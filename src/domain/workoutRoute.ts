import { sanitizeClientError } from '@/domain/clientError';
import { workoutTypeLabel } from '@/domain/fitnessSnapshot';

/** HealthKit activities that record a GPS path. Indoor sessions are excluded by the caller. */
export const OUTDOOR_ACTIVITY_TYPES = [13, 24, 37, 52] as const;

export const ROUTE_PURPOSE =
  'Charioteer reads this workout route from Apple Health so you can see the path and the splits. The path stays on this iPhone. It is not uploaded, shared, or sent to Thumos.';

export const ROUTE_READ_TYPE = 'HKWorkoutRouteTypeIdentifier';

/**
 * Shown when the path cannot be drawn. The workout summary above it stays.
 * MapKit raises an uncaught exception for an illegal region, so the screen
 * must not mount a map unless the region is inside Apple's limits.
 */
export const ROUTE_LOAD_ERROR = 'Route not available';

/** Shown when the read finished and Health had no path. Not an error. */
export const ROUTE_NONE = 'No route recorded for this workout.';

/** The route screen shows the unavailable line when a query or the map failed. */
export function routeUnavailable(state: {
  ready: boolean;
  denied: boolean;
  failed: boolean;
  mapLine: boolean;
  drawable: boolean;
}): boolean {
  return state.ready && (state.denied || state.failed || state.mapLine);
}

/** The empty-path line. A failed query uses the error line and Try again instead. */
export function routeEmptyCopy(state: {
  ready: boolean;
  failed: boolean;
  mapLine: boolean;
  points: number;
}): string | null {
  if (!state.ready || state.failed || state.mapLine || state.points > 0) return null;
  return ROUTE_NONE;
}

/** Try again only after a query or map error. An empty path does not offer it. */
export function routeRetryVisible(state: { failed: boolean; mapLine: boolean }): boolean {
  return state.failed || state.mapLine;
}

export const ROUTE_RETRY = 'Try again';

/** Shown while the phone is still reading the path. */
export const ROUTE_READING = 'Reading the route on this iPhone.';

/** How long the read, or Apple Maps becoming ready, may take before the fallback. */
export const ROUTE_MAP_TIMEOUT_MS = 10_000;

/** Logged when the map view never reports ready. No coordinates. */
export const ROUTE_MAP_TIMEOUT = 'Map did not become ready.';

/** Logged when the route read never settles. No coordinates. */
export const ROUTE_READ_TIMEOUT = 'The route did not load.';

/** About 500 points is enough to draw a two-hour walk without a huge native path. */
export const ROUTE_POINT_LIMIT = 500;

/** Debug builds only. A release build does not list or read this id. */
export const DEV_FIXTURE_ROUTE_ID = 'dev-fixture-route';

export type DistanceUnit = 'km' | 'mile';

export type DeviceWorkout = {
  id: string;
  activityType: number;
  label: string;
  startedAt: string;
  durationMinutes: number;
  distanceMetres: number | null;
  energyKcal: number | null;
  averageHeartRate: number | null;
  /**
   * Apple's workout effort score, 1 to 10, when HealthKit stored one.
   * Missing when the phone has no score. The path is never part of this summary.
   */
  effortScore?: number | null;
  /** An outdoor type that may have a path. The path itself is loaded later, on this phone. */
  routeExpected: boolean;
  /** Which feed this row came from after Apple Health and Garmin were merged. */
  origin?: 'garmin' | 'apple';
  /** Garmin training effect, 0 to 5. Not an Apple effort score. */
  trainingEffect?: number | null;
  /** Garmin anaerobic training effect, 0 to 5. */
  anaerobicEffect?: number | null;
};

export type RoutePoint = {
  latitude: number;
  longitude: number;
  altitude: number;
  at: string;
  heartRate: number | null;
};

export type HeartSample = { at: string; bpm: number };

export type RouteSplit = {
  index: number;
  label: string;
  metres: number;
  timeSeconds: number;
  paceLabel: string;
  heartRate: number | null;
  elevationMetres: number;
  startIndex: number;
  endIndex: number;
};

export type RouteStats = {
  unit: DistanceUnit;
  distanceLabel: string;
  durationLabel: string;
  paceLabel: string;
  heartLabel: string;
  calorieLabel: string | null;
  splits: RouteSplit[];
};

const UNIT_METRES: Record<DistanceUnit, number> = { km: 1000, mile: 1609.344 };
const UNIT_WORD: Record<DistanceUnit, string> = { km: 'km', mile: 'mi' };

export function routeExpected(activityType: number, indoor: boolean): boolean {
  return !indoor && (OUTDOOR_ACTIVITY_TYPES as readonly number[]).includes(activityType);
}

export function parseDistanceUnit(value: string | null | undefined): DistanceUnit {
  return value === 'mile' ? 'mile' : 'km';
}

export function haversineMetres(from: Pick<RoutePoint, 'latitude' | 'longitude'>, to: Pick<RoutePoint, 'latitude' | 'longitude'>): number {
  const radius = 6_371_000;
  const lat1 = (from.latitude * Math.PI) / 180;
  const lat2 = (to.latitude * Math.PI) / 180;
  const dLat = lat2 - lat1;
  const dLng = ((to.longitude - from.longitude) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * radius * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds)) return '0:00';
  const rounded = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(rounded / 60);
  const remain = rounded % 60;
  return `${minutes}:${String(remain).padStart(2, '0')}`;
}

export function formatDistance(metres: number, unit: DistanceUnit, exact = false): string {
  const word = UNIT_WORD[unit];
  const value = metres / UNIT_METRES[unit];
  if (exact || Math.abs(value - Math.round(value)) < 0.05) return `${Math.round(value)} ${word}`;
  const shown = value >= 10 ? value.toFixed(1) : value.toFixed(1);
  return `${shown} ${word}`;
}

export function elevationLine(metres: number): string {
  const rounded = Math.round(metres);
  if (Math.abs(rounded) < 1) return 'Elevation level';
  if (rounded > 0) return `Elevation ${rounded} m up`;
  return `Elevation ${Math.abs(rounded)} m down`;
}

export function paceLabel(seconds: number, metres: number, unit: DistanceUnit): string {
  if (metres <= 1 || seconds <= 0) return 'Pace not available';
  const perUnit = seconds / (metres / UNIT_METRES[unit]);
  return `${formatClock(perUnit)} / ${UNIT_WORD[unit]}`;
}

/**
 * Distance, duration, average pace, and average heart rate for an outdoor workout.
 * Uses the summary already on the phone. The path is not read here.
 */
export function routeSummaryLine(
  workout: Pick<DeviceWorkout, 'routeExpected' | 'distanceMetres' | 'durationMinutes' | 'averageHeartRate'>,
  unit: DistanceUnit = 'km',
): string | null {
  if (!workout.routeExpected) return null;
  const parts: string[] = [];
  const metres = workout.distanceMetres;
  if (metres != null && metres > 0) parts.push(`Distance ${formatDistance(metres, unit)}`);
  if (workout.durationMinutes > 0) parts.push(`Duration ${workout.durationMinutes} min`);
  if (metres != null && metres > 1 && workout.durationMinutes > 0) {
    const pace = paceLabel(workout.durationMinutes * 60, metres, unit);
    if (pace !== 'Pace not available') parts.push(`Average pace ${pace}`);
  }
  const heart = workout.averageHeartRate;
  if (heart != null && Number.isFinite(heart) && heart > 30) parts.push(`Average heart rate ${Math.round(heart)} bpm`);
  return parts.length ? parts.join(' · ') : null;
}

type Mark = { distance: number; t: number; altitude: number; index: number };

function marksFor(points: readonly RoutePoint[]): Mark[] {
  const marks: Mark[] = [];
  let distance = 0;
  points.forEach((point, index) => {
    if (index > 0) {
      const previous = points[index - 1];
      const step = haversineMetres(previous, point);
      if (Number.isFinite(step) && step > 0 && step < 500) distance += step;
    }
    marks.push({
      distance,
      t: Date.parse(point.at),
      altitude: Number.isFinite(point.altitude) ? point.altitude : 0,
      index,
    });
  });
  return marks;
}

function atDistance(marks: readonly Mark[], target: number): Mark {
  if (target <= 0 || marks.length === 1) return marks[0];
  for (let index = 1; index < marks.length; index += 1) {
    const previous = marks[index - 1];
    const next = marks[index];
    if (next.distance + 0.01 >= target) {
      const span = next.distance - previous.distance;
      const fraction = span <= 0 ? 0 : Math.min(1, (target - previous.distance) / span);
      return {
        distance: target,
        t: previous.t + (next.t - previous.t) * fraction,
        altitude: previous.altitude + (next.altitude - previous.altitude) * fraction,
        index: next.index,
      };
    }
  }
  return marks[marks.length - 1];
}

function heartIn(points: readonly RoutePoint[], samples: readonly HeartSample[] | null | undefined, startMs: number, endMs: number): number | null {
  const fromSamples = (samples ?? []).filter((sample) => {
    const at = Date.parse(sample.at);
    return at >= startMs && at <= endMs && sample.bpm > 30 && sample.bpm < 230;
  });
  const values = fromSamples.length
    ? fromSamples.map((sample) => sample.bpm)
    : points.filter((point) => {
      const at = Date.parse(point.at);
      return point.heartRate != null && at >= startMs && at <= endMs;
    }).map((point) => point.heartRate as number);
  if (!values.length) return null;
  return Math.round(values.reduce((total, value) => total + value, 0) / values.length);
}

export function buildRouteStats(input: {
  points: readonly RoutePoint[];
  unit: DistanceUnit;
  durationSeconds?: number | null;
  energyKcal?: number | null;
  averageHeartRate?: number | null;
  heartSamples?: readonly HeartSample[];
  /** Workout summary distance. Used only when the path itself has no points. */
  distanceMetres?: number | null;
}): RouteStats {
  const unit = input.unit;
  const points = [...input.points].filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude)).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const marks = points.length ? marksFor(points) : [];
  const summaryMetres = input.distanceMetres != null && input.distanceMetres > 0 ? input.distanceMetres : 0;
  const totalMetres = points.length > 0 ? (marks.at(-1)?.distance ?? 0) : summaryMetres;
  const elapsed = input.durationSeconds && input.durationSeconds > 0
    ? input.durationSeconds
    : marks.length > 1 ? Math.max(0, (marks.at(-1)!.t - marks[0].t) / 1000) : 0;
  const samples = input.heartSamples ?? [];
  const step = UNIT_METRES[unit];
  const splits: RouteSplit[] = [];
  let cursor = 0;
  const push = (endDistance: number, exact: boolean) => {
    const start = atDistance(marks, cursor);
    const end = atDistance(marks, endDistance);
    const metres = Math.max(0, endDistance - cursor);
    const timeSeconds = Math.max(0, (end.t - start.t) / 1000);
    splits.push({
      index: splits.length + 1,
      label: formatDistance(metres, unit, exact),
      metres,
      timeSeconds,
      paceLabel: paceLabel(timeSeconds, metres, unit),
      heartRate: heartIn(points, samples, start.t, end.t),
      elevationMetres: end.altitude - start.altitude,
      startIndex: start.index,
      endIndex: end.index,
    });
    cursor = endDistance;
  };
  if (marks.length > 1) {
    while (cursor + step <= totalMetres + 0.5) push(cursor + step, true);
    if (totalMetres - cursor >= 30) push(totalMetres, false);
  }
  const average = input.averageHeartRate && input.averageHeartRate > 30
    ? Math.round(input.averageHeartRate)
    : heartIn(points, samples, marks[0]?.t ?? 0, marks.at(-1)?.t ?? 0);
  return {
    unit,
    distanceLabel: `Distance ${formatDistance(totalMetres, unit)}`,
    durationLabel: `Duration ${formatClock(elapsed)}`,
    paceLabel: `Average pace ${paceLabel(elapsed, totalMetres, unit)}`,
    heartLabel: average == null ? 'Average heart rate not available' : `Average heart rate ${average} bpm`,
    calorieLabel: input.energyKcal != null && input.energyKcal > 0 ? `Calories ${Math.round(input.energyKcal)} kcal` : null,
    splits,
  };
}

export { omitSharedLocation, payloadHasRouteCoordinates, rejectRouteCoordinates, scrubSharedText } from './sharedPayload';

const COORDINATE_NUMBER = /-?\d{1,3}\.\d{4,}/g;

/** A client_errors line. Coordinates, stacks, addresses, and tokens are removed. */
export function routeErrorLine(error: unknown): string {
  const name = error instanceof Error ? error.name.trim() : '';
  const named = error instanceof Error
    ? (name && name !== 'Error' ? `${name}: ${error.message}` : error.message)
    : error;
  const line = sanitizeClientError(named)
    .replace(/latitude|longitude/gi, '')
    .replace(/\b(lat|lng|lon)\b/gi, '')
    .replace(COORDINATE_NUMBER, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
  return line || 'Unknown error';
}

export function finiteRoutePoints(points: readonly RoutePoint[]): RoutePoint[] {
  return points.filter((point) => (
    Number.isFinite(point.latitude)
    && Number.isFinite(point.longitude)
    && Math.abs(point.latitude) <= 90
    && Math.abs(point.longitude) <= 180
  ));
}

/** Evenly keeps the first and last finite points. Shorter paths are unchanged. */
export function downsampleRoute(points: readonly RoutePoint[], limit = ROUTE_POINT_LIMIT): RoutePoint[] {
  const clean = finiteRoutePoints(points);
  if (limit < 2 || clean.length <= limit) return clean;
  const last = clean.length - 1;
  const sampled: RoutePoint[] = [];
  let previous = -1;
  for (let step = 0; step < limit; step += 1) {
    const index = Math.round((step * last) / (limit - 1));
    if (index === previous) continue;
    const point = clean[index];
    if (point) sampled.push(point);
    previous = index;
  }
  return sampled;
}

export type RouteMapRegion = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

/** Null until two finite points can form a real region. A zero span is widened. */
export function routeMapRegion(points: readonly RoutePoint[]): RouteMapRegion | null {
  const clean = finiteRoutePoints(points);
  if (clean.length < 2) return null;
  let minLat = clean[0]?.latitude ?? Number.NaN;
  let maxLat = minLat;
  let minLng = clean[0]?.longitude ?? Number.NaN;
  let maxLng = minLng;
  for (const point of clean) {
    minLat = Math.min(minLat, point.latitude);
    maxLat = Math.max(maxLat, point.latitude);
    minLng = Math.min(minLng, point.longitude);
    maxLng = Math.max(maxLng, point.longitude);
  }
  const latitude = (minLat + maxLat) / 2;
  const longitude = (minLng + maxLng) / 2;
  // MKMapView.setRegion raises NSInvalidArgumentException when a span is
  // outside latitude [0, 180] or longitude [0, 360]. The 1.4 padding on a
  // route that reaches both poles, or both sides of the date line, crosses
  // that limit. The exception is not a JavaScript error, so the route
  // boundary cannot catch it.
  const latitudeRoom = Math.min(90 - latitude, latitude + 90) * 2;
  const region = {
    latitude,
    longitude,
    latitudeDelta: Math.min(179.999, latitudeRoom, Math.max(0.01, (maxLat - minLat) * 1.4)),
    longitudeDelta: Math.min(359.999, Math.max(0.01, (maxLng - minLng) * 1.4)),
  };
  const values = [region.latitude, region.longitude, region.latitudeDelta, region.longitudeDelta];
  if (values.some((value) => !Number.isFinite(value))) return null;
  if (region.latitudeDelta <= 0 || region.longitudeDelta <= 0) return null;
  return region;
}

export function devFixtureEnabled(dev = typeof __DEV__ !== 'undefined' && __DEV__): boolean {
  return dev === true;
}

/** A walking route the simulator can open. The numbers never leave the phone. */
export function devFixtureWorkout(): DeviceWorkout {
  return {
    id: DEV_FIXTURE_ROUTE_ID,
    activityType: 52,
    label: workoutTypeLabel(52),
    startedAt: '2026-10-18T10:16:00.000Z',
    durationMinutes: 109,
    distanceMetres: 6300,
    energyKcal: 480,
    averageHeartRate: 112,
    routeExpected: true,
  };
}

export function devFixturePoints(): RoutePoint[] {
  const start = Date.parse('2026-10-18T10:16:00.000Z');
  const points: RoutePoint[] = [];
  for (let index = 0; index <= 36; index += 1) {
    points.push({
      latitude: 51.507 + Math.sin(index / 6) * 0.004,
      longitude: -0.128 + index * 0.00035,
      altitude: 12 + Math.round(Math.sin(index / 5) * 4),
      at: new Date(start + index * 180_000).toISOString(),
      heartRate: 108 + (index % 4) * 2,
    });
  }
  return points;
}

const DEMO_WALK_ID = 'demo-outdoor-walk';

export function demoRoutePoints(startedAt: string): RoutePoint[] {
  const start = Date.parse(startedAt);
  const points: RoutePoint[] = [];
  for (let index = 0; index <= 28; index += 1) {
    points.push({
      latitude: 51.53 + index * 0.00105,
      longitude: -0.165 + Math.sin(index / 3) * 0.0004,
      altitude: 18 + Math.round(Math.sin(index / 4) * 6),
      at: new Date(start + index * 70_000).toISOString(),
      heartRate: 128 + (index % 5) * 3,
    });
  }
  return points;
}

export function demoWorkouts(now = new Date()): DeviceWorkout[] {
  const walkStart = new Date(now.getTime() - 26 * 60 * 60 * 1000).toISOString();
  return [
    {
      id: DEMO_WALK_ID,
      activityType: 52,
      label: workoutTypeLabel(52),
      startedAt: walkStart,
      durationMinutes: 33,
      distanceMetres: 3200,
      energyKcal: 210,
      averageHeartRate: 136,
      routeExpected: true,
    },
    {
      id: 'demo-indoor-strength',
      activityType: 50,
      label: workoutTypeLabel(50),
      startedAt: new Date(now.getTime() - 5 * 60 * 60 * 1000).toISOString(),
      durationMinutes: 40,
      distanceMetres: null,
      energyKcal: 280,
      averageHeartRate: 118,
      routeExpected: false,
    },
  ];
}

export function demoRouteFor(id: string, workout: DeviceWorkout | null): RoutePoint[] {
  if (id !== DEMO_WALK_ID || !workout) return [];
  return demoRoutePoints(workout.startedAt);
}
