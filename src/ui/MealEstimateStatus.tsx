import { View } from 'react-native';

import { Button, ErrorNote, T } from '@/ui/ui';
import { PlanTick } from '@/ui/PlanTick';
import { statsToneColors } from '@/ui/statsPalette';
import { useAppTheme } from '@/ui/theme';

export const ESTIMATE_READY_LINE = 'Estimate ready - see below';
export const ESTIMATE_WAITING_LINE = 'Estimating...';

/** Waiting, a green tick with the ready line, or a visible retry. Nothing here is saved. */
export function MealEstimateStatus({
  waiting,
  ready,
  error,
  onRetry,
}: {
  waiting: boolean;
  ready: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const theme = useAppTheme();
  const green = statsToneColors(theme.scheme).good.ink;
  return (
    <View style={{ gap: 8 }}>
      {waiting ? <T variant="muted">{ESTIMATE_WAITING_LINE}</T> : null}
      {!waiting && ready ? (
        <View
          accessibilityRole="text"
          accessibilityLabel={ESTIMATE_READY_LINE}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
        >
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <PlanTick done />
          </View>
          <T style={{ color: green }}>{ESTIMATE_READY_LINE}</T>
        </View>
      ) : null}
      {!waiting && error ? (
        <View style={{ gap: 8 }}>
          <ErrorNote>{error}</ErrorNote>
          <Button label="Try again" onPress={onRetry} />
        </View>
      ) : null}
    </View>
  );
}
