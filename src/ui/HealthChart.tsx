import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Line, Rect } from 'react-native-svg';

import {
  averageValue,
  formatHealthValue,
  formatUkCompactDay,
  shiftDay,
  weekdayShort,
  type DayValue,
  type HealthChartShape,
  type HealthInsightKind,
} from '@/domain/healthInsights';
import { useAppTheme } from '@/ui/theme';
import { T } from '@/ui/ui';

const HEIGHT = 148;
const PAD_L = 8;
const PAD_R = 8;
const PAD_T = 16;
const PAD_B = 8;

/**
 * Bars and lines are drawn with react-native-svg, which this Expo app already
 * uses on iOS and web. victory-native needs Skia. react-native-gifted-charts
 * also asks for expo-linear-gradient and react-native-linear-gradient, which
 * are not part of this app.
 */
export function HealthChart({
  kind,
  shape,
  today,
  windowDays,
  points,
}: {
  kind: HealthInsightKind;
  shape: HealthChartShape;
  today: string;
  windowDays: number;
  points: DayValue[];
}) {
  const theme = useAppTheme();
  const [width, setWidth] = useState(0);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const days = axisDays(today, windowDays);
  const byDay = new Map(points.map((point) => [point.day, point.value]));
  const valued = days.flatMap((day) => {
    const value = byDay.get(day);
    return value == null ? [] : [{ day, value }];
  });
  const selected = valued.find((point) => point.day === selectedDay) ?? valued[valued.length - 1] ?? null;
  const average = averageValue(valued);

  if (valued.length === 0) {
    return <T variant="muted">No readings in the last {windowDays} days.</T>;
  }

  function selectAt(x: number) {
    if (width <= 0 || valued.length === 0) return;
    let best = valued[0];
    let bestDistance = Number.POSITIVE_INFINITY;
    valued.forEach((point) => {
      const centre = centreX(days.indexOf(point.day), days.length, width);
      const distance = Math.abs(centre - x);
      if (distance < bestDistance) {
        best = point;
        bestDistance = distance;
      }
    });
    if (best) setSelectedDay(best.day);
  }

  const plotHeight = HEIGHT - PAD_T - PAD_B;
  const yFor = yScale(valued.map((point) => point.value), shape, average);

  return (
    <View style={{ gap: 8 }}>
      {selected ? (
        <T>
          {formatHealthValue(kind, selected.value)} · {formatUkCompactDay(selected.day)}
        </T>
      ) : null}
      {average != null ? <T variant="muted">Average {formatHealthValue(kind, average)}</T> : null}
      <View
        accessibilityLabel={`${kind} chart`}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        onPointerDown={(event) => selectAt(event.nativeEvent.offsetX)}
        onPointerMove={(event) => {
          if (event.nativeEvent.buttons) selectAt(event.nativeEvent.offsetX);
        }}
      >
        {width > 0 ? (
          <Svg width={width} height={HEIGHT}>
            {average != null ? (
              <Line
                x1={PAD_L}
                x2={width - PAD_R}
                y1={yFor(average)}
                y2={yFor(average)}
                stroke={theme.colors.muted}
                strokeWidth={1}
                strokeDasharray="4 4"
              />
            ) : null}
            {shape === 'line' ? (
              <LineSeries
                days={days}
                valued={valued}
                width={width}
                yFor={yFor}
                color={theme.colors.ink}
                selectedDay={selected?.day ?? null}
                onSelect={setSelectedDay}
              />
            ) : (
              valued.map((point) => {
                const index = days.indexOf(point.day);
                const slot = (width - PAD_L - PAD_R) / days.length;
                const barWidth = Math.max(2, Math.min(14, slot * 0.62));
                const x = centreX(index, days.length, width) - barWidth / 2;
                const y = yFor(point.value);
                const barHeight = Math.max(2, PAD_T + plotHeight - y);
                const chosen = point.day === selected?.day;
                return (
                  <Rect
                    key={point.day}
                    x={x}
                    y={y}
                    width={barWidth}
                    height={barHeight}
                    fill={theme.colors.ink}
                    opacity={chosen ? 1 : 0.72}
                    onPress={() => setSelectedDay(point.day)}
                  />
                );
              })
            )}
          </Svg>
        ) : (
          <View style={{ height: HEIGHT }} />
        )}
      </View>
      <Axis days={days} />
    </View>
  );
}

function LineSeries({
  days,
  valued,
  width,
  yFor,
  color,
  selectedDay,
  onSelect,
}: {
  days: string[];
  valued: DayValue[];
  width: number;
  yFor: (value: number) => number;
  color: string;
  selectedDay: string | null;
  onSelect: (day: string) => void;
}) {
  const segments: { x1: number; y1: number; x2: number; y2: number; key: string }[] = [];
  for (let index = 1; index < valued.length; index += 1) {
    const previous = valued[index - 1];
    const current = valued[index];
    if (!previous || !current) continue;
    segments.push({
      key: `${previous.day}-${current.day}`,
      x1: centreX(days.indexOf(previous.day), days.length, width),
      y1: yFor(previous.value),
      x2: centreX(days.indexOf(current.day), days.length, width),
      y2: yFor(current.value),
    });
  }
  return (
    <>
      {segments.map((segment) => (
        <Line key={segment.key} x1={segment.x1} y1={segment.y1} x2={segment.x2} y2={segment.y2} stroke={color} strokeWidth={2} />
      ))}
      {valued.map((point) => {
        const chosen = point.day === selectedDay;
        return (
          <Circle
            key={point.day}
            cx={centreX(days.indexOf(point.day), days.length, width)}
            cy={yFor(point.value)}
            r={chosen ? 5 : 3}
            fill={color}
            onPress={() => onSelect(point.day)}
          />
        );
      })}
    </>
  );
}

function Axis({ days }: { days: string[] }) {
  const theme = useAppTheme();
  const marks = axisMarks(days);
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      {marks.map((day) => (
        <T key={day} style={{ fontSize: 11 * theme.scale, lineHeight: 14 * theme.scale, color: theme.colors.muted }}>
          {days.length <= 7 ? weekdayShort(day) : formatUkCompactDay(day).replace(/ \d{4}$/, '')}
        </T>
      ))}
    </View>
  );
}

function axisDays(today: string, windowDays: number): string[] {
  const days: string[] = [];
  for (let ago = windowDays - 1; ago >= 0; ago -= 1) days.push(shiftDay(today, -ago));
  return days;
}

function axisMarks(days: string[]): string[] {
  if (days.length <= 7) return days;
  const first = days[0];
  const middle = days[Math.floor(days.length / 2)];
  const last = days[days.length - 1];
  return [first, middle, last].filter((day): day is string => Boolean(day));
}

function centreX(index: number, count: number, width: number): number {
  if (count <= 1) return width / 2;
  const inner = width - PAD_L - PAD_R;
  return PAD_L + ((index + 0.5) / count) * inner;
}

function yScale(values: number[], shape: HealthChartShape, average: number | null): (value: number) => number {
  const data = average == null ? values : [...values, average];
  const lowest = shape === 'bar' ? 0 : Math.min(...data);
  const highest = Math.max(...data);
  const span = highest - lowest || 1;
  const lo = shape === 'bar' ? 0 : lowest - span * 0.2;
  const hi = highest + span * 0.15;
  const plot = HEIGHT - PAD_T - PAD_B;
  return (value: number) => {
    const ratio = (value - lo) / (hi - lo || 1);
    return PAD_T + (1 - ratio) * plot;
  };
}
