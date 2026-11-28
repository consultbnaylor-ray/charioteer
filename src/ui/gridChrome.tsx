import { useEffect, useId, useState, type ReactNode } from 'react';
import { AccessibilityInfo, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Pattern, Polygon, Rect, Stop, Text as SvgText } from 'react-native-svg';

import { gridLine } from '@/ui/statsPalette';
import { useAppTheme } from '@/ui/theme';

const GRID = 26;

/** True when the person has asked for less motion. Animations should jump to the end. */
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (live) setReduce(Boolean(value));
    }).catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (value) => {
      setReduce(Boolean(value));
    });
    return () => {
      live = false;
      subscription?.remove?.();
    };
  }, []);
  return reduce;
}

/**
 * A short ease-out from 0 to 1. Reduced motion, and a missing frame clock, show the end at once.
 */
export function useFillMotion(): number {
  const reduce = useReduceMotion();
  const [progress, setProgress] = useState(reduce ? 1 : 0);
  useEffect(() => {
    if (reduce) {
      setProgress(1);
      return undefined;
    }
    let cancelled = false;
    let frame = 0;
    const started = Date.now();
    const tick = () => {
      if (cancelled) return;
      const t = Math.min(1, (Date.now() - started) / 440);
      setProgress(1 - (1 - t) ** 2);
      if (t < 1 && typeof requestAnimationFrame === 'function') frame = requestAnimationFrame(tick);
    };
    if (typeof requestAnimationFrame !== 'function') {
      setProgress(1);
      return undefined;
    }
    frame = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      if (frame && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame);
    };
  }, [reduce]);
  return progress;
}

/** One honest line from the numbers on screen. No wording is added beyond the range. */
export function numberRangeLine(values: readonly number[], unit: string): string | null {
  const nums = values.filter((value) => Number.isFinite(value));
  if (!nums.length) return null;
  const low = Math.min(...nums);
  const high = Math.max(...nums);
  const text = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(1));
  if (low === high) return `Held at ${text(low)} ${unit}.`;
  return `Range ${text(low)}–${text(high)} ${unit}.`;
}

/** Flat mint grid. The same pattern sits behind the screen and inside a card. */
export function FaintGrid({ style }: { style?: StyleProp<ViewStyle> }) {
  const theme = useAppTheme();
  const raw = useId();
  const id = `grid-${raw.replace(/[^a-zA-Z0-9]/g, '')}`;
  const color = gridLine(theme.scheme);
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, style]} accessibilityElementsHidden>
      <Svg width="100%" height="100%">
        <Defs>
          <Pattern id={id} width={GRID} height={GRID} patternUnits="userSpaceOnUse">
            <Line x1={0} y1={0} x2={GRID} y2={0} stroke={color} strokeWidth={1} />
            <Line x1={0} y1={0} x2={0} y2={GRID} stroke={color} strokeWidth={1} />
          </Pattern>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

/** Two HUD corners. Glow stays on the stroke, not on small text. */
export function HudCorners({ color }: { color: string }) {
  const corner = {
    position: 'absolute' as const,
    width: 16,
    height: 16,
    borderColor: color,
  };
  return (
    <View pointerEvents="none" accessibilityElementsHidden style={StyleSheet.absoluteFill}>
      <View style={[corner, { top: -1, left: -1, borderTopWidth: 2.5, borderLeftWidth: 2.5, borderTopLeftRadius: 18 }]} />
      <View style={[corner, { right: -1, bottom: -1, borderRightWidth: 2.5, borderBottomWidth: 2.5, borderBottomRightRadius: 18 }]} />
    </View>
  );
}

/** A short glowing line. Missing days are left out, so a gap is not drawn as zero. */
export function Sparkline({ values, color, width = 136, height = 34 }: { values: readonly number[]; color: string; width?: number; height?: number }) {
  const raw = useId();
  const id = `spark-${raw.replace(/[^a-zA-Z0-9]/g, '')}`;
  const points = values.filter((value) => Number.isFinite(value));
  if (points.length < 2) return <View style={{ width, height }} />;
  const low = Math.min(...points);
  const high = Math.max(...points);
  const span = high - low || 1;
  const step = (width - 8) / (points.length - 1);
  const coords = points.map((value, index) => {
    const x = 4 + index * step;
    const y = 6 + (1 - (value - low) / span) * (height - 12);
    return { x, y };
  });
  const line = coords.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ');
  const last = coords[coords.length - 1];
  const first = coords[0];
  const fill = `${line} L${last.x.toFixed(1)} ${height} L${first.x.toFixed(1)} ${height} Z`;
  return (
    <Svg width={width} height={height} accessibilityElementsHidden>
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity={0.35} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Path d={fill} fill={`url(#${id})`} />
      <Path d={line} stroke={color} strokeWidth={5} fill="none" opacity={0.22} strokeLinejoin="round" strokeLinecap="round" />
      <Path d={line} stroke={color} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
      <Circle cx={last.x} cy={last.y} r={7} fill={color} opacity={0.25} />
      <Circle cx={last.x} cy={last.y} r={3.5} fill={color} />
    </Svg>
  );
}

/** Daily bars. The best day is solid. A part-day today is dimmed. */
export function MiniBars({
  values,
  color,
  bestIndex,
  dimIndex,
  width = 136,
  height = 34,
}: {
  values: readonly number[];
  color: string;
  bestIndex: number;
  dimIndex: number | null;
  width?: number;
  height?: number;
}) {
  if (!values.length) return <View style={{ width, height }} />;
  const peak = Math.max(...values, 1);
  const gap = 3;
  const bar = (width - gap * (values.length - 1)) / values.length;
  return (
    <Svg width={width} height={height} accessibilityElementsHidden>
      {values.map((value, index) => {
        const h = Math.max(2, (value / peak) * (height - 2));
        const dim = index === dimIndex;
        return (
          <Rect
            key={index}
            x={index * (bar + gap)}
            y={height - h}
            width={bar}
            height={h}
            rx={2}
            fill={color}
            opacity={dim ? 0.28 : index === bestIndex ? 1 : 0.55}
          />
        );
      })}
    </Svg>
  );
}

/** Mood marks for the week. A day with no check-in stays a faint slot. */
export function MoodMarks({ values, color }: { values: readonly (number | null)[]; color: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 4, alignSelf: 'stretch' }} accessibilityElementsHidden>
      {values.map((value, index) => (
        <View
          key={index}
          style={{
            flex: 1,
            height: 10,
            borderRadius: 3,
            backgroundColor: color,
            opacity: value == null ? 0.15 : 0.35 + (value / 10) * 0.65,
          }}
        />
      ))}
    </View>
  );
}

/** Ring fill on open. Reduced motion shows the final arc. */
export function GlowRing({
  size,
  strokeWidth,
  fill,
  color,
  track,
  children,
}: {
  size: number;
  strokeWidth: number;
  /** 0 to 1. */
  fill: number;
  color: string;
  track: string;
  children?: ReactNode;
}) {
  const motion = useFillMotion();
  const reduce = useReduceMotion();
  const shown = Math.max(0, Math.min(1, fill)) * motion;
  const radius = (size - strokeWidth) / 2;
  const centre = size / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = `${(circumference * shown).toFixed(2)} ${circumference.toFixed(2)}`;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill} accessibilityElementsHidden>
        <Circle cx={centre} cy={centre} r={radius} stroke={track} strokeWidth={strokeWidth} fill="none" />
        {reduce ? null : (
          <Circle
            cx={centre}
            cy={centre}
            r={radius}
            stroke={color}
            strokeWidth={strokeWidth}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={dash}
            transform={`rotate(-90 ${centre} ${centre})`}
            opacity={0.35}
          />
        )}
        <Circle
          cx={centre}
          cy={centre}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={dash}
          transform={`rotate(-90 ${centre} ${centre})`}
        />
      </Svg>
      {children}
    </View>
  );
}

const HEX = [0, 60, 120, 180, 240, 300].map((degree) => {
  const angle = ((degree - 90) * Math.PI) / 180;
  return `${(16 + 13 * Math.cos(angle)).toFixed(2)},${(16 + 13 * Math.sin(angle)).toFixed(2)}`;
}).join(' ');

/** Milestone badge. Earned is filled. The next one is a bright stroke. The rest stay quiet. */
export function HexBadge({ label, state, color }: { label: string; state: 'earned' | 'next' | 'ahead'; color: string }) {
  const theme = useAppTheme();
  const ink = state === 'ahead' ? theme.colors.muted : state === 'earned' ? theme.colors.bg : color;
  const fill = state === 'earned' ? color : 'transparent';
  const stroke = state === 'ahead' ? theme.colors.line : color;
  return (
    <View style={{ width: 44, height: 48, alignItems: 'center', justifyContent: 'center' }} accessibilityElementsHidden>
      <Svg width={36} height={36} viewBox="0 0 32 32">
        <Polygon points={HEX} fill={fill} stroke={stroke} strokeWidth={state === 'next' ? 2 : 1.4} />
        <SvgText x={16} y={18} textAnchor="middle" fill={ink} fontSize={8} fontFamily={theme.font.bodyStrong}>
          {label}
        </SvgText>
      </Svg>
    </View>
  );
}
