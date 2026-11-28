import { useEffect, useRef } from 'react';
import { ScrollView, View } from 'react-native';

import { HEALTH_STAT_PERIOD_LABEL, HEALTH_STAT_PERIODS } from '@/domain/healthStatTiles';
import { useStatPeriod } from '@/health/useStatPeriod';
import { Choice } from '@/ui/ui';

/** Day through 12 months. The row scrolls, and the selected period stays in view. */
export function StatPeriodToggle({
  periods = HEALTH_STAT_PERIODS,
  selected,
}: {
  periods?: readonly (typeof HEALTH_STAT_PERIODS)[number][];
  /** Highlight this chip when the stored period is not one of `periods`. */
  selected?: (typeof HEALTH_STAT_PERIODS)[number];
} = {}) {
  const [period, setPeriod] = useStatPeriod();
  const shown = selected ?? period;
  const scroller = useRef<ScrollView>(null);
  const offsets = useRef<Partial<Record<string, number>>>({});

  useEffect(() => {
    const x = offsets.current[shown];
    if (x == null) return;
    scroller.current?.scrollTo({ x: Math.max(0, x - 8), animated: false });
  }, [shown]);

  return (
    <ScrollView
      ref={scroller}
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityRole="radiogroup"
      accessibilityLabel="Period"
      contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
    >
      {periods.map((id) => (
        <View
          key={id}
          onLayout={(event) => {
            offsets.current[id] = event.nativeEvent.layout.x;
            if (id === shown) scroller.current?.scrollTo({ x: Math.max(0, event.nativeEvent.layout.x - 8), animated: false });
          }}
        >
          <Choice
            label={HEALTH_STAT_PERIOD_LABEL[id]}
            selected={shown === id}
            onPress={() => setPeriod(id)}
          />
        </View>
      ))}
    </ScrollView>
  );
}
