import { Linking, Pressable, View } from 'react-native';

import type { GuidanceView } from '@/domain/guidance';
import { useAppTheme } from '@/ui/theme';
import { T } from '@/ui/ui';

/** A monochrome mark on a range. Deep red is used only when the band is a warning. */
export function GuidanceRange({ guidance }: { guidance: GuidanceView }) {
  const theme = useAppTheme();
  const summary = [guidance.label, guidance.plain].filter(Boolean).join('. ');
  return (
    <View accessibilityLabel={summary} style={{ gap: 8 }}>
      {guidance.label ? <T style={{ fontFamily: theme.font.bodyStrong }}>{guidance.label}</T> : null}
      <T>{guidance.plain}</T>
      {guidance.marker ? (
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
          {guidance.ticks.length ? (
            <T variant="muted">{guidance.ticks.map((item) => item.label).join('  ·  ')}</T>
          ) : null}
        </View>
      ) : null}
      {guidance.warning ? (
        <View style={{ gap: 4 }}>
          <T>{guidance.warning.detail}</T>
          <T>{guidance.warning.step}</T>
        </View>
      ) : null}
      {guidance.sources.map((source) => (
        <Pressable
          key={source.url}
          accessibilityRole="link"
          onPress={() => void Linking.openURL(source.url)}
          style={{ minHeight: 44, justifyContent: 'center' }}
        >
          <T variant="muted" style={{ textDecorationLine: 'underline' }}>{source.name}</T>
        </Pressable>
      ))}
      <T variant="muted">{guidance.caveat}</T>
    </View>
  );
}
