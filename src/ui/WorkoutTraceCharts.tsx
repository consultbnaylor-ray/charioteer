import { useState } from 'react';
import { View } from 'react-native';

import { climbLine, elevationTrace, heartRangeLine, heartTrace } from '@/domain/workoutTrace';
import type { HeartSample, RoutePoint } from '@/domain/workoutRoute';
import { numberRangeLine, Sparkline } from '@/ui/gridChrome';
import { useAppTheme } from '@/ui/theme';
import { T } from '@/ui/ui';

const TRACE_HEIGHT = 72;

function Trace({ title, values, color, label, lines }: { title: string; values: number[]; color: string; label: string; lines: (string | null)[] }) {
  const [width, setWidth] = useState(0);
  return (
    <View style={{ gap: 4 }}>
      <T variant="label">{title}</T>
      <View
        accessibilityRole="image"
        accessibilityLabel={label}
        onLayout={(event) => setWidth(Math.round(event.nativeEvent.layout.width))}
        style={{ minHeight: TRACE_HEIGHT }}
      >
        {width > 0 ? <Sparkline values={values} color={color} width={width} height={TRACE_HEIGHT} /> : null}
      </View>
      {lines.filter((line): line is string => Boolean(line)).map((line) => <T key={line} variant="muted">{line}</T>)}
    </View>
  );
}

/**
 * Heart rate over time and elevation along the route, under the workout map.
 * Drawn from data already on screen. No AI and no credits.
 */
export function WorkoutTraceCharts({
  points,
  heartSamples,
  climb,
}: {
  points: readonly RoutePoint[];
  heartSamples: readonly HeartSample[];
  climb?: { gain: number | null; loss: number | null } | null;
}) {
  const theme = useAppTheme();
  const heart = heartTrace(heartSamples, points);
  const elevation = elevationTrace(points);
  const climbText = climbLine(points, climb ?? undefined);
  const heartRange = heartRangeLine(heartSamples.length ? heartSamples : points.flatMap((point) => (point.heartRate == null ? [] : [{ at: point.at, bpm: point.heartRate }])));
  if (heart.length < 2 && elevation.length < 2 && !climbText) return null;
  return (
    <View style={{ gap: 12 }}>
      {heart.length >= 2 ? (
        <Trace
          title="Heart rate"
          values={heart}
          color={theme.colors.accent}
          label={`Heart rate through the workout. ${heartRange ?? ''}`.trim()}
          lines={[heartRange, 'From the start of the workout to the end.']}
        />
      ) : null}
      {elevation.length >= 2 ? (
        <Trace
          title="Elevation"
          values={elevation}
          color={theme.colors.ink}
          label={`Elevation along the route. ${climbText ?? ''}`.trim()}
          lines={[climbText, numberRangeLine(elevation.map((value) => Math.round(value)), 'm above sea level'), 'From the start of the route to the finish.']}
        />
      ) : climbText ? <T>{climbText}</T> : null}
    </View>
  );
}
