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
 * Process death ends the watch with the process. Nothing here is logged.
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
};

export type OutingHooks = {
  onFix: (result: ActivityFixResult) => void;
  onLimit: () => void;
};

export const OUTING_DISTANCE_INTERVAL_M = 10;

export function outingWatchOptions(os: string): Record<string, unknown> {
  const options: Record<string, unknown> = {
    accuracy: 'balanced',
    distanceInterval: OUTING_DISTANCE_INTERVAL_M,
  };
  if (os === 'ios') {
    options.activityType = 'fitness';
    options.pausesUpdatesAutomatically = true;
    options.showsBackgroundLocationIndicator = true;
    options.allowsBackgroundUpdates = true;
  }
  return options;
}

let hooks: OutingHooks | null = null;
let watch: WatchHandle | null = null;
let limitTimer: ReturnType<typeof setInterval> | null = null;
let limitFrom = 0;
let watching = false;

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
      atMs: typeof reading.timestamp === 'number' ? reading.timestamp : Date.now(),
    },
  };
}

function armLimit(startedAtMs: number, now: () => number): void {
  if (limitTimer && limitFrom === startedAtMs) return;
  if (limitTimer) clearInterval(limitTimer);
  limitFrom = startedAtMs;
  limitTimer = setInterval(() => {
    if (!outingTimedOut(limitFrom, now(), OUTING_TIME_LIMIT_MS)) return;
    const notify = hooks?.onLimit;
    stopActivityWatch();
    notify?.();
  }, 1000);
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
    toNativeOptions: (watchOptions) => {
      const next = { ...watchOptions, accuracy: Location.Accuracy.Balanced };
      if (Platform.OS === 'ios') next.activityType = Location.ActivityType.Fitness;
      return next;
    },
  };
}

export async function ensureActivityWatch(
  startedAtMs: number,
  deps?: ActivityWatchDeps,
  now: () => number = Date.now,
): Promise<ActivityFixResult> {
  armLimit(startedAtMs, now);
  if (watching) return { ok: false, reason: 'waiting' };
  try {
    const location = deps ?? await loadDeps();
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
