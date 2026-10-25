import type { OutdoorPoint } from '@/domain/outdoorRoute';

/**
 * One fix while the page is open. Foreground only.
 * This file must not request background or always location, and it must not watch the fix.
 */
export async function readWhileUsingFix(): Promise<OutdoorPoint | null> {
  try {
    const Location = await import('expo-location');
    const current = await Location.getForegroundPermissionsAsync();
    const status = current.status === 'granted'
      ? current.status
      : (await Location.requestForegroundPermissionsAsync()).status;
    if (status !== 'granted') return null;
    const fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const latitude = fix.coords.latitude;
    const longitude = fix.coords.longitude;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    return { latitude, longitude };
  } catch {
    return null;
  }
}
