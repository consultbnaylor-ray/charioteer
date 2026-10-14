import { useMemo, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Line, Rect } from 'react-native-svg';

import type { FoodLog, NutritionGoal, TrendDay } from '@/domain/nutrition';
import {
  dayItems,
  eatingInsights,
  fatBalance,
  loggingCaption,
  loggingDots,
  macroSplit,
  nutritionTrendDays,
  smoothWeight,
  sumItems,
  todayRing,
  trendCaption,
  waterProgress,
  weightTrendLine,
} from '@/domain/nutrition';
import { useAppTheme } from '@/ui/theme';
import { Card, Choice, T } from '@/ui/ui';

const RING = 132;
const RING_STROKE = 12;

/**
 * Nutrition charts use react-native-svg, the same drawing library as Health.
 * Figures come from the meals already on screen, so nothing is fetched.
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
  const [span, setSpan] = useState<7 | 30>(7);
  const picture = useMemo(() => {
    const items = dayItems(logs, today);
    const totals = sumItems(items);
    return {
      ring: todayRing({
        hideCalories,
        kcal: totals.kcal,
        kcalTarget,
        proteinG: totals.proteinG,
        proteinTarget,
        logged: items.length > 0,
      }),
      macros: macroSplit(items),
      fats: fatBalance(items),
      dots: loggingDots(logs, today),
      dotsCaption: loggingCaption(logs, today),
      insights: eatingInsights(logs, checkIns),
    };
  }, [logs, today, hideCalories, kcalTarget, proteinTarget, checkIns]);
  const trend = useMemo(() => {
    const days = nutritionTrendDays(logs, today, span);
    return { days, caption: trendCaption(days, { hideCalories, span }) };
  }, [logs, today, span, hideCalories]);
  const loggedDays = trend.days.some((day) => day.logged);

  return (
    <>
      <Card>
        <T variant="label">{hideCalories ? 'Protein today' : 'Energy today'}</T>
        <Ring ring={picture.ring} />
        <T variant="label">Protein, carbohydrate and fat</T>
        <MacroDonut slices={picture.macros.slices} caption={picture.macros.caption} />
        <T variant="label">Fats</T>
        <FatBar unsaturated={picture.fats.unsaturated} other={picture.fats.other} caption={picture.fats.line} />
        {qualitySwitch}
      </Card>

      <Card>
        <T variant="label">Recent days</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Choice label="7 days" selected={span === 7} onPress={() => setSpan(7)} />
          <Choice label="30 days" selected={span === 30} onPress={() => setSpan(30)} />
        </View>
        {loggedDays ? (
          <>
            {hideCalories ? null : (
              <TrendBars
                title="Energy"
                days={trend.days}
                pick={(day) => day.kcal}
                target={kcalTarget}
                unit="kcal"
              />
            )}
            <TrendBars
              title="Protein"
              days={trend.days}
              pick={(day) => day.proteinG}
              target={proteinTarget}
              unit="g"
            />
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

export function WeightTrendChart({
  points,
  goal,
}: {
  points: readonly { day: string; kg: number }[];
  goal: NutritionGoal | null;
}) {
  const theme = useAppTheme();
  const [width, setWidth] = useState(0);
  const series = smoothWeight(points);
  const caption = weightTrendLine(points, goal);
  if (series.length < 2) return <T variant="muted">{caption}</T>;
  const values = series.flatMap((point) => [point.kg, point.smooth]);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const span = high - low || 1;
  const height = 120;
  const yFor = (kg: number) => 12 + (1 - (kg - (low - span * 0.15)) / (span * 1.3)) * (height - 24);
  const xFor = (index: number) => {
    if (series.length <= 1 || width <= 0) return 0;
    return 8 + (index / (series.length - 1)) * (width - 16);
  };
  return (
    <View accessibilityLabel={caption} style={{ gap: 8 }}>
      <View onLayout={(event) => setWidth(Math.round(event.nativeEvent.layout.width))}>
        {width > 0 ? (
          <Svg width={width} height={height}>
            {series.slice(1).map((point, index) => {
              const previous = series[index];
              if (!previous) return null;
              return (
                <Line
                  key={point.day}
                  x1={xFor(index)}
                  y1={yFor(previous.smooth)}
                  x2={xFor(index + 1)}
                  y2={yFor(point.smooth)}
                  stroke={theme.colors.ink}
                  strokeWidth={2}
                />
              );
            })}
            {series.map((point, index) => (
              <Circle key={point.day} cx={xFor(index)} cy={yFor(point.kg)} r={3.5} fill={theme.colors.ink} />
            ))}
          </Svg>
        ) : (
          <View style={{ height }} />
        )}
      </View>
      <T variant="muted">{caption}</T>
    </View>
  );
}

export function WaterMeter({ ml }: { ml: number }) {
  const theme = useAppTheme();
  const water = waterProgress(ml);
  return (
    <View accessibilityLabel={water.caption} style={{ gap: 8 }}>
      <View style={{ height: 14, borderRadius: 7, backgroundColor: theme.colors.line, overflow: 'hidden' }}>
        <View style={{ width: `${Math.round(water.fill * 100)}%`, height: '100%', backgroundColor: theme.colors.ink }} />
      </View>
      <T variant="muted">{water.caption}</T>
    </View>
  );
}

function Ring({ ring }: { ring: ReturnType<typeof todayRing> }) {
  const theme = useAppTheme();
  const radius = (RING - RING_STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = circumference * ring.fill;
  const centre = RING / 2;
  return (
    <View accessibilityLabel={ring.caption} style={{ alignItems: 'center', gap: 8 }}>
      <View style={{ width: RING, height: RING }}>
        <Svg width={RING} height={RING}>
          <Circle cx={centre} cy={centre} r={radius} stroke={theme.colors.line} strokeWidth={RING_STROKE} fill="none" />
          {ring.fill > 0 ? (
            <Circle
              cx={centre}
              cy={centre}
              r={radius}
              stroke={theme.colors.ink}
              strokeWidth={RING_STROKE}
              fill="none"
              strokeDasharray={`${dash} ${circumference - dash}`}
              transform={`rotate(-90 ${centre} ${centre})`}
            />
          ) : null}
        </Svg>
        <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
          <T variant="title">{ring.centre}</T>
          <T variant="muted">{ring.unit}</T>
        </View>
      </View>
      <T variant="muted">{ring.caption}</T>
    </View>
  );
}

function MacroDonut({
  slices,
  caption,
}: {
  slices: { id: 'protein' | 'carbs' | 'fat'; label: string; grams: number; share: number }[];
  caption: string;
}) {
  const theme = useAppTheme();
  const ink = { protein: theme.colors.ink, carbs: theme.colors.muted, fat: theme.colors.placeholder };
  const size = 132;
  const stroke = 16;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const centre = size / 2;
  let offset = 0;
  return (
    <View accessibilityLabel={caption} style={{ alignItems: 'center', gap: 8 }}>
      {slices.length === 0 ? <T variant="muted">{caption}</T> : (
        <>
          <Svg width={size} height={size}>
            {slices.filter((slice) => slice.grams > 0).map((slice) => {
              const length = slice.share * circumference;
              const node = (
                <Circle
                  key={slice.id}
                  cx={centre}
                  cy={centre}
                  r={radius}
                  stroke={ink[slice.id]}
                  strokeWidth={stroke}
                  fill="none"
                  strokeDasharray={`${length} ${circumference - length}`}
                  strokeDashoffset={-offset}
                  transform={`rotate(-90 ${centre} ${centre})`}
                />
              );
              offset += length;
              return node;
            })}
          </Svg>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12 }}>
            {slices.map((slice) => (
              <View key={slice.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: ink[slice.id] }} />
                <T style={{ fontSize: 13 * theme.scale, lineHeight: 18 * theme.scale }}>{slice.label}</T>
              </View>
            ))}
          </View>
          <T variant="muted">{caption}</T>
        </>
      )}
    </View>
  );
}

function FatBar({ unsaturated, other, caption }: { unsaturated: number; other: number; caption: string }) {
  const theme = useAppTheme();
  const total = unsaturated + other;
  const share = total > 0 ? unsaturated / total : 0;
  return (
    <View accessibilityLabel={caption} style={{ gap: 8 }}>
      <View style={{ height: 16, borderRadius: 8, backgroundColor: theme.colors.line, overflow: 'hidden', flexDirection: 'row' }}>
        {total > 0 ? (
          <>
            <View style={{ width: `${Math.round(share * 100)}%`, backgroundColor: theme.colors.ink }} />
            <View style={{ width: `${100 - Math.round(share * 100)}%`, backgroundColor: theme.colors.muted }} />
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

function TrendBars({
  title,
  days,
  pick,
  target,
  unit,
}: {
  title: string;
  days: readonly TrendDay[];
  pick: (day: TrendDay) => number;
  target: number | null;
  unit: string;
}) {
  const theme = useAppTheme();
  const [width, setWidth] = useState(0);
  const amounts = days.map((day) => pick(day));
  const top = Math.max(...amounts, target != null && target > 0 ? target : 0, 1);
  const height = 112;
  const barHeight = (amount: number) => Math.max(amount > 0 ? 3 : 1, (amount / top) * (height - 8));
  const targetY = target != null && target > 0 ? height - (target / top) * (height - 8) : null;
  return (
    <View accessibilityLabel={`${title} over ${days.length} days`} style={{ gap: 6 }}>
      <T variant="label">{title}</T>
      <View onLayout={(event) => setWidth(Math.round(event.nativeEvent.layout.width))}>
        {width > 0 ? (
          <Svg width={width} height={height}>
            {targetY != null ? (
              <Line x1={0} x2={width} y1={targetY} y2={targetY} stroke={theme.colors.muted} strokeWidth={1} strokeDasharray="4 4" />
            ) : null}
            {days.map((day, index) => {
              const slot = width / days.length;
              const bar = Math.max(2, Math.min(16, slot * 0.62));
              const amount = amounts[index] ?? 0;
              const h = barHeight(amount);
              return (
                <Rect
                  key={day.day}
                  x={index * slot + (slot - bar) / 2}
                  y={height - h}
                  width={bar}
                  height={h}
                  fill={day.logged ? theme.colors.ink : theme.colors.line}
                />
              );
            })}
          </Svg>
        ) : (
          <View style={{ height }} />
        )}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {axisLabels(days.map((day) => day.day)).map((label) => (
          <T key={label.key} style={{ fontSize: 11 * theme.scale, lineHeight: 14 * theme.scale, color: theme.colors.muted }}>{label.text}</T>
        ))}
      </View>
      {target != null && target > 0 ? (
        <T variant="muted">{`Dashed line: ${target.toLocaleString('en-GB')} ${unit} target.`}</T>
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
                backgroundColor: dot.logged ? theme.colors.ink : theme.colors.line,
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
      <View style={{ height, backgroundColor: theme.colors.ink, borderRadius: 2 }} />
      <T variant="muted">{value === 1 ? '1 snack' : `${value} snacks`}</T>
    </View>
  );
}

function axisLabels(days: string[]): { key: string; text: string }[] {
  if (days.length <= 7) {
    return days.map((day) => ({ key: day, text: weekdayLetter(day) }));
  }
  const first = days[0];
  const middle = days[Math.floor(days.length / 2)];
  const last = days[days.length - 1];
  return [first, middle, last].filter((day): day is string => Boolean(day)).map((day) => ({
    key: day,
    text: compactDay(day),
  }));
}

function weekdayLetter(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1));
  return 'SMTWTFS'[date.getUTCDay()] ?? '';
}

function compactDay(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1));
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}
