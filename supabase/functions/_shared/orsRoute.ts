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

/** A UK postcode, with or without the space. "bs81ab" and "BS8 1AB" both match. */
export function isUkPostcode(query: string): boolean {
  const compact = query.replace(/\s+/g, '').toUpperCase();
  return /^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/.test(compact);
}

/** Uppercase a postcode and put one space before the inward code. Other text is only trimmed. */
export function normalisePlaceQuery(query: string): string {
  const trimmed = query.trim().replace(/\s+/g, ' ');
  const compact = trimmed.replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/.test(compact)) return trimmed;
  return `${compact.slice(0, -3)} ${compact.slice(-3)}`;
}

export function geocodeUrl(query: string): string {
  const text = encodeURIComponent(query.trim().slice(0, 80));
  const country = isUkPostcode(query) ? '&boundary.country=GB' : '';
  return `${ORS_HOST}/pelias/v1/search?text=${text}&size=5${country}`;
}

const PACE_M_PER_MIN = { walk: 80, run: 150, cycle: 250 } as const;

/** Round-trip length this app sends, in metres. A loop uses this as `round_trip.length`. */
export const ROUTE_DISTANCE_MIN_M = 500;
export const ROUTE_DISTANCE_MAX_M = 50_000;
/** A time becomes a length only inside this window, then that length is clamped to the distance window. */
export const ROUTE_MINUTES_MIN = 10;
export const ROUTE_MINUTES_MAX = 180;

export function readMode(value: unknown): Mode | null {
  return value === 'walk' || value === 'run' || value === 'cycle' ? value : null;
}

export function readShape(value: unknown): 'loop' | 'a_to_b' | null {
  return value === 'loop' || value === 'a_to_b' ? value : null;
}

export function cleanPlaceQuery(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const query = normalisePlaceQuery(value);
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
    return clamp(Math.round(distance), ROUTE_DISTANCE_MIN_M, ROUTE_DISTANCE_MAX_M);
  }
  const minutes = typeof input.minutes === 'number' ? input.minutes : Number(input.minutes);
  if (Number.isFinite(minutes) && input.minutes != null && input.minutes !== '') {
    return clamp(
      clamp(Math.round(minutes), ROUTE_MINUTES_MIN, ROUTE_MINUTES_MAX) * PACE_M_PER_MIN[input.mode],
      ROUTE_DISTANCE_MIN_M,
      ROUTE_DISTANCE_MAX_M,
    );
  }
  return null;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/** A route or snap. Twelve in ten minutes, or forty in a day. */
export const ROUTE_TEN_MINUTE_CAP = 12;
export const ROUTE_DAILY_CAP = 40;

/** A place search. Thirty in ten minutes, or three hundred in a day. */
export const SEARCH_TEN_MINUTE_CAP = 30;
export const SEARCH_DAILY_CAP = 300;

/** True when this account is named in a comma-separated exemption list. */
export function listedUser(allowlist: string | undefined, userId: string): boolean {
  if (!userId || !allowlist) return false;
  const wanted = userId.trim().toLowerCase();
  if (!wanted) return false;
  return allowlist.split(',').map((item) => item.trim().toLowerCase()).filter(Boolean).includes(wanted);
}

export function withinRouteLimit(stamps: readonly number[], now: number): { ok: boolean; next: number[] } {
  return withinWindow(stamps, now, ROUTE_TEN_MINUTE_CAP, ROUTE_DAILY_CAP);
}

export function withinSearchLimit(stamps: readonly number[], now: number): { ok: boolean; next: number[] } {
  return withinWindow(stamps, now, SEARCH_TEN_MINUTE_CAP, SEARCH_DAILY_CAP);
}

function withinWindow(
  stamps: readonly number[],
  now: number,
  burst: number,
  daily: number,
): { ok: boolean; next: number[] } {
  const day = stamps.filter((stamp) => now - stamp < 86_400_000 && now >= stamp);
  const recent = day.filter((stamp) => now - stamp < 600_000);
  if (recent.length >= burst || day.length >= daily) return { ok: false, next: day };
  return { ok: true, next: [...day, now] };
}

/**
 * Free Standard plan, Directions V2: 2,000 a day and 40 a minute.
 * Geocoding on that plan is 3,000 a day.
 * https://account.heigit.org/info/plans
 * Directions stay under 2,000. Geocoding stays under 3,000.
 * The two caps together stay under 3,000.
 */
export const ORS_FREE_DIRECTIONS_PER_DAY = 2000;

export const ORS_FREE_GEOCODING_PER_DAY = 3000;

export const GLOBAL_ROUTE_DAILY_CAP = 1500;

/** Place searches for the whole app. Kept apart from the directions cap. */
export const GLOBAL_SEARCH_DAILY_CAP = 1200;

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

export const VIA_POINT_CAP = 5;

/** Hosted directions accepts this many coordinates. A sketch is refused above it. */
export const ORS_WAYPOINT_LIMIT = 50;

/**
 * How far a sketch corner may snap to the path network, in metres.
 * Wide enough for a finger that sits just off a path. Short of the next street.
 */
export const SKETCH_SNAP_RADIUS_M = 100;

/** Walking and cycling weightings that prefer greener, quieter paths. */
export const PREFER_PATH_WEIGHTINGS = { green: 1, quiet: 1 } as const;

/**
 * A walk that prefers footpaths uses the hiking profile, which prefers trails.
 * Run already uses that profile. Cycling stays on the cycling profile.
 */
export function routingMode(mode: Mode, preferPaths: boolean): Mode {
  if (preferPaths && mode === 'walk') return 'run';
  return mode;
}

/** Missing means no via-points. More than five, or a bad point, is refused. The message must not echo a coordinate. */
export function readViaPoints(value: unknown): { latitude: number; longitude: number }[] | null {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > VIA_POINT_CAP) return null;
  const points: { latitude: number; longitude: number }[] = [];
  for (const item of value) {
    const point = readPlace(item);
    if (!point) return null;
    points.push(point);
  }
  return points;
}

type PlacePoint = { latitude: number; longitude: number };

function routeOptions(
  roundTrip: { length: number; points: number } | null,
  preferPaths: boolean,
): { options?: Record<string, unknown> } {
  if (!roundTrip && !preferPaths) return {};
  const options: Record<string, unknown> = {};
  if (roundTrip) options.round_trip = roundTrip;
  if (preferPaths) options.profile_params = { weightings: { ...PREFER_PATH_WEIGHTINGS } };
  return { options };
}

function coordinateOf(point: PlacePoint): [number, number] {
  return [round6(point.longitude), round6(point.latitude)];
}

/** Missing means no sketch. More than the waypoint limit, or a bad point, is refused. */
export function readSketchPoints(value: unknown): PlacePoint[] | null {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > ORS_WAYPOINT_LIMIT || value.length === 1) return null;
  const points: PlacePoint[] = [];
  for (const item of value) {
    const point = readPlace(item);
    if (!point) return null;
    points.push(point);
  }
  return points;
}

export function buildDirectionsBody(input: {
  mode: Mode;
  shape: 'loop' | 'a_to_b';
  start: PlacePoint;
  end?: PlacePoint | null;
  lengthM: number;
  via?: readonly PlacePoint[] | null;
  preferPaths?: boolean;
  sketch?: readonly PlacePoint[] | null;
}): Record<string, unknown> | null {
  const preferPaths = input.preferPaths === true;
  const sketch = (input.sketch ?? []).slice(0, ORS_WAYPOINT_LIMIT);
  if (sketch.length >= 2) {
    return {
      coordinates: sketch.map(coordinateOf),
      // One radius per corner. continue_straight refuses a u-turn at a corner,
      // which is the out-and-back a point on the wrong side of a junction causes.
      radiuses: sketch.map(() => SKETCH_SNAP_RADIUS_M),
      continue_straight: true,
      elevation: true,
      instructions: false,
      ...routeOptions(null, preferPaths),
    };
  }
  const start = coordinateOf(input.start);
  const vias = (input.via ?? []).slice(0, VIA_POINT_CAP).map(coordinateOf);
  if (vias.length > 0) {
    if (input.shape === 'loop') {
      return { coordinates: [start, ...vias, start], elevation: true, instructions: false, ...routeOptions(null, preferPaths) };
    }
    if (!input.end) return null;
    return { coordinates: [start, ...vias, coordinateOf(input.end)], elevation: true, instructions: false, ...routeOptions(null, preferPaths) };
  }
  if (input.shape === 'loop') {
    return {
      coordinates: [start],
      elevation: true,
      instructions: false,
      ...routeOptions({ length: input.lengthM, points: 5 }, preferPaths),
    };
  }
  if (!input.end) return null;
  return {
    coordinates: [start, coordinateOf(input.end)],
    elevation: true,
    instructions: false,
    ...routeOptions(null, preferPaths),
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

type LngLat = number[];

export function parseDirections(payload: unknown, mode: Mode, shape: 'loop' | 'a_to_b'): {
  profile: string;
  distanceM: number;
  durationMinutes: number;
  ascentM: number | null;
  descentM: number | null;
  elevationsM: number[] | null;
  points: { latitude: number; longitude: number }[];
} | null {
  const feature = firstFeature(payload);
  if (!feature) return null;
  const coords = feature.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const points: { latitude: number; longitude: number }[] = [];
  const elevations: number[] = [];
  let elevationsComplete = true;
  for (const pair of coords) {
    if (points.length >= 2000) break;
    if (!Array.isArray(pair) || pair.length < 2) continue;
    const longitude = Number(pair[0]);
    const latitude = Number(pair[1]);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
    points.push({ latitude, longitude });
    const elevation = pair.length >= 3 ? Number(pair[2]) : Number.NaN;
    if (Number.isFinite(elevation) && elevation > -500 && elevation < 9000) elevations.push(elevation);
    else elevationsComplete = false;
  }
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
    descentM: readDescent(feature.properties),
    elevationsM: elevationsComplete && elevations.length === points.length ? elevations : null,
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

/** ORS puts descent on `properties.descent`, and sometimes on `properties.summary.descent`. A missing field stays null. */
function readDescent(properties: { descent?: unknown; summary?: { descent?: unknown } } | undefined): number | null {
  const direct = Number(properties?.descent);
  if (Number.isFinite(direct) && direct >= 0 && direct <= 20_000) return Math.round(direct);
  const summary = Number(properties?.summary?.descent);
  if (Number.isFinite(summary) && summary >= 0 && summary <= 20_000) return Math.round(summary);
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
