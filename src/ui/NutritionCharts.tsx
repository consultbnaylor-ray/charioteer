import { useMemo, type ReactNode } from 'react';
import { View } from 'react-native';

import { loggedNutritionChart, loggingChart, overviewLineChart } from '@/domain/chartSeries';
import type { ChartBar } from '@/domain/distance';
import type { FoodLog, NutritionGoal, TodayRing, TrendDay } from '@/domain/nutrition';
import {
  dayItems,
  eatingInsights,
  fatBalance,
  loggingCaption,
  loggingDots,
  macroSplit,
  nutritionTrendDays,
  sumItems,
  todayRing,
  trendCaption,
  waterProgress,
  weightTrendLine,
} from '@/domain/nutrition';
import { chartBucketForPeriod } from '@/domain/readingChart';
import type { StatsTone } from '@/domain/statsOverview';
import { londonToday, paceJudgement, periodDayCount, periodHeading, periodPhrase, proteinPace, rollingWindow, type StatPeriod } from '@/domain/statWindow';
import { useStatPeriod } from '@/health/useStatPeriod';
import { CompareBars, ProgressRing } from '@/ui/DistanceCharts';
import { ReadingChart } from '@/ui/ReadingChart';
import { statsToneColors } from '@/ui/statsPalette';
import { StatPeriodToggle } from '@/ui/StatPeriodToggle';
import { useAppTheme } from '@/ui/theme';
import { Card, T } from '@/ui/ui';

/**
 * Nutrition charts use react-native-svg, the same drawing library as Health.
 * Figures come from the meals already on screen, so nothing is fetched.
 * Colour comes from the stats palette, with a word beside it.
 */
export function NutritionBoard({
  logs,
  today,
  hideCalories,
  kcalTarget,
  proteinTarget,
  checkIns,
  qualitySwitch,
  progressSwitch,
}: {
  logs: readonly FoodLog[];
  today: string;
  hideCalories: boolean;
  kcalTarget: number | null;
  proteinTarget: number | null;
  checkIns: readonly { createdAt: string; mood: number; sleepHours: number }[];
  qualitySwitch?: ReactNode;
  progressSwitch?: ReactNode;
}) {
  const [period] = useStatPeriod();
  const span = periodDayCount(period);
  const picture = useMemo(() => {
    const days = nutritionTrendDays(logs, today, span);
    const logged = days.filter((day) => day.logged);
    const items = logged.flatMap((day) => dayItems(logs, day.day));
    const proteinDays = logged.map((day) => day.proteinG).filter((grams) => grams > 0);
    const proteinAvg = proteinDays.length ? proteinDays.reduce((sum, grams) => sum + grams, 0) / proteinDays.length : 0;
    const proteinHits = proteinTarget != null && proteinTarget > 0
      ? proteinDays.filter((grams) => grams >= proteinTarget).length
      : 0;
    const kcalAvg = logged.length ? logged.reduce((sum, day) => sum + day.kcal, 0) / logged.length : 0;
    const whole = items.filter((item) => !item.processed).length;
    const processed = items.length - whole;
    const shared = {
      hideCalories,
      kcal: kcalAvg,
      kcalTarget,
      proteinG: proteinAvg,
      proteinTarget,
      logged: logged.length > 0,
    };
    return {
      loggedCount: logged.length,
      proteinDays: proteinDays.length,
      proteinHits,
      proteinAvg,
      kcal: hideCalories ? null : todayRing({ ...shared, hideCalories: false }),
      protein: todayRing({ ...shared, hideCalories: true }),
      macros: macroSplit(items),
      fats: fatBalance(items),
      quality: items.length === 0 ? null : {
        max: Math.max(whole, processed, 1),
        caption: `Whole ${whole}, processed ${processed}.`,
        bars: [
          { key: 'whole', label: `Whole ${whole}`, value: whole, tone: whole > 0 ? 'good' : 'empty' },
          { key: 'processed', label: `Processed ${processed}`, value: processed, tone: processed > 0 ? 'watch' : 'info' },
        ] satisfies ChartBar[],
      },
      dots: loggingChart(loggingDots(logs, today)),
      dotsCaption: loggingCaption(logs, today),
      insights: eatingInsights(logs, checkIns),
    };
  }, [logs, today, hideCalories, kcalTarget, proteinTarget, checkIns, span]);
  const trend = useMemo(() => {
    const days = nutritionTrendDays(logs, today, span);
    return { days, caption: trendCaption(days, { hideCalories, span }) };
  }, [logs, today, span, hideCalories]);
  const loggedDays = trend.days.some((day) => day.logged);

  return (
    <>
      <Card>
        <StatPeriodToggle />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-around' }}>
          {picture.kcal ? (
            <RingFigure
              label={figureLabel('Energy', period)}
              ring={picture.kcal}
              mark={energyMark(picture.kcal, period, picture.loggedCount)}
              period={period}
            />
          ) : null}
          <RingFigure
            label={figureLabel('Protein', period)}
            ring={alignProteinCentre(picture.protein, picture.proteinAvg)}
            mark={proteinMark(picture.protein, period, picture.proteinDays, picture.proteinAvg, picture.proteinHits)}
            period={period}
          />
        </View>
        <T variant="label">Protein, carbohydrate and fat</T>
        <MacroBars slices={picture.macros.slices} caption={picture.macros.caption} />
        <T variant="label">Fats</T>
        <FatBar unsaturated={picture.fats.unsaturated} other={picture.fats.other} caption={picture.fats.line} />
        {picture.quality ? (
          <>
            <T variant="label">Food quality</T>
            <View accessibilityLabel={picture.quality.caption}>
              <CompareBars layout="row" max={picture.quality.max} bars={picture.quality.bars} />
            </View>
          </>
        ) : null}
        {qualitySwitch}
      </Card>

      <Card>
        <T variant="label">{periodHeading(period)}</T>
        {loggedDays ? (
          <>
            {hideCalories ? null : (
              <LoggedSeries title="Energy" today={today} period={period} days={trend.days} pick={(day) => day.kcal} target={kcalTarget} unit="kcal" />
            )}
            <LoggedSeries title="Protein" today={today} period={period} days={trend.days} pick={(day) => day.proteinG} target={proteinTarget} unit="g" />
            <T variant="muted">{trend.caption}</T>
          </>
        ) : (
          <T variant="muted">{trend.caption}</T>
        )}
        <T variant="label">Logging</T>
        <LoggingCalendar dots={picture.dots} caption={picture.dotsCaption} />
        {progressSwitch}
      </Card>

      {picture.insights.length ? (
        <Card>
          <T variant="label">Alongside check-ins</T>
          {picture.insights.map((insight) => (
            <InsightCard key={insight.id} insight={insight} />
          ))}
        </Card>
      ) : null}
    </>
  );
}

function figureLabel(name: string, period: StatPeriod): string {
  if (period === 'day') return `${name} today`;
  return `${name} in ${periodPhrase(period).replace(/^the /, '')}`;
}

function alignProteinCentre(ring: TodayRing, average: number): TodayRing {
  if (average <= 0) return ring;
  return { ...ring, centre: String(Math.round(average)), value: average };
}

type RingMark = { tone: StatsTone; signal?: string; monochrome?: boolean };

function energyMark(ring: TodayRing, period: StatPeriod, loggedDays: number): RingMark {
  if (ring.value <= 0 || ring.target == null) return { tone: 'info' };
  if (ring.value > ring.target) return { tone: 'watch' };
  const met = ring.value >= ring.target * 0.85;
  const pace = paceJudgement({ period, loggedDays, now: new Date(), met, behind: 'Watch' });
  if (pace.neutral) return { tone: 'info', signal: pace.word, monochrome: true };
  return { tone: met ? 'good' : 'info' };
}

function proteinMark(ring: TodayRing, period: StatPeriod, loggedDays: number, average: number, hits: number): RingMark {
  if (ring.value <= 0 || ring.target == null) return { tone: 'info' };
  const pace = proteinPace({
    period,
    loggedDays,
    now: new Date(),
    average,
    target: ring.target,
    hits,
  });
  return { tone: pace.tone, signal: pace.word, monochrome: pace.neutral };
}

function spokenPeriod(ring: TodayRing, period: StatPeriod): string {
  if (period === 'day') return ring.caption;
  return ring.caption.replace(/today/g, periodPhrase(period));
}

function RingFigure({ label, ring, mark, period }: { label: string; ring: TodayRing; mark: RingMark; period: StatPeriod }) {
  const unit = ring.unit === 'g protein' ? 'g' : ring.unit;
  return (
    <View style={{ alignItems: 'center', gap: 4, flexGrow: 1, flexBasis: 140 }}>
      <T variant="label">{label}</T>
      <ProgressRing
        centre={ring.centre}
        unit={unit}
        fill={ring.fill}
        status={ring.status}
        tone={mark.tone}
        signal={mark.signal}
        monochrome={mark.monochrome}
        surface="card"
        size={108}
        mark
        spoken
        caption={spokenPeriod(ring, period)}
      />
    </View>
  );
}

export function WeightTrendChart({
  points,
  goal,
}: {
  points: readonly { day: string; kg: number }[];
  goal: NutritionGoal | null;
}) {
  const [period] = useStatPeriod();
  const today = londonToday();
  const window = rollingWindow(today, period);
  const caption = weightTrendLine(points, goal);
  const readings = overviewLineChart(points
    .filter((point) => point.day >= window.start && point.day <= window.end)
    .map((point) => ({ day: point.day, value: point.kg })));
  return (
    <View accessibilityLabel={caption} style={{ gap: 8 }}>
      <ReadingChart
        points={readings}
        start={window.start}
        end={window.end}
        unit="kg"
        aggregate="mean"
        bucket={chartBucketForPeriod(period)}
        accessibilityLabel="Weight chart"
      />
      <T variant="muted">{caption}</T>
    </View>
  );
}

export function WaterMeter({ ml }: { ml: number }) {
  const water = waterProgress(ml);
  const tone: StatsTone = water.ml >= water.mark ? 'good' : 'info';
  return (
    <ProgressRing
      centre={water.ml.toLocaleString('en-GB')}
      unit="ml"
      fill={water.fill}
      status={water.status}
      tone={tone}
      surface="card"
      mark
      spoken
      caption={water.caption}
    />
  );
}

function MacroBars({
  slices,
  caption,
}: {
  slices: { id: 'protein' | 'carbs' | 'fat'; label: string; grams: number; share: number }[];
  caption: string;
}) {
  if (slices.length === 0) return <T variant="muted">{caption}</T>;
  const max = Math.max(...slices.map((slice) => slice.grams), 1);
  return (
    <View accessibilityLabel={caption} style={{ gap: 8 }}>
      <CompareBars
        layout="row"
        max={max}
        bars={slices.map((slice) => ({
          key: slice.id,
          label: `${slice.label} ${slice.grams} g`,
          value: slice.grams,
          tone: 'info',
        }))}
      />
      <T variant="muted">{caption}</T>
    </View>
  );
}

function FatBar({ unsaturated, other, caption }: { unsaturated: number; other: number; caption: string }) {
  const theme = useAppTheme();
  const colors = statsToneColors(theme.scheme);
  const total = unsaturated + other;
  const share = total > 0 ? unsaturated / total : 0;
  return (
    <View accessibilityLabel={caption} style={{ gap: 8 }}>
      <View style={{ height: 16, borderRadius: 8, backgroundColor: theme.colors.line, overflow: 'hidden', flexDirection: 'row' }}>
        {total > 0 ? (
          <>
            <View style={{ width: `${Math.round(share * 100)}%`, backgroundColor: colors.good.ink }} />
            <View style={{ width: `${100 - Math.round(share * 100)}%`, backgroundColor: colors.watch.ink }} />
          </>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
        <T style={{ fontSize: 13 * theme.scale, lineHeight: 18 * theme.scale }}>Unsaturated</T>
        <T style={{ fontSize: 13 * theme.scale, lineHeight: 18 * theme.scale }}>Saturated and trans</T>
      </View>
      <T variant="muted">{caption}</T>
    </View>
  );
}

function LoggedSeries({
  title,
  today,
  period,
  days,
  pick,
  target,
  unit,
}: {
  title: string;
  today: string;
  period: StatPeriod;
  days: readonly TrendDay[];
  pick: (day: TrendDay) => number;
  target: number | null;
  unit: string;
}) {
  const window = rollingWindow(today, period);
  const points = loggedNutritionChart(days, pick);
  return (
    <View accessibilityLabel={`${title} chart`} style={{ gap: 6 }}>
      <T variant="label">{title}</T>
      <ReadingChart
        points={points}
        start={window.start}
        end={window.end}
        unit={unit}
        aggregate="mean"
        bucket={chartBucketForPeriod(period)}
        accessibilityLabel={`${title} chart`}
      />
      {target != null && target > 0 ? (
        <T variant="muted">{`Target ${target.toLocaleString('en-GB')} ${unit}.`}</T>
      ) : null}
    </View>
  );
}

function LoggingCalendar({
  dots,
  caption,
}: {
  dots: { day: string; logged: boolean }[];
  caption: string;
}) {
  const theme = useAppTheme();
  const loggedInk = statsToneColors(theme.scheme).info.ink;
  return (
    <View accessibilityLabel={caption} style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {dots.map((dot) => (
          <View key={dot.day} style={{ width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 4 }}>
            <View
              accessibilityLabel={dot.logged ? `${dot.day} logged` : `${dot.day} not logged`}
              style={{
                width: 12,
                height: 12,
                borderRadius: 6,
                backgroundColor: dot.logged ? loggedInk : theme.colors.line,
              }}
            />
          </View>
        ))}
      </View>
      <T variant="muted">{caption}</T>
    </View>
  );
}

function InsightCard({
  insight,
}: {
  insight: { caption: string; leftLabel: string; rightLabel: string; leftSnacks: number; rightSnacks: number };
}) {
  const max = Math.max(insight.leftSnacks, insight.rightSnacks, 1);
  const bar = (value: number) => Math.max(value > 0 ? 6 : 2, Math.round((value / max) * 56));
  return (
    <View accessibilityLabel={insight.caption} style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 16 }}>
        <SnackBar label={insight.leftLabel} value={insight.leftSnacks} height={bar(insight.leftSnacks)} />
        <SnackBar label={insight.rightLabel} value={insight.rightSnacks} height={bar(insight.rightSnacks)} />
      </View>
      <T variant="muted">{insight.caption}</T>
    </View>
  );
}

function SnackBar({ label, value, height }: { label: string; value: number; height: number }) {
  const theme = useAppTheme();
  return (
    <View style={{ flex: 1, gap: 4 }}>
      <T style={{ fontSize: 13 * theme.scale, lineHeight: 18 * theme.scale }}>{label}</T>
      <View style={{ height, backgroundColor: statsToneColors(theme.scheme).info.ink, borderRadius: 2 }} />
      <T variant="muted">{value === 1 ? '1 snack' : `${value} snacks`}</T>
    </View>
  );
}

