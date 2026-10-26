import { Linking, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';

import { useState, type ReactNode } from 'react';
import {
  ACTIVITY_CARE_LINE,
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
  distanceText,
  exerciseChartCaption,
  exerciseSeries,
  floorsSeries,
  garminMinuteSeries,
  minuteTypeEmpty,
  mostInOneDay,
  restingSeries,
  seriesHasValue,
  stepsSeries,
  type AppleDayValue,
  type DailyActivityPoint,
} from '@/domain/dailyActivity';
import {
  GARMIN_DETAILS_TITLE,
  TAP_FOR_MORE,
  activityChartGuide,
  distanceChartGuide,
  exerciseChartGuide,
  floorsChartGuide,
  garminBarPoints,
  garminDetailCharts,
  garminSourceCaption,
  intensitySeries,
  moderateChartGuide,
  movementPeriod,
  restingChartGuide,
  stepGoalInPeriod,
  stepsChartGuide,
  vigorousChartGuide,
  type ChartGuide,
} from '@/domain/garminCharts';
import type { GarminDaily, GarminHrvSummary, GarminPulseOx, GarminRespiration, GarminSleep, GarminUserMetric } from '@/domain/garminConnect';
import type { NutritionSex } from '@/domain/nutrition';
import { crisisHelplines } from '@/data/catalogue';
import { restingFitnessComment } from '@/domain/restingFitness';
import { weekdayShort } from '@/domain/healthInsights';
import { CHART_DIRECTION_HINT } from '@/domain/readingChart';
import type { WorkoutChartSpan } from '@/domain/workoutDay';
import { useStatPeriod } from '@/health/useStatPeriod';
import { openAppSettings } from '@/health/link';
import { MoreInfo } from '@/ui/MoreInfo';
import { goodZoneBand, statsToneColors } from '@/ui/statsPalette';
import { StatPeriodToggle } from '@/ui/StatPeriodToggle';
import { useAppTheme } from '@/ui/theme';
import { activityTitleIcon } from '@/domain/statIcons';
import { IconLabel } from '@/ui/statIcons';
import { Button, Card, T } from '@/ui/ui';

const BAR_HEIGHT = 88;

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
  age = null,
  sex = null,
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
  age?: number | null;
  sex?: NutritionSex | null;
  exercisePermissionMissing?: boolean;
}) {
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
        nameSource
        garminNote={exerciseChartCaption(exercise)}
        guide={consent ? exerciseChartGuide(period) : null}
        onSelect={setSelected}
      />
      {consent ? (
        <MinuteTypeChart
          title="Moderate minutes"
          points={moderate}
          span={span}
          selected={selected}
          emptyLine={minuteTypeEmpty('moderate')}
          guide={moderateChartGuide()}
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
          guide={vigorousChartGuide()}
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
        age={age}
        sex={sex}
        showIntensity={false}
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
  userMetrics = [],
  age = null,
  sex = null,
  showIntensity = true,
  framed = true,
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
  userMetrics?: readonly GarminUserMetric[];
  age?: number | null;
  sex?: NutritionSex | null;
  showIntensity?: boolean;
  /** False when this block already sits inside a card, so the metrics do not gain a second edge. */
  framed?: boolean;
}) {
  const [sharedPeriod] = useStatPeriod();
  const chartWindow = movementPeriod(span, sharedPeriod);
  const [selected, setSelected] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const stepPoints = stepsSeries(endDay, chartWindow.days, steps, dailies);
  const distance = distanceSeries(endDay, chartWindow.days, dailies);
  const floors = floorsSeries(endDay, chartWindow.days, dailies);
  const resting = restingSeries(endDay, chartWindow.days, restingHeart, dailies);
  const intensity = showIntensity ? intensitySeries(endDay, chartWindow.period, dailies) : [];
  const intensityBars = garminBarPoints(intensity);
  const moderate = showIntensity ? garminMinuteSeries(endDay, chartWindow.days, dailies, 'moderate') : [];
  const vigorous = showIntensity ? garminMinuteSeries(endDay, chartWindow.days, dailies, 'vigorous') : [];
  const details = garminDetailCharts({
    endDay,
    period: chartWindow.period,
    dailies,
    sleep,
    respiration,
    pulseOx,
    hrv,
    userMetrics,
    age,
    sex,
  });
  const chosen = stepPoints.find((point) => point.day === selected)
    ?? distance.find((point) => point.day === selected)
    ?? floors.find((point) => point.day === selected)
    ?? resting.find((point) => point.day === selected)
    ?? intensityBars.find((point) => point.day === selected)
    ?? null;
  const dayLines = [
    stepPoints.find((point) => point.day === selected),
    seriesHasValue(distance) ? distance.find((point) => point.day === selected) : null,
    seriesHasValue(floors) ? floors.find((point) => point.day === selected) : null,
    seriesHasValue(resting) ? resting.find((point) => point.day === selected) : null,
    seriesHasValue(intensityBars) ? intensityBars.find((point) => point.day === selected) : null,
  ].filter((point): point is DailyActivityPoint => point != null && point.value > 0 && !point.empty);
  const detailLines = details.flatMap((chart) => {
    const point = chart.points.find((row) => row.day === selected && !row.empty);
    return point ? [point.label] : [];
  });

  return (
    <View style={{ gap: framed ? 22 : 12 }}>
      {span == null ? (
        <Card>
          <StatPeriodToggle />
        </Card>
      ) : null}
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
        )}
        onSelect={setSelected}
      />
      {seriesHasValue(distance) ? (
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
          guide={distanceChartGuide(chartWindow.period, distance)}
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
          guide={floorsChartGuide(chartWindow.period, floors)}
          onSelect={setSelected}
        />
      ) : null}
      {seriesHasValue(resting) ? (
        <ActivityBars
          framed={framed}
          title="Resting heart rate"
          points={resting}
          span={chartWindow.days}
          unit="bpm"
          selected={selected}
          garminNote={chartSourceCaption(resting)}
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
          }))}
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
          guide={activityChartGuide(chartWindow.period)}
          onSelect={setSelected}
        />
      ) : null}
      {showIntensity && !seriesHasValue(intensityBars) ? (
        <MinuteTypeChart
          title="Intensity minutes"
          points={[]}
          span={chartWindow.days}
          selected={selected}
          emptyLine={INTENSITY_EMPTY}
          guide={activityChartGuide(chartWindow.period)}
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
          guide={moderateChartGuide()}
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
          guide={vigorousChartGuide()}
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
      {details.length > 0 ? (
        <Fold
          title={GARMIN_DETAILS_TITLE}
          closedLabel={TAP_FOR_MORE}
          accessibilityLabel={open ? `Hide ${GARMIN_DETAILS_TITLE}` : `${GARMIN_DETAILS_TITLE}. ${TAP_FOR_MORE}`}
          open={open}
          onToggle={() => setOpen((value) => !value)}
        >
          {details.map((chart) => {
            const bars = garminBarPoints(chart.points);
            return (
              <ActivityBars
                key={chart.id}
                framed={framed}
                title={chart.title}
                points={bars}
                span={chartWindow.days}
                unit={chart.unit}
                selected={selected}
                garminNote={garminSourceCaption(chart)}
                guide={chart.guide}
                onSelect={setSelected}
              />
            );
          })}
        </Fold>
      ) : null}
      {span == null ? <T variant="muted" style={{ textAlign: 'center' }}>{CHART_DIRECTION_HINT}</T> : null}
    </View>
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
  const line = [scale, source].filter((part): part is string => Boolean(part)).join(' ');
  return line || null;
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
  const marks = [1, ...points.map((point) => (point.empty ? 0 : point.value))];
  if (guide?.dailyTypical) marks.push(guide.dailyTypical.high);
  if (guide?.target) marks.push(guide.target.value);
  if (guide?.ownAverage) marks.push(guide.ownAverage.value);
  return Math.max(...marks);
}

function barSourceName(point: DailyActivityPoint): string {
  if (point.source === 'apple') return 'Apple';
  if (point.source === 'garmin') return 'Garmin';
  return '—';
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
  if (!hasReading) {
    const body = (
      <>
        <T variant="label">{title}</T>
        <T variant="muted">{emptyLine}</T>
        <MoreInfo
          about={title}
          summary={ACTIVITY_CARE_LINE}
        >
          <T variant="muted">{guide.about}</T>
        </MoreInfo>
      </>
    );
    if (!framed) return <View style={{ gap: 8 }}>{body}</View>;
    return <Card>{body}</Card>;
  }
  return (
    <ActivityBars
      framed={framed}
      title={title}
      points={points}
      span={span}
      unit="min"
      selected={selected}
      nameSource
      garminNote={MINUTE_TYPE_CAPTION}
      guide={guide}
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
  nameSource = false,
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
  /** False inside a card that already has the mint edge. */
  framed?: boolean;
  /** Apple, Garmin, or a dash under each bar. */
  nameSource?: boolean;
  onSelect: (day: string) => void;
}) {
  const theme = useAppTheme();
  const icon = activityTitleIcon(title);
  const most = chartPeak(points, guide);
  const scaleLine = scale === undefined ? mostInOneDay(points, unit) : scale;
  const band = guide?.dailyTypical ?? null;
  const target = guide?.target?.value ?? null;
  const own = guide?.ownAverage?.value ?? null;
  const explanation = [...new Set([guide?.legend, guide?.about].map((line) => line?.trim()).filter((line): line is string => Boolean(line)))];

  function markStyle(value: number, ink: string) {
    return {
      position: 'absolute' as const,
      left: 0,
      right: 0,
      bottom: (value / most) * BAR_HEIGHT,
      height: 1,
      backgroundColor: ink,
    };
  }

  const body = (
    <>
      {icon ? <IconLabel name={icon}>{title}</IconLabel> : <T variant="label">{title}</T>}
      {readingLine(scaleLine, garminNote) ? <T variant="muted">{readingLine(scaleLine, garminNote)}</T> : null}
      {guide?.target?.label ? <T variant="muted">{guide.target.label}</T> : null}
      {guide?.ownAverage?.label ? <T variant="muted">{guide.ownAverage.label}</T> : null}
      {guide?.warning ? <RestingWarning text={guide.cardCare || 'Contact your GP or NHS 111.'} /> : null}
      {chartVerdict(guide) ? <T>{chartVerdict(guide)}</T> : null}
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
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: span > 14 ? 1 : 4, minHeight: BAR_HEIGHT + (nameSource ? 50 : 36) }}>
        {points.map((point) => {
          const chosen = point.day === selected;
          const showValue = span <= 7 && !point.empty && (point.value > 0 || point.source != null);
          return (
            <Pressable
              key={point.day}
              accessibilityRole="button"
              accessibilityLabel={`${point.label}. Select this day.`}
              accessibilityState={{ selected: chosen }}
              onPress={() => onSelect(point.day)}
              style={{ flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'flex-end' }}
            >
              {point.empty && span <= 10 ? (
                <T style={{ fontSize: 10, lineHeight: 12, textAlign: 'center', color: theme.colors.muted }}>No data</T>
              ) : null}
              {showValue ? (
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
                {band ? (
                  <View
                    style={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      bottom: (band.low / most) * BAR_HEIGHT,
                      height: Math.max(2, ((band.high - band.low) / most) * BAR_HEIGHT),
                      backgroundColor: goodZoneBand(theme.scheme),
                    }}
                  />
                ) : null}
                {point.empty || (point.value === 0 && point.source == null) ? (
                  <View style={{ height: 2, backgroundColor: theme.colors.line, opacity: point.empty ? 0.45 : 1 }} />
                ) : point.value === 0 ? (
                  <View style={{ height: 2, backgroundColor: theme.colors.ink }} />
                ) : (
                  <View style={{ height: Math.max(2, (point.value / most) * BAR_HEIGHT), backgroundColor: theme.colors.ink }} />
                )}
                {own != null ? <View style={markStyle(own, theme.colors.muted)} /> : null}
                {target != null ? <View style={markStyle(target, theme.colors.ink)} /> : null}
              </View>
              <T style={{ fontSize: 10, lineHeight: 12, color: theme.colors.muted }}>
                {span <= 7 ? weekdayShort(point.day).slice(0, 1) : span <= 31 ? String(Number(point.day.slice(8, 10))) : ''}
              </T>
              {nameSource ? (
                <T style={{ fontSize: 10, lineHeight: 12, color: theme.colors.muted }}>{barSourceName(point)}</T>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </>
  );
  if (!framed) return <View style={{ gap: 8 }}>{body}</View>;
  return <Card>{body}</Card>;
}

function Fold({
  title,
  closedLabel,
  accessibilityLabel,
  open,
  onToggle,
  children,
}: {
  title: string;
  closedLabel: string;
  accessibilityLabel: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const theme = useAppTheme();
  const green = statsToneColors(theme.scheme).good.ink;
  return (
    <View style={{ alignSelf: 'stretch', gap: 8 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ expanded: open }}
        onPress={onToggle}
        style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
      >
        <T style={{ fontFamily: theme.font.bodyStrong, flex: 1 }}>{title}</T>
        <T style={{ color: green }}>{open ? 'Hide' : closedLabel}</T>
        <View accessibilityElementsHidden>
          <T style={{ color: green }}>{open ? '⌄' : '›'}</T>
        </View>
      </Pressable>
      {open ? children : null}
    </View>
  );
}

