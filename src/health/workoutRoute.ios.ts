import {
  authorizationStatusFor,
  isHealthDataAvailable,
  queryQuantitySamples,
  queryWorkoutSamples,
  requestAuthorization,
} from '@kingstinct/react-native-healthkit';

import { workoutTypeLabel } from '@/domain/fitnessSnapshot';
import {
  DEV_FIXTURE_ROUTE_ID,
  ROUTE_READ_TYPE,
  devFixtureEnabled,
  devFixturePoints,
  devFixtureWorkout,
  downsampleRoute,
  routeExpected,
  type DeviceWorkout,
  type HeartSample,
  type RoutePoint,
} from '@/domain/workoutRoute';
import { rememberWorkouts, rememberedWorkout } from '@/health/workoutRouteMemory';

type Quantity = { quantity: number; unit: string } | null | undefined;

function metresFrom(quantity: Quantity): number | null {
  if (!quantity || !Number.isFinite(quantity.quantity) || quantity.quantity <= 0) return null;
  const unit = quantity.unit.toLowerCase();
  if (unit === 'm' || unit.startsWith('meter')) return quantity.quantity;
  if (unit === 'km' || unit.startsWith('kilometer')) return quantity.quantity * 1000;
  if (unit === 'mi' || unit.startsWith('mile')) return quantity.quantity * 1609.344;
  return null;
}

function kcalFrom(quantity: Quantity): number | null {
  if (!quantity || !Number.isFinite(quantity.quantity) || quantity.quantity <= 0) return null;
  const unit = quantity.unit.toLowerCase();
  if (unit.includes('kcal') || unit === 'cal') return quantity.quantity;
  if (unit === 'kj' || unit.includes('joule')) return quantity.quantity / 4.184;
  return null;
}

function minutesFrom(quantity: number, unit: string): number {
  const name = unit.toLowerCase();
  if (name.startsWith('min')) return quantity;
  if (name.startsWith('hr') || name.startsWith('hour')) return quantity * 60;
  return quantity / 60;
}

function indoorFlag(metadata: Record<string, unknown> | null | undefined): boolean {
  const value = metadata?.HKIndoorWorkout;
  return value === true || value === 1 || value === 'true' || value === '1';
}

type WorkoutStat = {
  getStatistic: (type: string, unit?: string) => Promise<{
    averageQuantity?: { quantity?: number };
    mostRecentQuantity?: { quantity?: number };
    sumQuantity?: { quantity?: number };
  } | undefined>;
};

function asStat(workout: object): WorkoutStat {
  return workout as WorkoutStat;
}

async function averageHeart(workout: object): Promise<number | null> {
  try {
    const stat = await asStat(workout).getStatistic('HKQuantityTypeIdentifierHeartRate', 'count/min');
    const value = stat?.averageQuantity?.quantity;
    if (value == null || value <= 30 || value >= 230) return null;
    return Math.round(value);
  } catch {
    return null;
  }
}

/** User score first, then Apple's estimate. Both use the 1–10 effort unit. A miss leaves the chart on heart rate. */
async function effortFrom(workout: object): Promise<number | null> {
  const types = [
    'HKQuantityTypeIdentifierWorkoutEffortScore',
    'HKQuantityTypeIdentifierEstimatedWorkoutEffortScore',
  ];
  for (const type of types) {
    try {
      const stat = await asStat(workout).getStatistic(type, 'appleEffortScore');
      const value = stat?.averageQuantity?.quantity ?? stat?.mostRecentQuantity?.quantity ?? stat?.sumQuantity?.quantity;
      if (value != null && Number.isFinite(value) && value > 0 && value <= 10) return Math.round(value * 10) / 10;
    } catch {
      // The score is optional. The list still shows the workout.
    }
  }
  return null;
}

async function summaryFrom(workout: Awaited<ReturnType<typeof queryWorkoutSamples>>[number]): Promise<DeviceWorkout> {
  const plain = workout.toJSON();
  const activityType = Number(plain.workoutActivityType);
  const length = minutesFrom(plain.duration.quantity, plain.duration.unit);
  return {
    id: plain.uuid,
    activityType,
    label: workoutTypeLabel(activityType),
    startedAt: new Date(plain.startDate).toISOString(),
    durationMinutes: Math.max(1, Math.round(length)),
    distanceMetres: metresFrom(plain.totalDistance),
    energyKcal: kcalFrom(plain.totalEnergyBurned),
    averageHeartRate: await averageHeart(workout),
    effortScore: await effortFrom(workout),
    routeExpected: routeExpected(activityType, indoorFlag(plain.metadata as Record<string, unknown> | undefined)),
  };
}

/** Workouts for the day strip and the 30-day charts. Routes are not read here, and nothing is uploaded. */
export async function listDeviceWorkouts(): Promise<DeviceWorkout[]> {
  if (!isHealthDataAvailable()) return [];
  const end = new Date();
  const start = new Date(end.getTime() - 32 * 24 * 60 * 60 * 1000);
  const workouts = await queryWorkoutSamples({
    limit: 0,
    ascending: false,
    filter: { date: { startDate: start, endDate: end } },
  });
  const rows: DeviceWorkout[] = [];
  for (const workout of workouts) {
    try {
      rows.push(await summaryFrom(workout));
    } catch {
      // One unreadable workout does not hide the rest.
    } finally {
      workout.dispose();
    }
  }
  rememberWorkouts(rows);
  if (devFixtureEnabled()) rows.push(devFixtureWorkout());
  return rows;
}

async function heartSamples(start: Date, end: Date): Promise<HeartSample[]> {
  const status = authorizationStatusFor('HKQuantityTypeIdentifierHeartRate') as unknown;
  if (status !== 2 && status !== 'sharingAuthorized') return [];
  try {
    const samples = await queryQuantitySamples('HKQuantityTypeIdentifierHeartRate', {
      limit: 0,
      unit: 'count/min',
      filter: { date: { startDate: start, endDate: end } },
    });
    return samples
      .filter((sample) => sample.quantity > 30 && sample.quantity < 230)
      .map((sample) => ({ at: new Date(sample.startDate).toISOString(), bpm: Math.round(sample.quantity) }));
  } catch {
    return [];
  }
}

/**
 * Asks for workout routes the first time a route is opened.
 * The path is returned to the screen and is not stored or uploaded.
 */
export async function readDeviceRoute(id: string): Promise<{
  workout: DeviceWorkout | null;
  points: RoutePoint[];
  heartSamples: HeartSample[];
  denied: boolean;
}> {
  if (id === DEV_FIXTURE_ROUTE_ID && devFixtureEnabled()) {
    return { workout: devFixtureWorkout(), points: downsampleRoute(devFixturePoints()), heartSamples: [], denied: false };
  }
  const known = rememberedWorkout(id);
  if (known && !known.routeExpected) {
    return { workout: known, points: [], heartSamples: [], denied: false };
  }
  if (!isHealthDataAvailable()) {
    return { workout: known, points: [], heartSamples: [], denied: false };
  }
  const allowed = await requestAuthorization({ toRead: [ROUTE_READ_TYPE] });
  if (!allowed) return { workout: known, points: [], heartSamples: [], denied: true };
  const workouts = await queryWorkoutSamples({ limit: 1, filter: { uuids: [id] } });
  const workout = workouts[0];
  if (!workout) return { workout: known, points: [], heartSamples: [], denied: false };
  try {
    const summary = await summaryFrom(workout);
    rememberWorkouts([summary]);
    const routes = await workout.getWorkoutRoutes();
    const points: RoutePoint[] = [];
    for (const route of routes) {
      for (const location of route.locations) {
        if (!Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) continue;
        points.push({
          latitude: location.latitude,
          longitude: location.longitude,
          altitude: Number.isFinite(location.altitude) ? location.altitude : 0,
          at: new Date(location.date).toISOString(),
          heartRate: null,
        });
      }
    }
    points.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    const drawn = downsampleRoute(points);
    const start = new Date(summary.startedAt);
    const end = new Date(start.getTime() + summary.durationMinutes * 60_000);
    return { workout: summary, points: drawn, heartSamples: await heartSamples(start, end), denied: false };
  } finally {
    workout.dispose();
  }
}
