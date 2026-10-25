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
  const ascent = Number(summary.ascent);
  return {
    profile: PROFILES[mode],
    distanceM: Math.round(distance),
    durationMinutes: Math.max(1, Math.round(duration / 60)),
    ascentM: Number.isFinite(ascent) ? Math.round(ascent) : null,
    points,
  };
}

function firstFeature(payload: unknown): {
  geometry?: { coordinates?: LngLat[] };
  properties?: { summary?: { distance?: number; duration?: number; ascent?: number } };
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
