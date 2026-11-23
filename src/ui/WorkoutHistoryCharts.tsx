import { memo, useCallback, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { CHART_DIRECTION_HINT, chartBucketCaption } from '@/domain/readingChart';
import {
  buildWorkoutHistoryCharts,
  workoutAverageLine,
  workoutDayForPoint,
  workoutHistoryPeriod,
  WORKOUT_HISTORY_PERIODS,
  type WorkoutHistorySample,
} from '@/domain/workoutHistoryCharts';
import { WORKOUT_HISTORY_HINT } from '@/domain/workoutDay';
import { workoutTypeColor } from '@/domain/workoutTypeColor';
import { useStatPeriod } from '@/health/useStatPeriod';
import { DataMeaning } from '@/ui/MoreInfo';
import { ReadingChart } from '@/ui/ReadingChart';
import { StatPeriodToggle } from '@/ui/StatPeriodToggle';
import { chartAccent } from '@/ui/statsPalette';
import { useAppTheme } from '@/ui/theme';
import { T } from '@/ui/ui';

const MEANING = 'The average counts every finished day in the range, including days with no workout. The current day is left out because it is still open.';

function ChartLine({
  title,
  points,
  start,
  end,
  unit,
  bucket,
  accent,
  average,
  onSelectDay,
}: {
  title: string;
  points: readonly { day: string; value: number }[];
  start: string;
  end: string;
  unit: string;
  bucket: 'day' | 'week' | 'month';
  accent?: string;
  average: string;
  onSelectDay: (day: string) => void;
}) {
  if (points.length === 0) return null;
  return (
    <View style={{ gap: 4 }}>
      <ReadingChart
        title={title}
        points={points}
        start={start}
        end={end}
        unit={unit}
        aggregate="sum"
        bucket={bucket}
        accent={accent}
        accessibilityLabel={`${title} chart`}
        meaning="none"
        onSelectDay={onSelectDay}
      />
      <T variant="muted">{average}</T>
    </View>
  );
}

/** Workout minutes, sessions, and each workout type over the shared range. */
export const WorkoutHistoryCharts = memo(function WorkoutHistoryCharts({
  workouts,
  today,
  onSelectDay,
}: {
  workouts: readonly WorkoutHistorySample[];
  today: string;
  onSelectDay: (day: string) => void;
}) {
  const theme = useAppTheme();
  const [open, setOpen] = useState(true);
  const [period] = useStatPeriod();
  const shown = workoutHistoryPeriod(period);
  const model = useMemo(() => buildWorkoutHistoryCharts(workouts, today, shown), [workouts, today, shown]);
  const pick = useCallback((pointDay: string) => {
    onSelectDay(workoutDayForPoint(pointDay, model.bucket, model.days, today));
  }, [model.bucket, model.days, onSelectDay, today]);
  const caption = chartBucketCaption(model.bucket, 'sum');
  const minuteAccent = chartAccent('Workout minutes', theme.scheme) ?? undefined;
  const sessionAccent = chartAccent('Workouts', theme.scheme) ?? undefined;

  return (
    <View style={{ gap: 8 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Workout History Charts"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
      >
        <T variant="label" style={{ flex: 1 }}>Workout History Charts</T>
        <T variant="muted">{open ? 'Hide' : 'Show'}</T>
      </Pressable>
      {open ? (
        <View style={{ gap: 12, alignSelf: 'stretch' }}>
          <StatPeriodToggle periods={WORKOUT_HISTORY_PERIODS} selected={shown} />
          {model.minutes.length === 0 ? <T variant="muted">No workouts in these days.</T> : (
            <>
              <ChartLine
                title="Workout minutes"
                points={model.minutes}
                start={model.start}
                end={model.end}
                unit="min"
                bucket={model.bucket}
                accent={minuteAccent}
                average={workoutAverageLine('minutes', model.averageMinutes, model.fullDays)}
                onSelectDay={pick}
              />
              <ChartLine
                title="Workouts"
                points={model.sessions}
                start={model.start}
                end={model.end}
                unit="workouts"
                bucket={model.bucket}
                accent={sessionAccent}
                average={workoutAverageLine('workouts', model.averageSessions, model.fullDays)}
                onSelectDay={pick}
              />
              {model.types.map((type) => (
                <ChartLine
                  key={type.label}
                  title={`${type.label} minutes`}
                  points={type.points}
                  start={model.start}
                  end={model.end}
                  unit="min"
                  bucket={model.bucket}
                  accent={workoutTypeColor(type.label)}
                  average={workoutAverageLine('minutes', type.average, model.fullDays)}
                  onSelectDay={pick}
                />
              ))}
            </>
          )}
          <DataMeaning about="Workout history charts">
            <T variant="muted">{MEANING}</T>
            {caption ? <T variant="muted">{caption}</T> : null}
            <T variant="muted">{WORKOUT_HISTORY_HINT}</T>
            <T variant="muted">{CHART_DIRECTION_HINT}</T>
          </DataMeaning>
        </View>
      ) : null}
    </View>
  );
});
