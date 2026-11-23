import { shiftDay, type DayValue, type HealthChartShape, type HealthInsightKind } from '@/domain/healthInsights';
import type { ChartAggregate } from '@/domain/readingChart';
import { ReadingChart } from '@/ui/ReadingChart';
import { chartAccent } from '@/ui/statsPalette';
import { useAppTheme } from '@/ui/theme';

const META: Record<HealthInsightKind, { unit: string; aggregate: ChartAggregate; title: string }> = {
  steps: { unit: 'steps', aggregate: 'sum', title: 'Steps' },
  sleep_hours: { unit: 'hours', aggregate: 'mean', title: 'Sleep duration' },
  resting_heart_rate: { unit: 'bpm', aggregate: 'mean', title: 'Resting heart rate' },
  hrv_sdnn: { unit: 'ms', aggregate: 'mean', title: 'Heart rate variability' },
  workout_minutes: { unit: 'min', aggregate: 'sum', title: 'Workout minutes' },
  weight_kg: { unit: 'kg', aggregate: 'mean', title: 'Weight' },
};

/**
 * The health page uses the same chart as the other stat screens.
 * `shape` stays on the call so older cards still name a bar or a line.
 */
export function HealthChart({
  kind,
  shape,
  today,
  windowDays,
  points,
}: {
  kind: HealthInsightKind;
  shape: HealthChartShape;
  today: string;
  windowDays: number;
  points: DayValue[];
}) {
  const theme = useAppTheme();
  const meta = META[kind];
  const start = shiftDay(today, -(windowDays - 1));
  return (
    <ReadingChart
      points={points}
      start={start}
      end={today}
      unit={meta.unit}
      yTitle={meta.unit}
      aggregate={meta.aggregate}
      bucket={windowDays <= 90 ? 'day' : windowDays <= 200 ? 'week' : 'month'}
      accent={chartAccent(meta.title, theme.scheme) ?? undefined}
      accessibilityLabel={`${kind} ${shape} chart`}
    />
  );
}
