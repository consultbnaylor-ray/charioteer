import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { NUTRITION_BREAKDOWN_LABEL, type MealNutrientBar } from '@/domain/nutrition';
import { goodZoneBand } from '@/ui/statsPalette';
import { useAppTheme } from '@/ui/theme';
import { T } from '@/ui/ui';

/** Compact bars. A lime band is the healthy zone, and the words say which side of it this meal sits on. */
export function MealNutrientBars({ bars }: { bars: readonly MealNutrientBar[] }) {
  const theme = useAppTheme();
  if (!bars.length) return null;
  return (
    <View style={{ gap: 6 }}>
      {bars.map((bar) => {
        const fill = Math.max(0, Math.min(1, bar.fill));
        const zone = bar.zone == null ? null : Math.max(0, Math.min(1, bar.zone));
        return (
          <View key={bar.key} style={{ gap: 2 }}>
            <T style={{ fontSize: 12 * theme.scale, lineHeight: 16 * theme.scale }}>{bar.label}</T>
            <View
              accessibilityElementsHidden
              style={{ height: 10, borderRadius: 5, backgroundColor: theme.colors.line, overflow: 'hidden', justifyContent: 'center' }}
            >
              {zone != null ? (
                <View
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: `${zone * 100}%`,
                    backgroundColor: goodZoneBand(theme.scheme),
                  }}
                />
              ) : null}
              <View style={{ width: `${fill * 100}%`, height: 4, borderRadius: 2, backgroundColor: theme.colors.ink }} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** Latest meals stay open. A longer list starts each earlier chart behind this toggle. */
export function MealBreakdown({ bars, startOpen }: { bars: readonly MealNutrientBar[]; startOpen: boolean }) {
  const [open, setOpen] = useState(startOpen);
  if (!bars.length) return null;
  if (startOpen) return <MealNutrientBars bars={bars} />;
  return (
    <View style={{ gap: 6 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={NUTRITION_BREAKDOWN_LABEL}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        style={{ minHeight: 44, justifyContent: 'center' }}
      >
        <T variant="label">{open ? 'Hide nutrition breakdown' : NUTRITION_BREAKDOWN_LABEL}</T>
      </Pressable>
      {open ? <MealNutrientBars bars={bars} /> : null}
    </View>
  );
}
