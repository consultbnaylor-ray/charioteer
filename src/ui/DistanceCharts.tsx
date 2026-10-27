import { useEffect, useState } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import Svg, { Circle, Line, Path, Polyline } from 'react-native-svg';

import type { ChartBar } from '@/domain/distance';
import { STATS_SIGNAL, type StatsTone } from '@/domain/statsOverview';
import { statsToneColors } from '@/ui/statsPalette';
import { useAppTheme } from '@/ui/theme';
import { ringDrawsClosed, ringStroke } from '@/ui/ringClose';
import { T } from '@/ui/ui';

const STEPS = 8;
const MOTION_MS = 440;

/** A short ease-out, then stop. Reduced motion and a missing frame clock jump to the end. */
export function useChartMotion(): number {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    let cancelled = false;
    let frame = 0;
    const clearFrame = () => {
      if (typeof cancelAnimationFrame === 'function' && frame) cancelAnimationFrame(frame);
    };
    const finish = () => {
      if (cancelled) return;
      cancelled = true;
      clearFrame();
      setProgress(1);
    };
    const animate = () => {
      if (typeof requestAnimationFrame !== 'function') {
        if (!cancelled) setProgress(1);
        return;
      }
      const started = Date.now();
      let last = -1;
      const tick = () => {
        if (cancelled) return;
        const t = Math.min(1, (Date.now() - started) / MOTION_MS);
        const step = Math.min(STEPS, Math.ceil(t * STEPS));
        if (step !== last) {
          last = step;
          setProgress(1 - (1 - step / STEPS) ** 2);
        }
        if (t < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    };
    animate();
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (value) finish();
    }).catch(() => undefined);
    return () => {
      cancelled = true;
      clearFrame();
    };
  }, []);
  return progress;
}

export function ToneMark({ tone, color }: { tone: StatsTone; color: string }) {
  if (tone === 'good') {
    return <Path d="M5 12.2 9.2 16.2 19 7" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />;
  }
  if (tone === 'watch') {
    return <Path d="M12 5.2 20 18.2H4L12 5.2zM12 10v3.4M12 16.2v.2" stroke={color} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />;
  }
  if (tone === 'attention') {
    return <Path d="M12 6v7M12 16.4v.3" stroke={color} strokeWidth={1.8} strokeLinecap="round" />;
  }
  return (
    <>
      <Circle cx={12} cy={12} r={7} stroke={color} strokeWidth={1.6} />
      <Path d="M12 11v5M12 8.2v.2" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
    </>
  );
}

function SignalRow({ tone, signal, monochrome }: { tone: StatsTone; signal?: string; monochrome?: boolean }) {
  const theme = useAppTheme();
  const word = signal ?? STATS_SIGNAL[tone];
  const neutral = monochrome || word === 'Early days' || word === 'On pace';
  const iconTone: StatsTone = word === 'On pace' ? 'good' : word === 'Early days' ? 'info' : tone;
  const ink = neutral ? theme.colors.ink : statsToneColors(theme.scheme)[tone].ink;
  const mark = !neutral && iconTone === 'good' ? theme.colors.accent : ink;
  const label = theme.scheme === 'light' ? ink : mark;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" accessibilityElementsHidden>
        <ToneMark tone={iconTone} color={mark} />
      </Svg>
      <T style={{ color: label, fontFamily: theme.font.bodyStrong }}>{word}</T>
    </View>
  );
}

function inkFor(tone: StatsTone, surface: 'tile' | 'card'): { stroke: string; centre: string; muted: string; track: string } {
  const theme = useAppTheme();
  const toneInk = statsToneColors(theme.scheme)[tone].ink;
  if (surface === 'tile') {
    return { stroke: toneInk, centre: toneInk, muted: toneInk, track: toneInk };
  }
  const stroke = tone === 'good' ? theme.colors.accent : toneInk;
  return { stroke, centre: theme.colors.ink, muted: theme.colors.muted, track: theme.colors.line };
}

export function ProgressRing({
  centre,
  unit,
  fill,
  status,
  tone,
  surface,
  size,
  mark = false,
  spoken = false,
  caption,
  signal,
  monochrome = false,
  showStatus = true,
}: {
  centre: string;
  unit: string;
  fill: number;
  status: string;
  tone: StatsTone;
  surface: 'tile' | 'card';
  size?: number;
  mark?: boolean;
  spoken?: boolean;
  caption?: string;
  signal?: string;
  monochrome?: boolean;
  /** The row beside a small ring can carry the status word instead. */
  showStatus?: boolean;
}) {
  const theme = useAppTheme();
  const motion = useChartMotion();
  const colors = monochrome
    ? { stroke: theme.colors.ink, centre: theme.colors.ink, muted: theme.colors.muted, track: theme.colors.line }
    : inkFor(tone, surface);
  const ring = size ?? (surface === 'tile' ? 92 : 120);
  const stroke = ringStroke(ring);
  const radius = (ring - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const shown = Math.max(0, Math.min(1, fill)) * motion;
  const closed = ringDrawsClosed(shown, ring);
  const mid = ring / 2;
  const centreSize = (ring < 72 ? (centre.length > 3 ? 13 : 16) : ring < 100 ? 18 : 22) * theme.scale;
  return (
    <View
      accessibilityElementsHidden={!spoken}
      accessibilityLabel={spoken ? (caption ?? `${centre} ${unit}. ${status}`) : undefined}
      style={{ alignItems: 'center', gap: 6 }}
    >
      <View style={{ width: ring, height: ring }}>
        <Svg width={ring} height={ring}>
          <Circle
            cx={mid}
            cy={mid}
            r={radius}
            stroke={colors.track}
            strokeOpacity={surface === 'tile' ? 0.28 : 1}
            strokeWidth={stroke}
            fill="none"
          />
          {closed ? (
            <Circle cx={mid} cy={mid} r={radius} stroke={colors.stroke} strokeWidth={stroke} fill="none" />
          ) : shown > 0 ? (
            <Circle
              cx={mid}
              cy={mid}
              r={radius}
              stroke={colors.stroke}
              strokeWidth={stroke}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${circumference * shown} ${circumference}`}
              transform={`rotate(-90 ${mid} ${mid})`}
            />
          ) : null}
        </Svg>
        <View style={{ position: 'absolute', left: 8, right: 8, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
          <T style={{ color: colors.centre, fontFamily: theme.font.display, fontSize: centreSize, lineHeight: centreSize * 1.15 }}>{centre}</T>
          {unit ? (
            <T
              numberOfLines={2}
              style={{
                color: colors.muted,
                fontSize: (unit.length > 8 ? 9 : 11) * theme.scale,
                lineHeight: (unit.length > 8 ? 11 : 14) * theme.scale,
                textAlign: 'center',
              }}
            >
              {unit}
            </T>
          ) : null}
        </View>
      </View>
      {mark ? <SignalRow tone={tone} signal={signal} monochrome={monochrome} /> : null}
      {showStatus ? <T style={{ color: surface === 'tile' ? colors.centre : theme.colors.ink, textAlign: 'center' }}>{status}</T> : null}
    </View>
  );
}

export function CompareBars({
  bars,
  max,
  target = null,
  layout = 'column',
  showLabels = true,
}: {
  bars: ChartBar[];
  max: number;
  target?: number | null;
  layout?: 'column' | 'row';
  showLabels?: boolean;
}) {
  const theme = useAppTheme();
  const motion = useChartMotion();
  const colors = statsToneColors(theme.scheme);
  const [width, setWidth] = useState(0);
  const top = max > 0 ? max : 1;
  if (layout === 'row') {
    return (
      <View accessibilityElementsHidden style={{ gap: 8, alignSelf: 'stretch' }}>
        {bars.map((bar) => {
          const width = Math.max(0, Math.min(1, bar.value / top)) * motion;
          const fill = bar.tone === 'empty' ? theme.colors.line : colors[bar.tone].ink;
          return (
            <View key={bar.key} style={{ gap: 4 }}>
              <T style={{ fontSize: 13 * theme.scale, lineHeight: 18 * theme.scale }}>{bar.label}</T>
              <View style={{ height: 12, borderRadius: 6, backgroundColor: theme.colors.line, overflow: 'hidden' }}>
                <View style={{ width: `${Math.round(width * 100)}%`, height: '100%', backgroundColor: fill }} />
              </View>
            </View>
          );
        })}
      </View>
    );
  }
  const height = 84;
  const targetY = target != null && target > 0 ? height - (Math.min(target, top) / top) * height : null;
  return (
    <View accessibilityElementsHidden style={{ gap: 4, alignSelf: 'stretch' }}>
      <View style={{ height, position: 'relative' }} onLayout={(event) => setWidth(Math.round(event.nativeEvent.layout.width))}>
        {targetY != null && width > 0 ? (
          <Svg width={width} height={height} style={{ position: 'absolute', left: 0, top: 0 }}>
            <Line x1={0} x2={width} y1={targetY} y2={targetY} stroke={colors.info.ink} strokeWidth={1} strokeDasharray="4 4" />
          </Svg>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', height }}>
          {bars.map((bar) => {
            const share = Math.max(0, bar.value / top) * motion;
            const barHeight = Math.max(bar.value > 0 ? 3 : 0, share * height);
            const fill = bar.tone === 'empty' ? theme.colors.line : colors[bar.tone].ink;
            return (
              <View key={bar.key} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height }}>
                {bar.value > 0 ? (
                  <View style={{ width: '62%', maxWidth: 16, height: barHeight, borderRadius: 2, backgroundColor: fill }} />
                ) : bar.missing === 'line' ? (
                  <View style={{ width: '62%', maxWidth: 16, height: 2, borderRadius: 1, backgroundColor: theme.colors.line }} />
                ) : (
                  <View style={{ width: '62%', maxWidth: 16, height: 0 }} />
                )}
              </View>
            );
          })}
        </View>
      </View>
      {showLabels ? (
        <View style={{ flexDirection: 'row' }}>
          {bars.map((bar) => (
            <T key={bar.key} style={{ flex: 1, textAlign: 'center', fontSize: 11 * theme.scale, lineHeight: 14 * theme.scale, color: theme.colors.muted }}>{bar.label}</T>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function TrendLine({ points, color }: { points: number[]; color: string }) {
  const motion = useChartMotion();
  const width = 132;
  const height = 36;
  if (points.length < 2) return null;
  const low = Math.min(...points);
  const high = Math.max(...points);
  const span = high - low || 1;
  const coords = points.map((value, index) => {
    const x = 4 + (index / (points.length - 1)) * (width - 8);
    const y = 4 + (1 - (value - low) / span) * (height - 8);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <View accessibilityElementsHidden style={{ width, height, overflow: 'hidden' }}>
      <View style={{ width: Math.max(1, width * motion), overflow: 'hidden' }}>
        <Svg width={width} height={height}>
          <Polyline points={coords} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        </Svg>
      </View>
    </View>
  );
}

export function RangeTrack({
  value,
  zoneLow,
  zoneHigh,
  scaleMin,
  scaleMax,
  status,
  zoneCaption,
  goalLow = null,
  goalHigh = null,
  goalCaption = null,
  tone,
  surface,
  mark = false,
  spoken = false,
  showStatus = true,
  signal,
  monochrome = false,
  showCaptions = true,
}: {
  value: number;
  zoneLow: number;
  zoneHigh: number;
  scaleMin: number;
  scaleMax: number;
  status: string;
  zoneCaption: string;
  /** A second band, such as a boxing class. high null means the class has no upper limit. */
  goalLow?: number | null;
  goalHigh?: number | null;
  goalCaption?: string | null;
  tone: StatsTone;
  surface: 'tile' | 'card';
  mark?: boolean;
  spoken?: boolean;
  /** Hide the status line when a ring above the track already says it. */
  showStatus?: boolean;
  signal?: string;
  monochrome?: boolean;
  /** Legend lines. A status card can keep the bar and move these behind More info. */
  showCaptions?: boolean;
}) {
  const theme = useAppTheme();
  const motion = useChartMotion();
  const colors = statsToneColors(theme.scheme);
  const span = scaleMax - scaleMin || 1;
  const place = (point: number) => Math.max(0, Math.min(1, (point - scaleMin) / span));
  const zoneStart = place(zoneLow);
  const zoneEnd = place(zoneHigh);
  const marker = place(value) * motion;
  const markerInk = colors[tone].ink;
  const track = surface === 'tile' ? colors[tone].ink : theme.colors.line;
  return (
    <View
      accessibilityElementsHidden={!spoken}
      accessibilityLabel={spoken ? [zoneCaption, goalCaption, showStatus ? status : null].filter(Boolean).join('. ') : undefined}
      style={{ gap: 6, alignSelf: 'stretch' }}
    >
      <View style={{ height: 22, justifyContent: 'flex-end' }}>
        <View style={{ height: 12, borderRadius: 6, overflow: 'hidden' }}>
          <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: track, opacity: surface === 'tile' ? 0.28 : 1 }} />
          <View
            style={{
              position: 'absolute',
              left: `${zoneStart * 100}%`,
              width: `${Math.max(0, zoneEnd - zoneStart) * 100}%`,
              top: 0,
              bottom: 0,
              backgroundColor: colors.good.bg,
              borderLeftWidth: 2,
              borderRightWidth: 2,
              borderColor: colors.good.ink,
            }}
          />
          {goalLow != null ? (
            <View
              style={{
                position: 'absolute',
                left: `${place(goalLow) * 100}%`,
                width: `${Math.max(1.5, ((goalHigh == null ? 1 : place(goalHigh)) - place(goalLow)) * 100)}%`,
                top: 0,
                bottom: 0,
                backgroundColor: colors.info.bg,
                borderLeftWidth: 2,
                borderRightWidth: goalHigh == null ? 0 : 2,
                borderColor: colors.info.ink,
              }}
            />
          ) : null}
        </View>
        <View
          accessibilityElementsHidden
          style={{
            position: 'absolute',
            left: `${marker * 100}%`,
            marginLeft: -6,
            top: 4,
            width: 12,
            height: 12,
            borderRadius: 6,
            backgroundColor: markerInk,
            borderWidth: 2,
            borderColor: surface === 'tile' ? colors[tone].bg : theme.colors.surface,
          }}
        />
      </View>
      {showCaptions ? (
        <T style={{ fontSize: 13 * theme.scale, lineHeight: 18 * theme.scale, color: surface === 'tile' ? markerInk : theme.colors.muted }}>{zoneCaption}</T>
      ) : null}
      {showCaptions && goalCaption ? (
        <T style={{ fontSize: 13 * theme.scale, lineHeight: 18 * theme.scale, color: colors.info.ink }}>{goalCaption}</T>
      ) : null}
      {mark ? <SignalRow tone={tone} signal={signal} monochrome={monochrome} /> : null}
      {showStatus ? <T style={{ color: surface === 'tile' ? markerInk : theme.colors.ink }}>{status}</T> : null}
    </View>
  );
}
