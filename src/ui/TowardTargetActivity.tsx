import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';

import { useSnapshot } from '@/data';
import { mergeActivityReadings } from '@/domain/targetActivity';
import { targetDirection } from '@/domain/targetWeight';
import { weightPointsFrom } from '@/domain/nutrition';
import { londonDay } from '@/domain/healthInsights';
import { useHealthSources } from '@/health/useHealthSources';
import { targetActivityPlan, TOWARD_TARGET_TITLE } from '@/domain/targetActivity';
import { radius, useAppTheme } from '@/ui/theme';
import { UpdateWeightLink } from '@/ui/UpdateWeightLink';
import { T } from '@/ui/ui';

/** Suggestions for a saved target weight. Hidden when no target is set. */
export function TowardTargetActivity({ compact = false }: { compact?: boolean }) {
  const snap = useSnapshot();
  const router = useRouter();
  const theme = useAppTheme();
  const { readings, activity } = useHealthSources();
  const [open, setOpen] = useState(false);
  const targetKg = snap.nutrition?.targetWeightKg ?? null;
  if (targetKg == null) return null;
  const weights = weightPointsFrom(snap.health ?? []);
  const current = weights.length ? weights[weights.length - 1]?.kg ?? null : null;
  if (current == null) {
    return (
      <View style={{ gap: 6 }}>
        <T variant="label">{TOWARD_TARGET_TITLE}</T>
        <T>Current weight is not logged yet, so there is no activity suggestion.</T>
        <UpdateWeightLink />
      </View>
    );
  }
  const plan = targetActivityPlan({
    direction: targetDirection(current, targetKg),
    today: londonDay(new Date()),
    readings: mergeActivityReadings({
      samples: snap.health ?? [],
      appleExercise: activity.exerciseMinutes.map((day) => ({ day: day.day, minutes: day.value })),
      appleKcal: activity.activeKcal.map((day) => ({ day: day.day, kcal: day.value })),
      garmin: readings.dailies.map((day) => ({
        day: day.calendarDate,
        steps: day.steps,
        moderateMinutes: day.moderateMinutes,
        vigorousMinutes: day.vigorousMinutes,
        activeKcal: day.activeKilocalories,
      })),
    }),
  });
  const shown = compact && !open ? plan.suggestions.slice(0, 1) : plan.suggestions;
  const hidden = plan.suggestions.length - shown.length;
  return (
    <View style={{ gap: 8 }}>
      <T variant="label">{plan.title}</T>
      {plan.suggestions.length === 0 ? plan.notes.map((line) => <T key={line}>{line}</T>) : null}
      {shown.map((item) => (
        <Pressable
          key={item.id + item.text}
          accessibilityRole="button"
          accessibilityLabel={item.text}
          onPress={() => router.push('/workouts' as never)}
          style={{ minHeight: 44, justifyContent: 'center', borderWidth: 1, borderColor: theme.colors.line, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 10 }}
        >
          <T>{item.text}</T>
          <T variant="muted">Open workouts</T>
        </Pressable>
      ))}
      {hidden > 0 ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Show ${hidden} more`} onPress={() => setOpen(true)} style={{ minHeight: 44, justifyContent: 'center' }}>
          <T>{`Show ${hidden} more`}</T>
        </Pressable>
      ) : null}
      {plan.enough ? plan.notes.map((line) => <T key={line} variant="muted">{line}</T>) : null}
    </View>
  );
}
