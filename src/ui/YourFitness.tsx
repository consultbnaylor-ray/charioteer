import { useEffect, useState, type ReactNode } from 'react';
import { Platform, Pressable, View } from 'react-native';

import { useRepository, useSnapshot } from '@/data';
import { shownError } from '@/domain/errors';
import {
  fitnessView,
  VO2_WHAT,
  type FitnessCompare,
  type FitnessSnapshot,
  type FitnessTone,
} from '@/domain/fitnessSnapshot';
import { applyFitnessFocus } from '@/domain/healthPlan';
import type { AppleHealthAccess } from '@/health/connection';
import { readAppleHealthAccess } from '@/health/link';
import { TrendLine } from '@/ui/DistanceCharts';
import { MeasureRingView } from '@/ui/MeasuredFigure';
import { PlanTick } from '@/ui/PlanTick';
import { statsToneColors } from '@/ui/statsPalette';
import { useAppTheme } from '@/ui/theme';
import { Card, T } from '@/ui/ui';

const MIX = [
  ['strength', 'Strength', 'good'],
  ['cardio', 'Cardio', 'info'],
  ['other', 'Other', 'watch'],
] as const;

/**
 * Fitness level, the measures that exist, and one to three goal-led lines.
 * A line can be ticked into this week's focus.
 */
export function YourFitness() {
  const snap = useSnapshot();
  const repo = useRepository();
  const theme = useAppTheme();
  const [access, setAccess] = useState<AppleHealthAccess | null>(Platform.OS === 'ios' ? null : 'web');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    void readAppleHealthAccess().then(setAccess).catch(() => setAccess('prompt'));
  }, []);
  if (!snap.profile) return null;
  const view = fitnessView(snap, access === 'denied' ? 'denied' : 'unknown');
  if (!view) return null;
  const colors = statsToneColors(theme.scheme);
  const ink = (tone: FitnessTone) => colors[tone].ink;

  async function tick(text: string) {
    setError(null);
    try {
      const current = repo.getSnapshot().healthPlan;
      const next = applyFitnessFocus(current, text, new Date().toISOString());
      await repo.saveHealthPlan(next);
    } catch (err) {
      setError(shownError(err, 'Could not add that to this week.'));
    }
  }

  return (
    <Card>
      <T variant="label">Your fitness</T>
      {view.level ? <T style={{ color: ink(view.level === 'Developing' ? 'watch' : 'good'), fontFamily: theme.font.bodyStrong }}>{view.level}</T> : null}
      <T>{view.levelWords}</T>
      <T variant="muted">{view.estimate}</T>
      {view.missing ? <T variant="muted">{view.missing}</T> : null}
      {view.cardio ? (
        <View style={{ alignItems: 'center', gap: 6 }}>
          <MeasureRingView
            label="Cardio fitness"
            ring={{
              centre: view.cardio.centre,
              unit: view.cardio.unit,
              fill: view.cardio.fill,
              status: view.cardio.status,
              tone: view.cardio.tone,
            }}
          />
          {view.cardio.trend.length >= 2 ? <TrendLine points={view.cardio.trend} color={ink(view.cardio.tone)} /> : null}
          {view.cardio.trend.length >= 2 ? <T variant="muted">Cardio fitness, oldest to newest. ml/kg/min.</T> : null}
          <Fold title="What is this?">
            <T>{VO2_WHAT}</T>
          </Fold>
          <FitnessCompareBar compare={view.cardio.compare} tone={view.cardio.tone} />
        </View>
      ) : null}
      {view.minutes ? (
        <MeasureRingView
          label="Active minutes"
          ring={{
            centre: view.minutes.centre,
            unit: view.minutes.unit,
            fill: view.minutes.fill,
            status: view.minutes.status,
            tone: view.minutes.tone,
          }}
          detail={view.minutes.words}
        />
      ) : null}
      {view.resting ? (
        <View style={{ gap: 6 }}>
          <T variant="label">Resting heart rate</T>
          <T style={{ color: ink(view.resting.tone), fontFamily: theme.font.bodyStrong }}>
            {view.resting.reading ? `${view.resting.reading} · ` : ''}{view.resting.tone === 'watch' ? 'Watch' : 'On track'}
          </T>
          <TrendLine points={view.resting.points} color={ink(view.resting.tone)} />
          <T variant="muted">{view.resting.words} Oldest to newest.</T>
        </View>
      ) : null}
      {view.mix ? <MixBar view={view} /> : null}
      {view.recovery ? (
        <View style={{ gap: 4 }}>
          <T variant="label">Recovery</T>
          <T style={{ color: ink(view.recovery.tone), fontFamily: theme.font.bodyStrong }}>{view.recovery.status}</T>
          <T>{view.recovery.words}</T>
        </View>
      ) : null}
      {view.recommendations.length > 0 ? (
        <View style={{ gap: 4 }}>
          <T variant="label">To get closer to your goal</T>
          <T variant="muted">Check with a doctor before big changes.</T>
        </View>
      ) : null}
      {view.recommendations.map((item) => {
        const saved = snap.healthPlan?.focus.find((action) => action.text.toLowerCase() === item.text.toLowerCase());
        const done = Boolean(saved?.done);
        return (
          <Pressable
            key={item.id}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: done }}
            accessibilityLabel={saved ? item.text : `${item.text}. Add to this week's focus`}
            onPress={() => void tick(item.text)}
            style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 }}
          >
            <PlanTick done={done} />
            <T style={{ flex: 1 }}>{item.text}</T>
          </Pressable>
        );
      })}
      {error ? <T>{error}</T> : null}
    </Card>
  );
}

function Fold({ title, children }: { title: string; children: ReactNode }) {
  const theme = useAppTheme();
  const [open, setOpen] = useState(false);
  return (
    <View style={{ alignSelf: 'stretch', gap: 6 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
      >
        <T style={{ fontFamily: theme.font.bodyStrong, flex: 1 }}>{title}</T>
        <T variant="muted">{open ? 'Hide' : 'Show'}</T>
      </Pressable>
      {open ? children : null}
    </View>
  );
}

function FitnessCompareBar({ compare, tone }: { compare: FitnessCompare; tone: FitnessTone }) {
  const theme = useAppTheme();
  const colors = statsToneColors(theme.scheme);
  const marks = [compare.value, compare.age?.low, compare.age?.high, compare.goal?.low, compare.goal?.high]
    .filter((point): point is number => point != null);
  const low = Math.min(...marks);
  const high = Math.max(...marks);
  const pad = Math.max(4, (high - low) * 0.15);
  const scaleMin = Math.max(0, low - pad);
  const span = high + pad - scaleMin || 1;
  const place = (point: number): `${number}%` => `${Math.max(0, Math.min(1, (point - scaleMin) / span)) * 100}%`;
  const band = (zone: { low: number; high: number } | null, fill: string, edge: string) => {
    if (!zone) return null;
    const start = Math.max(0, Math.min(1, (zone.low - scaleMin) / span));
    const end = Math.max(0, Math.min(1, (zone.high - scaleMin) / span));
    return (
      <View
        style={{
          position: 'absolute',
          left: `${start * 100}%`,
          width: `${Math.max(1.5, (end - start) * 100)}%`,
          top: 0,
          bottom: 0,
          backgroundColor: fill,
          borderLeftWidth: 2,
          borderRightWidth: 2,
          borderColor: edge,
        }}
      />
    );
  };
  return (
    <View accessibilityLabel={compare.words} style={{ alignSelf: 'stretch', gap: 8 }}>
      <View accessibilityElementsHidden style={{ height: 28, justifyContent: 'flex-end' }}>
        <View style={{ height: 14, borderRadius: 7, overflow: 'hidden', backgroundColor: theme.colors.line }}>
          {band(compare.age, colors.good.bg, colors.good.ink)}
          {band(compare.goal, colors.info.bg, colors.info.ink)}
        </View>
        <View
          style={{
            position: 'absolute',
            left: place(compare.value),
            marginLeft: -7,
            top: 7,
            width: 14,
            height: 14,
            borderRadius: 7,
            backgroundColor: colors[tone].ink,
            borderWidth: 2,
            borderColor: theme.colors.surface,
          }}
        />
      </View>
      <View style={{ gap: 6 }}>
        <Legend swatch={colors[tone].ink} round label={`You, ${compare.value} ml/kg/min`} />
        {compare.age ? (
          <Legend swatch={colors.good.ink} label={`${compare.age.label}, ${compare.age.low} to ${compare.age.high}`} />
        ) : null}
        {compare.goal ? (
          <Legend swatch={colors.info.ink} label={`${compare.goal.label}, approximate, ${compare.goal.low} to ${compare.goal.high}`} />
        ) : null}
      </View>
      <T>{compare.words}</T>
      {compare.sources.length > 0 ? (
        <Fold title="About these ranges">
          {compare.sources.map((source) => <T key={source.slice(0, 24)} variant="muted">{source}</T>)}
        </Fold>
      ) : null}
    </View>
  );
}

function Legend({ swatch, label, round = false }: { swatch: string; label: string; round?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <View style={{ width: 12, height: 12, borderRadius: round ? 6 : 2, backgroundColor: swatch }} />
      <T style={{ flex: 1 }}>{label}</T>
    </View>
  );
}

function MixBar({ view }: { view: FitnessSnapshot }) {
  const theme = useAppTheme();
  const colors = statsToneColors(theme.scheme);
  const weeks = view.mix?.weeks ?? [];
  const max = Math.max(1, ...weeks.map((week) => week.strength + week.cardio + week.other));
  return (
    <View style={{ gap: 8 }} accessibilityLabel={view.mix?.words}>
      <T variant="label">Sessions</T>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        {MIX.map(([key, label, tone]) => (
          <View key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: colors[tone].ink }} />
            <T>{label}</T>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 72, gap: 4 }}>
        {weeks.map((week) => {
          const total = week.strength + week.cardio + week.other;
          const height = Math.max(total > 0 ? 4 : 0, (total / max) * 72);
          return (
            <View key={week.label} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: 72 }}>
              <View style={{ width: '70%', maxWidth: 18, height, borderRadius: 2, overflow: 'hidden', justifyContent: 'flex-end' }}>
                {total > 0 ? (
                  <>
                    <View style={{ height: `${(week.other / total) * 100}%`, backgroundColor: colors.watch.ink }} />
                    <View style={{ height: `${(week.cardio / total) * 100}%`, backgroundColor: colors.info.ink }} />
                    <View style={{ height: `${(week.strength / total) * 100}%`, backgroundColor: colors.good.ink }} />
                  </>
                ) : (
                  <View style={{ height: 2, backgroundColor: theme.colors.line }} />
                )}
              </View>
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {weeks.map((week) => (
          <T key={week.label} style={{ flex: 1, textAlign: 'center', fontSize: 11 * theme.scale, lineHeight: 14 * theme.scale, color: theme.colors.muted }}>{week.label}</T>
        ))}
      </View>
      <T variant="muted">{view.mix?.words} Oldest week to this week.</T>
    </View>
  );
}
