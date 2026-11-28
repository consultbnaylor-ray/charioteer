import { memo, useCallback, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { CHART_DIRECTION_HINT, chartBucketCaption } from '@/domain/readingChart';
import {
  buildWorkoutHistoryCharts,
  workoutDayForPoint,
  workoutHistoryPeriod,
  WORKOUT_HISTORY_PERIODS,
  type WorkoutHistorySample,
  type WorkoutHistorySeries,
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

const GROUPING = 'Each chart is one activity, such as walking or running, across every place. A Garmin name like South Derbyshire is the place on that workout, listed under Places, and those minutes are already in the activity. A line is drawn when the range has at least two points. One session is a short line instead.';

function SeriesSummary({
  line,
  day,
  onOpenDay,
}: {
  line: string;
  day: string | null;
  onOpenDay: (day: string) => void;
}) {
  if (!line) return null;
  if (!day) return <T>{line}</T>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={line}
      onPress={() => onOpenDay(day)}
      style={{ minHeight: 44, justifyContent: 'center' }}
    >
      <T>{line}</T>
    </Pressable>
  );
}

function SeriesView({
  series,
  start,
  end,
  bucket,
  accent,
  onSelectDay,
  onOpenDay,
}: {
  series: WorkoutHistorySeries;
  start: string;
  end: string;
  bucket: 'day' | 'week' | 'month';
  accent?: string;
  onSelectDay: (day: string) => void;
  onOpenDay: (day: string) => void;
}) {
  if (!series.chartable) {
    return <SeriesSummary line={series.summary} day={series.day} onOpenDay={onOpenDay} />;
  }
  return (
    <View style={{ gap: 4 }}>
      <ReadingChart
        title={series.title}
        subtitle={series.subtitle}
        rangeLine={series.rangeLine}
        points={series.points}
        start={start}
        end={end}
        unit={series.unit}
        aggregate="sum"
        bucket={bucket}
        accent={accent}
        accessibilityLabel={`${series.title} chart`}
        meaning="none"
        onSelectDay={onSelectDay}
      />
      <T variant="muted">{series.averageLine}</T>
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
  const [placesOpen, setPlacesOpen] = useState(false);
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
              {model.minuteSeries.chartable ? (
                <>
                  <SeriesView
                    series={model.minuteSeries}
                    start={model.start}
                    end={model.end}
                    bucket={model.bucket}
                    accent={model.foldSingleType && model.types[0] ? workoutTypeColor(model.types[0].label) : minuteAccent}
                    onSelectDay={pick}
                    onOpenDay={onSelectDay}
                  />
                  <SeriesView
                    series={model.sessionSeries}
                    start={model.start}
                    end={model.end}
                    bucket={model.bucket}
                    accent={sessionAccent}
                    onSelectDay={pick}
                    onOpenDay={onSelectDay}
                  />
                </>
              ) : (
                <SeriesSummary line={model.headline} day={model.minuteSeries.day} onOpenDay={onSelectDay} />
              )}
              {model.foldSingleType ? null : model.types.map((type) => (
                <SeriesView
                  key={type.label}
                  series={type}
                  start={model.start}
                  end={model.end}
                  bucket={model.bucket}
                  accent={workoutTypeColor(type.label)}
                  onSelectDay={pick}
                  onOpenDay={onSelectDay}
                />
              ))}
              {model.places.length > 0 ? (
                <View style={{ gap: 8 }}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Places"
                    accessibilityState={{ expanded: placesOpen }}
                    onPress={() => setPlacesOpen((value) => !value)}
                    style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
                  >
                    <T variant="label" style={{ flex: 1 }}>Places</T>
                    <T variant="muted">{placesOpen ? 'Hide' : 'Show'}</T>
                  </Pressable>
                  {placesOpen ? (
                    <View style={{ gap: 12 }}>
                      <T variant="muted">Each line is the place named on the workout. Those minutes are already included in the activity above.</T>
                      {model.places.map((place) => (
                        <SeriesView
                          key={`${place.activity}:${place.place}`}
                          series={place}
                          start={model.start}
                          end={model.end}
                          bucket={model.bucket}
                          accent={workoutTypeColor(place.activity)}
                          onSelectDay={pick}
                          onOpenDay={onSelectDay}
                        />
                      ))}
                    </View>
                  ) : null}
                </View>
              ) : null}
            </>
          )}
          <DataMeaning about="Workout history charts">
            <T variant="muted">{MEANING}</T>
            <T variant="muted">{GROUPING}</T>
            {caption ? <T variant="muted">{caption}</T> : null}
            <T variant="muted">{WORKOUT_HISTORY_HINT}</T>
            <T variant="muted">{CHART_DIRECTION_HINT}</T>
          </DataMeaning>
        </View>
      ) : null}
    </View>
  );
});
