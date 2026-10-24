import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { latestWeightSummary } from '@/domain/weightEntry';
import { useAppTheme } from '@/ui/theme';
import { Card, T } from '@/ui/ui';

export const WEIGHT_WAIST_TITLE = 'Weight, waist and BMI';
export const WEIGHT_WAIST_OPEN = 'Tap to open';
export const WEIGHT_WAIST_HREF = '/weight-waist';

/** One tappable row on Health stats. The charts and entry boxes live on Weight and waist. */
export function WeightWaistLink({
  samples,
}: {
  samples: readonly { kind: string; value: number; recordedOn: string; source?: string }[];
}) {
  const router = useRouter();
  const theme = useAppTheme();
  const summary = latestWeightSummary(samples);
  return (
    <Card
      accessibilityLabel={`${WEIGHT_WAIST_TITLE}. ${summary}. ${WEIGHT_WAIST_OPEN}`}
      onPress={() => router.push(WEIGHT_WAIST_HREF as never)}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1, gap: 4 }}>
          <T style={{ fontFamily: theme.font.bodyStrong }}>{WEIGHT_WAIST_TITLE}</T>
          <T>{summary}</T>
          <T variant="muted">{WEIGHT_WAIST_OPEN}</T>
        </View>
        <T>›</T>
      </View>
    </Card>
  );
}
