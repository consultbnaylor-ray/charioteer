import { Linking, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';

import { useState } from 'react';
import {
  EXERCISE_GARMIN_CAPTION,
  INTENSITY_EMPTY,
  MINUTE_TYPE_CAPTION,
} from '@/domain/activityMinutes';
import {
  DAILY_ACTIVITY_CONSENT,
  DAILY_ACTIVITY_RINGS_HINT,
  DAILY_ACTIVITY_TAP_HINT,
  DAILY_ACTIVITY_TITLE,
  EXERCISE_PERMISSION_BUTTON,
  EXERCISE_PERMISSION_HINT,
  NO_STEPS_YET_TODAY,
  activeCaloriesLabel,
  calorieSeries,
  chartSourceCaption,
  distanceSeries,
  activityAxisPlan,
  activityScaleLine,
  chartScalePeak,
  distanceText,
  exerciseChartCaption,
  exerciseSeries,
  floorsSeries,
  garminMinuteSeries,
  minuteTypeEmpty,
  mostInOneDay,
  rangeScaleLine,
  hrvSdnnSeries,
  restingSeries,
  seriesHasValue,
  stepsSeries,
  type AppleDayValue,
  type DailyActivityPoint,
} from '@/domain/dailyActivity';
import {
  GARMIN_DETAILS_TITLE,
  activityChartGuide,
  distanceChartGuide,
  exerciseChartGuide,
  floorsChartGuide,
  garminBarPoints,
  garminDetailCharts,
  garminSourceCaption,
  intensitySeries,
  APPLE_HRV_EMPTY,
  APPLE_HRV_SOURCE,
  GARMIN_HRV_EMPTY,
  GARMIN_HRV_SOURCE,
  NO_READINGS_YET,
  garminPlaceholderCharts,
  sdnnGuide,
  moderateChartGuide,
  movementPeriod,
  restingChartGuide,
  stepGoalInPeriod,
  stepsChartGuide,
  vigorousChartGuide,
  activeEnergyChartGuide,
  type ChartGuide,
  type GarminChartInput,
} from '@/domain/garminCharts';
import type { MetricContext } from '@/domain/metricRegistry';
import type { GarminActivityDetail, GarminBloodPressure, GarminBodyComp, GarminDaily, GarminEpoch, GarminHealthSnapshot, GarminHrvSummary, GarminMoveIq, GarminPulseOx, GarminRespiration, GarminSkinTemp, GarminSleep, GarminStressDetail, GarminUserMetric } from '@/domain/garminConnect';
import type { NutritionGoal, NutritionSex } from '@/domain/nutrition';
import { crisisHelplines } from '@/data/catalogue';
import { restingFitnessComment } from '@/domain/restingFitness';
import { weekdayShort } from '@/domain/healthInsights';
import { CHART_DIRECTION_HINT } from '@/domain/readingChart';
import type { WorkoutChartSpan } from '@/domain/workoutDay';
import { useStatPeriod } from '@/health/useStatPeriod';
import { openDayFraction } from '@/domain/statWindow';
import { openAppSettings } from '@/health/link';
import { MetricRatingLines } from '@/ui/MetricRating';
import { MoreInfo } from '@/ui/MoreInfo';
import { goodZoneBand, statsToneColors } from '@/ui/statsPalette';
import { StatPeriodToggle } from '@/ui/StatPeriodToggle';
import { useAppTheme } from '@/ui/theme';
import { activityTitleIcon } from '@/domain/statIcons';
import { IconLabel } from '@/ui/statIcons';
import { Button, Card, T } from '@/ui/ui';

const BAR_HEIGHT = 88;

function sumPoints(points: readonly { value: number; empty?: boolean }[]): number | null {
  const values = points.flatMap((point) => (point.empty || !(point.value > 0) ? [] : [point.value]));
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0);
}

function chartContext(age: number | null, sex: NutritionSex | null, goal: NutritionGoal | null, windowDays: number): Partial<MetricContext> {
  return { age, sex, goal, realAge: age, windowDays };
}

function dailyAverage(points: readonly DailyActivityPoint[]): number | null {
  const values = points.flatMap((point) => (point.empty || point.value <= 0 ? [] : [point.value]));
  if (!values.length) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function latestRunningVo2(metrics: readonly GarminUserMetric[]): number | null {
  let day = '';
  let value: number | null = null;
  for (const row of metrics) {
    if (row.vo2Max == null || !(row.vo2Max > 0)) continue;
    if (row.calendarDate >= day) {
      day = row.calendarDate;
      value = row.vo2Max;
    }
  }
  return value;
}

function RestingWarning({ text }: { text: string }) {
  const theme = useAppTheme();
  return (
    <View accessibilityRole="alert" style={{ backgroundColor: '#FFE14A', borderWidth: 2, borderColor: '#1A1400', padding: 12, gap: 8 }}>
      <T style={{ color: '#1A1400', fontSize: 28, lineHeight: 32 }}>⚠</T>
      <T style={{ color: '#1A1400', fontFamily: theme.font.bodyStrong }}>{text}</T>
    </View>
  );
}

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
  userMetrics = [],
  bloodPressure = [],
  bodyComp = [],
  skinTemp = [],
  stress = [],
  epochs = [],
  healthSnapshot = [],
  moveIq = [],
  activityDetails = [],
  age = null,
  sex = null,
  goal = null,
  exercisePermissionMissing = false,
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
  userMetrics?: readonly GarminUserMetric[];
  bloodPressure?: readonly GarminBloodPressure[];
  bodyComp?: readonly GarminBodyComp[];
  skinTemp?: readonly GarminSkinTemp[];
  stress?: readonly GarminStressDetail[];
  epochs?: readonly GarminEpoch[];
  healthSnapshot?: readonly GarminHealthSnapshot[];
  moveIq?: readonly GarminMoveIq[];
  activityDetails?: readonly GarminActivityDetail[];
  age?: number | null;
  sex?: NutritionSex | null;
  goal?: NutritionGoal | null;
  exercisePermissionMissing?: boolean;
}) {
  const minuteCtx = chartContext(age, sex, goal, span);
  const [selected, setSelected] = useState<string | null>(null);
  const period = movementPeriod(span, '7').period;
  const exercise = consent ? exerciseSeries(endDay, span, exerciseMinutes, dailies) : [];
  const moderate = consent ? garminMinuteSeries(endDay, span, dailies, 'moderate') : [];
  const vigorous = consent ? garminMinuteSeries(endDay, span, dailies, 'vigorous') : [];
  const calories = consent ? calorieSeries(endDay, span, activeKcal, dailies) : [];
  const exerciseDay = exercise.find((point) => point.day === selected) ?? null;
  const calorieDay = calories.find((point) => point.day === selected) ?? null;

  return (
    <View style={{ gap: 8 }}>
      <T variant="label">{DAILY_ACTIVITY_TITLE}</T>
      <T variant="muted">{DAILY_ACTIVITY_RINGS_HINT}</T>
      {consent ? null : <T variant="muted">{DAILY_ACTIVITY_CONSENT}</T>}
      <ActivityBars
        framed={false}
        title="Exercise minutes"
        points={exercise}
        span={span}
        unit="min"
        selected={selected}
        garminNote={exerciseChartCaption(exercise)}
        guide={exerciseChartGuide(period, minuteCtx, sumPoints(exercise))}
        onSelect={setSelected}
      />
      {consent ? (
        <MinuteTypeChart
          title="Moderate minutes"
          points={moderate}
          span={span}
          selected={selected}
          emptyLine={minuteTypeEmpty('moderate')}
          guide={moderateChartGuide(minuteCtx, sumPoints(moderate))}
          onSelect={setSelected}
        />
      ) : null}
      {consent ? (
        <MinuteTypeChart
          title="Vigorous minutes"
          points={vigorous}
          span={span}
          selected={selected}
          emptyLine={minuteTypeEmpty('vigorous')}
          guide={vigorousChartGuide(minuteCtx, sumPoints(vigorous))}
          onSelect={setSelected}
        />
      ) : null}
      {exercisePermissionMissing ? (
        <View style={{ gap: 8 }}>
          <T>{EXERCISE_PERMISSION_HINT}</T>
          <Button label={EXERCISE_PERMISSION_BUTTON} onPress={() => void openAppSettings()} />
        </View>
      ) : null}
      <ActivityBars
        framed={false}
        title="Active calories"
        points={calories}
        span={span}
        unit="kcal"
        selected={selected}
        garminNote={chartSourceCaption(calories)}
        guide={activeEnergyChartGuide(minuteCtx, sumPoints(calories))}
        onSelect={setSelected}
      />
      <T variant="muted">{DAILY_ACTIVITY_TAP_HINT}</T>
      <T variant="muted" style={{ textAlign: 'center' }}>{CHART_DIRECTION_HINT}</T>
      {exerciseDay && calorieDay ? (
        <View style={{ gap: 4 }}>
          <T>{exerciseDay.label}</T>
          <T>{activeCaloriesLabel(calorieDay.day, calorieDay.value, calorieDay.source)}</T>
        </View>
      ) : null}
      <MovementCharts
        framed={false}
        endDay={endDay}
        span={span}
        steps={steps}
        restingHeart={restingHeart}
        dailies={dailies}
        sleep={sleep}
        respiration={respiration}
        pulseOx={pulseOx}
        hrv={hrv}
        userMetrics={userMetrics}
        bloodPressure={bloodPressure}
        bodyComp={bodyComp}
        skinTemp={skinTemp}
        stress={stress}
        epochs={epochs}
        healthSnapshot={healthSnapshot}
        moveIq={moveIq}
        activityDetails={activityDetails}
        age={age}
        sex={sex}
        goal={goal}
        showIntensity={false}
        showHealthStats={false}
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
  appleHrvSdnn = [],
  userMetrics = [],
  bloodPressure = [],
  bodyComp = [],
  skinTemp = [],
  stress = [],
  epochs = [],
  healthSnapshot = [],
  moveIq = [],
  activityDetails = [],
  age = null,
  sex = null,
  goal = null,
  showIntensity = true,
  framed = true,
  showVo2Chart = true,
  detailsOnly = false,
  showHealthStats = true,
}: {
  endDay: string;
  /** Set on Workouts, where that screen's 7 or 30 day control is the one the other charts use. */
  span?: number;
  steps: readonly AppleDayValue[];
  restingHeart: readonly AppleDayValue[];
  dailies: readonly GarminDaily[];
  sleep: readonly GarminSleep[];
  respiration: readonly GarminRespiration[];
  pulseOx: readonly GarminPulseOx[];
  hrv: readonly GarminHrvSummary[];
  appleHrvSdnn?: readonly AppleDayValue[];
  userMetrics?: readonly GarminUserMetric[];
  bloodPressure?: GarminChartInput['bloodPressure'];
  bodyComp?: GarminChartInput['bodyComp'];
  skinTemp?: GarminChartInput['skinTemp'];
  stress?: GarminChartInput['stress'];
  epochs?: GarminChartInput['epochs'];
  healthSnapshot?: GarminChartInput['healthSnapshot'];
  moveIq?: GarminChartInput['moveIq'];
  activityDetails?: GarminChartInput['activityDetails'];
  age?: number | null;
  sex?: NutritionSex | null;
  goal?: NutritionGoal | null;
  showIntensity?: boolean;
  /** False when this block already sits inside a card, so the metrics do not gain a second edge. */
  framed?: boolean;
  /** False on Stats and Health Plan, where the VO2 max chart sits inside Your fitness. */
  showVo2Chart?: boolean;
  /** The More Garmin Stats screen. The main charts stay on Stats. */
  detailsOnly?: boolean;
  /**
   * Workouts already has its own exercise charts. Steps, distance, resting heart rate,
   * heart rate variability, fitness age, and the More Garmin Stats link stay on Health Stats.
   */
  showHealthStats?: boolean;
}) {
  const theme = useAppTheme();
  const router = useRouter();
  const [sharedPeriod] = useStatPeriod();
  const chartWindow = movementPeriod(span, sharedPeriod);
  const [selected, setSelected] = useState<string | null>(null);
  const stepPoints = stepsSeries(endDay, chartWindow.days, steps, dailies);
  const distance = distanceSeries(endDay, chartWindow.days, dailies);
  const floors = floorsSeries(endDay, chartWindow.days, dailies);
  const resting = restingSeries(endDay, chartWindow.days, restingHeart, dailies);
  const intensity = showIntensity ? intensitySeries(endDay, chartWindow.period, dailies) : [];
  const intensityBars = garminBarPoints(intensity);
  const moderate = showIntensity ? garminMinuteSeries(endDay, chartWindow.days, dailies, 'moderate') : [];
  const vigorous = showIntensity ? garminMinuteSeries(endDay, chartWindow.days, dailies, 'vigorous') : [];
  const detailCharts = garminDetailCharts({
    endDay,
    period: chartWindow.period,
    dailies,
    sleep,
    respiration,
    pulseOx,
    hrv,
    userMetrics,
    bloodPressure,
    bodyComp,
    skinTemp,
    stress,
    epochs,
    healthSnapshot,
    moveIq,
    activityDetails,
    age,
    sex,
    goal,
  });
  const minuteCtx = {
    ...chartContext(age, sex, goal, chartWindow.days),
    dayFraction: chartWindow.period === 'day' ? openDayFraction() : null,
  };
  const hrvChart = detailCharts.find((chart) => chart.id === 'hrv') ?? null;
  const details = detailCharts.filter((chart) => (showVo2Chart || chart.id !== 'vo2') && chart.id !== 'hrv');
  const shownGarmin = new Set<string>(details.map((chart) => chart.id));
  if (hrvChart) shownGarmin.add('hrv');
  if (!showVo2Chart) shownGarmin.add('vo2');
  const missingGarmin = dailies.length > 0
    ? garminPlaceholderCharts({
      endDay,
      period: chartWindow.period,
      dailies,
      sleep,
      respiration,
      pulseOx,
      hrv,
      userMetrics,
      bloodPressure,
      bodyComp,
      skinTemp,
      stress,
      epochs,
      healthSnapshot,
      moveIq,
      activityDetails,
      age,
      sex,
      goal,
    }, shownGarmin)
    : [];
  const hrvPlaceholder = missingGarmin.find((chart) => chart.id === 'hrv') ?? null;
  const fitnessChart = detailCharts.find((chart) => chart.id === 'fitness_age')
    ?? missingGarmin.find((chart) => chart.id === 'fitness_age')
    ?? null;
  const placeholders = missingGarmin.filter((chart) => chart.id !== 'hrv' && chart.id !== 'fitness_age');
  const foldDetails = details.filter((chart) => chart.id !== 'fitness_age');
  const sdnnPoints = hrvSdnnSeries(endDay, chartWindow.days, appleHrvSdnn);
  const chosen = (showHealthStats ? stepPoints.find((point) => point.day === selected) : null)
    ?? (showHealthStats ? distance.find((point) => point.day === selected) : null)
    ?? floors.find((point) => point.day === selected)
    ?? (showHealthStats ? resting.find((point) => point.day === selected) : null)
    ?? intensityBars.find((point) => point.day === selected)
    ?? null;
  const dayLines = [
    showHealthStats ? stepPoints.find((point) => point.day === selected) : null,
    showHealthStats && seriesHasValue(distance) ? distance.find((point) => point.day === selected) : null,
    seriesHasValue(floors) ? floors.find((point) => point.day === selected) : null,
    showHealthStats && seriesHasValue(resting) ? resting.find((point) => point.day === selected) : null,
    seriesHasValue(intensityBars) ? intensityBars.find((point) => point.day === selected) : null,
  ].filter((point): point is DailyActivityPoint => point != null && point.value > 0 && !point.empty);
  const detailLines = details.flatMap((chart) => {
    const point = chart.points.find((row) => row.day === selected && !row.empty);
    return point ? [point.label] : [];
  });
  const green = statsToneColors(theme.scheme).good.ink;
  function garminCard(chart: (typeof foldDetails)[number] | NonNullable<typeof fitnessChart>) {
    return (
      <ActivityBars
        key={chart.id}
        framed={framed}
        title={chart.title}
        points={garminBarPoints(chart.points)}
        span={chartWindow.days}
        unit={chart.unit}
        selected={selected}
        garminNote="Garmin"
        guide={chart.guide}
        lead={chart.note}
        cumulative={chart.id === 'epoch_minutes' || chart.id === 'move_iq' || chart.id === 'activity_detail' || chart.id === 'body_battery_charged' || chart.id === 'body_battery_drained'}
        onSelect={setSelected}
      />
    );
  }
  if (detailsOnly) {
    return (
      <View style={{ gap: 12 }}>
        {foldDetails.map((chart) => garminCard(chart))}
        {placeholders.map((chart) => garminCard(chart))}
      </View>
    );
  }

  return (
    <View style={{ gap: framed ? 22 : 12 }}>
      {span == null ? (
        <Card>
          <StatPeriodToggle />
        </Card>
      ) : null}
      {showHealthStats ? (
        <ActivityBars
          framed={framed}
          title="Steps"
          points={stepPoints}
          span={chartWindow.days}
          unit="steps"
          selected={selected}
          garminNote={[chartSourceCaption(stepPoints), stepPoints.at(-1)?.label === NO_STEPS_YET_TODAY ? NO_STEPS_YET_TODAY : null].filter((line): line is string => line != null).join('\n') || null}
          guide={stepsChartGuide(
            chartWindow.period,
            stepGoalInPeriod(dailies, endDay, chartWindow.period),
            age,
            dailyAverage(stepPoints),
            minuteCtx,
          )}
          onSelect={setSelected}
        />
      ) : null}
      {showHealthStats && seriesHasValue(distance) ? (
        <ActivityBars
          framed={framed}
          title="Distance"
          points={distance}
          span={chartWindow.days}
          unit="m"
          selected={selected}
          scale={mostDistance(distance)}
          format={(point) => distanceText(point.value)}
          garminNote={chartSourceCaption(distance)}
          guide={distanceChartGuide(chartWindow.period, distance, minuteCtx)}
          onSelect={setSelected}
        />
      ) : null}
      {seriesHasValue(floors) ? (
        <ActivityBars
          framed={framed}
          title="Floors"
          points={floors}
          span={chartWindow.days}
          unit="floors"
          selected={selected}
          garminNote={chartSourceCaption(floors)}
          guide={floorsChartGuide(chartWindow.period, floors, minuteCtx)}
          onSelect={setSelected}
        />
      ) : null}
      {showHealthStats && seriesHasValue(resting) ? (
        <ActivityBars
          framed={framed}
          title="Resting heart rate"
          points={resting}
          span={chartWindow.days}
          unit="bpm"
          selected={selected}
          garminNote={chartSourceCaption(resting)}
          cumulative={false}
          guide={restingChartGuide(chartWindow.period, resting, restingFitnessComment({
            today: endDay,
            resting: restingSeries(endDay, 30, restingHeart, dailies).flatMap((point) => (
              point.empty || point.value <= 0 ? [] : [{ day: point.day, bpm: point.value }]
            )),
            activity: dailies.flatMap((day) => (
              day.calendarDate ? [{
                day: day.calendarDate,
                moderateMinutes: day.moderateMinutes ?? 0,
                vigorousMinutes: day.vigorousMinutes ?? 0,
              }] : []
            )),
            vo2Max: latestRunningVo2(userMetrics),
            age,
            sex,
          }), minuteCtx)}
          onSelect={setSelected}
        />
      ) : null}
      {showIntensity && seriesHasValue(intensityBars) ? (
        <ActivityBars
          framed={framed}
          title="Intensity minutes"
          points={intensityBars}
          span={chartWindow.days}
          unit="min"
          selected={selected}
          garminNote={EXERCISE_GARMIN_CAPTION}
          guide={activityChartGuide(chartWindow.period, minuteCtx, sumPoints(intensityBars))}
          onSelect={setSelected}
        />
      ) : null}
      {showIntensity && !seriesHasValue(intensityBars) ? (
        <MinuteTypeChart
          title="Intensity minutes"
          points={intensityBars}
          span={chartWindow.days}
          selected={selected}
          emptyLine={INTENSITY_EMPTY}
          guide={activityChartGuide(chartWindow.period, minuteCtx, null)}
          framed={framed}
          onSelect={setSelected}
        />
      ) : null}
      {showIntensity ? (
        <MinuteTypeChart
          title="Moderate minutes"
          points={moderate}
          span={chartWindow.days}
          selected={selected}
          emptyLine={minuteTypeEmpty('moderate')}
          guide={moderateChartGuide(minuteCtx, sumPoints(moderate))}
          framed={framed}
          onSelect={setSelected}
        />
      ) : null}
      {showIntensity ? (
        <MinuteTypeChart
          title="Vigorous minutes"
          points={vigorous}
          span={chartWindow.days}
          selected={selected}
          emptyLine={minuteTypeEmpty('vigorous')}
          guide={vigorousChartGuide(minuteCtx, sumPoints(vigorous))}
          framed={framed}
          onSelect={setSelected}
        />
      ) : null}
      {chosen && (dayLines.length > 0 || detailLines.length > 0) ? (
        <View style={{ gap: 4 }}>
          {dayLines.map((point) => <T key={point.label}>{point.label}</T>)}
          {detailLines.map((line) => <T key={line}>{line}</T>)}
        </View>
      ) : null}
      {showHealthStats && hrvChart ? (
        <ActivityBars
          framed={framed}
          title="Heart rate variability"
          points={garminBarPoints(hrvChart.points)}
          span={chartWindow.days}
          unit={hrvChart.unit}
          selected={selected}
          garminNote={GARMIN_HRV_SOURCE}
          guide={hrvChart.guide}
          cumulative={false}
          onSelect={setSelected}
        />
      ) : showHealthStats && hrvPlaceholder ? (
        <ActivityBars
          framed={framed}
          title="Heart rate variability"
          points={garminBarPoints(hrvPlaceholder.points)}
          span={chartWindow.days}
          unit={hrvPlaceholder.unit}
          selected={selected}
          garminNote={GARMIN_HRV_SOURCE}
          guide={hrvPlaceholder.guide}
          lead={hrvPlaceholder.note ?? GARMIN_HRV_EMPTY}
          cumulative={false}
          onSelect={setSelected}
        />
      ) : null}
      {showHealthStats && seriesHasValue(sdnnPoints) ? (
        <ActivityBars
          framed={framed}
          title="Heart rate variability"
          points={sdnnPoints}
          span={chartWindow.days}
          unit="ms"
          selected={selected}
          garminNote={APPLE_HRV_SOURCE}
          guide={sdnnGuide(chartWindow.period, sdnnPoints, minuteCtx)}
          cumulative={false}
          onSelect={setSelected}
        />
      ) : showHealthStats && appleHrvSdnn.length > 0 ? (
        <ActivityBars
          framed={framed}
          title="Heart rate variability"
          points={sdnnPoints}
          span={chartWindow.days}
          unit="ms"
          selected={selected}
          garminNote={APPLE_HRV_SOURCE}
          guide={sdnnGuide(chartWindow.period, sdnnPoints, minuteCtx)}
          lead={APPLE_HRV_EMPTY}
          cumulative={false}
          onSelect={setSelected}
        />
      ) : null}
      {showHealthStats && fitnessChart ? garminCard(fitnessChart) : null}
      {showHealthStats && (foldDetails.length > 0 || placeholders.length > 0) ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`Garmin. ${GARMIN_DETAILS_TITLE}`}
          onPress={() => router.push('/garmin-stats' as never)}
          style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10 }}
        >
          <T style={{ color: theme.colors.ink, fontFamily: theme.font.bodyStrong, fontSize: 34 * theme.scale, lineHeight: 40 * theme.scale }}>Garmin</T>
          <T style={{ color: green, fontFamily: theme.font.bodyStrong, fontSize: 22 * theme.scale, lineHeight: 28 * theme.scale }}>{`→ ${GARMIN_DETAILS_TITLE}`}</T>
        </Pressable>
      ) : null}
      {span == null ? <T variant="muted" style={{ textAlign: 'center' }}>{CHART_DIRECTION_HINT}</T> : null}
    </View>
  );
}

/** Garmin's VO2 max bars. Shown inside Your fitness, under the connected card. */
export function Vo2MaxChart({
  endDay,
  userMetrics,
  age,
  sex,
  goal = null,
}: {
  endDay: string;
  userMetrics: readonly GarminUserMetric[];
  age: number | null;
  sex: NutritionSex | null;
  goal?: NutritionGoal | null;
}) {
  const [sharedPeriod] = useStatPeriod();
  const chartWindow = movementPeriod(undefined, sharedPeriod);
  const [selected, setSelected] = useState<string | null>(null);
  const chart = garminDetailCharts({
    endDay,
    period: chartWindow.period,
    dailies: [],
    sleep: [],
    respiration: [],
    pulseOx: [],
    hrv: [],
    userMetrics,
    age,
    sex,
    goal,
  }).find((item) => item.id === 'vo2');
  if (!chart) return null;
  return (
    <ActivityBars
      framed
      title={chart.title}
      points={garminBarPoints(chart.points)}
      span={chartWindow.days}
      unit={chart.unit}
      selected={selected}
      garminNote={garminSourceCaption(chart)}
      guide={chart.guide}
      cumulative={false}
      onSelect={setSelected}
    />
  );
}

const CARE_LINES = new Set(['Samaritans', 'NHS 111', 'Emergency services']);

/** Crisis numbers stay on the card. They are the same helplines as Help. */
function CareLine({ text }: { text: string }) {
  const lines = crisisHelplines([]).filter((item) => CARE_LINES.has(item.title) && item.phone);
  return (
    <View style={{ gap: 4 }}>
      <T>{text}</T>
      {lines.map((item) => {
        const phone = item.phone ?? '';
        const dial = phone.replace(/\s/g, '');
        return (
          <Pressable
            key={item.id}
            accessibilityRole="link"
            accessibilityLabel={`${item.title}, ${phone}`}
            onPress={() => void Linking.openURL(`tel:${dial}`)}
            style={{ minHeight: 44, justifyContent: 'center' }}
          >
            <T style={{ textDecorationLine: 'underline' }}>{`${item.title} ${phone}`}</T>
          </Pressable>
        );
      })}
    </View>
  );
}

function StressActions() {
  const router = useRouter();
  return (
    <View style={{ gap: 4 }}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel="Open Breathe"
        onPress={() => router.push('/breathe' as never)}
        style={{ minHeight: 44, justifyContent: 'center' }}
      >
        <T variant="muted" style={{ textDecorationLine: 'underline' }}>Breathe</T>
      </Pressable>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel="Open Thumos"
        onPress={() => router.push('/thumos' as never)}
        style={{ minHeight: 44, justifyContent: 'center' }}
      >
        <T variant="muted" style={{ textDecorationLine: 'underline' }}>Thumos</T>
      </Pressable>
    </View>
  );
}

function readingLine(scale: string | null, source: string | null): string | null {
  return activityScaleLine(scale, source);
}

/** The first short sentence, when a chart has no verdict of its own. */
function chartVerdict(guide: ChartGuide | null): string | null {
  if (!guide) return null;
  if (guide.verdict) return guide.verdict;
  if (!guide.outside) return null;
  const first = guide.outside.split(/(?<=\.)\s/)[0]?.trim() ?? '';
  if (!first || first.split(/\s+/).length > 22) return null;
  return first;
}

function mostDistance(points: readonly { value: number }[]): string | null {
  const most = points.reduce((max, point) => Math.max(max, point.value), 0);
  if (most <= 0) return null;
  return `Most in one day ${distanceText(most)}`;
}

function chartPeak(points: readonly DailyActivityPoint[], guide: ChartGuide | null | undefined): number {
  const marks: number[] = [];
  if (guide?.dailyTypical) marks.push(guide.dailyTypical.high);
  if (guide?.target) marks.push(guide.target.value);
  if (guide?.ownAverage) marks.push(guide.ownAverage.value);
  return chartScalePeak(points, marks);
}

function MinuteTypeChart({
  title,
  points,
  span,
  selected,
  emptyLine,
  guide,
  framed = false,
  onSelect,
}: {
  title: string;
  points: readonly DailyActivityPoint[];
  span: number;
  selected: string | null;
  emptyLine: string;
  guide: ChartGuide;
  framed?: boolean;
  onSelect: (day: string) => void;
}) {
  const hasReading = points.some((point) => point.source != null);
  return (
    <ActivityBars
      framed={framed}
      title={title}
      points={points}
      span={span}
      unit="min"
      selected={selected}
      garminNote={MINUTE_TYPE_CAPTION}
      guide={guide}
      lead={hasReading ? null : emptyLine}
      onSelect={onSelect}
    />
  );
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
  guide = null,
  framed = true,
  lead = null,
  cumulative = true,
  onSelect,
}: {
  title: string;
  points: readonly DailyActivityPoint[];
  span: number;
  unit: string;
  selected: string | null;
  garminNote: string | null;
  scale?: string | null;
  format?: (point: DailyActivityPoint) => string;
  guide?: ChartGuide | null;
  /** A running total uses "Today so far" on an open Day. A rate uses "Today". */
  cumulative?: boolean;
  /** False inside a card that already has the mint edge. */
  framed?: boolean;
  /** One sentence kept on the card when the chart has no readings. */
  lead?: string | null;
  onSelect: (day: string) => void;
}) {
  const theme = useAppTheme();
  const icon = activityTitleIcon(title);
  const most = chartPeak(points, guide);
  const scaleLine = span === 1
    ? rangeScaleLine({
      points,
      unit,
      days: 1,
      cumulative,
      textFor: format ? (value) => format({ day: points[0]?.day ?? '', value, source: null, empty: false, label: '' }) : undefined,
    })
    : (scale === undefined ? mostInOneDay(points, unit) : scale);
  const band = guide?.dailyTypical ?? null;
  const target = guide?.target?.value ?? null;
  const own = guide?.ownAverage?.value ?? null;
  const explanation = [...new Set([guide?.legend, guide?.about].map((line) => line?.trim()).filter((line): line is string => Boolean(line)))].filter((line) => !lead || line !== lead.trim());

  function guideLine(value: number) {
    return {
      position: 'absolute' as const,
      left: 0,
      right: 0,
      bottom: (Math.min(value, most) / most) * BAR_HEIGHT,
      height: 1,
      backgroundColor: theme.colors.muted,
    };
  }
  const hasBars = points.some((point) => point.source != null && point.empty !== true);
  const bandLow = band ? Math.max(0, Math.min(band.low, band.high)) : 0;
  const bandTop = band ? Math.min(Math.max(band.high, bandLow), most) : 0;
  const bandBottom = band ? Math.min(bandLow, bandTop) : 0;
  const axis = activityAxisPlan(points.map((point) => point.day));
  const dividers = new Set(axis.filter((mark) => mark.divider).map((mark) => mark.index));

  const body = (
    <>
      {icon ? <IconLabel name={icon}>{title}</IconLabel> : <T variant="label">{title}</T>}
      {readingLine(scaleLine, garminNote) ? <T variant="muted">{readingLine(scaleLine, garminNote)}</T> : null}
      {guide?.target?.label ? <T variant="muted">{guide.target.label}</T> : null}
      {guide?.ownAverage?.label ? <T variant="muted">{guide.ownAverage.label}</T> : null}
      {guide?.warning ? <RestingWarning text={guide.cardCare || 'Contact your GP or NHS 111.'} /> : null}
      {lead ? <T>{lead}</T> : null}
      {chartVerdict(guide) ? <T>{chartVerdict(guide)}</T> : null}
      <MetricRatingLines rating={guide?.rating} />
      {explanation.length > 0 || (guide?.sections?.length ?? 0) > 0 || guide?.care || guide?.outside ? (
        <MoreInfo about={title} summary="Not medical advice. Not a diagnosis.">
          {(guide?.sections ?? []).map((section) => (
            <View key={section.heading} style={{ gap: 4 }}>
              <T variant="label">{section.heading}</T>
              <T variant="muted">{section.body}</T>
            </View>
          ))}
          {explanation.map((line) => <T key={line.slice(0, 48)} variant="muted">{line}</T>)}
          {guide?.outside && guide.outside !== chartVerdict(guide) ? <T variant="muted">{guide.outside}</T> : null}
          {guide?.care ? <CareLine text={guide.care} /> : null}
          {title === 'Average stress' ? <StressActions /> : null}
        </MoreInfo>
      ) : null}
      <View style={{ alignSelf: 'stretch', paddingHorizontal: 2, gap: 2 }}>
        {span <= 7 ? (
          <View style={{ flexDirection: 'row', gap: span > 14 ? 1 : 4 }}>
            {points.map((point) => {
              const missing = point.empty || (point.value === 0 && point.source == null);
              const showValue = !missing && (point.value > 0 || point.source != null);
              return (
                <View key={point.day} style={{ flex: 1, minHeight: 12, alignItems: 'center' }}>
                  {showValue ? (
                    <T numberOfLines={1} style={{ fontSize: 10, lineHeight: 12, textAlign: 'center' }}>{format ? format(point) : `${point.value} ${unit}`}</T>
                  ) : null}
                </View>
              );
            })}
          </View>
        ) : null}
        <View style={{ height: BAR_HEIGHT, position: 'relative' }}>
          {band && bandTop > bandBottom ? (
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                zIndex: 0,
                left: 0,
                right: 0,
                bottom: (bandBottom / most) * BAR_HEIGHT,
                height: Math.max(2, ((bandTop - bandBottom) / most) * BAR_HEIGHT),
                backgroundColor: goodZoneBand(theme.scheme),
              }}
            />
          ) : null}
          {dividers.size > 0 ? points.map((point, index) => (
            dividers.has(index) ? (
              <View
                key={`tick-${point.day}`}
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  zIndex: 1,
                  top: 0,
                  bottom: 0,
                  width: 1,
                  left: `${((index + 0.5) / points.length) * 100}%`,
                  backgroundColor: theme.colors.line,
                }}
              />
            ) : null
          )) : null}
          {!hasBars ? (
            <View pointerEvents="none" style={{ position: 'absolute', zIndex: 3, left: 8, right: 8, top: 8 }}>
              <T>{NO_READINGS_YET}</T>
            </View>
          ) : null}
          {own != null ? <View pointerEvents="none" style={{ ...guideLine(own), zIndex: 1 }} /> : null}
          {target != null ? <View pointerEvents="none" style={{ ...guideLine(target), zIndex: 1 }} /> : null}
          <View style={{ zIndex: 2, flexDirection: 'row', alignItems: 'flex-end', height: BAR_HEIGHT, gap: span > 14 ? 1 : 4 }}>
            {points.map((point) => {
              const chosen = point.day === selected;
              const missing = point.empty || (point.value === 0 && point.source == null);
              return (
                <Pressable
                  key={point.day}
                  accessibilityRole="button"
                  accessibilityLabel={`${point.label}. Select this day.`}
                  accessibilityState={{ selected: chosen }}
                  onPress={() => onSelect(point.day)}
                  style={{ flex: 1, height: BAR_HEIGHT, justifyContent: 'flex-end' }}
                >
                  <View
                    style={{
                      height: BAR_HEIGHT,
                      alignSelf: 'stretch',
                      justifyContent: 'flex-end',
                      marginHorizontal: 1,
                      borderWidth: chosen ? 1 : 0,
                      borderColor: theme.colors.ink,
                      backgroundColor: chosen ? theme.colors.emphasisSoft : 'transparent',
                    }}
                  >
                    {missing ? null : point.value === 0 ? (
                      <View style={{ height: 2, backgroundColor: theme.colors.ink }} />
                    ) : (
                      <View style={{ height: Math.max(2, (point.value / most) * BAR_HEIGHT), backgroundColor: theme.colors.ink }} />
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
        <View style={{ height: 14, position: 'relative' }}>
          {span <= 7 ? points.map((point, index) => (
            <View key={point.day} style={{ position: 'absolute', left: `${(index / points.length) * 100}%`, width: `${100 / points.length}%`, alignItems: 'center' }}>
              <T numberOfLines={1} style={{ fontSize: 9, lineHeight: 12, textAlign: 'center', color: theme.colors.muted }}>{weekdayShort(point.day).slice(0, 1)}</T>
            </View>
          )) : axis.filter((mark) => mark.label).map((mark) => {
            const nearStart = mark.index <= 1;
            const nearEnd = mark.index >= points.length - 2;
            const width = Math.max(18, mark.label.length * 6 + 4);
            return (
              <T
                key={points[mark.index]?.day ?? mark.index}
                numberOfLines={1}
                style={{
                  position: 'absolute',
                  top: 0,
                  width,
                  fontSize: 9,
                  lineHeight: 12,
                  textAlign: nearStart ? 'left' : nearEnd ? 'right' : 'center',
                  color: theme.colors.muted,
                  left: nearEnd ? undefined : nearStart ? `${(mark.index / points.length) * 100}%` : `${((mark.index + 0.5) / points.length) * 100}%`,
                  right: nearEnd ? `${((points.length - 1 - mark.index) / points.length) * 100}%` : undefined,
                  marginLeft: nearStart || nearEnd ? 0 : -width / 2,
                }}
              >
                {mark.label}
              </T>
            );
          })}
        </View>
      </View>
    </>
  );
  if (!framed) return <View style={{ gap: 8 }}>{body}</View>;
  return <Card>{body}</Card>;
}


