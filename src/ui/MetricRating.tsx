import { View } from 'react-native';

import type { MetricReading } from '@/domain/metricRegistry';
import { T } from '@/ui/ui';

/** The label, the comparison, the aim, and tips. The source stays in More info so it is named once. */
export function MetricRatingLines({ rating }: { rating: MetricReading | null | undefined }) {
  if (!rating) return null;
  return (
    <View style={{ gap: 4 }}>
      <T>{`${rating.label}. ${rating.where}`}</T>
      {rating.goalLine ? <T variant="muted">{rating.goalLine}</T> : null}
      {rating.tips.map((tip) => <T key={tip}>{tip}</T>)}
    </View>
  );
}
