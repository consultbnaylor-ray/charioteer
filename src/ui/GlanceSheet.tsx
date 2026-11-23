import { useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RESTING_WHAT, VO2_WHAT } from '@/domain/fitnessSnapshot';
import { HRV_EXPLAINER_PARAGRAPHS } from '@/domain/healthInsights';
import { LOW_RESTING_FIT_LINE, LOW_RESTING_FIT_MORE } from '@/domain/restingFitness';
import { useAppTheme } from '@/ui/theme';
import { T } from '@/ui/ui';
import { Vo2MeasureCopy } from '@/ui/Vo2EstimateNote';

/** One level of detail. The card stays a number and a line. This sheet holds the rest. */
export function GlanceSheet({
  visible,
  title,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" style={{ flex: 1 }} onPress={onClose} />
        <View
          style={{
            maxHeight: '88%',
            backgroundColor: theme.colors.bg,
            borderTopLeftRadius: 26,
            borderTopRightRadius: 26,
            borderTopWidth: 1.5,
            borderColor: theme.colors.accent,
            paddingHorizontal: 16,
            paddingTop: 10,
            paddingBottom: 16 + insets.bottom,
            gap: 12,
          }}
        >
          <View accessibilityElementsHidden style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: theme.colors.line, alignSelf: 'center' }} />
          <T variant="title">{title}</T>
          <ScrollView style={{ flexGrow: 0, flexShrink: 1 }} contentContainerStyle={{ gap: 12, paddingBottom: 8 }}>
            {children}
          </ScrollView>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={{ minHeight: 44, justifyContent: 'center' }}>
            <T style={{ fontFamily: theme.font.bodyStrong, textAlign: 'center' }}>Close</T>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

/** A closed section inside a sheet. Opening it does not open another sheet. */
export function SheetSection({ title, children }: { title: string; children: ReactNode }) {
  const theme = useAppTheme();
  const [open, setOpen] = useState(false);
  return (
    <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.line }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
      >
        <T style={{ flex: 1, fontFamily: theme.font.bodyStrong }}>{title}</T>
        <T variant="muted">{open ? '–' : '>'}</T>
      </Pressable>
      {open ? <View style={{ gap: 8, paddingBottom: 12 }}>{children}</View> : null}
    </View>
  );
}

/** The resting explanation. Both detail sheets use this, so the words cannot drift. */
export function RestingMeaningBody() {
  return (
    <>
      <T variant="label">What resting heart rate means</T>
      <T>{RESTING_WHAT}</T>
      <T variant="label">When to get a reading checked</T>
      <T>{LOW_RESTING_FIT_LINE}</T>
      <T>{LOW_RESTING_FIT_MORE}</T>
      <T variant="muted">Not medical advice. Not a diagnosis.</T>
    </>
  );
}

export function Vo2MeaningBody() {
  return (
    <>
      <T variant="label">What VO2 max means</T>
      <T>{VO2_WHAT}</T>
      <Vo2MeasureCopy />
    </>
  );
}

export function HrvMeaningBody() {
  return (
    <>
      <T variant="label">What heart rate variability means</T>
      {HRV_EXPLAINER_PARAGRAPHS.map((paragraph) => <T key={paragraph.slice(0, 32)}>{paragraph}</T>)}
      <T variant="muted">Not medical advice. Not a diagnosis.</T>
    </>
  );
}

export function StatTrio({ low, average, high, unit }: { low: string; average: string; high: string; unit: string }) {
  const theme = useAppTheme();
  const cells = [
    ['Low', low],
    ['Average', average],
    ['High', high],
  ] as const;
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {cells.map(([label, value]) => (
        <View key={label} style={{ flex: 1, borderWidth: 1.5, borderColor: theme.colors.line, borderRadius: 12, padding: 10, gap: 2 }}>
          <T variant="label">{label}</T>
          <T variant="title">{value}</T>
          <T variant="muted">{unit}</T>
        </View>
      ))}
    </View>
  );
}
