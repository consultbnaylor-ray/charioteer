import { View } from 'react-native';

import { VO2_PLAN_LABEL, VO2_STALE_NUDGE, vo2MeasuredLine, vo2NoteParts, vo2ReadingIsStale, type Vo2Source } from '@/domain/vo2Estimate';
import { MoreInfo } from '@/ui/MoreInfo';
import { Button, T } from '@/ui/ui';

export function Vo2EstimateNote({
  measuredOn,
  source,
  today,
  onPlan,
  showMeasured = true,
}: {
  measuredOn: string | null;
  source: Vo2Source | null;
  today: string;
  onPlan: () => void;
  /** The card shows the date beside the number. This hides the second copy. */
  showMeasured?: boolean;
}) {
  const stale = measuredOn != null && vo2ReadingIsStale(measuredOn, today);
  return (
    <View style={{ gap: 8, alignSelf: 'stretch' }}>
      {vo2NoteParts(source).map((part) => {
        const title = part.startsWith('Garmin') ? 'Garmin watch info' : 'Apple Watch info';
        return (
          <MoreInfo key={title} title={title} about={title}>
            <T>{part}</T>
          </MoreInfo>
        );
      })}
      {showMeasured && measuredOn ? <T variant="muted">{vo2MeasuredLine(measuredOn, source)}</T> : null}
      {stale ? <T>{VO2_STALE_NUDGE}</T> : null}
      {stale ? <Button label={VO2_PLAN_LABEL} onPress={onPlan} /> : null}
    </View>
  );
}
