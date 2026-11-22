import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { HRV_EXPLAINER_PARAGRAPHS } from '@/domain/healthInsights';
import { RESTING_WHAT, VO2_WHAT } from '@/domain/fitnessSnapshot';
import { LOW_RESTING_FIT_LINE, LOW_RESTING_FIT_MORE } from '@/domain/restingFitness';
import { GlanceSheet, SheetSection, StatTrio } from '@/ui/GlanceSheet';
import { Sparkline } from '@/ui/gridChrome';
import { ReadingChart } from '@/ui/ReadingChart';
import { useAppTheme } from '@/ui/theme';
import { Card, T } from '@/ui/ui';
import { Vo2MeasureCopy } from '@/ui/Vo2EstimateNote';

export type GlanceReading = {
  id: 'resting' | 'vo2' | 'hrv';
  title: string;
  value: string;
  unit: string;
  source: string | null;
  points: readonly { day: string; value: number }[];
  line: string | null;
};

const ORDER = ['resting', 'vo2', 'hrv'] as const;

/**
 * Collapsed heart and body cards. The number, the line, and the source stay on the card.
 * The chart, the range, and the explanations open in one sheet.
 */
export function HeartBodyGlance({
  readings,
  onMonth,
}: {
  readings: readonly GlanceReading[];
  onMonth: () => void;
}) {
  const theme = useAppTheme();
  const [open, setOpen] = useState<GlanceReading | null>(null);
  const colorFor = (id: GlanceReading['id']) => (id === 'resting' ? theme.grid.heart : id === 'vo2' ? theme.grid.activity : theme.grid.mind);
  const shown = ORDER.flatMap((id) => {
    const reading = readings.find((item) => item.id === id);
    return reading ? [reading] : [];
  });
  return (
    <View style={{ gap: 12 }}>
      {shown.map((reading) => {
        const color = colorFor(reading.id);
        const values = reading.points.map((point) => point.value);
        return (
          <Card key={reading.id} compact style={{ borderColor: color }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <T variant="label" style={{ color }}>{reading.title}</T>
              {reading.source ? <T variant="muted">{reading.source}</T> : null}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }}>
              <View style={{ flexShrink: 1 }}>
                <T numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} variant="display" style={{ fontSize: 42 * theme.scale, lineHeight: 46 * theme.scale }}>{reading.value}</T>
                <T variant="muted">{reading.unit}</T>
              </View>
              <Sparkline values={values} color={color} width={120} height={42} />
            </View>
            {reading.line ? <T numberOfLines={2}>{reading.line}</T> : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`More about ${reading.title}`}
              onPress={() => setOpen(reading)}
              style={{ minHeight: 44, alignSelf: 'flex-end', justifyContent: 'center' }}
            >
              <T style={{ color: theme.grid.sobriety, fontFamily: theme.font.bodyStrong, letterSpacing: 1.1 }}>MORE</T>
            </Pressable>
          </Card>
        );
      })}
      <GlanceSheet visible={open != null} title={open?.title ?? 'More'} onClose={() => setOpen(null)}>
        {open ? <ReadingBody reading={open} color={colorFor(open.id)} onMonth={() => { setOpen(null); onMonth(); }} /> : null}
      </GlanceSheet>
    </View>
  );
}

function ReadingBody({ reading, color, onMonth }: { reading: GlanceReading; color: string; onMonth: () => void }) {
  const theme = useAppTheme();
  const values = reading.points.map((point) => point.value);
  const low = values.length ? Math.min(...values) : null;
  const high = values.length ? Math.max(...values) : null;
  const average = values.length ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10 : null;
  const start = reading.points[0]?.day;
  const end = reading.points[reading.points.length - 1]?.day;
  return (
    <View style={{ gap: 12 }}>
      <T variant="display">{reading.value}</T>
      <T variant="muted">{reading.source ?? 'No source yet'} · {reading.unit}</T>
      {reading.points.length > 1 && start && end ? (
        <ReadingChart
          points={reading.points}
          start={start}
          end={end}
          unit={reading.unit}
          aggregate="mean"
          accent={color}
          accessibilityLabel={`${reading.title} chart`}
        />
      ) : (
        <T variant="muted">Not enough days for a chart yet.</T>
      )}
      {low != null && average != null && high != null ? (
        <StatTrio low={String(low)} average={String(average)} high={String(high)} unit={reading.unit} />
      ) : null}
      {reading.line ? <T>{reading.line}</T> : null}
      {reading.id === 'resting' ? (
        <>
          <SheetSection title="What resting heart rate means">
            <T>{RESTING_WHAT}</T>
          </SheetSection>
          <SheetSection title="When to get a reading checked">
            <T>{LOW_RESTING_FIT_LINE}</T>
            <T>{LOW_RESTING_FIT_MORE}</T>
            <T variant="muted">Not medical advice. Not a diagnosis.</T>
          </SheetSection>
        </>
      ) : null}
      {reading.id === 'vo2' ? (
        <SheetSection title="What VO2 max means">
          <T>{VO2_WHAT}</T>
          <Vo2MeasureCopy />
        </SheetSection>
      ) : null}
      {reading.id === 'hrv' ? (
        <SheetSection title="What heart rate variability means">
          {HRV_EXPLAINER_PARAGRAPHS.map((paragraph) => <T key={paragraph.slice(0, 32)}>{paragraph}</T>)}
          <T variant="muted">Not medical advice. Not a diagnosis.</T>
        </SheetSection>
      ) : null}
      <Pressable accessibilityRole="button" accessibilityLabel="Month and year view" onPress={onMonth} style={{ minHeight: 44, justifyContent: 'center' }}>
        <T style={{ fontFamily: theme.font.bodyStrong }}>Month and year view</T>
      </Pressable>
    </View>
  );
}
