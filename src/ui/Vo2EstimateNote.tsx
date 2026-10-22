import { View } from 'react-native';

import { VO2_ESTIMATE_NOTE, VO2_PLAN_LABEL, VO2_STALE_NUDGE, vo2MeasuredLine, vo2ReadingIsStale } from '@/domain/vo2Estimate';
import { Button, T } from '@/ui/ui';

export function Vo2EstimateNote({
  measuredOn,
  today,
  onPlan,
}: {
  measuredOn: string | null;
  today: string;
  onPlan: () => void;
}) {
  const stale = measuredOn != null && vo2ReadingIsStale(measuredOn, today);
  return (
    <View style={{ gap: 8, alignSelf: 'stretch' }}>
      <T>{VO2_ESTIMATE_NOTE}</T>
      {measuredOn ? <T>{vo2MeasuredLine(measuredOn)}</T> : null}
      {stale ? <T>{VO2_STALE_NUDGE}</T> : null}
      {stale ? <Button label={VO2_PLAN_LABEL} onPress={onPlan} /> : null}
    </View>
  );
}
