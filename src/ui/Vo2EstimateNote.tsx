import { View } from 'react-native';

import { VO2_MEASURE_LINES, VO2_PLAN_LABEL, VO2_STALE_NUDGE, vo2MeasuredLine, vo2NoteParts, vo2ReadingIsStale, type Vo2Source } from '@/domain/vo2Estimate';
import { MoreInfo } from '@/ui/MoreInfo';
import { statsToneColors } from '@/ui/statsPalette';
import { useAppTheme } from '@/ui/theme';
import { Button, T } from '@/ui/ui';

/** The GPS line, then the heart-rate line, then the 15-minute line. */
export function Vo2MeasureCopy() {
  return (
    <View style={{ gap: 6, alignSelf: 'stretch' }}>
      {VO2_MEASURE_LINES.map((line) => <T key={line}>{line}</T>)}
    </View>
  );
}

/** Compact strip at the top of the cardio section. The health lines stay further down. */
export function Vo2MeasureBanner() {
  const theme = useAppTheme();
  const green = statsToneColors(theme.scheme).good.ink;
  return (
    <View
      accessibilityRole="text"
      style={{
        alignSelf: 'stretch',
        borderWidth: 1,
        borderColor: theme.colors.line,
        borderLeftWidth: 3,
        borderLeftColor: green,
        borderRadius: theme.radius.md,
        paddingVertical: 8,
        paddingHorizontal: 10,
      }}
    >
      <Vo2MeasureCopy />
    </View>
  );
}

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
