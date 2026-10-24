import { useEffect, useRef } from 'react';
import { ScrollView, View } from 'react-native';

import { HEALTH_STAT_PERIOD_LABEL, HEALTH_STAT_PERIODS } from '@/domain/healthStatTiles';
import { useStatPeriod } from '@/health/useStatPeriod';
import { Choice } from '@/ui/ui';

/** Day through 12 months. The row scrolls, and the selected period stays in view. */
export function StatPeriodToggle() {
  const [period, setPeriod] = useStatPeriod();
  const scroller = useRef<ScrollView>(null);
  const offsets = useRef<Partial<Record<string, number>>>({});

  useEffect(() => {
    const x = offsets.current[period];
    if (x == null) return;
    scroller.current?.scrollTo({ x: Math.max(0, x - 8), animated: false });
  }, [period]);

  return (
    <ScrollView
      ref={scroller}
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityRole="radiogroup"
      accessibilityLabel="Period"
      contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
    >
      {HEALTH_STAT_PERIODS.map((id) => (
        <View
          key={id}
          onLayout={(event) => {
            offsets.current[id] = event.nativeEvent.layout.x;
            if (id === period) scroller.current?.scrollTo({ x: Math.max(0, event.nativeEvent.layout.x - 8), animated: false });
          }}
        >
          <Choice
            label={HEALTH_STAT_PERIOD_LABEL[id]}
            selected={period === id}
            onPress={() => setPeriod(id)}
          />
        </View>
      ))}
    </ScrollView>
  );
}
