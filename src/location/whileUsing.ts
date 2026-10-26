import { routeCoordinate } from '@/domain/findRoute';
import type { OutdoorPoint } from '@/domain/outdoorRoute';

/**
 * One fix while the page is open. Foreground only.
 * This file must not request background or always location, and it must not watch the fix.
 */
export const LOCATION_FIX_TIMEOUT_MS = 12_000;

export const LOCATION_FIX_MESSAGE =
  "Couldn't get your location. Check Settings > Privacy > Location Services > Charioteer, or pick a start below.";

export const LOCATION_FIX_PENDING = 'Finding where you are';

/** A cached fix older than this is not used. Five minutes is the long end of a short indoor wait. */
export const LAST_KNOWN_MAX_AGE_MS = 5 * 60 * 1000;

/** Wider than this, the dot is only a rough indoor fix. The route can still start. */
export const ROUGH_ACCURACY_M = 50;

export const ROUGH_FIX_LINE =
  'Your phone\'s location is approximate indoors. We\'ll start from the nearest path.';

export type WhileUsingMiss = 'denied' | 'unavailable' | 'timeout';

export type WhileUsingFixResult =
  | { ok: true; point: OutdoorPoint; approximate: boolean }
  | { ok: false; reason: WhileUsingMiss };

type PositionReading = {
  coords?: { latitude?: number; longitude?: number; accuracy?: number | null };
  accuracy?: unknown;
  timestamp?: number;
};

export type FixAccuracy = 'balanced' | 'high';

export type WhileUsingDeps = {
  getForegroundPermissionsAsync: () => Promise<{ status: string }>;
  requestForegroundPermissionsAsync: () => Promise<{ status: string }>;
  getLastKnownPositionAsync?: () => Promise<PositionReading | null>;
  getCurrentPositionAsync: (accuracy?: FixAccuracy) => Promise<PositionReading>;
};

async function loadDeps(): Promise<WhileUsingDeps> {
  const Location = await import('expo-location');
  return {
    getForegroundPermissionsAsync: () => Location.getForegroundPermissionsAsync(),
    requestForegroundPermissionsAsync: () => Location.requestForegroundPermissionsAsync(),
    getLastKnownPositionAsync: () => Location.getLastKnownPositionAsync({ maxAge: LAST_KNOWN_MAX_AGE_MS }),
    getCurrentPositionAsync: (accuracy: FixAccuracy = 'balanced') => Location.getCurrentPositionAsync({
      accuracy: accuracy === 'high' ? Location.Accuracy.High : Location.Accuracy.Balanced,
      maximumAge: 0,
    } as never),
  };
}

export async function readWhileUsingFix(
  deps?: WhileUsingDeps,
  timeoutMs = LOCATION_FIX_TIMEOUT_MS,
): Promise<WhileUsingFixResult> {
  try {
    const location = deps ?? await loadDeps();
    const current = await location.getForegroundPermissionsAsync();
    const status = current.status === 'granted'
      ? current.status
      : (await location.requestForegroundPermissionsAsync()).status;
    if (status !== 'granted') return { ok: false, reason: 'denied' };
    const deadline = Date.now() + timeoutMs;
    const left = () => Math.max(0, deadline - Date.now());
    const cached = await readLastKnown(location);
    let sawTimeout = false;
    const balanced = await readCurrent(location, 'balanced', left, () => { sawTimeout = true; });
    if (balanced) return { ok: true, point: balanced.point, approximate: rough(balanced.reading) };
    const high = await readCurrent(location, 'high', left, () => { sawTimeout = true; });
    if (high) return { ok: true, point: high.point, approximate: rough(high.reading) };
    if (cached) return { ok: true, point: cached.point, approximate: true };
    return { ok: false, reason: sawTimeout ? 'timeout' : 'unavailable' };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}

async function readLastKnown(location: WhileUsingDeps): Promise<{ point: OutdoorPoint; reading: PositionReading } | null> {
  if (!location.getLastKnownPositionAsync) return null;
  try {
    const reading = await firstFix(location.getLastKnownPositionAsync(), 1_000);
    if (reading === 'timeout' || reading == null) return null;
    return accepted(reading);
  } catch {
    return null;
  }
}

async function readCurrent(
  location: WhileUsingDeps,
  accuracy: FixAccuracy,
  left: () => number,
  onTimeout: () => void,
): Promise<{ point: OutdoorPoint; reading: PositionReading } | null> {
  const budget = left();
  if (budget <= 0) {
    onTimeout();
    return null;
  }
  try {
    const reading = await firstFix(location.getCurrentPositionAsync(accuracy), budget);
    if (reading === 'timeout') {
      onTimeout();
      return null;
    }
    return accepted(reading);
  } catch {
    return null;
  }
}

function accepted(reading: PositionReading | null): { point: OutdoorPoint; reading: PositionReading } | null {
  if (!reading) return null;
  const point = routeCoordinate(reading);
  if (!point || !freshEnough(reading)) return null;
  return { point, reading };
}

function freshEnough(reading: PositionReading, now = Date.now()): boolean {
  const stamp = reading.timestamp;
  if (typeof stamp !== 'number' || !Number.isFinite(stamp) || stamp <= 1e11) return true;
  return now - stamp <= LAST_KNOWN_MAX_AGE_MS;
}

function rough(reading: PositionReading): boolean {
  const accuracy = reading.coords?.accuracy;
  return typeof accuracy === 'number' && accuracy > ROUGH_ACCURACY_M;
}

/** The position call has no deadline of its own. A late result is ignored after the deadline. */
function firstFix<T>(work: Promise<T>, timeoutMs: number): Promise<T | 'timeout'> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const guarded = work.then(
    (value) => ({ kind: 'value' as const, value }),
    () => ({ kind: 'error' as const }),
  );
  const timeout = new Promise<{ kind: 'timeout' }>((resolve) => {
    timer = setTimeout(() => resolve({ kind: 'timeout' }), timeoutMs);
  });
  return Promise.race([guarded, timeout]).then((winner) => {
    if (timer) clearTimeout(timer);
    if (winner.kind === 'timeout') return 'timeout';
    if (winner.kind === 'error') throw new Error('location unavailable');
    return winner.value;
  });
}
