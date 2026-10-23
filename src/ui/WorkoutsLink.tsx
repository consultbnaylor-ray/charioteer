import { useRouter } from 'expo-router';

import { workoutWeekSummary } from '@/domain/workoutDay';
import type { DeviceWorkout } from '@/domain/workoutRoute';
import { useAppTheme } from '@/ui/theme';
import { Card, T } from '@/ui/ui';

export const WORKOUTS_LINK = 'Workouts: see your workout calendar and history';

/** Full-width way into the workout calendar and history. */
export function WorkoutsLink({ workouts }: { workouts: readonly DeviceWorkout[] }) {
  const router = useRouter();
  const theme = useAppTheme();
  return (
    <Card accessibilityLabel="Open Workouts" onPress={() => router.push('/workouts' as never)}>
      <T style={{ fontFamily: theme.font.bodyStrong }}>{WORKOUTS_LINK}</T>
      <T variant="muted">{workoutWeekSummary(workouts)}</T>
    </Card>
  );
}
