import { shiftDay, type DayValue, type HealthChartShape, type HealthInsightKind } from '@/domain/healthInsights';
import type { ChartAggregate } from '@/domain/readingChart';
import { ReadingChart } from '@/ui/ReadingChart';

const META: Record<HealthInsightKind, { unit: string; aggregate: ChartAggregate }> = {
  steps: { unit: 'steps', aggregate: 'sum' },
  sleep_hours: { unit: 'hours', aggregate: 'mean' },
  resting_heart_rate: { unit: 'bpm', aggregate: 'mean' },
  hrv_sdnn: { unit: 'ms', aggregate: 'mean' },
  workout_minutes: { unit: 'min', aggregate: 'sum' },
  weight_kg: { unit: 'kg', aggregate: 'mean' },
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
      accessibilityLabel={`${kind} ${shape} chart`}
    />
  );
}
