import { useState } from 'react';
import { View } from 'react-native';

import { NUTRITION_BREAKDOWN_LABEL, type MealNutrientBar } from '@/domain/nutrition';
import { ExpandableRow } from '@/ui/ExpandableRow';
import { limitStatusInk, macroAccent } from '@/ui/statsPalette';
import { useAppTheme } from '@/ui/theme';
import { T } from '@/ui/ui';

const MACRO_NAME: Record<string, string> = {
  kcal: 'Calories',
  protein: 'Protein',
  carbs: 'Carbs',
  sugar: 'Sugars',
  fat: 'Total fat',
  saturated: 'Saturated fat',
  fibre: 'Fibre',
  salt: 'Salt',
  processed: 'Processed food level',
};

function barCopy(bar: MealNutrientBar): { name: string; value: string; note: string } {
  const [head, ...rest] = bar.label.split(' · ');
  const note = rest.join(' · ');
  const known = MACRO_NAME[bar.key];
  if (bar.key === 'kcal') return { name: 'Calories', value: head ?? bar.label, note };
  if (known && head?.startsWith(`${known} `)) {
    return { name: known, value: head.slice(known.length).trim(), note };
  }
  return { name: head ?? bar.label, value: '', note };
}

/** Macro-coloured tracks. The name stays ink. The value and a status chip carry the colour. */
export function MealNutrientBars({ bars }: { bars: readonly MealNutrientBar[] }) {
  const theme = useAppTheme();
  if (!bars.length) return null;
  const text = { fontSize: 12 * theme.scale, lineHeight: 16 * theme.scale };
  return (
    <View style={{ gap: 6 }}>
      {bars.map((bar) => {
        const accent = macroAccent(bar.key, theme.scheme) ?? theme.colors.ink;
        const copy = barCopy(bar);
        const noteColor = bar.status ? limitStatusInk(bar.status, theme.scheme) : accent;
        const fill = Math.max(0, Math.min(1, bar.fill));
        const overfill = Math.max(0, Math.min(1, bar.overfill ?? 0));
        return (
          <View key={bar.key} accessible accessibilityLabel={bar.label} style={{ gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <View
                accessibilityElementsHidden
                style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: accent }}
              />
              <T style={{ ...text, color: theme.colors.ink }}>{copy.name}</T>
              {copy.value ? <T style={{ ...text, color: accent }}>{copy.value}</T> : null}
              {copy.note ? <T style={{ ...text, color: noteColor }}>{copy.note}</T> : null}
            </View>
            {bar.unscaled ? null : (
              <View
                accessibilityElementsHidden
                style={{ height: 8, borderRadius: 4, backgroundColor: theme.colors.line, overflow: 'hidden' }}
              >
                {fill > 0 ? (
                  <View style={{ width: `${fill * 100}%`, height: '100%', backgroundColor: accent }} />
                ) : null}
                {overfill > 0 ? (
                  <View
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      bottom: 0,
                      width: `${overfill * 100}%`,
                      backgroundColor: limitStatusInk('above', theme.scheme),
                    }}
                  />
                ) : null}
              </View>
            )}
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
      <ExpandableRow
        label={open ? 'Hide nutrition breakdown' : NUTRITION_BREAKDOWN_LABEL}
        accessibilityLabel={NUTRITION_BREAKDOWN_LABEL}
        expanded={open}
        onPress={() => setOpen((value) => !value)}
      />
      {open ? <MealNutrientBars bars={bars} /> : null}
    </View>
  );
}
