import type { OutdoorKind, OutdoorPoint } from './outdoorRoute';
import { OSM_CONTRIBUTORS, ORS_CREDIT } from './routeConsent';

export { OSM_CONTRIBUTORS, ORS_CREDIT };

export const ROUTE_SERVICE_LINE =
  'The start point and the destination are sent to our route service (OpenRouteService, built on OpenStreetMap data) to make the route. Nothing is shared with other people.';

export { ROUTE_RETENTION_LINE, ROUTE_SEND_LINE } from './routeConsent';

export const ROUTE_UNAVAILABLE =
  'The route service is not available right now. Nothing was saved.';

export const ROUTE_FINDING_OFF = 'Route finding is off.';

export const ROUTE_MOCK_LINE =
  'This line is a sample. The route service is not connected in this preview, so the line is not a real path.';

export const HIKE_PROFILE_NOTE =
  'Run uses the hiking profile. OpenRouteService has no separate running profile.';

export const STARTER_NOTE =
  'Example start points, not a popularity list. OpenRouteService does not say how busy a path is. Strava, Komoot, and Garmin routes are not used.';

export const APPLE_MAPS_NOTE =
  'Opens Apple Maps with a few points from this route. Apple draws its own line. It does not need another permission.';

export const NO_CLIMB_LINE = 'Climb not available for this route.';

export type RouteMode = 'walk' | 'run' | 'cycle';

export type RouteShape = 'loop' | 'a_to_b';

export type RoutePlace = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
};

export type RoutePlanInput = {
  mode: RouteMode;
  shape: RouteShape;
  start: OutdoorPoint;
  end?: OutdoorPoint | null;
  distanceM?: number | null;
  minutes?: number | null;
};

export type RoutePlan = {
  mocked: boolean;
  mode: RouteMode;
  shape: RouteShape;
  profile: 'foot-walking' | 'foot-hiking' | 'cycling-regular';
  distanceM: number;
  durationMinutes: number;
  ascentM: number | null;
  points: OutdoorPoint[];
};

/** Public places used as example starts. They are not surveyed routes. */
export const STARTER_PLACES: readonly RoutePlace[] = [
  { id: 'bristol', name: 'Bristol, Queen Square', latitude: 51.4504, longitude: -2.5945 },
  { id: 'london', name: 'London, Hyde Park', latitude: 51.5073, longitude: -0.1657 },
  { id: 'manchester', name: 'Manchester, Heaton Park', latitude: 53.5304, longitude: -2.2553 },
  { id: 'edinburgh', name: 'Edinburgh, Holyrood Park', latitude: 55.9496, longitude: -3.1674 },
  { id: 'cardiff', name: 'Cardiff, Bute Park', latitude: 51.4872, longitude: -3.1846 },
];

const PACE_M_PER_MIN: Record<RouteMode, number> = {
  walk: 80,
  run: 150,
  cycle: 250,
};

export function routeProfile(mode: RouteMode): RoutePlan['profile'] {
  if (mode === 'run') return 'foot-hiking';
  if (mode === 'cycle') return 'cycling-regular';
  return 'foot-walking';
}

export function routeKind(shape: RouteShape, craving: boolean): OutdoorKind {
  if (craving) return 'craving_walk';
  return shape === 'a_to_b' ? 'point_to_point' : 'loop';
}

/** Distance wins when both are set. Otherwise time becomes a length from the pace. */
export function targetLengthM(input: Pick<RoutePlanInput, 'mode' | 'distanceM' | 'minutes'>): number | null {
  const distance = input.distanceM;
  if (typeof distance === 'number' && Number.isFinite(distance)) {
    return clamp(Math.round(distance), 500, 50_000);
  }
  const minutes = input.minutes;
  if (typeof minutes === 'number' && Number.isFinite(minutes)) {
    const bounded = clamp(Math.round(minutes), 10, 180);
    return clamp(bounded * PACE_M_PER_MIN[input.mode], 500, 50_000);
  }
  return null;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

export function filterStarterPlaces(query: string): RoutePlace[] {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) return [];
  return STARTER_PLACES.filter((place) => place.name.toLowerCase().includes(needle));
}

function finitePoint(value: unknown): OutdoorPoint | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as { latitude?: unknown; longitude?: unknown };
  const latitude = typeof row.latitude === 'number' ? row.latitude : Number(row.latitude);
  const longitude = typeof row.longitude === 'number' ? row.longitude : Number(row.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

/**
 * A start or destination for the route service.
 * Named latitude and longitude only. An array is rejected so the order is never guessed.
 * A negative accuracy is an invalid fix. An accuracy object is ignored.
 * The result is only the two coordinates, rounded to six decimal places.
 */
export function routeCoordinate(value: unknown): OutdoorPoint | null {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as { coords?: unknown; accuracy?: unknown; latitude?: unknown; longitude?: unknown };
  if (invalidAccuracy(row.accuracy)) return null;
  if (Array.isArray(row.coords)) return null;
  const source = row.coords != null && typeof row.coords === 'object'
    ? row.coords as { accuracy?: unknown; latitude?: unknown; longitude?: unknown }
    : row;
  if (source !== row && invalidAccuracy(source.accuracy)) return null;
  if (typeof source.latitude !== 'number' || typeof source.longitude !== 'number') return null;
  if (!Number.isFinite(source.latitude) || !Number.isFinite(source.longitude)) return null;
  if (Math.abs(source.latitude) > 90 || Math.abs(source.longitude) > 180) return null;
  const latitude = Number(source.latitude.toFixed(6));
  const longitude = Number(source.longitude.toFixed(6));
  if (latitude === 0 && longitude === 0) return null;
  return { latitude, longitude };
}

function invalidAccuracy(value: unknown): boolean {
  return typeof value === 'number' && !(value >= 0);
}

export function parseRoutePlan(value: unknown): RoutePlan | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (row.ok === false) return null;
  const mode = row.mode === 'run' || row.mode === 'cycle' ? row.mode : row.mode === 'walk' ? 'walk' : null;
  const shape = row.shape === 'a_to_b' ? 'a_to_b' : row.shape === 'loop' ? 'loop' : null;
  const profile = row.profile === 'foot-hiking' || row.profile === 'cycling-regular' || row.profile === 'foot-walking'
    ? row.profile
    : null;
  if (!mode || !shape || !profile) return null;
  const points = Array.isArray(row.points) ? row.points.map(finitePoint).filter((point): point is OutdoorPoint => point != null) : [];
  const distance = typeof row.distanceM === 'number' ? row.distanceM : Number(row.distanceM);
  const duration = typeof row.durationMinutes === 'number' ? row.durationMinutes : Number(row.durationMinutes);
  if (points.length < 2 || !Number.isFinite(distance) || !Number.isFinite(duration)) return null;
  const ascent = typeof row.ascentM === 'number' && Number.isFinite(row.ascentM) ? Math.round(row.ascentM) : null;
  return {
    mocked: row.mocked === true,
    mode,
    shape,
    profile,
    distanceM: Math.round(distance),
    durationMinutes: Math.max(1, Math.round(duration)),
    ascentM: ascent,
    points: points.slice(0, 2000),
  };
}

function shift(origin: OutdoorPoint, northM: number, eastM: number): OutdoorPoint {
  const lat = origin.latitude + northM / 111_320;
  const lng = origin.longitude + eastM / (111_320 * Math.cos((origin.latitude * Math.PI) / 180));
  return { latitude: lat, longitude: lng };
}

/** A bent sample line around the start. It is not a path from the route service. */
export function mockRoute(input: RoutePlanInput): RoutePlan | null {
  const length = targetLengthM(input);
  const start = routeCoordinate(input.start);
  if (!length || !start) return null;
  const end = input.shape === 'a_to_b' ? routeCoordinate(input.end) : null;
  if (input.shape === 'a_to_b' && !end) return null;
  const leg = length / 6;
  const points = input.shape === 'a_to_b' && end
    ? [start, shift(start, leg * 0.2, leg * 0.3), shift(end, leg * 0.15, -leg * 0.1), end]
    : [
      start,
      shift(start, leg * 0.35, leg * 0.15),
      shift(start, leg * 0.45, leg * 0.55),
      shift(start, leg * 0.1, leg * 0.7),
      shift(start, -leg * 0.25, leg * 0.35),
      start,
    ];
  const minutes = typeof input.minutes === 'number' && input.minutes >= 10
    ? Math.round(input.minutes)
    : Math.max(10, Math.round(length / PACE_M_PER_MIN[input.mode]));
  return {
    mocked: true,
    mode: input.mode,
    shape: input.shape,
    profile: routeProfile(input.mode),
    distanceM: length,
    durationMinutes: minutes,
    ascentM: null,
    points,
  };
}

/** A few points only. Apple draws its own line between them. */
export function appleMapsUrl(points: readonly OutdoorPoint[], mode: RouteMode): string | null {
  if (points.length < 2) return null;
  const pick = [0, Math.floor(points.length / 3), Math.floor((points.length * 2) / 3), points.length - 1]
    .map((index) => points[index])
    .filter((point): point is OutdoorPoint => point != null);
  const unique: OutdoorPoint[] = [];
  for (const point of pick) {
    const last = unique[unique.length - 1];
    if (!last || last.latitude !== point.latitude || last.longitude !== point.longitude) unique.push(point);
  }
  if (unique.length < 2) return null;
  const [start, ...rest] = unique;
  const daddr = rest.map((point) => `${point.latitude.toFixed(5)},${point.longitude.toFixed(5)}`).join('+to:');
  const flag = mode === 'cycle' ? '' : '&dirflg=w';
  return `https://maps.apple.com/?saddr=${start.latitude.toFixed(5)},${start.longitude.toFixed(5)}&daddr=${daddr}${flag}`;
}

export function formatClimb(metres: number | null): string {
  if (metres == null) return NO_CLIMB_LINE;
  return `Climb ${Math.max(0, Math.round(metres))} m`;
}

/** A short message from our function. A body that looks like a place is not shown. */
export function calmRouteMessage(value: unknown): string {
  if (!value || typeof value !== 'object') return ROUTE_UNAVAILABLE;
  const message = (value as { message?: unknown }).message;
  if (typeof message !== 'string') return ROUTE_UNAVAILABLE;
  const text = message.trim();
  if (text.length < 8 || text.length > 180) return ROUTE_UNAVAILABLE;
  if (/\d+\.\d{3,}/.test(text)) return ROUTE_UNAVAILABLE;
  return text;
}

export function parseRoutePlaces(value: unknown): RoutePlace[] {
  if (!value || typeof value !== 'object') return [];
  const places = (value as { places?: unknown }).places;
  if (!Array.isArray(places)) return [];
  return places.flatMap((place) => {
    const point = finitePoint(place);
    if (!point || !place || typeof place !== 'object') return [];
    const row = place as { id?: unknown; name?: unknown };
    const name = typeof row.name === 'string' ? row.name.trim() : '';
    if (!name) return [];
    return [{
      id: typeof row.id === 'string' && row.id.trim() ? row.id : name,
      name: name.slice(0, 120),
      latitude: point.latitude,
      longitude: point.longitude,
    }];
  }).slice(0, 5);
}
