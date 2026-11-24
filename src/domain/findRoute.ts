import { UserFacingError } from './errors';
import {
  drawnLineAfterSnap,
  formatWalkDistance,
  pathMetres,
  sketchWaypointSets,
  type OutdoorKind,
  type OutdoorPoint,
} from './outdoorRoute';
import { OSM_CONTRIBUTORS, ORS_CREDIT, ROUTE_SKETCH_LINE } from './routeConsent';

export { OSM_CONTRIBUTORS, ORS_CREDIT };

export const ROUTE_SERVICE_LINE =
  `The start point, the destination, and any points you add on the map are sent to our route service (OpenRouteService, built on OpenStreetMap data) to make the route. ${ROUTE_SKETCH_LINE} Nothing is shared with other people.`;

export { ROUTE_RETENTION_LINE, ROUTE_SEND_LINE } from './routeConsent';

export const ROUTE_UNAVAILABLE =
  'The route service is not available right now. Nothing was saved.';

export const ROUTE_NO_PATH =
  'We couldn\'t find a path near that start. Try a start nearer a street or footpath.';

export const ROUTE_RATE_LIMITED =
  'You\'ve made a lot of route requests. Try again in a little while.';

export const ROUTE_BAD_REQUEST = 'That route request could not be used.';

export const ROUTE_SIGN_IN = 'Please sign in again.';

export const ROUTE_OFFLINE = 'Check your connection and try again.';

export const SEARCH_SLOW = 'The place search took too long. Try again.';

export const SEARCH_EMPTY = 'No place matched that search.';

export const SEARCH_FAILED = 'The place search did not answer.';

export const ROUTE_SLOW = 'The route took too long. Nothing was saved.';

export const DRAW_TOO_SHORT = 'Draw a longer line.';

/** One client wait for a route or a place search. The edge function stops at 12 seconds. */
export const ROUTE_CLIENT_TIMEOUT_MS = 15_000;

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
  /** Points the route is pulled through, between the start and the destination. At most five. */
  via?: OutdoorPoint[] | null;
  /** Bias the route toward paths and trails, and away from main roads. */
  preferPaths?: boolean;
  /** A pencil sketch. The route follows these points instead of a chosen length. */
  sketch?: OutdoorPoint[] | null;
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
  /** The green start when the route service moved off the GPS point. Null when the start was already on a path. */
  snappedStart: OutdoorPoint | null;
  snapDistanceM: number | null;
  /** Metres down, when the route service sent a descent. Null when it did not. */
  descentM?: number | null;
  /** Steepest grade, percent, when the route service or the elevation samples provide it. */
  maxGradientPct?: number | null;
  /** Mean absolute grade, percent. Null when elevation was not returned. */
  averageGradientPct?: number | null;
  /** Elevation samples along the line, metres. Null when the snap response has none. */
  elevationsM?: number[] | null;
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

/**
 * The same window `routeLengthM` sends to OpenRouteService.
 * A loop asks for a round trip of this length. A longer or shorter figure is clamped there.
 * A time is turned into a length only inside the minute window, then clamped to the same length.
 */
export const ROUTE_DISTANCE_MIN_M = 500;
export const ROUTE_DISTANCE_MAX_M = 50_000;
export const ROUTE_MINUTES_MIN = 10;
export const ROUTE_MINUTES_MAX = 180;

/** One mile, matching the kilometres or miles setting on this phone. */
const METRES_PER_MILE = 1609.344;

export type RouteDistanceUnit = 'km' | 'mile';

export const ROUTE_DISTANCE_CHOICES = [
  { id: '3', label: '3 km', metres: 3000 },
  { id: '5', label: '5 km', metres: 5000 },
  { id: '8', label: '8 km', metres: 8000 },
  { id: 'time', label: 'Use time', metres: null },
  { id: 'custom', label: 'Custom', metres: null },
] as const;

export const ROUTE_TIME_CHOICES = [
  { id: 'none', label: 'No set time', minutes: null },
  { id: '30', label: '30 min', minutes: 30 },
  { id: '45', label: '45 min', minutes: 45 },
  { id: '60', label: '60 min', minutes: 60 },
  { id: 'custom', label: 'Custom', minutes: null },
] as const;

export type RouteDistanceChoice = (typeof ROUTE_DISTANCE_CHOICES)[number]['id'];
export type RouteTimeChoice = (typeof ROUTE_TIME_CHOICES)[number]['id'];

export const DISTANCE_WINS_NOTE =
  'When both distance and time are set, the distance is used. A time on its own is turned into a distance.';

export const ROUTE_DISTANCE_NUMBER_MESSAGE: Record<RouteDistanceUnit, string> = {
  km: 'Enter a distance in kilometres.',
  mile: 'Enter a distance in miles.',
};

export const ROUTE_MINUTES_NUMBER_MESSAGE = 'Enter a whole number of minutes.';

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
    return clamp(Math.round(distance), ROUTE_DISTANCE_MIN_M, ROUTE_DISTANCE_MAX_M);
  }
  const minutes = input.minutes;
  if (typeof minutes === 'number' && Number.isFinite(minutes)) {
    const bounded = clamp(Math.round(minutes), ROUTE_MINUTES_MIN, ROUTE_MINUTES_MAX);
    return clamp(bounded * PACE_M_PER_MIN[input.mode], ROUTE_DISTANCE_MIN_M, ROUTE_DISTANCE_MAX_M);
  }
  return null;
}

function metresPerUnit(unit: RouteDistanceUnit): number {
  return unit === 'mile' ? METRES_PER_MILE : 1000;
}

/** Shortest and longest custom distances that still fall inside the route-service window. */
function distanceBoundAmount(unit: RouteDistanceUnit, edge: 'min' | 'max'): string {
  if (unit === 'km') return edge === 'min' ? '0.5' : '50';
  if (edge === 'min') {
    let cents = Math.ceil((ROUTE_DISTANCE_MIN_M / METRES_PER_MILE) * 100);
    while (Math.round((cents / 100) * METRES_PER_MILE) < ROUTE_DISTANCE_MIN_M) cents += 1;
    return (cents / 100).toFixed(2);
  }
  let cents = Math.floor((ROUTE_DISTANCE_MAX_M / METRES_PER_MILE) * 100);
  while (Math.round((cents / 100) * METRES_PER_MILE) > ROUTE_DISTANCE_MAX_M) cents -= 1;
  return (cents / 100).toFixed(2);
}

export function routeDistanceSpan(unit: RouteDistanceUnit): string {
  const word = unit === 'mile' ? 'miles' : 'km';
  return `${distanceBoundAmount(unit, 'min')} and ${distanceBoundAmount(unit, 'max')} ${word}`;
}

export function routeDistanceRangeMessage(unit: RouteDistanceUnit): string {
  return `Enter a distance between ${routeDistanceSpan(unit)}.`;
}

export function routeMinutesRangeMessage(): string {
  return `Enter a time between ${ROUTE_MINUTES_MIN} and ${ROUTE_MINUTES_MAX} minutes.`;
}

export function routeDistanceFieldHint(unit: RouteDistanceUnit): string {
  return `Between ${routeDistanceSpan(unit)}.`;
}

export function routeMinutesFieldHint(): string {
  return `Between ${ROUTE_MINUTES_MIN} and ${ROUTE_MINUTES_MAX} minutes.`;
}

function parseDecimal(text: string): number | null {
  const cleaned = text.trim().replace(',', '.');
  if (!/^(\d+(\.\d+)?|\.\d+)$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

/** A typed distance in kilometres or miles. Outside the route-service window is refused. */
export function parseCustomRouteDistance(
  text: string,
  unit: RouteDistanceUnit,
): { ok: true; metres: number } | { ok: false; message: string } {
  const amount = parseDecimal(text);
  if (amount == null) return { ok: false, message: ROUTE_DISTANCE_NUMBER_MESSAGE[unit] };
  const metres = Math.round(amount * metresPerUnit(unit));
  if (metres < ROUTE_DISTANCE_MIN_M || metres > ROUTE_DISTANCE_MAX_M) {
    return { ok: false, message: routeDistanceRangeMessage(unit) };
  }
  return { ok: true, metres };
}

/** Whole minutes. Outside the window the route service turns into a length is refused. */
export function parseCustomRouteMinutes(
  text: string,
): { ok: true; minutes: number } | { ok: false; message: string } {
  const cleaned = text.trim();
  if (!/^\d+$/.test(cleaned)) return { ok: false, message: ROUTE_MINUTES_NUMBER_MESSAGE };
  const minutes = Number(cleaned);
  if (minutes < ROUTE_MINUTES_MIN || minutes > ROUTE_MINUTES_MAX) {
    return { ok: false, message: routeMinutesRangeMessage() };
  }
  return { ok: true, minutes };
}

export type RouteAsk =
  | { ok: true; distanceM: number | null; minutes: number | null; lengthM: number }
  | { ok: false; message: string };

/**
 * The distance and time the route request should carry.
 * A preset is used as it is. Custom text is parsed in the phone's distance unit.
 * Distance wins when both are set. A time on its own becomes `lengthM` from the pace.
 * The same `lengthM` is used for a loop and for A to B.
 */
export function routeAskFromChoices(input: {
  mode: RouteMode;
  distanceChoice: RouteDistanceChoice;
  timeChoice: RouteTimeChoice;
  customDistance: string;
  customMinutes: string;
  unit: RouteDistanceUnit;
}): RouteAsk {
  let distanceM: number | null = null;
  if (input.distanceChoice === 'custom') {
    const parsed = parseCustomRouteDistance(input.customDistance, input.unit);
    if (!parsed.ok) return parsed;
    distanceM = parsed.metres;
  } else {
    distanceM = ROUTE_DISTANCE_CHOICES.find((item) => item.id === input.distanceChoice)?.metres ?? null;
  }

  let minutes: number | null = null;
  if (input.timeChoice === 'custom') {
    const trimmed = input.customMinutes.trim();
    if (trimmed.length === 0) {
      if (distanceM == null) return { ok: false, message: ROUTE_MINUTES_NUMBER_MESSAGE };
    } else {
      const parsed = parseCustomRouteMinutes(trimmed);
      if (!parsed.ok) return parsed;
      minutes = parsed.minutes;
    }
  } else {
    minutes = ROUTE_TIME_CHOICES.find((item) => item.id === input.timeChoice)?.minutes ?? null;
  }

  if (distanceM == null && minutes == null) {
    return { ok: false, message: 'Choose a distance or a time.' };
  }
  const lengthM = targetLengthM({ mode: input.mode, distanceM, minutes });
  if (lengthM == null) return { ok: false, message: 'Choose a distance or a time.' };
  return { ok: true, distanceM, minutes, lengthM };
}

/** What the phone asks for. Loop and A to B both carry the custom distance or the time-converted length. */
export function plannedRouteFields(input: {
  mode: RouteMode;
  shape: RouteShape;
  distanceM: number | null;
  minutes: number | null;
}): {
  mode: RouteMode;
  shape: RouteShape;
  distanceM: number | null;
  minutes: number | null;
  lengthM: number | null;
} {
  return {
    mode: input.mode,
    shape: input.shape,
    distanceM: input.distanceM,
    minutes: input.minutes,
    lengthM: targetLengthM(input),
  };
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
  const snappedStart = routeCoordinate(row.snappedStart);
  const snapRaw = typeof row.snapDistanceM === 'number' ? row.snapDistanceM : null;
  const snapDistanceM = snapRaw != null && Number.isFinite(snapRaw) && snapRaw >= 0 ? Math.round(snapRaw) : null;
  const elevationsM = readElevations(row.elevationsM) ?? elevationsFromPoints(row.points);
  return {
    mocked: row.mocked === true,
    mode,
    shape,
    profile,
    distanceM: Math.round(distance),
    durationMinutes: Math.max(1, Math.round(duration)),
    ascentM: ascent,
    points: points.slice(0, 2000),
    snappedStart,
    snapDistanceM,
    descentM: readMetres(row.descentM),
    maxGradientPct: readPercent(row.maxGradientPct),
    averageGradientPct: readPercent(row.averageGradientPct),
    elevationsM,
  };
}

function readMetres(value: unknown): number | null {
  const number = typeof value === 'number' ? value : Number.NaN;
  if (!Number.isFinite(number) || number < 0 || number > 20_000) return null;
  return Math.round(number);
}

function readPercent(value: unknown): number | null {
  const number = typeof value === 'number' ? value : Number.NaN;
  if (!Number.isFinite(number) || number < 0 || number > 100) return null;
  return Math.round(number * 10) / 10;
}

function readElevations(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const metres = value
    .map((item) => (typeof item === 'number' ? item : Number.NaN))
    .filter((item) => Number.isFinite(item) && item > -500 && item < 9000)
    .slice(0, 400);
  return metres.length >= 2 ? metres : null;
}

/** Every point must carry an elevation. A partial list would draw a profile that does not match the line. */
function elevationsFromPoints(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const metres: number[] = [];
  for (const point of value.slice(0, 400)) {
    if (!point || typeof point !== 'object') return null;
    const raw = (point as { elevationM?: unknown; elevation?: unknown }).elevationM
      ?? (point as { elevation?: unknown }).elevation;
    if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= -500 || raw >= 9000) return null;
    metres.push(raw);
  }
  return metres.length >= 2 ? metres : null;
}

function shift(origin: OutdoorPoint, northM: number, eastM: number): OutdoorPoint {
  const lat = origin.latitude + northM / 111_320;
  const lng = origin.longitude + eastM / (111_320 * Math.cos((origin.latitude * Math.PI) / 180));
  return { latitude: lat, longitude: lng };
}

function profileFor(input: Pick<RoutePlanInput, 'mode' | 'preferPaths'>): RoutePlan['profile'] {
  if (input.preferPaths === true && input.mode === 'walk') return 'foot-hiking';
  return routeProfile(input.mode);
}

/** A bent sample line around the start. It is not a path from the route service. */
export function mockRoute(input: RoutePlanInput): RoutePlan | null {
  const sketch = (input.sketch ?? [])
    .map((point) => routeCoordinate(point))
    .filter((point): point is OutdoorPoint => point != null);
  if (sketch.length >= 2) {
    const distanceM = Math.max(1, pathMetres(sketch));
    return {
      mocked: true,
      mode: input.mode,
      shape: input.shape,
      profile: profileFor(input),
      distanceM,
      durationMinutes: Math.max(1, Math.round(distanceM / PACE_M_PER_MIN[input.mode])),
      ascentM: null,
      points: sketch.slice(0, 2000),
      snappedStart: null,
      snapDistanceM: null,
    };
  }
  const length = targetLengthM(input);
  const start = routeCoordinate(input.start);
  if (!length || !start) return null;
  const end = input.shape === 'a_to_b' ? routeCoordinate(input.end) : null;
  if (input.shape === 'a_to_b' && !end) return null;
  const minutes = typeof input.minutes === 'number' && input.minutes >= 10
    ? Math.round(input.minutes)
    : Math.max(10, Math.round(length / PACE_M_PER_MIN[input.mode]));
  const vias = (input.via ?? []).filter((point): point is OutdoorPoint => routeCoordinate(point) != null).slice(0, 5);
  if (vias.length > 0) {
    const close = input.shape === 'a_to_b' && end ? end : start;
    return {
      mocked: true,
      mode: input.mode,
      shape: input.shape,
      profile: profileFor(input),
      distanceM: length + vias.length * 250,
      durationMinutes: minutes + vias.length * 4,
      ascentM: vias.length * 12,
      points: [start, ...vias, close],
      snappedStart: null,
      snapDistanceM: null,
    };
  }
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
  return {
    mocked: true,
    mode: input.mode,
    shape: input.shape,
    profile: profileFor(input),
    distanceM: length,
    durationMinutes: minutes,
    ascentM: null,
    points,
    snappedStart: null,
    snapDistanceM: null,
  };
}

function copyPlanPoints(points: readonly OutdoorPoint[]): OutdoorPoint[] {
  return points.map((point) => ({ latitude: point.latitude, longitude: point.longitude }));
}

/** Figures follow the cleaned geometry, at the pace the route service just used. */
export function adoptSnappedLine(plan: RoutePlan, points: readonly OutdoorPoint[]): RoutePlan {
  const line = copyPlanPoints(points);
  const distanceM = Math.max(1, pathMetres(line));
  const pace = plan.durationMinutes > 0 ? plan.distanceM / plan.durationMinutes : PACE_M_PER_MIN[plan.mode];
  const durationMinutes = Math.max(1, Math.round(distanceM / Math.max(1, pace)));
  const ascentM = plan.ascentM == null || plan.distanceM <= 0
    ? plan.ascentM
    : Math.max(0, Math.round(plan.ascentM * (distanceM / plan.distanceM)));
  const descentM = plan.descentM == null || plan.distanceM <= 0
    ? plan.descentM ?? null
    : Math.max(0, Math.round(plan.descentM * (distanceM / plan.distanceM)));
  const sameShape = line.length === plan.points.length;
  return {
    ...plan,
    points: line,
    distanceM,
    durationMinutes,
    ascentM,
    descentM,
    elevationsM: sameShape ? plan.elevationsM ?? null : null,
    maxGradientPct: sameShape ? plan.maxGradientPct ?? null : null,
    averageGradientPct: sameShape ? plan.averageGradientPct ?? null : null,
  };
}

/** The pencil line, when no snap stayed close to it. Climb is unknown. */
export function unmatchedDrawnPlan(input: {
  mode: RouteMode;
  shape: RouteShape;
  preferPaths: boolean;
  points: readonly OutdoorPoint[];
}): RoutePlan {
  const line = copyPlanPoints(input.points);
  const distanceM = Math.max(1, pathMetres(line));
  const pace = PACE_M_PER_MIN[input.mode];
  return {
    mocked: false,
    mode: input.mode,
    shape: input.shape,
    profile: input.preferPaths && input.mode === 'walk' ? 'foot-hiking' : routeProfile(input.mode),
    distanceM,
    durationMinutes: Math.max(1, Math.round(distanceM / pace)),
    ascentM: null,
    points: line,
    snappedStart: null,
    snapDistanceM: null,
  };
}

/**
 * Tries the corner sketch, then fewer corners.
 * A line that comes back is kept only when it still follows the pencil.
 * When every answer is a miss, `sawRoute` says whether the service answered at all.
 */
export async function matchDrawnSketch(input: {
  sketch: readonly OutdoorPoint[];
  send: (waypoints: readonly OutdoorPoint[]) => Promise<RoutePlan>;
}): Promise<
  | { matched: true; plan: RoutePlan }
  | { matched: false; sawRoute: true }
  | { matched: false; sawRoute: false; error: unknown }
> {
  const sets = sketchWaypointSets(input.sketch);
  let sawRoute = false;
  let lastError: unknown = null;
  for (const waypoints of sets) {
    try {
      const plan = await input.send(waypoints);
      sawRoute = true;
      const choice = drawnLineAfterSnap({ sketch: input.sketch, routed: plan.points });
      if (choice.matched) return { matched: true, plan: adoptSnappedLine(plan, choice.points) };
    } catch (error) {
      lastError = error;
    }
  }
  if (sawRoute) return { matched: false, sawRoute: true };
  return { matched: false, sawRoute: false, error: lastError };
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

/** How far the green start moved from the phone. Zero and a missing distance stay quiet. */
export function nearestPathLine(metres: number | null | undefined): string | null {
  if (typeof metres !== 'number' || !Number.isFinite(metres) || metres <= 0) return null;
  return `Starting from the nearest path, about ${Math.round(metres)} m away.`;
}

/** A short message from our function. A body that looks like a place is not shown. */
export function calmRouteMessage(value: unknown): string {
  return calmOr(value, ROUTE_UNAVAILABLE);
}

function calmOr(value: unknown, fallback: string): string {
  if (!value || typeof value !== 'object') return fallback;
  const message = (value as { message?: unknown }).message;
  if (typeof message !== 'string') return fallback;
  const text = message.trim();
  if (text.length < 8 || text.length > 180) return fallback;
  if (/\d+\.\d{3,}/.test(text)) return fallback;
  if (/-?\d{1,3}\.\d+\s*,\s*-?\d{1,3}\.\d+/.test(text)) return fallback;
  return text;
}

/**
 * Why a route call did not return a line.
 * `functions.invoke` leaves a non-2xx body on `error.context`, with `data` null.
 * A 401 or a dropped connection never reaches the function, so those are not "the route service".
 */
export async function explainRouteFailure(error: unknown, now = Date.now()): Promise<string> {
  const status = statusOf(error);
  if (status === 401) return ROUTE_SIGN_IN;
  if (isRouteNetworkError(error)) return ROUTE_OFFLINE;
  const body = await readInvokeBody(error);
  const message = messageForRouteBody(body, status);
  if (status === 429 || isRateLimitedBody(body)) {
    const extra = rateLimitFreesLine(body, retryAfterHeader(error), now);
    if (extra && !message.includes('You can try again in')) return `${message} ${extra}`;
  }
  return message;
}

function isRateLimitedBody(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false;
  const code = (body as { code?: unknown }).code;
  return code === 'rate_limited' || code === 'rate';
}

/**
 * When the refusal says when the limit lifts.
 * A missing time stays quiet. The phone does not guess from the 40-a-day rule.
 */
export function rateLimitFreesLine(body: unknown, retryAfterHeaderValue: string | null = null, now = Date.now()): string | null {
  const seconds = retrySecondsFromBody(body, now) ?? retrySecondsFromHeader(retryAfterHeaderValue, now);
  if (seconds == null || seconds > 86_400 * 2) return null;
  return freesIn(seconds);
}

function freesIn(seconds: number): string {
  const whole = Math.max(1, Math.round(seconds));
  if (whole < 90) return `You can try again in ${whole} ${whole === 1 ? 'second' : 'seconds'}.`;
  const minutes = Math.max(1, Math.round(whole / 60));
  if (minutes < 90) return `You can try again in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`;
  const hours = Math.max(1, Math.round(minutes / 60));
  return `You can try again in ${hours} ${hours === 1 ? 'hour' : 'hours'}.`;
}

function retrySecondsFromBody(body: unknown, now: number): number | null {
  if (!body || typeof body !== 'object') return null;
  const row = body as Record<string, unknown>;
  const direct = row.retryAfter ?? row.retry_after ?? row.retryAfterSeconds;
  if (typeof direct === 'number' && Number.isFinite(direct) && direct > 0) return direct;
  if (typeof direct === 'string' && /^\d+$/.test(direct.trim())) {
    const seconds = Number(direct.trim());
    return seconds > 0 ? seconds : null;
  }
  return secondsUntil(row.resetAt ?? row.freesAt ?? row.retryAt ?? row.availableAt, now);
}

function retrySecondsFromHeader(header: string | null, now: number): number | null {
  if (!header) return null;
  const trimmed = header.trim();
  if (/^\d+$/.test(trimmed)) {
    const seconds = Number(trimmed);
    return seconds > 0 ? seconds : null;
  }
  return secondsUntil(trimmed, now);
}

function secondsUntil(value: unknown, now: number): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 1_000_000_000_000) {
    const seconds = Math.round((value - now) / 1000);
    return seconds > 0 ? seconds : null;
  }
  if (typeof value !== 'string') return null;
  const at = Date.parse(value);
  if (!Number.isFinite(at)) return null;
  const seconds = Math.round((at - now) / 1000);
  return seconds > 0 ? seconds : null;
}

function retryAfterHeader(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  const context = (error as { context?: unknown }).context;
  if (!context || typeof context !== 'object') return null;
  const headers = (context as { headers?: { get?: (name: string) => string | null } }).headers;
  if (!headers || typeof headers.get !== 'function') return null;
  try {
    const value = headers.get('Retry-After') ?? headers.get('retry-after');
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  } catch {
    return null;
  }
}

function modeWord(mode: RouteMode): string {
  if (mode === 'run') return 'Run';
  if (mode === 'cycle') return 'Cycle';
  return 'Walk';
}

function formatPercent(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/**
 * Distance, time for the mode, and climb.
 * Descent, gradient, and a profile are added only when the snap response carried them.
 */
export function routeSnapLines(plan: Pick<RoutePlan, 'distanceM' | 'durationMinutes' | 'mode' | 'ascentM'> & Partial<Pick<RoutePlan, 'descentM' | 'maxGradientPct' | 'averageGradientPct' | 'elevationsM'>>): string[] {
  const lines = [
    `${formatWalkDistance(plan.distanceM)} · ${modeWord(plan.mode)} · ${plan.durationMinutes} min`,
    formatClimb(plan.ascentM ?? null),
  ];
  if (typeof plan.descentM === 'number' && Number.isFinite(plan.descentM)) {
    lines.push(`Descent ${Math.max(0, Math.round(plan.descentM))} m`);
  }
  const derived = gradientFromElevations(plan.elevationsM, plan.distanceM);
  const max = readPercent(plan.maxGradientPct) ?? derived?.max ?? null;
  const average = readPercent(plan.averageGradientPct) ?? derived?.average ?? null;
  if (max != null && average != null) lines.push(`Max gradient ${formatPercent(max)}% · average ${formatPercent(average)}%`);
  else if (max != null) lines.push(`Max gradient ${formatPercent(max)}%`);
  else if (average != null) lines.push(`Average gradient ${formatPercent(average)}%`);
  return lines;
}

/** At least two samples. One number is not a profile. */
export function routeElevations(plan: { elevationsM?: readonly number[] | null }): number[] | null {
  const values = plan.elevationsM?.filter((value) => typeof value === 'number' && Number.isFinite(value));
  if (!values || values.length < 2) return null;
  return [...values];
}

/** A short list for the profile line. The samples are the route's own elevations, thinned for drawing. */
export function elevationProfileSamples(metres: readonly number[], limit = 48): number[] {
  if (metres.length <= limit) return [...metres];
  const sampled: number[] = [];
  const last = metres.length - 1;
  for (let index = 0; index < limit; index += 1) {
    const at = Math.round((index / (limit - 1)) * last);
    sampled.push(metres[at] ?? metres[last] ?? 0);
  }
  return sampled;
}

/**
 * Grade from elevation samples and the route length.
 * No samples means no grade. The length is not turned into a made-up hill.
 */
export function gradientFromElevations(
  elevationsM: readonly number[] | null | undefined,
  distanceM: number,
): { max: number; average: number } | null {
  if (!elevationsM || elevationsM.length < 2 || !(distanceM > 0)) return null;
  const step = distanceM / (elevationsM.length - 1);
  if (!(step > 0)) return null;
  let climb = 0;
  let drop = 0;
  let max = 0;
  for (let index = 1; index < elevationsM.length; index += 1) {
    const delta = (elevationsM[index] ?? 0) - (elevationsM[index - 1] ?? 0);
    const grade = (Math.abs(delta) / step) * 100;
    if (grade > max) max = grade;
    if (delta > 0) climb += delta;
    else drop += -delta;
  }
  const average = ((climb + drop) / distanceM) * 100;
  if (!Number.isFinite(max) || !Number.isFinite(average) || max > 100) return null;
  return { max: Math.round(max * 10) / 10, average: Math.round(average * 10) / 10 };
}

export function messageForRouteBody(body: unknown, status: number | null): string {
  const named = body && typeof body === 'object' && typeof (body as { code?: unknown }).code === 'string'
    ? (body as { code: string }).code
    : '';
  if (named === 'unauthorised' || named === 'unauthorized') return ROUTE_SIGN_IN;
  if (named === 'no_path' || status === 422) return calmOr(body, ROUTE_NO_PATH);
  if (named === 'rate_limited' || named === 'rate' || status === 429) return calmOr(body, ROUTE_RATE_LIMITED);
  if (named === 'bad_request' || named === 'input' || status === 400) return calmOr(body, ROUTE_BAD_REQUEST);
  if (named === 'unavailable' || status === 503) return calmOr(body, ROUTE_UNAVAILABLE);
  return ROUTE_UNAVAILABLE;
}

function statusOf(value: unknown): number | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as { status?: unknown; context?: unknown };
  if (typeof record.status === 'number' && Number.isFinite(record.status)) return record.status;
  if (record.context && typeof record.context === 'object') {
    const status = (record.context as { status?: unknown }).status;
    if (typeof status === 'number' && Number.isFinite(status)) return status;
  }
  return null;
}

async function readInvokeBody(error: unknown): Promise<unknown> {
  const source = jsonCarrier(error);
  if (!source) return null;
  try {
    return await source.json();
  } catch {
    return null;
  }
}

function jsonCarrier(error: unknown): { json: () => Promise<unknown> } | null {
  if (!error || typeof error !== 'object') return null;
  const record = error as { json?: unknown; context?: unknown };
  if (typeof record.json === 'function') return record as { json: () => Promise<unknown> };
  if (record.context && typeof record.context === 'object' && typeof (record.context as { json?: unknown }).json === 'function') {
    return record.context as { json: () => Promise<unknown> };
  }
  return null;
}

function isRouteNetworkError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const name = (error as { name?: unknown }).name;
  if (name === 'FunctionsFetchError') return true;
  if (name === 'FunctionsHttpError' || name === 'FunctionsRelayError') return false;
  const message = (error as { message?: unknown }).message;
  const text = typeof message === 'string' ? message : '';
  return /failed to fetch|network request failed|load failed|network error|network connection was lost|failed to send a request to the edge function/i.test(text);
}

/** One pause, then one fresh connection. A second failure is shown as it is. */
export const ROUTE_INVOKE_RETRY_MS = 300;

/**
 * True only when the phone never got an HTTP answer.
 * A 4xx, a 401, and a rate limit are answers. They are not retried.
 */
export function routeInvokeShouldRetry(error: unknown): boolean {
  if (error == null || statusOf(error) != null) return false;
  if (isRouteNetworkError(error)) return true;
  if (typeof error !== 'object') return false;
  const name = (error as { name?: unknown }).name;
  if (name === 'AbortError' || name === 'TimeoutError') return true;
  const message = (error as { message?: unknown }).message;
  const text = typeof message === 'string' ? message : '';
  return /timed out|\btimeout\b/i.test(text);
}

/** The retry closes the dead socket. The first attempt keeps the pooled connection. */
export function routeInvokeHeaders(attempt: number): Record<string, string> | undefined {
  if (attempt === 0) return undefined;
  return { Connection: 'close', 'Cache-Control': 'no-store' };
}

type RouteInvokeResult<T> = { data: T; error: unknown };

/** One extra invoke after a network failure. The second result is the one that is used. */
export async function retryRouteInvoke<T>(
  send: (attempt: number) => Promise<RouteInvokeResult<T>>,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<RouteInvokeResult<T>> {
  let first: RouteInvokeResult<T>;
  try {
    first = await send(0);
  } catch (error) {
    if (!routeInvokeShouldRetry(error)) throw error;
    await sleep(ROUTE_INVOKE_RETRY_MS);
    return send(1);
  }
  if (!routeInvokeShouldRetry(first.error)) return first;
  await sleep(ROUTE_INVOKE_RETRY_MS);
  return send(1);
}

/** Stops a route or place search that never answers, so the spinner can finish. */
export function withDeadline<T>(work: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new UserFacingError(message, 'generic')), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function pointFromPair(value: unknown): OutdoorPoint | null {
  if (!Array.isArray(value) || value.length < 2 || Array.isArray(value[0])) return null;
  const longitude = Number(value[0]);
  const latitude = Number(value[1]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

/** A saved search row, or one OpenRouteService geocode feature. Longitude comes first in the feature. */
export function placeFromSearchHit(place: unknown): RoutePlace | null {
  if (!place || typeof place !== 'object') return null;
  const row = place as {
    id?: unknown;
    name?: unknown;
    geometry?: { coordinates?: unknown };
    properties?: { label?: unknown; name?: unknown; gid?: unknown; lat?: unknown; lon?: unknown };
  };
  const named = typeof row.name === 'string'
    ? row.name.trim()
    : typeof row.properties?.label === 'string'
      ? row.properties.label.trim()
      : typeof row.properties?.name === 'string'
        ? row.properties.name.trim()
        : '';
  if (!named) return null;
  const point = finitePoint(row)
    ?? pointFromPair(row.geometry?.coordinates)
    ?? finitePoint({ latitude: row.properties?.lat, longitude: row.properties?.lon });
  if (!point) return null;
  const rawId = typeof row.id === 'string' && row.id.trim()
    ? row.id
    : typeof row.properties?.gid === 'string' && row.properties.gid.trim()
      ? row.properties.gid
      : named;
  return {
    id: rawId.slice(0, 160),
    name: named.slice(0, 120),
    latitude: point.latitude,
    longitude: point.longitude,
  };
}

export function parseRoutePlaces(value: unknown): RoutePlace[] {
  if (!value || typeof value !== 'object') return [];
  const record = value as { places?: unknown; features?: unknown };
  const rows = Array.isArray(record.places)
    ? record.places
    : Array.isArray(record.features)
      ? record.features
      : [];
  const places: RoutePlace[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const place = placeFromSearchHit(row);
    if (!place || seen.has(place.id)) continue;
    seen.add(place.id);
    places.push(place);
    if (places.length === 5) break;
  }
  return places;
}
