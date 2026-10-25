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

type PositionReading = { coords: { latitude: number; longitude: number } };

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
    getCurrentPositionAsync: () => Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
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
    const latitude = reading.coords.latitude;
    const longitude = reading.coords.longitude;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return { ok: false, reason: 'unavailable' };
    return { ok: true, point: { latitude, longitude } };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
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
