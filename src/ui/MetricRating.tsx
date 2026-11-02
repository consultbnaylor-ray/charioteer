import { View } from 'react-native';

import type { MetricReading } from '@/domain/metricRegistry';
import { T } from '@/ui/ui';

/** The label, the comparison, the aim, and tips. The source stays in More info so it is named once. */
export function MetricRatingLines({ rating }: { rating: MetricReading | null | undefined }) {
  if (!rating) return null;
  return (
    <View style={{ gap: 4 }}>
      {rating.pending ? <T>No rating yet</T> : <T>{`${rating.label}. ${rating.where}`}</T>}
      {rating.pending && rating.where ? <T>{rating.where}</T> : null}
      {rating.inputs?.map((line) => (
        <T key={line.name}>{`${line.name}: ${line.detail}`}</T>
      ))}
      {rating.goalLine ? <T variant="muted">{rating.goalLine}</T> : null}
      {rating.why ? (
        <View style={{ gap: 4 }}>
          <T variant="label">Why it matters</T>
          <T>{rating.why.body}</T>
          <T variant="muted">{rating.why.sources}</T>
        </View>
      ) : null}
      {rating.tips.map((tip) => <T key={tip}>{tip}</T>)}
    </View>
  );
}
