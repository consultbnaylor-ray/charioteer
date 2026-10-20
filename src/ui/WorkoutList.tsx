import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { formatUkCompactWhen } from '@/domain/dates';
import { formatDistance } from '@/domain/workoutRoute';
import type { DeviceWorkout } from '@/domain/workoutRoute';
import { useAppTheme } from '@/ui/theme';
import { Card, T } from '@/ui/ui';

function rowWords(workout: DeviceWorkout): string {
  const when = formatUkCompactWhen(workout.startedAt);
  const distance = workout.distanceMetres ? formatDistance(workout.distanceMetres, 'km') : null;
  const bits = [workout.label, when, `${workout.durationMinutes} min`];
  if (distance) bits.push(distance);
  return bits.join(' · ');
}

/** Workouts already on this phone. Opening one is the only time a route is read. */
export function WorkoutList({ workouts }: { workouts: readonly DeviceWorkout[] }) {
  const theme = useAppTheme();
  const router = useRouter();
  return (
    <Card>
      <T variant="label">Workouts</T>
      <T variant="muted">A route stays on this iPhone. It is not uploaded or shared.</T>
      {workouts.length === 0 ? <T>No workouts yet. An outdoor walk, run, or hike can show a route once Apple Health has one.</T> : null}
      {workouts.map((workout) => (
        <Pressable
          key={workout.id}
          accessibilityRole="button"
          accessibilityLabel={workout.routeExpected ? `View route, ${rowWords(workout)}` : rowWords(workout)}
          onPress={() => router.push(`/workout/${encodeURIComponent(workout.id)}` as never)}
          style={{ minHeight: 44, justifyContent: 'center', gap: 2 }}
        >
          <T style={{ fontFamily: theme.font.bodyStrong }}>{rowWords(workout)}</T>
          <T variant="muted">{workout.routeExpected ? 'View route' : 'No GPS route'}</T>
        </Pressable>
      ))}
    </Card>
  );
}
