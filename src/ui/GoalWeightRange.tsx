import { useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { useSnapshot } from '@/data';
import {
  APPROXIMATE,
  formatWeightAmount,
  goalWeightFromSnapshot,
  type GoalWeightView,
  type WeightSpan,
  type WeightUnitMode,
} from '@/domain/goalWeightRange';
import { GOAL_LABEL } from '@/domain/nutrition';
import { GoalLine } from '@/ui/GoalLine';
import { PlanTick } from '@/ui/PlanTick';
import { statsToneColors } from '@/ui/statsPalette';
import { useAppTheme } from '@/ui/theme';
import { Card, Choice, T } from '@/ui/ui';

/**
 * Current weight against the healthy BMI band and, where a source gives one, a goal range.
 * Missing height, sex, or age shows a prompt and no guessed figures.
 */
export function GoalWeightRange({ embedded = false }: { embedded?: boolean }) {
  const snap = useSnapshot();
  const [unit, setUnit] = useState<WeightUnitMode>('kg');
  if (!snap.profile) return null;
  const view = goalWeightFromSnapshot(snap, unit);
  const goalName = snap.nutrition?.goal ? GOAL_LABEL[snap.nutrition.goal] : null;
  const body = (
    <View style={{ gap: 8 }} accessibilityLabel={view.words}>
      {embedded ? null : <GoalLine note={false} />}
      <T variant="label">Weight range</T>
      {view.status === 'ready' ? <T variant="muted">{APPROXIMATE}</T> : null}
      {view.status === 'ready' ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Choice label="kg" selected={unit === 'kg'} onPress={() => setUnit('kg')} />
          <Choice label="st-lb" selected={unit === 'stlb'} onPress={() => setUnit('stlb')} />
        </View>
      ) : null}
      {view.status === 'prompt' ? <T>{view.prompt}</T> : <Ready view={view} unit={unit} goalName={goalName} />}
    </View>
  );
  if (embedded) return body;
  return <Card>{body}</Card>;
}

function Ready({ view, unit, goalName }: { view: GoalWeightView; unit: WeightUnitMode; goalName: string | null }) {
  return (
    <View style={{ gap: 8 }}>
      {view.healthy ? <RangeBar view={view} unit={unit} goalName={goalName} /> : null}
      {view.withinRange ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }} accessibilityLabel="Within range">
          <PlanTick done />
          <T>Within range</T>
        </View>
      ) : (
        <Outside text={view.gap ?? view.words} />
      )}
      {view.goalNote ? <T variant="muted">{view.goalNote}</T> : null}
      {view.classReference ? <T>{view.classReference}</T> : null}
      {view.muscle ? <T variant="muted">{view.muscle}</T> : null}
      {view.floorNote ? <T>{view.floorNote}</T> : null}
      {view.pace ? <T>{view.pace}</T> : null}
      {view.doctor ? <T variant="muted">{view.doctor}</T> : null}
      {view.sources.length ? (
        <Fold title="About these ranges">
          <T variant="muted">{APPROXIMATE}</T>
          {view.caveat ? <T variant="muted">{view.caveat}</T> : null}
          {view.sources.map((source) => (
            <T key={source.url} variant="muted">{`${source.name}. ${source.url}`}</T>
          ))}
        </Fold>
      ) : null}
    </View>
  );
}

function Outside({ text }: { text: string }) {
  const theme = useAppTheme();
  const ink = statsToneColors(theme.scheme).watch.ink;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: ink }} />
      <T style={{ flex: 1, color: ink }}>{text}</T>
    </View>
  );
}

function RangeBar({ view, unit, goalName }: { view: GoalWeightView; unit: WeightUnitMode; goalName: string | null }) {
  const theme = useAppTheme();
  const colors = statsToneColors(theme.scheme);
  const healthy = view.healthy;
  if (!healthy || healthy.highKg == null) return null;
  const marks = [view.weightKg, healthy.lowKg, healthy.highKg, view.goal?.lowKg, view.goal?.highKg]
    .filter((point): point is number => point != null);
  const low = Math.min(...marks);
  const high = Math.max(...marks);
  const pad = Math.max(2, (high - low) * 0.12);
  const scaleMin = Math.max(0, low - pad);
  const scaleMax = view.goal?.highKg == null && view.goal ? Math.max(high, view.goal.lowKg) + pad + 8 : high + pad;
  const span = scaleMax - scaleMin || 1;
  const place = (point: number) => Math.max(0, Math.min(1, (point - scaleMin) / span));
  const same = view.goal != null
    && view.goal.lowKg === healthy.lowKg
    && view.goal.highKg === healthy.highKg;
  const band = (zone: WeightSpan, fill: string, edge: string) => {
    const start = place(zone.lowKg);
    const end = zone.highKg == null ? 1 : place(zone.highKg);
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
    <View style={{ alignSelf: 'stretch', gap: 8 }}>
      <View accessibilityElementsHidden style={{ height: 28, justifyContent: 'flex-end' }}>
        <View style={{ height: 14, borderRadius: 7, overflow: 'hidden', backgroundColor: theme.colors.line }}>
          {band(healthy, colors.good.bg, colors.good.ink)}
          {view.goal && !same ? band(view.goal, colors.info.bg, colors.info.ink) : null}
          {view.goal && same ? (
            <View style={{ position: 'absolute', left: `${place(healthy.lowKg) * 100}%`, width: `${Math.max(1.5, (place(healthy.highKg) - place(healthy.lowKg)) * 100)}%`, top: 0, height: 4, backgroundColor: colors.info.ink }} />
          ) : null}
        </View>
        {view.weightKg != null ? (
          <View
            style={{
              position: 'absolute',
              left: `${place(view.weightKg) * 100}%`,
              marginLeft: -7,
              top: 7,
              width: 14,
              height: 14,
              borderRadius: 7,
              backgroundColor: theme.colors.ink,
              borderWidth: 2,
              borderColor: theme.colors.surface,
            }}
          />
        ) : null}
      </View>
      <View style={{ gap: 6 }}>
        {view.weightKg != null ? (
          <Legend swatch={theme.colors.ink} round label={`You, ${formatShown(view.weightKg, unit)}`} />
        ) : null}
        <Legend swatch={colors.good.ink} label={`Healthy weight, ${shownSpan(healthy, unit)}`} />
        {view.goal ? (
          <Legend swatch={colors.info.ink} label={`${view.goal.label}, approximate, ${shownSpan(view.goal, unit)}`} />
        ) : (
          <Legend swatch={colors.info.ink} label={goalName ? `No separate published range for ${goalName}` : 'No separate published range'} />
        )}
      </View>
    </View>
  );
}

function formatShown(kg: number, unit: WeightUnitMode): string {
  return formatWeightAmount(kg, unit);
}

function shownSpan(span: WeightSpan, unit: WeightUnitMode): string {
  const low = formatShown(span.lowKg, unit);
  if (span.highKg == null) return span.lowExclusive ? `over ${low}` : `${low} and above`;
  const high = formatShown(span.highKg, unit);
  return span.lowExclusive ? `over ${low} to ${high}` : `${low} to ${high}`;
}

function Legend({ swatch, label, round = false }: { swatch: string; label: string; round?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <View style={{ width: 12, height: 12, borderRadius: round ? 6 : 2, backgroundColor: swatch }} />
      <T style={{ flex: 1 }}>{label}</T>
    </View>
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
