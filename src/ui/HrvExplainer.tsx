import { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';

import {
  HRV_EXPLAINER_LINKS,
  HRV_EXPLAINER_PARAGRAPHS,
  HRV_EXPLAINER_TIPS,
  HRV_EXPLAINER_TITLE,
} from '@/domain/healthInsights';
import { useAppTheme } from '@/ui/theme';
import { T } from '@/ui/ui';

/** Collapsible plain-English note for the heart rate variability card. */
export function HrvExplainer() {
  const theme = useAppTheme();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: 8 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={HRV_EXPLAINER_TITLE}
        accessibilityState={{ expanded: open }}
        aria-expanded={open}
        onPress={() => setOpen((value) => !value)}
        style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
      >
        <T style={{ fontFamily: theme.font.bodyStrong, flex: 1 }}>{HRV_EXPLAINER_TITLE}</T>
        <T variant="muted">{open ? 'Hide' : 'Show'}</T>
      </Pressable>
      {open ? (
        <View style={{ gap: 8 }}>
          {HRV_EXPLAINER_PARAGRAPHS.map((paragraph) => (
            <T key={paragraph.slice(0, 24)}>{paragraph}</T>
          ))}
          <T>{HRV_EXPLAINER_TIPS}</T>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Open breathing exercises"
            onPress={() => router.push('/breathe?exercise=sigh' as never)}
            style={{ minHeight: 44, justifyContent: 'center' }}
          >
            <T variant="muted" style={{ textDecorationLine: 'underline' }}>Breathe</T>
          </Pressable>
          {HRV_EXPLAINER_LINKS.map((source) => (
            <Pressable
              key={source.url}
              accessibilityRole="link"
              onPress={() => void Linking.openURL(source.url)}
              style={{ minHeight: 44, justifyContent: 'center' }}
            >
              <T variant="muted" style={{ textDecorationLine: 'underline' }}>{source.name}</T>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}
