import { routeCoordinate } from '@/domain/findRoute';
import type { ActivityFix } from '@/domain/activitySession';

/**
 * One balanced fix while the activity screen is open.
 * Foreground only. This file must not watch, and it must not ask for background location.
 */

type Reading = {
  coords?: { latitude?: number; longitude?: number; accuracy?: number | null };
  timestamp?: number;
};

export type ActivityFixDeps = {
  getForegroundPermissionsAsync: () => Promise<{ status: string }>;
  requestForegroundPermissionsAsync: () => Promise<{ status: string }>;
  getCurrentPositionAsync: () => Promise<Reading>;
};

export type ActivityFixResult =
  | { ok: true; fix: ActivityFix }
  | { ok: false; reason: 'denied' | 'waiting' };

async function loadDeps(): Promise<ActivityFixDeps> {
  const Location = await import('expo-location');
  return {
    getForegroundPermissionsAsync: () => Location.getForegroundPermissionsAsync(),
    requestForegroundPermissionsAsync: () => Location.requestForegroundPermissionsAsync(),
    getCurrentPositionAsync: () => Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
      maximumAge: 3000,
    } as never),
  };
}

export async function readActivityFix(deps?: ActivityFixDeps): Promise<ActivityFixResult> {
  try {
    const location = deps ?? await loadDeps();
    const current = await location.getForegroundPermissionsAsync();
    const status = current.status === 'granted'
      ? current.status
      : (await location.requestForegroundPermissionsAsync()).status;
    if (status !== 'granted') return { ok: false, reason: 'denied' };
    const reading = await location.getCurrentPositionAsync();
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
  } catch {
    return { ok: false, reason: 'waiting' };
  }
}
