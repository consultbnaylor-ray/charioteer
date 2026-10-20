import { workoutTypeLabel } from '@/domain/fitnessSnapshot';

/** HealthKit activities that record a GPS path. Indoor sessions are excluded by the caller. */
export const OUTDOOR_ACTIVITY_TYPES = [13, 24, 37, 52] as const;

export const ROUTE_PURPOSE =
  'Charioteer reads this workout route from Apple Health so you can see the path and the splits. The path stays on this iPhone. It is not uploaded, shared, or sent to Thumos.';

export const ROUTE_READ_TYPE = 'HKWorkoutRouteTypeIdentifier';

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
  /** An outdoor type that may have a path. The path itself is loaded later, on this phone. */
  routeExpected: boolean;
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
      altitude: point.altitude,
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

function heartIn(points: readonly RoutePoint[], samples: readonly HeartSample[], startMs: number, endMs: number): number | null {
  const fromSamples = samples.filter((sample) => {
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
}): RouteStats {
  const unit = input.unit;
  const points = [...input.points].filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude)).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const marks = points.length ? marksFor(points) : [];
  const totalMetres = marks.at(-1)?.distance ?? 0;
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

/** True when a value destined for the network carries a route coordinate. */
export function payloadHasRouteCoordinates(value: unknown): boolean {
  const seen = new Set<unknown>();
  const walk = (node: unknown): boolean => {
    if (!node || typeof node !== 'object') return false;
    if (seen.has(node)) return false;
    seen.add(node);
    if (Array.isArray(node)) return node.some(walk);
    const record = node as Record<string, unknown>;
    const latitude = record.latitude ?? record.lat;
    const longitude = record.longitude ?? record.lng ?? record.lon;
    if (typeof latitude === 'number' && typeof longitude === 'number') return true;
    return Object.values(record).some(walk);
  };
  return walk(value);
}

export function rejectRouteCoordinates(value: unknown): void {
  if (payloadHasRouteCoordinates(value)) {
    throw new Error('Workout routes stay on this iPhone.');
  }
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
