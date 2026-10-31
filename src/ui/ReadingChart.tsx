import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';

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
import { useAppTheme } from '@/ui/theme';
import { T } from '@/ui/ui';

/** Plot height stays put when text grows. Labels use the text scale. */
const PLOT_H = 200;

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
}) {
  const theme = useAppTheme();
  const [width, setWidth] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  const windowStart = start <= end ? start : end;
  const windowEnd = start <= end ? end : start;
  const grain = bucket ?? bucketForSpan(windowStart, windowEnd);
  const plot = chartPlot({ points, start: windowStart, end: windowEnd, bucket: grain, aggregate });
  const shown = plot.points;
  const axisStart = plot.start;
  const axisEnd = plot.end;
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
    if (best) setChosen(best.day);
  }

  if (!extent) {
    return <T variant="muted">No readings in this period.</T>;
  }

  const marks = datedAxisTicks(axisStart, axisEnd);
  const grainCaption = chartBucketCaption(grain, aggregate);
  const summary = `Latest ${formatChartValue(extent.latest.value, unit)} · Min ${formatAxisNumber(extent.min)} · Max ${formatAxisNumber(extent.max)}`;
  const spoken = selected
    ? `${accessibilityLabel}. ${tooltipWhen(selected.day, grain)}, ${formatChartValue(selected.value, unit)}.`
    : `${accessibilityLabel}. ${summary}. Older on the left, newer on the right.`;

  return (
    <View accessibilityLabel={spoken} style={{ gap: 6, alignSelf: 'stretch' }}>
      <T>{summary}</T>
      {yName ? (
        <T style={{ fontSize: 11 * label, lineHeight: 14 * label, color: theme.colors.muted }}>{yName}</T>
      ) : null}
      <View
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
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
                    stroke={theme.colors.ink}
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
              {shown.map((point) => {
                const active = point.day === selected?.day;
                return (
                  <Circle
                    key={point.day}
                    cx={xFor(point.day)}
                    cy={yFor(point.value)}
                    r={active ? 6 : 4}
                    fill={theme.colors.ink}
                    onPress={() => setChosen(point.day)}
                  />
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
                  {formatChartValue(selected.value, unit)}
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
      <T style={{ fontSize: 11 * label, lineHeight: 14 * label, color: theme.colors.muted, textAlign: 'center' }}>{CHART_DIRECTION_HINT}</T>
      {grainCaption ? <T variant="muted">{grainCaption}</T> : null}
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

function bucketForSpan(start: string, end: string): ChartBucket {
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
