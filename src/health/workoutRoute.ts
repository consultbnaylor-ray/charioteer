import { demoRouteFor, demoWorkouts, type DeviceWorkout, type HeartSample, type RoutePoint } from '@/domain/workoutRoute';
import { rememberedWorkout, rememberWorkouts } from '@/health/workoutRouteMemory';

export { rememberedWorkout, rememberWorkouts };

/** Sample workouts for the browser. Nothing here is sent anywhere. */
export async function listDeviceWorkouts(): Promise<DeviceWorkout[]> {
  const rows = demoWorkouts(new Date());
  rememberWorkouts(rows);
  return rows;
}

export async function readDeviceRoute(id: string): Promise<{
  workout: DeviceWorkout | null;
  points: RoutePoint[];
  heartSamples: HeartSample[];
  denied: boolean;
}> {
  const workout = rememberedWorkout(id) ?? demoWorkouts().find((row) => row.id === id) ?? null;
  if (workout) rememberWorkouts([workout]);
  return {
    workout,
    points: demoRouteFor(id, workout),
    heartSamples: [],
    denied: false,
  };
}
