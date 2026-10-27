import type { OutdoorPoint } from '@/domain/outdoorRoute';

type PressLike = {
  nativeEvent?: PressLike;
  lngLat?: unknown;
  geometry?: { coordinates?: unknown };
  coordinates?: { latitude?: unknown; longitude?: unknown };
};

function finitePoint(longitude: number, latitude: number): OutdoorPoint | null {
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
  return { latitude, longitude };
}

/**
 * MapLibre React Native 11 delivers a press as `nativeEvent.lngLat`,
 * `[longitude, latitude]`. A handler that only reads `geometry` or
 * `coordinates.latitude` drops the tap and adds nothing.
 */
export function mapPressPoint(event: unknown): OutdoorPoint | null {
  if (!event || typeof event !== 'object') return null;
  const record = event as PressLike;
  const payload = record.nativeEvent && typeof record.nativeEvent === 'object' ? record.nativeEvent : record;
  const pair = payload.lngLat;
  if (Array.isArray(pair) && pair.length >= 2) {
    const fromPair = finitePoint(Number(pair[0]), Number(pair[1]));
    if (fromPair) return fromPair;
  }
  const geometry = payload.geometry?.coordinates;
  if (Array.isArray(geometry) && geometry.length >= 2) {
    const fromGeometry = finitePoint(Number(geometry[0]), Number(geometry[1]));
    if (fromGeometry) return fromGeometry;
  }
  const coordinates = payload.coordinates;
  if (coordinates && typeof coordinates.latitude === 'number' && typeof coordinates.longitude === 'number') {
    return finitePoint(coordinates.longitude, coordinates.latitude);
  }
  return null;
}
