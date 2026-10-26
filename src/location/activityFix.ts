import { routeCoordinate } from '@/domain/findRoute';
import {
  OUTING_TIME_LIMIT_MS,
  outingTimedOut,
  type ActivityFix,
} from '@/domain/activitySession';

/**
 * One continuous while-using watch for an outing.
 * Foreground permission only. The iOS watch streamer, when the location
 * background mode is in the binary, keeps standard fitness updates going
 * with the blue mark. This file does not ask for a background permission.
 * Process death ends the watch with the process. It is not a task, so a
 * force-quit does not relaunch it. Nothing here is logged.
 *
 * The six-hour limit is checked on each fix and when the app returns to
 * the foreground, as well as on a one-second timer. Any one of those stops
 * the watch. Leaving the outing screen does not.
 *
 * JS keys that the patched LocationOptions Record keeps: accuracy,
 * distanceInterval, activityType, pausesUpdatesAutomatically,
 * showsBackgroundLocationIndicator, allowsBackgroundUpdates.
 * A real iOS compile still has to prove the manager applies them.
 */

type Reading = {
  coords?: { latitude?: number; longitude?: number; accuracy?: number | null };
  timestamp?: number;
};

export type ActivityFixResult =
  | { ok: true; fix: ActivityFix }
  | { ok: false; reason: 'denied' | 'waiting' };

export type WatchHandle = { remove: () => void };

export type ActivityWatchDeps = {
  os: string;
  getForegroundPermissionsAsync: () => Promise<{ status: string }>;
  requestForegroundPermissionsAsync: () => Promise<{ status: string }>;
  watchPositionAsync: (
    options: Record<string, unknown>,
    onReading: (reading: Reading) => void,
    onError?: (message: string) => void,
  ) => Promise<WatchHandle>;
  toNativeOptions?: (options: Record<string, unknown>) => Record<string, unknown>;
  /** Test double. Production listens for AppState 'active'. */
  subscribeForeground?: (onActive: () => void) => () => void;
};

export type OutingHooks = {
  onFix: (result: ActivityFixResult) => void;
  onLimit: () => void;
};

export const OUTING_DISTANCE_INTERVAL_M = 10;

/** High is about 10 metres. Finer than that navigation setting is not used. */
export function outingWatchOptions(os: string): Record<string, unknown> {
  const options: Record<string, unknown> = {
    accuracy: 'high',
    distanceInterval: OUTING_DISTANCE_INTERVAL_M,
  };
  if (os === 'ios') {
    options.activityType = 'fitness';
    options.pausesUpdatesAutomatically = false;
    options.showsBackgroundLocationIndicator = true;
    options.allowsBackgroundUpdates = true;
  }
  return options;
}

/**
 * Values passed into watchPositionAsync. Accuracy 4 is High (about 10 metres).
 * Activity type 3 is fitness. The patched Record decodes these names.
 */
export function mapOutingWatchOptions(
  logical: Record<string, unknown>,
  native: { accuracyHigh: number; fitness: number },
  os: string,
): Record<string, unknown> {
  const next = { ...logical, accuracy: native.accuracyHigh };
  if (os === 'ios') next.activityType = native.fitness;
  return next;
}

let hooks: OutingHooks | null = null;
let watch: WatchHandle | null = null;
let limitTimer: ReturnType<typeof setInterval> | null = null;
let limitFrom = 0;
let watching = false;
let foregroundStop: (() => void) | null = null;
let clock: () => number = Date.now;

export function setOutingHooks(next: OutingHooks | null): void {
  hooks = next;
}

export function activityWatchRunning(): boolean {
  return watching;
}

export function pauseActivityWatch(): void {
  watch?.remove();
  watch = null;
  watching = false;
}

export function stopActivityWatch(): void {
  pauseActivityWatch();
  if (limitTimer) clearInterval(limitTimer);
  limitTimer = null;
  limitFrom = 0;
  if (foregroundStop) foregroundStop();
  foregroundStop = null;
}

function readingToResult(reading: Reading): ActivityFixResult {
  const point = routeCoordinate(reading);
  if (!point) return { ok: false, reason: 'waiting' };
  const accuracy = reading.coords?.accuracy;
  return {
    ok: true,
    fix: {
      latitude: point.latitude,
      longitude: point.longitude,
      accuracyM: typeof accuracy === 'number' && Number.isFinite(accuracy) ? accuracy : null,
      atMs: typeof reading.timestamp === 'number' ? reading.timestamp : clock(),
    },
  };
}

function expireIfDue(nowMs: number): boolean {
  if (!limitFrom || !outingTimedOut(limitFrom, nowMs, OUTING_TIME_LIMIT_MS)) return false;
  const notify = hooks?.onLimit;
  stopActivityWatch();
  notify?.();
  return true;
}

function armLimit(startedAtMs: number, now: () => number): void {
  clock = now;
  if (limitTimer && limitFrom === startedAtMs) return;
  if (limitTimer) clearInterval(limitTimer);
  limitFrom = startedAtMs;
  limitTimer = setInterval(() => {
    expireIfDue(now());
  }, 1000);
}

async function defaultForeground(onActive: () => void): Promise<() => void> {
  const { AppState } = await import('react-native');
  const sub = AppState.addEventListener('change', (state) => {
    if (state === 'active') onActive();
  });
  return () => sub.remove();
}

async function bindForeground(
  subscribe: ActivityWatchDeps['subscribeForeground'],
  now: () => number,
): Promise<void> {
  if (foregroundStop) return;
  if (subscribe) {
    foregroundStop = subscribe(() => {
      expireIfDue(now());
    });
    return;
  }
  foregroundStop = await defaultForeground(() => {
    expireIfDue(now());
  });
}

async function loadDeps(): Promise<ActivityWatchDeps> {
  const Location = await import('expo-location');
  const { Platform } = await import('react-native');
  return {
    os: Platform.OS,
    getForegroundPermissionsAsync: () => Location.getForegroundPermissionsAsync(),
    requestForegroundPermissionsAsync: () => Location.requestForegroundPermissionsAsync(),
    watchPositionAsync: (watchOptions, onReading, onError) => Location.watchPositionAsync(
      watchOptions as never,
      onReading,
      onError,
    ),
    toNativeOptions: (watchOptions) => mapOutingWatchOptions(watchOptions, {
      accuracyHigh: Location.Accuracy.High,
      fitness: Location.ActivityType.Fitness,
    }, Platform.OS),
  };
}

export async function ensureActivityWatch(
  startedAtMs: number,
  deps?: ActivityWatchDeps,
  now: () => number = Date.now,
  load: () => Promise<ActivityWatchDeps> = loadDeps,
): Promise<ActivityFixResult> {
  armLimit(startedAtMs, now);
  try {
    const location = deps ?? await load();
    if (deps == null || location.subscribeForeground) {
      await bindForeground(location.subscribeForeground, now);
    }
    if (expireIfDue(now())) return { ok: false, reason: 'waiting' };
    if (watching) return { ok: false, reason: 'waiting' };
    const current = await location.getForegroundPermissionsAsync();
    const status = current.status === 'granted'
      ? current.status
      : (await location.requestForegroundPermissionsAsync()).status;
    if (status !== 'granted') return { ok: false, reason: 'denied' };
    const logical = outingWatchOptions(location.os);
    const native = location.toNativeOptions ? location.toNativeOptions(logical) : logical;
    const handle = await location.watchPositionAsync(
      native,
      (reading) => {
        if (expireIfDue(now())) return;
        hooks?.onFix(readingToResult(reading));
      },
      () => {
        hooks?.onFix({ ok: false, reason: 'waiting' });
      },
    );
    watch = handle;
    watching = true;
    return { ok: false, reason: 'waiting' };
  } catch {
    return { ok: false, reason: 'waiting' };
  }
}
