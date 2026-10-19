import { View } from 'react-native';

import { HEALTH_STAT_PERIOD_LABEL, HEALTH_STAT_PERIODS } from '@/domain/healthStatTiles';
import { useStatPeriod } from '@/health/useStatPeriod';
import { Choice } from '@/ui/ui';

/** Day / 7 days / 30 days. The same control as Health Stats, bound to one saved choice. */
export function StatPeriodToggle() {
  const [period, setPeriod] = useStatPeriod();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Period" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {HEALTH_STAT_PERIODS.map((id) => (
        <Choice
          key={id}
          label={HEALTH_STAT_PERIOD_LABEL[id]}
          selected={period === id}
          onPress={() => setPeriod(id)}
        />
      ))}
    </View>
  );
}
