import { useRouter } from 'expo-router';
import { Pressable } from 'react-native';

import { T } from '@/ui/ui';

export const UPDATE_WEIGHT_LABEL = 'Update your weight';
/**
 * You still has the weight box (kg or stones, and Save).
 * Health Stats no longer shows the weight reading itself.
 */
export const UPDATE_WEIGHT_HREF = '/profile?section=weight';

export function textMentionsWeight(text: string): boolean {
  return /\bweight\b/i.test(text);
}

/** A small link to the weight box on You. The sentence it sits under stays. */
export function UpdateWeightLink() {
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={UPDATE_WEIGHT_LABEL}
      onPress={() => router.push(UPDATE_WEIGHT_HREF as never)}
      style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }}
    >
      <T variant="muted" style={{ textDecorationLine: 'underline' }}>{UPDATE_WEIGHT_LABEL}</T>
    </Pressable>
  );
}
