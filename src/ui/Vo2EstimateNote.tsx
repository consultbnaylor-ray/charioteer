import { View } from 'react-native';

import { VO2_PLAN_LABEL, VO2_STALE_NUDGE, vo2MeasuredLine, vo2Note, vo2ReadingIsStale, type Vo2Source } from '@/domain/vo2Estimate';
import { Button, T } from '@/ui/ui';

export function Vo2EstimateNote({
  measuredOn,
  source,
  today,
  onPlan,
}: {
  measuredOn: string | null;
  source: Vo2Source | null;
  today: string;
  onPlan: () => void;
}) {
  const stale = measuredOn != null && vo2ReadingIsStale(measuredOn, today);
  return (
    <View style={{ gap: 8, alignSelf: 'stretch' }}>
      <T>{vo2Note(source)}</T>
      {measuredOn ? <T variant="muted">{vo2MeasuredLine(measuredOn, source)}</T> : null}
      {stale ? <T>{VO2_STALE_NUDGE}</T> : null}
      {stale ? <Button label={VO2_PLAN_LABEL} onPress={onPlan} /> : null}
    </View>
  );
}
