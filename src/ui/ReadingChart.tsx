import { useId, useState, type ReactNode } from 'react';
import { useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop, Text as SvgText } from 'react-native-svg';

import {
  chartBucketCaption,
  CHART_DIRECTION_HINT,
  chartExtent,
  chartPlot,
  datedAxisTicks,
  daySpan,
  placeAxisLabels,
  formatAxisNumber,
  formatChartDate,
  formatChartValue,
  yAxisTicks,
  type ChartAggregate,
  type ChartBucket,
  type ChartPoint,
} from '@/domain/readingChart';
import { formatReadingSpan, formatSpanAmount, readingSpan } from '@/domain/readingSpan';
import { DATA_MEANING_TITLE, MoreInfo } from '@/ui/MoreInfo';
import { useAppTheme } from '@/ui/theme';
import { T } from '@/ui/ui';

/** The grain line and the direction line. A card can place this inside its own toggle. */
export function ChartMeaningCopy({ bucket, aggregate }: { bucket: ChartBucket; aggregate: ChartAggregate }) {
  const caption = chartBucketCaption(bucket, aggregate);
  return (
    <>
      {caption ? <T variant="muted">{caption}</T> : null}
      <T variant="muted">{CHART_DIRECTION_HINT}</T>
    </>
  );
}

/** Plot height stays put when text grows. Labels use the text scale. */
const PLOT_H = 200;

/** Last measured plot width. The next chart can draw on the first frame instead of flashing empty. */
let measuredChartWidth = 0;

function chartWidthGuess(screen: number): number {
  return measuredChartWidth > 0 ? measuredChartWidth : Math.max(260, Math.min(screen, 760) - 80);
}

/**
 * One line chart for readings. Dots are real values only.
 * A gap is empty space between those dots, not a made-up point.
 */
export function ReadingChart({
  points,
  start,
  end,
  unit,
  yTitle,
  xTitle = 'Date',
  aggregate = 'mean',
  bucket,
  accessibilityLabel = 'Chart',
  title,
  subtitle,
  onSelectDay,
  accent,
  meaning = 'chart',
  meaningTitle,
  explanation,
  markExtremes = false,
  hideSummary = false,
  spanWindow = false,
  today,
  rangeLine,
}: {
  points: readonly ChartPoint[];
  start: string;
  end: string;
  unit: string;
  yTitle?: string;
  xTitle?: string;
  aggregate?: ChartAggregate;
  bucket?: ChartBucket;
  accessibilityLabel?: string;
  /** Name of the series, kept above the latest, minimum, and maximum line. */
  title?: string;
  /** One plain-English line under the title. Omitted charts stay as they were. */
  subtitle?: string;
  /** Choosing a point can open that day on the page. */
  onSelectDay?: (day: string) => void;
  /** Stroke colour for this metric. Omitted charts stay on the ink. */
  accent?: string;
  /** Ring the lowest and highest points, and name them in the summary. */
  markExtremes?: boolean;
  /** The card already shows the latest, lowest, and highest lines. */
  hideSummary?: boolean;
  /** Keep the date axis on the selected range when readings are sparse. */
  spanWindow?: boolean;
  /** Year reference for the summary dates. The range end is used when omitted. */
  today?: string;
  /**
   * `chart` shows What this means when `explanation` is set.
   * `none` leaves that note to the card, so the card has one toggle.
   * A node is extra explanation, shown with the direction note.
   * No explanation and no node means no button.
   */
  meaning?: 'chart' | 'none' | ReactNode;
  /** Toggle name when this chart draws one. A node defaults to What this Data means. */
  meaningTitle?: string;
  /** Two or three sentences for What this means. Blank hides the button. */
  explanation?: string;
  /**
   * Replaces “Latest · Min · Max” when a card has a clearer line.
   * Omitted charts keep that line, so other pages do not change.
   */
  rangeLine?: string;
}) {
  const theme = useAppTheme();
  const screen = useWindowDimensions().width;
  const rawId = useId();
  const fillId = `chart-fill-${rawId.replace(/[^a-zA-Z0-9]/g, '')}`;
  const [width, setWidth] = useState(() => chartWidthGuess(screen));
  const [chosen, setChosen] = useState<string | null>(null);
  const windowStart = start <= end ? start : end;
  const windowEnd = start <= end ? end : start;
  const grain = bucket ?? chartWindowBucket(windowStart, windowEnd);
  const plot = chartPlot({ points, start: windowStart, end: windowEnd, bucket: grain, aggregate });
  const shown = plot.points;
  const axisStart = spanWindow ? windowStart : plot.start;
  const axisEnd = spanWindow ? windowEnd : plot.end;
  const extent = chartExtent(shown);
  const ticks = yAxisTicks(shown.map((point) => point.value));
  const yName = yTitle ?? unit;
  const selected = shown.find((point) => point.day === chosen) ?? null;
  const gutter = Math.round(52 * theme.scale);
  const label = theme.scale;
  const low = ticks[0] ?? 0;
  const high = ticks[ticks.length - 1] ?? 1;

  function yFor(value: number): number {
    const span = high - low || 1;
    const ratio = (value - low) / span;
    return 12 + (1 - ratio) * (PLOT_H - 24);
  }

  function xFor(day: string): number {
    const span = Math.max(1, daySpan(axisStart, axisEnd));
    const offset = Math.min(span - 1, Math.max(0, daySpan(axisStart, day) - 1));
    const inner = Math.max(1, width - gutter - 12);
    if (span <= 1) return gutter + inner / 2;
    return gutter + (offset / (span - 1)) * inner;
  }

  function selectAt(x: number) {
    if (shown.length === 0 || width <= 0) return;
    let best = shown[0];
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const point of shown) {
      const distance = Math.abs(xFor(point.day) - x);
      if (distance < bestDistance) {
        best = point;
        bestDistance = distance;
      }
    }
    if (best) {
      setChosen(best.day);
      onSelectDay?.(best.day);
    }
  }

  if (!extent) {
    return <T variant="muted">No readings in this period.</T>;
  }

  const marks = datedAxisTicks(axisStart, axisEnd);
  const grainCaption = chartBucketCaption(grain, aggregate);
  const extremes = markExtremes ? readingSpan(shown) : null;
  const headlines = extremes ? formatReadingSpan(extremes, unit, today ?? windowEnd) : null;
  const summary = rangeLine
    ?? (headlines
      ? `${headlines.latest}. ${headlines.lowest}. ${headlines.highest}`
      : `Latest ${formatChartValue(extent.latest.value, unit)} · Min ${formatAxisNumber(extent.min)} · Max ${formatAxisNumber(extent.max)}`);
  const lowDay = extremes?.lowest.day ?? null;
  const highDay = extremes?.highest.day ?? null;
  function amount(value: number): string {
    return markExtremes ? formatSpanAmount(value, unit) : formatChartValue(value, unit);
  }
  function pointLabel(value: number): string {
    if (!markExtremes || unit !== 'kg') return formatAxisNumber(value);
    return (Math.round(value * 10) / 10).toFixed(1);
  }
  function extremeLabel(day: string): string | null {
    if (day === lowDay && day === highDay) return 'Low and high';
    if (day === lowDay) return 'Low';
    if (day === highDay) return 'High';
    return null;
  }
  const spoken = selected
    ? `${accessibilityLabel}. ${tooltipWhen(selected.day, grain)}, ${amount(selected.value)}.`
    : `${accessibilityLabel}. ${summary}. Older on the left, newer on the right.`;

  const explanationText = explanation?.replace(/\s+/g, ' ').trim() ?? '';
  const customMeaning = meaning !== 'none' && meaning !== 'chart';
  const meaningToggle = meaning === 'none' || (!explanationText && !customMeaning) ? null : (
    <MoreInfo
      about={accessibilityLabel}
      title={meaningTitle ?? (meaning === 'chart' ? 'What this means' : DATA_MEANING_TITLE)}
    >
      {explanationText ? <T variant="muted">{explanationText}</T> : null}
      {meaning === 'chart' ? null : meaning}
      {grainCaption ? <T variant="muted">{grainCaption}</T> : null}
      <T variant="muted">{CHART_DIRECTION_HINT}</T>
    </MoreInfo>
  );

  return (
    <View accessibilityLabel={spoken} style={{ gap: 6, alignSelf: 'stretch' }}>
      {title ? <T variant="label">{title}</T> : null}
      {subtitle ? <T variant="muted">{subtitle}</T> : null}
      {yName ? (
        <T style={{ fontSize: 11 * label, lineHeight: 14 * label, color: theme.colors.muted }}>{yName}</T>
      ) : null}
      <View
        onLayout={(event) => {
          const next = event.nativeEvent.layout.width;
          if (!(next > 0) || Math.abs(next - width) < 1) return;
          measuredChartWidth = next;
          setWidth(next);
        }}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(event) => selectAt(event.nativeEvent.locationX)}
        onResponderMove={(event) => selectAt(event.nativeEvent.locationX)}
        onPointerDown={(event) => selectAt(event.nativeEvent.offsetX)}
        onPointerMove={(event) => {
          if (event.nativeEvent.buttons) selectAt(event.nativeEvent.offsetX);
        }}
        style={{ alignSelf: 'stretch' }}
      >
        {width > 0 ? (
          <View style={{ height: PLOT_H }}>
            <Svg width={width} height={PLOT_H}>
              <Defs>
                <LinearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={accent ?? theme.colors.ink} stopOpacity={0.32} />
                  <Stop offset="1" stopColor={accent ?? theme.colors.ink} stopOpacity={0} />
                </LinearGradient>
              </Defs>
              {ticks.map((tick) => (
                <Line
                  key={`grid-${tick}`}
                  x1={gutter}
                  x2={width - 8}
                  y1={yFor(tick)}
                  y2={yFor(tick)}
                  stroke={theme.colors.line}
                  strokeWidth={1}
                />
              ))}
              {shown.length > 1 ? (
                <Path
                  d={`${shown.map((point, index) => `${index === 0 ? 'M' : 'L'}${xFor(point.day).toFixed(1)} ${yFor(point.value).toFixed(1)}`).join(' ')} L${xFor(shown[shown.length - 1].day).toFixed(1)} ${PLOT_H - 12} L${xFor(shown[0].day).toFixed(1)} ${PLOT_H - 12} Z`}
                  fill={`url(#${fillId})`}
                />
              ) : null}
              {shown.length > 1 ? (
                <Path
                  d={shown.map((point, index) => `${index === 0 ? 'M' : 'L'}${xFor(point.day).toFixed(1)} ${yFor(point.value).toFixed(1)}`).join(' ')}
                  stroke={accent ?? theme.colors.ink}
                  strokeWidth={5}
                  fill="none"
                  opacity={0.22}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ) : null}
              {shown.slice(1).map((point, index) => {
                const previous = shown[index];
                if (!previous) return null;
                return (
                  <Line
                    key={`${previous.day}-${point.day}`}
                    x1={xFor(previous.day)}
                    y1={yFor(previous.value)}
                    x2={xFor(point.day)}
                    y2={yFor(point.value)}
                    stroke={accent ?? theme.colors.ink}
                    strokeWidth={2}
                  />
                );
              })}
              {selected ? (
                <Line
                  x1={xFor(selected.day)}
                  x2={xFor(selected.day)}
                  y1={12}
                  y2={PLOT_H - 12}
                  stroke={theme.colors.ink}
                  strokeWidth={1}
                />
              ) : null}
              {shown.map((point, index) => {
                const active = point.day === selected?.day;
                const latest = index === shown.length - 1;
                const marked = extremeLabel(point.day);
                const ink = accent ?? theme.colors.ink;
                return (
                  <Circle
                    key={point.day}
                    cx={xFor(point.day)}
                    cy={yFor(point.value)}
                    r={active || latest || marked ? 5 : 3.5}
                    fill={ink}
                    stroke={marked ? theme.colors.surface : 'none'}
                    strokeWidth={marked ? 2 : 0}
                  />
                );
              })}
              {shown.map((point) => {
                const marked = extremeLabel(point.day);
                if (!marked) return null;
                const ink = accent ?? theme.colors.ink;
                return (
                  <Circle
                    key={`ring-${point.day}`}
                    cx={xFor(point.day)}
                    cy={yFor(point.value)}
                    r={9}
                    fill="none"
                    stroke={ink}
                    strokeWidth={2}
                  />
                );
              })}
              {shown.length <= 10 ? shown.map((point) => (
                <SvgText
                  key={`label-${point.day}`}
                  x={xFor(point.day)}
                  y={Math.max(12, yFor(point.value) - 8)}
                  textAnchor="middle"
                  fill={theme.colors.ink}
                  fontSize={10}
                  fontFamily={theme.font.bodyStrong}
                >
                  {pointLabel(point.value)}
                </SvgText>
              )) : (
                <SvgText
                  x={xFor(shown[shown.length - 1].day)}
                  y={Math.max(12, yFor(shown[shown.length - 1].value) - 8)}
                  textAnchor="middle"
                  fill={theme.colors.ink}
                  fontSize={11}
                  fontFamily={theme.font.bodyStrong}
                >
                  {pointLabel(shown[shown.length - 1].value)}
                </SvgText>
              )}
              {shown.map((point) => {
                const marked = extremeLabel(point.day);
                if (!marked) return null;
                return (
                  <SvgText
                    key={`extreme-${point.day}`}
                    x={xFor(point.day)}
                    y={Math.min(PLOT_H - 2, yFor(point.value) + 18)}
                    textAnchor="middle"
                    fill={theme.colors.ink}
                    fontSize={10}
                    fontFamily={theme.font.bodyStrong}
                  >
                    {marked}
                  </SvgText>
                );
              })}
            </Svg>
            {ticks.map((tick) => (
              <T
                key={`y-${tick}`}
                style={{
                  position: 'absolute',
                  left: 0,
                  width: gutter - 6,
                  top: yFor(tick) - 7 * label,
                  textAlign: 'right',
                  fontSize: 11 * label,
                  lineHeight: 14 * label,
                  color: theme.colors.muted,
                }}
              >
                {formatAxisNumber(tick)}
              </T>
            ))}
            {selected ? (
              <View
                style={{
                  position: 'absolute',
                  left: Math.min(Math.max(gutter, xFor(selected.day) - 70), Math.max(gutter, width - 148)),
                  top: Math.max(4, yFor(selected.value) - 52),
                  borderWidth: 1,
                  borderColor: theme.colors.ink,
                  backgroundColor: theme.colors.surface,
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  gap: 2,
                }}
              >
                <T style={{ fontSize: 12 * label, lineHeight: 16 * label }}>{tooltipWhen(selected.day, grain)}</T>
                <T style={{ fontFamily: theme.font.bodyStrong, fontSize: 12 * label, lineHeight: 16 * label }}>
                  {amount(selected.value)}
                </T>
              </View>
            ) : null}
          </View>
        ) : (
          <View style={{ height: PLOT_H }} />
        )}
      </View>
      <AxisLabels marks={marks} width={width} gutter={gutter} scale={label} xFor={xFor} />
      <T style={{ fontSize: 11 * label, lineHeight: 14 * label, color: theme.colors.muted, textAlign: 'center' }}>{xTitle}</T>
      {hideSummary ? null : <T>{summary}</T>}
      {meaningToggle}
    </View>
  );
}

function AxisLabels({
  marks,
  width,
  gutter,
  scale,
  xFor,
}: {
  marks: readonly { day: string; label: string }[];
  width: number;
  gutter: number;
  scale: number;
  xFor: (day: string) => number;
}) {
  const theme = useAppTheme();
  const rowWidth = Math.max(0, width - gutter);
  const placed = width > 0
    ? placeAxisLabels({
      ticks: marks,
      xs: marks.map((mark) => xFor(mark.day) - gutter),
      rowWidth,
      scale,
    })
    : [];
  const rotate = placed.some((mark) => mark.rotate);
  return (
    <View style={{ height: (rotate ? 48 : 16) * scale, marginLeft: gutter, position: 'relative' }}>
      {placed.map((mark) => {
        const boxLeft = mark.left - (mark.textWidth - mark.width) / 2;
        return (
          <T
            key={mark.day}
            numberOfLines={1}
            style={{
              position: 'absolute',
              left: boxLeft,
              width: mark.textWidth,
              top: 0,
              textAlign: 'center',
              fontSize: 11 * scale,
              lineHeight: 14 * scale,
              color: theme.colors.muted,
              transform: mark.rotate ? [{ rotate: '-55deg' }] : undefined,
            }}
          >
            {mark.label}
          </T>
        );
      })}
    </View>
  );
}

export function chartWindowBucket(start: string, end: string): ChartBucket {
  const span = daySpan(start, end);
  if (span <= 90) return 'day';
  if (span <= 200) return 'week';
  return 'month';
}

function tooltipWhen(day: string, bucket: ChartBucket): string {
  const text = formatChartDate(day);
  if (bucket === 'week') return `Week of ${text}`;
  if (bucket === 'month') return text.replace(/^\d+\s/, '');
  return text;
}
