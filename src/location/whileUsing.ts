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

export type WhileUsingMiss = 'denied' | 'unavailable' | 'timeout';

export type WhileUsingFixResult =
  | { ok: true; point: OutdoorPoint }
  | { ok: false; reason: WhileUsingMiss };

type PositionReading = {
  coords?: { latitude?: number; longitude?: number; accuracy?: number | null };
  accuracy?: unknown;
  timestamp?: number;
};

/** A millisecond timestamp older than two minutes is a cached fix, not a current one. */
const FRESH_FIX_MS = 120_000;

export type WhileUsingDeps = {
  getForegroundPermissionsAsync: () => Promise<{ status: string }>;
  requestForegroundPermissionsAsync: () => Promise<{ status: string }>;
  getCurrentPositionAsync: () => Promise<PositionReading>;
};

async function loadDeps(): Promise<WhileUsingDeps> {
  const Location = await import('expo-location');
  return {
    getForegroundPermissionsAsync: () => Location.getForegroundPermissionsAsync(),
    requestForegroundPermissionsAsync: () => Location.requestForegroundPermissionsAsync(),
    getCurrentPositionAsync: () => Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
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
    const reading = await firstFix(location.getCurrentPositionAsync(), timeoutMs);
    if (reading === 'timeout') return { ok: false, reason: 'timeout' };
    const point = routeCoordinate(reading);
    if (!point || !freshFix(reading)) return { ok: false, reason: 'unavailable' };
    return { ok: true, point };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}

function freshFix(reading: PositionReading, now = Date.now()): boolean {
  const stamp = reading.timestamp;
  if (typeof stamp !== 'number' || !Number.isFinite(stamp) || stamp <= 1e11) return true;
  return now - stamp <= FRESH_FIX_MS;
}

/** The position call has no deadline of its own. A late result is ignored after the deadline. */
function firstFix(work: Promise<PositionReading>, timeoutMs: number): Promise<PositionReading | 'timeout'> {
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
