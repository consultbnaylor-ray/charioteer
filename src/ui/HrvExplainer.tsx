import { Linking, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';

import {
  HRV_EXPLAINER_LINKS,
  HRV_EXPLAINER_PARAGRAPHS,
  HRV_EXPLAINER_TIPS,
  HRV_EXPLAINER_TITLE,
} from '@/domain/healthInsights';
import { MoreInfo } from '@/ui/MoreInfo';
import { T } from '@/ui/ui';

/** The long HRV note. The title stays on the shared More info button. */
export function HrvExplainer() {
  const router = useRouter();
  return (
    <MoreInfo title={HRV_EXPLAINER_TITLE} about={HRV_EXPLAINER_TITLE}>
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
    </MoreInfo>
  );
}
