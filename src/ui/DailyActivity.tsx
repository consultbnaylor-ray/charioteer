import { useState } from 'react';
import { Pressable, View } from 'react-native';

import {
  DAILY_ACTIVITY_CONSENT,
  DAILY_ACTIVITY_RINGS_HINT,
  DAILY_ACTIVITY_TAP_HINT,
  DAILY_ACTIVITY_TITLE,
  GARMIN_CALORIE_SOURCE,
  GARMIN_EXERCISE_SOURCE,
  activeCaloriesLabel,
  calorieSeries,
  exerciseMinutesLabel,
  exerciseSeries,
  mostInOneDay,
  seriesUsesGarmin,
  type AppleDayValue,
  type DailyActivityPoint,
} from '@/domain/dailyActivity';
import type { GarminDaily } from '@/domain/garminConnect';
import { weekdayShort } from '@/domain/healthInsights';
import { CHART_DIRECTION_HINT } from '@/domain/readingChart';
import type { WorkoutChartSpan } from '@/domain/workoutDay';
import { useAppTheme } from '@/ui/theme';
import { T } from '@/ui/ui';

const BAR_HEIGHT = 88;

export function DailyActivityCharts({
  endDay,
  span,
  consent,
  exerciseMinutes,
  activeKcal,
  dailies,
}: {
  endDay: string;
  span: WorkoutChartSpan;
  consent: boolean;
  exerciseMinutes: readonly AppleDayValue[];
  activeKcal: readonly AppleDayValue[];
  dailies: readonly GarminDaily[];
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const exercise = consent ? exerciseSeries(endDay, span, exerciseMinutes, dailies) : [];
  const calories = consent ? calorieSeries(endDay, span, activeKcal, dailies) : [];
  const exerciseDay = exercise.find((point) => point.day === selected) ?? null;
  const calorieDay = calories.find((point) => point.day === selected) ?? null;

  return (
    <View style={{ gap: 8 }}>
      <T variant="label">{DAILY_ACTIVITY_TITLE}</T>
      <T variant="muted">{DAILY_ACTIVITY_RINGS_HINT}</T>
      {consent ? null : <T variant="muted">{DAILY_ACTIVITY_CONSENT}</T>}
      <ActivityBars
        title="Exercise minutes"
        points={exercise}
        span={span}
        unit="min"
        selected={selected}
        garminNote={seriesUsesGarmin(exercise) ? GARMIN_EXERCISE_SOURCE : null}
        onSelect={setSelected}
      />
      <ActivityBars
        title="Active calories"
        points={calories}
        span={span}
        unit="kcal"
        selected={selected}
        garminNote={seriesUsesGarmin(calories) ? GARMIN_CALORIE_SOURCE : null}
        onSelect={setSelected}
      />
      <T variant="muted">{DAILY_ACTIVITY_TAP_HINT}</T>
      <T variant="muted" style={{ textAlign: 'center' }}>{CHART_DIRECTION_HINT}</T>
      {exerciseDay && calorieDay ? (
        <View style={{ gap: 4 }}>
          <T>{exerciseMinutesLabel(exerciseDay.day, exerciseDay.value, exerciseDay.source)}</T>
          <T>{activeCaloriesLabel(calorieDay.day, calorieDay.value, calorieDay.source)}</T>
        </View>
      ) : null}
    </View>
  );
}

function ActivityBars({
  title,
  points,
  span,
  unit,
  selected,
  garminNote,
  onSelect,
}: {
  title: string;
  points: readonly DailyActivityPoint[];
  span: WorkoutChartSpan;
  unit: 'min' | 'kcal';
  selected: string | null;
  garminNote: string | null;
  onSelect: (day: string) => void;
}) {
  const theme = useAppTheme();
  const most = Math.max(1, ...points.map((point) => point.value));
  const scale = mostInOneDay(points, unit);

  return (
    <View style={{ gap: 8 }}>
      <T variant="label">{title}</T>
      {scale ? <T variant="muted">{scale}</T> : null}
      {garminNote ? <T variant="muted">{garminNote}</T> : null}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: span === 30 ? 1 : 4, minHeight: BAR_HEIGHT + 36 }}>
        {points.map((point) => {
          const chosen = point.day === selected;
          return (
            <Pressable
              key={point.day}
              accessibilityRole="button"
              accessibilityLabel={`${point.label}. Select this day.`}
              accessibilityState={{ selected: chosen }}
              onPress={() => onSelect(point.day)}
              style={{ flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'flex-end' }}
            >
              {span === 7 && point.value > 0 ? (
                <T style={{ fontSize: 10, lineHeight: 12, textAlign: 'center' }}>{`${point.value} ${unit}`}</T>
              ) : null}
              <View
                style={{
                  height: BAR_HEIGHT,
                  alignSelf: 'stretch',
                  justifyContent: 'flex-end',
                  borderWidth: chosen ? 1 : 0,
                  borderColor: theme.colors.ink,
                  backgroundColor: chosen ? theme.colors.emphasisSoft : 'transparent',
                }}
              >
                {point.value === 0 ? (
                  <View style={{ height: 2, backgroundColor: theme.colors.line }} />
                ) : (
                  <View style={{ height: Math.max(2, (point.value / most) * BAR_HEIGHT), backgroundColor: theme.colors.ink }} />
                )}
              </View>
              <T style={{ fontSize: 10, lineHeight: 12, color: theme.colors.muted }}>{span === 7 ? weekdayShort(point.day).slice(0, 1) : String(Number(point.day.slice(8, 10)))}</T>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
