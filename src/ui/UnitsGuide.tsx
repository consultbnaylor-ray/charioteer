import * as Linking from 'expo-linking';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { formatWeeklyUnits, NHS_DRINKS, NHS_UNITS_URL, UK_LOW_RISK_WEEKLY_UNITS, unitsForCounts } from '@/domain/units';
import { useAppTheme } from '@/ui/theme';
import { T } from '@/ui/ui';

const emptyCounts = Object.fromEntries(NHS_DRINKS.map((drink) => [drink.id, 0]));

/** NHS drink sizes, with plus and minus that fill the weekly units field. */
export function UnitsGuide({ onChange }: { onChange: (units: string) => void }) {
  const theme = useAppTheme();
  const [counts, setCounts] = useState<Record<string, number>>(emptyCounts);

  function setCount(id: string, next: number) {
    const updated = { ...counts, [id]: Math.max(0, next) };
    setCounts(updated);
    onChange(formatWeeklyUnits(unitsForCounts(updated)));
  }

  return (
    <View style={{ gap: 8, borderWidth: 1, borderColor: theme.colors.line, backgroundColor: theme.colors.sunken, borderRadius: 8, padding: 12 }}>
      <T variant="label">Common drinks</T>
      <T variant="muted">Tap plus or minus for a usual week. The total fills the units box. NHS figures.</T>
      {NHS_DRINKS.map((drink) => {
        const count = counts[drink.id] ?? 0;
        return (
          <View key={drink.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Fewer ${drink.name}`}
              disabled={count === 0}
              onPress={() => setCount(drink.id, count - 1)}
              style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.colors.line, backgroundColor: theme.colors.surface, opacity: count === 0 ? 0.4 : 1 }}
            >
              <T>−</T>
            </Pressable>
            <T style={{ minWidth: 22, textAlign: 'center' }}>{count}</T>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`More ${drink.name}`}
              onPress={() => setCount(drink.id, count + 1)}
              style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.colors.line, backgroundColor: theme.colors.surface }}
            >
              <T>+</T>
            </Pressable>
            <View style={{ flex: 1 }}>
              <T>{drink.name}</T>
              <T variant="muted">{drink.detail} · {drink.unitsLabel}</T>
            </View>
          </View>
        );
      })}
      <T>The UK low-risk guideline is no more than {UK_LOW_RISK_WEEKLY_UNITS} units a week.</T>
      <T variant="muted">A unit is 10ml of pure alcohol. Strength (ABV) × volume (ml) ÷ 1,000.</T>
      <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(NHS_UNITS_URL)}>
        <T style={{ textDecorationLine: 'underline' }}>NHS: Calculating alcohol units</T>
      </Pressable>
    </View>
  );
}
