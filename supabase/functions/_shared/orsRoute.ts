/**
 * OpenRouteService request building. The phone does not import this file.
 * Host: api.heigit.org. The old host api.openrouteservice.org is not used.
 * HeiGIT said that old host shuts down in the week of 16 November 2026
 * (https://heigit.org/changes-in-the-openrouteservice-universe/, 22 October 2026).
 * An earlier forum note said 2–6 November 2026.
 */

export const ORS_HOST = 'https://api.heigit.org';

const PROFILES = {
  walk: 'foot-walking',
  run: 'foot-hiking',
  cycle: 'cycling-regular',
} as const;

type Mode = keyof typeof PROFILES;

export function directionsUrl(mode: Mode): string {
  return `${ORS_HOST}/openrouteservice/v2/directions/${PROFILES[mode]}/geojson`;
}

export function geocodeUrl(query: string): string {
  const text = encodeURIComponent(query.trim().slice(0, 80));
  return `${ORS_HOST}/pelias/v1/search?text=${text}&size=5`;
}

const PACE_M_PER_MIN = { walk: 80, run: 150, cycle: 250 } as const;

export function readMode(value: unknown): Mode | null {
  return value === 'walk' || value === 'run' || value === 'cycle' ? value : null;
}

export function readShape(value: unknown): 'loop' | 'a_to_b' | null {
  return value === 'loop' || value === 'a_to_b' ? value : null;
}

export function cleanPlaceQuery(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const query = value.trim();
  if (query.length < 2 || query.length > 80) return null;
  return query;
}

export function readPlace(value: unknown): { latitude: number; longitude: number } | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as { latitude?: unknown; longitude?: unknown };
  const latitude = typeof row.latitude === 'number' ? row.latitude : Number(row.latitude);
  const longitude = typeof row.longitude === 'number' ? row.longitude : Number(row.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

/** Distance wins when both are set. Otherwise time becomes a length from the pace. */
export function routeLengthM(input: { mode: Mode; distanceM?: unknown; minutes?: unknown }): number | null {
  const distance = typeof input.distanceM === 'number' ? input.distanceM : Number(input.distanceM);
  if (Number.isFinite(distance) && input.distanceM != null && input.distanceM !== '') {
    return clamp(Math.round(distance), 500, 50_000);
  }
  const minutes = typeof input.minutes === 'number' ? input.minutes : Number(input.minutes);
  if (Number.isFinite(minutes) && input.minutes != null && input.minutes !== '') {
    return clamp(clamp(Math.round(minutes), 10, 180) * PACE_M_PER_MIN[input.mode], 500, 50_000);
  }
  return null;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/** Twelve requests in ten minutes, or forty in a day, is enough for one person. */
export function withinRouteLimit(stamps: readonly number[], now: number): { ok: boolean; next: number[] } {
  const day = stamps.filter((stamp) => now - stamp < 86_400_000 && now >= stamp);
  const recent = day.filter((stamp) => now - stamp < 600_000);
  if (recent.length >= 12 || day.length >= 40) return { ok: false, next: day };
  return { ok: true, next: [...day, now] };
}

/**
 * Free Standard plan, Directions V2: 2,000 a day and 40 a minute.
 * Geocoding on that plan is 3,000 a day.
 * https://account.heigit.org/info/plans
 * The whole app stays under the smaller of those daily figures.
 */
export const ORS_FREE_DIRECTIONS_PER_DAY = 2000;

export const GLOBAL_ROUTE_DAILY_CAP = 1500;

export function withinGlobalRouteLimit(
  stamps: readonly number[],
  now: number,
  cap = GLOBAL_ROUTE_DAILY_CAP,
): { ok: boolean; next: number[] } {
  const day = stamps.filter((stamp) => now - stamp < 86_400_000 && now >= stamp);
  if (day.length >= cap) return { ok: false, next: day };
  return { ok: true, next: [...day, now] };
}

/** Headers for a route call. The caller's address and account id are not copied across. */
export function orsRequestHeaders(key: string, accept: string): Record<string, string> {
  return { Authorization: key, Accept: accept };
}

export function buildDirectionsBody(input: {
  mode: Mode;
  shape: 'loop' | 'a_to_b';
  start: { latitude: number; longitude: number };
  end?: { latitude: number; longitude: number } | null;
  lengthM: number;
}): Record<string, unknown> | null {
  const start = [round6(input.start.longitude), round6(input.start.latitude)];
  if (input.shape === 'loop') {
    return {
      coordinates: [start],
      elevation: true,
      instructions: false,
      options: { round_trip: { length: input.lengthM, points: 5 } },
    };
  }
  if (!input.end) return null;
  const end = [round6(input.end.longitude), round6(input.end.latitude)];
  return {
    coordinates: [start, end],
    elevation: true,
    instructions: false,
  };
}

function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/** Hosted snap search limit. A second lookup stays inside the one route request. */
export const SNAP_RADIUS_M = 350;

export function snapUrl(mode: Mode): string {
  return `${ORS_HOST}/openrouteservice/v2/snap/${PROFILES[mode]}/geojson`;
}

export function buildSnapBody(point: { latitude: number; longitude: number }): Record<string, unknown> {
  return {
    locations: [[round6(point.longitude), round6(point.latitude)]],
    radius: SNAP_RADIUS_M,
  };
}

/** A snapped point from the geojson snap response. The service text is not kept. */
export function parseSnap(payload: unknown): { latitude: number; longitude: number; distanceM: number | null } | null {
  const feature = snapFeature(payload);
  const pair = feature?.coordinates;
  if (!pair) return null;
  const longitude = Number(pair[0]);
  const latitude = Number(pair[1]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  if (latitude === 0 && longitude === 0) return null;
  const distance = Number(feature?.distanceM);
  return {
    latitude: Number(latitude.toFixed(6)),
    longitude: Number(longitude.toFixed(6)),
    distanceM: Number.isFinite(distance) && distance >= 0 ? Math.round(distance) : null,
  };
}

function snapFeature(payload: unknown): { coordinates?: unknown[]; distanceM?: unknown } | null {
  if (!payload || typeof payload !== 'object') return null;
  const row = payload as { features?: unknown[]; locations?: unknown[] };
  const feature = Array.isArray(row.features) ? row.features[0] : null;
  if (feature && typeof feature === 'object') {
    const item = feature as { geometry?: { coordinates?: unknown[] }; properties?: { snapped_distance?: unknown } };
    return { coordinates: item.geometry?.coordinates, distanceM: item.properties?.snapped_distance };
  }
  const location = Array.isArray(row.locations) ? row.locations[0] : null;
  if (location && typeof location === 'object') {
    const item = location as { location?: unknown[]; snapped_distance?: unknown };
    return { coordinates: item.location, distanceM: item.snapped_distance };
  }
  return null;
}

export function haversineM(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const NO_PATH_MESSAGE =
  'We couldn\'t find a path near that start. Try a start nearer a street or footpath.';

export const RATE_LIMITED_MESSAGE =
  'You\'ve made a lot of route requests. Try again in a little while.';

export const BAD_REQUEST_MESSAGE = 'That route request could not be used.';

export const UNAVAILABLE_MESSAGE =
  'The route service is not available right now. Nothing was saved.';

export type RouteFailureCode = 'no_path' | 'unavailable' | 'rate_limited' | 'bad_request';

export type RouteFailure = {
  status: 422 | 503 | 429 | 400;
  body: { ok: false; code: RouteFailureCode; message: string };
};

/** ORS 404 with 2009 or 2010 means the start is not on a path. The ORS text can contain coordinates, so it is never copied. */
export function classifyOrsFailure(status: number, payload: unknown): RouteFailure {
  if (status === 429) {
    return { status: 429, body: { ok: false, code: 'rate_limited', message: RATE_LIMITED_MESSAGE } };
  }
  if (status === 400) {
    return { status: 400, body: { ok: false, code: 'bad_request', message: BAD_REQUEST_MESSAGE } };
  }
  const code = orsErrorCode(payload);
  if (status === 404 && (code === 2009 || code === 2010)) {
    return { status: 422, body: { ok: false, code: 'no_path', message: NO_PATH_MESSAGE } };
  }
  return { status: 503, body: { ok: false, code: 'unavailable', message: UNAVAILABLE_MESSAGE } };
}

function orsErrorCode(payload: unknown): number | null {
  if (!payload || typeof payload !== 'object') return null;
  const row = payload as { code?: unknown; error?: unknown };
  const direct = asErrorCode(row.code);
  if (direct != null) return direct;
  if (row.error && typeof row.error === 'object') {
    return asErrorCode((row.error as { code?: unknown }).code);
  }
  return null;
}

function asErrorCode(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value);
  return null;
}

type LngLat = [number, number];

export function parseDirections(payload: unknown, mode: Mode, shape: 'loop' | 'a_to_b'): {
  profile: string;
  distanceM: number;
  durationMinutes: number;
  ascentM: number | null;
  points: { latitude: number; longitude: number }[];
} | null {
  const feature = firstFeature(payload);
  if (!feature) return null;
  const coords = feature.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const points = coords.flatMap((pair) => {
    if (!Array.isArray(pair) || pair.length < 2) return [];
    const longitude = Number(pair[0]);
    const latitude = Number(pair[1]);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
    return [{ latitude, longitude }];
  }).slice(0, 2000);
  if (points.length < 2) return null;
  const summary = feature.properties?.summary ?? {};
  const distance = Number(summary.distance);
  const duration = Number(summary.duration);
  if (!Number.isFinite(distance) || !Number.isFinite(duration)) return null;
  return {
    profile: PROFILES[mode],
    distanceM: Math.round(distance),
    durationMinutes: Math.max(1, Math.round(duration / 60)),
    ascentM: readAscent(feature.properties),
    points,
  };
}

/** ORS puts climb on `properties.ascent`. Older samples put it on `properties.summary.ascent`. */
function readAscent(properties: { ascent?: unknown; summary?: { ascent?: unknown } } | undefined): number | null {
  const direct = Number(properties?.ascent);
  if (Number.isFinite(direct)) return Math.round(direct);
  const summary = Number(properties?.summary?.ascent);
  if (Number.isFinite(summary)) return Math.round(summary);
  return null;
}

function firstFeature(payload: unknown): {
  geometry?: { coordinates?: LngLat[] };
  properties?: { ascent?: number; summary?: { distance?: number; duration?: number; ascent?: number } };
} | null {
  if (!payload || typeof payload !== 'object') return null;
  const row = payload as { features?: unknown[]; geometry?: unknown };
  if (Array.isArray(row.features) && row.features[0] && typeof row.features[0] === 'object') {
    return row.features[0] as ReturnType<typeof firstFeature>;
  }
  if (row.geometry) return row as ReturnType<typeof firstFeature>;
  return null;
}

export function parseGeocode(payload: unknown): { id: string; name: string; latitude: number; longitude: number }[] {
  if (!payload || typeof payload !== 'object') return [];
  const features = (payload as { features?: unknown[] }).features;
  if (!Array.isArray(features)) return [];
  const places: { id: string; name: string; latitude: number; longitude: number }[] = [];
  for (const feature of features) {
    if (!feature || typeof feature !== 'object') continue;
    const row = feature as { geometry?: { coordinates?: unknown[] }; properties?: { label?: unknown; name?: unknown; gid?: unknown } };
    const pair = row.geometry?.coordinates;
    if (!Array.isArray(pair) || pair.length < 2) continue;
    const longitude = Number(pair[0]);
    const latitude = Number(pair[1]);
    const name = typeof row.properties?.label === 'string'
      ? row.properties.label
      : typeof row.properties?.name === 'string'
        ? row.properties.name
        : '';
    if (!name || !Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
    places.push({
      id: typeof row.properties?.gid === 'string' ? row.properties.gid : `${latitude},${longitude}`,
      name: name.slice(0, 120),
      latitude,
      longitude,
    });
  }
  return places.slice(0, 5);
}
