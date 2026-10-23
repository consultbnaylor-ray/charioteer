import { Pressable, View } from 'react-native';

import { useState } from 'react';
import {
  DAILY_ACTIVITY_CONSENT,
  DAILY_ACTIVITY_RINGS_HINT,
  DAILY_ACTIVITY_TAP_HINT,
  DAILY_ACTIVITY_TITLE,
  GARMIN_CALORIE_SOURCE,
  GARMIN_EXERCISE_SOURCE,
  GARMIN_LINE_FOLD,
  GARMIN_SOURCE,
  NO_STEPS_YET_TODAY,
  activeCaloriesLabel,
  calorieSeries,
  distanceSeries,
  distanceText,
  exerciseMinutesLabel,
  exerciseSeries,
  floorsSeries,
  garminLatestLines,
  mostInOneDay,
  restingSeries,
  seriesHasValue,
  seriesUsesGarmin,
  stepsSeries,
  type AppleDayValue,
  type DailyActivityPoint,
} from '@/domain/dailyActivity';
import type { GarminDaily, GarminHrvSummary, GarminPulseOx, GarminRespiration, GarminSleep } from '@/domain/garminConnect';
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
  steps = [],
  restingHeart = [],
  sleep = [],
  respiration = [],
  pulseOx = [],
  hrv = [],
}: {
  endDay: string;
  span: WorkoutChartSpan;
  consent: boolean;
  exerciseMinutes: readonly AppleDayValue[];
  activeKcal: readonly AppleDayValue[];
  dailies: readonly GarminDaily[];
  steps?: readonly AppleDayValue[];
  restingHeart?: readonly AppleDayValue[];
  sleep?: readonly GarminSleep[];
  respiration?: readonly GarminRespiration[];
  pulseOx?: readonly GarminPulseOx[];
  hrv?: readonly GarminHrvSummary[];
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
      <MovementCharts
        endDay={endDay}
        span={span}
        steps={steps}
        restingHeart={restingHeart}
        dailies={dailies}
        sleep={sleep}
        respiration={respiration}
        pulseOx={pulseOx}
        hrv={hrv}
      />
    </View>
  );
}

export function MovementCharts({
  endDay,
  span,
  steps,
  restingHeart,
  dailies,
  sleep,
  respiration,
  pulseOx,
  hrv,
}: {
  endDay: string;
  span: WorkoutChartSpan;
  steps: readonly AppleDayValue[];
  restingHeart: readonly AppleDayValue[];
  dailies: readonly GarminDaily[];
  sleep: readonly GarminSleep[];
  respiration: readonly GarminRespiration[];
  pulseOx: readonly GarminPulseOx[];
  hrv: readonly GarminHrvSummary[];
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const stepPoints = stepsSeries(endDay, span, steps, dailies);
  const distance = distanceSeries(endDay, span, dailies);
  const floors = floorsSeries(endDay, span, dailies);
  const resting = restingSeries(endDay, span, restingHeart, dailies);
  const chosen = stepPoints.find((point) => point.day === selected)
    ?? distance.find((point) => point.day === selected)
    ?? floors.find((point) => point.day === selected)
    ?? resting.find((point) => point.day === selected)
    ?? null;
  const lines = garminLatestLines({ dailies, sleep, respiration, pulseOx, hrv });
  const hidden = Math.max(0, lines.length - GARMIN_LINE_FOLD);
  const shown = hidden > 0 && !open ? lines.slice(0, GARMIN_LINE_FOLD) : lines;
  const dayLines = [
    stepPoints.find((point) => point.day === selected),
    seriesHasValue(distance) ? distance.find((point) => point.day === selected) : null,
    seriesHasValue(floors) ? floors.find((point) => point.day === selected) : null,
    seriesHasValue(resting) ? resting.find((point) => point.day === selected) : null,
  ].filter((point): point is DailyActivityPoint => point != null && point.value > 0);

  return (
    <View style={{ gap: 8 }}>
      <ActivityBars
        title="Steps"
        points={stepPoints}
        span={span}
        unit="steps"
        selected={selected}
        garminNote={stepPoints.at(-1)?.label === NO_STEPS_YET_TODAY ? NO_STEPS_YET_TODAY : null}
        onSelect={setSelected}
      />
      {seriesHasValue(distance) ? (
        <ActivityBars
          title="Distance"
          points={distance}
          span={span}
          unit="m"
          selected={selected}
          scale={mostDistance(distance)}
          format={(point) => distanceText(point.value)}
          garminNote={GARMIN_SOURCE}
          onSelect={setSelected}
        />
      ) : null}
      {seriesHasValue(floors) ? (
        <ActivityBars
          title="Floors"
          points={floors}
          span={span}
          unit="floors"
          selected={selected}
          garminNote={GARMIN_SOURCE}
          onSelect={setSelected}
        />
      ) : null}
      {seriesHasValue(resting) ? (
        <ActivityBars
          title="Resting heart rate"
          points={resting}
          span={span}
          unit="bpm"
          selected={selected}
          garminNote={null}
          onSelect={setSelected}
        />
      ) : null}
      {chosen && dayLines.length ? (
        <View style={{ gap: 4 }}>
          {dayLines.map((point) => <T key={point.label}>{point.label}</T>)}
        </View>
      ) : null}
      {shown.map((line) => <T key={line}>{line}</T>)}
      {hidden > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={open ? 'Hide the rest' : `Show ${hidden} more`}
          accessibilityState={{ expanded: open }}
          onPress={() => setOpen((value) => !value)}
          style={{ minHeight: 44, justifyContent: 'center' }}
        >
          <T>{open ? 'Hide the rest' : `Show ${hidden} more`}</T>
        </Pressable>
      ) : null}
    </View>
  );
}

function mostDistance(points: readonly { value: number }[]): string | null {
  const most = points.reduce((max, point) => Math.max(max, point.value), 0);
  if (most <= 0) return null;
  return `Most in one day ${distanceText(most)}`;
}

function ActivityBars({
  title,
  points,
  span,
  unit,
  selected,
  garminNote,
  scale,
  format,
  onSelect,
}: {
  title: string;
  points: readonly DailyActivityPoint[];
  span: WorkoutChartSpan;
  unit: string;
  selected: string | null;
  garminNote: string | null;
  scale?: string | null;
  format?: (point: DailyActivityPoint) => string;
  onSelect: (day: string) => void;
}) {
  const theme = useAppTheme();
  const most = Math.max(1, ...points.map((point) => point.value));
  const scaleLine = scale === undefined ? mostInOneDay(points, unit) : scale;

  return (
    <View style={{ gap: 8 }}>
      <T variant="label">{title}</T>
      {scaleLine ? <T variant="muted">{scaleLine}</T> : null}
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
                <T style={{ fontSize: 10, lineHeight: 12, textAlign: 'center' }}>{format ? format(point) : `${point.value} ${unit}`}</T>
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
