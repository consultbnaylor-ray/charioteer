import { useEffect, useState, type ReactNode, type RefObject } from 'react';
import { Pressable, View } from 'react-native';

import type { MealDayGroup } from '@/domain/nutrition';
import { MealNutrientBars } from '@/ui/MealNutrientBars';
import { useAppTheme } from '@/ui/theme';
import { T } from '@/ui/ui';

/**
 * One compact row per day. Today starts open, and so does the day just saved.
 * Other earlier days start closed, with the same Show and Hide control.
 */
export function MealDayList({
  groups,
  pinnedDay,
  anchorRef,
  renderMeals,
}: {
  groups: readonly MealDayGroup[];
  pinnedDay?: string | null;
  anchorRef?: RefObject<View | null>;
  renderMeals: (group: MealDayGroup) => ReactNode;
}) {
  if (!groups.length) return null;
  return (
    <View style={{ gap: 12 }}>
      {groups.map((group) => (
        <MealDay
          key={group.day}
          group={group}
          pinned={pinnedDay === group.day}
          anchorRef={pinnedDay === group.day ? anchorRef : undefined}
        >
          {renderMeals(group)}
        </MealDay>
      ))}
    </View>
  );
}

function MealDay({
  group,
  pinned,
  anchorRef,
  children,
}: {
  group: MealDayGroup;
  pinned: boolean;
  anchorRef?: RefObject<View | null>;
  children: ReactNode;
}) {
  const theme = useAppTheme();
  const [open, setOpen] = useState(group.isToday || pinned);
  useEffect(() => {
    if (pinned) setOpen(true);
  }, [pinned]);
  return (
    <View ref={anchorRef} nativeID={`meal-day-${group.day}`} collapsable={false} style={{ gap: 8 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${group.heading}. ${open ? 'Hide' : 'Show'}`}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        style={{ minHeight: 44, justifyContent: 'center', gap: 6 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <T style={{ fontFamily: theme.font.bodyStrong, flex: 1 }}>{group.heading}</T>
          <T variant="muted">{open ? 'Hide' : 'Show'}</T>
        </View>
        <MealNutrientBars bars={group.bars} />
      </Pressable>
      {open ? <View style={{ gap: 8 }}>{children}</View> : null}
    </View>
  );
}
