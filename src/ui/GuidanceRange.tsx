import { Linking, Pressable, View } from 'react-native';

import type { GuidanceView } from '@/domain/guidance';
import { selfCareStep, VISIBLE_SAFETY_LINE } from '@/domain/visibleSafety';
import { MoreInfo } from '@/ui/MoreInfo';
import { PlanTick } from '@/ui/PlanTick';
import { useAppTheme } from '@/ui/theme';
import { T } from '@/ui/ui';

/**
 * Status, one honesty line, then one More info button.
 * The long explanation, the duplicate range bar, and the source links open in place.
 * A warning keeps the urgent-care line on the card.
 */
export function GuidanceRange({ guidance }: { guidance: GuidanceView }) {
  const theme = useAppTheme();
  const summary = [guidance.label, guidance.lead, guidance.honesty, guidance.plain].filter(Boolean).join('. ');
  const onTrack = /healthy range|within|on track|meeting the guideline/i.test(guidance.label ?? '');
  const care = selfCareStep(guidance.warning?.step ?? '');
  const suddenStop = Boolean(guidance.warning && /stopping suddenly|seizure/i.test(guidance.warning.step));
  return (
    <View accessibilityLabel={summary} style={{ gap: 8 }}>
      {guidance.label ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {onTrack ? <PlanTick done /> : null}
          <T style={{ flex: 1, fontFamily: theme.font.bodyStrong }}>{guidance.label}</T>
        </View>
      ) : null}
      {guidance.lead ? <T>{guidance.lead}</T> : null}
      <T variant="muted">{guidance.honesty}</T>
      {guidance.warning ? <T>{VISIBLE_SAFETY_LINE}</T> : null}
      {suddenStop && guidance.warning ? <T>{guidance.warning.step}</T> : null}
      <MoreInfo about={guidance.label ?? 'this range'}>
        {guidance.plain ? <T>{guidance.plain}</T> : null}
        {guidance.marker ? <RangeMark guidance={guidance} /> : null}
        {guidance.ticks.length ? (
          <T variant="muted">{guidance.ticks.map((item) => item.label).join('  ·  ')}</T>
        ) : null}
        {guidance.sources.map((source) => (
          <Pressable
            key={source.url}
            accessibilityRole="link"
            accessibilityLabel={source.name}
            onPress={() => void Linking.openURL(source.url)}
            style={{ minHeight: 44, justifyContent: 'center' }}
          >
            <T variant="muted" style={{ textDecorationLine: 'underline' }}>{source.name}</T>
          </Pressable>
        ))}
        {guidance.warning ? (
          <View style={{ gap: 4 }}>
            <T>{guidance.warning.detail}</T>
            {suddenStop || !care ? null : <T>{care}</T>}
          </View>
        ) : null}
        <T variant="muted">{guidance.caveat}</T>
      </MoreInfo>
    </View>
  );
}

function RangeMark({ guidance }: { guidance: GuidanceView }) {
  const theme = useAppTheme();
  if (!guidance.marker) return null;
  return (
    <View style={{ paddingHorizontal: 8, paddingTop: 6 }}>
      <View style={{ height: 28, justifyContent: 'center' }}>
        <View style={{ height: 8, borderRadius: 4, backgroundColor: theme.colors.line }}>
          {guidance.ticks.map((item) => (
            <View
              key={item.label}
              style={{
                position: 'absolute',
                left: `${item.position * 100}%`,
                top: -3,
                width: 2,
                height: 14,
                marginLeft: -1,
                backgroundColor: theme.colors.muted,
              }}
            />
          ))}
        </View>
        <View
          accessibilityElementsHidden
          style={{
            position: 'absolute',
            left: `${guidance.marker.position * 100}%`,
            marginLeft: -7,
            width: 14,
            height: 14,
            borderRadius: 7,
            backgroundColor: guidance.marker.warning ? theme.colors.danger : theme.colors.ink,
          }}
        />
      </View>
    </View>
  );
}
