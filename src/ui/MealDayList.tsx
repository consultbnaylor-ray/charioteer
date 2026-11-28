import { useEffect, useState, type ReactNode, type RefObject } from 'react';
import { View } from 'react-native';

import type { MealDayGroup } from '@/domain/nutrition';
import { ExpandableRow } from '@/ui/ExpandableRow';
import { MealNutrientBars } from '@/ui/MealNutrientBars';

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
  const [open, setOpen] = useState(group.isToday || pinned);
  useEffect(() => {
    if (pinned) setOpen(true);
  }, [pinned]);
  return (
    <View ref={anchorRef} nativeID={`meal-day-${group.day}`} collapsable={false} style={{ gap: 8 }}>
      <ExpandableRow
        label={group.heading}
        accessibilityLabel={`${group.heading}. ${open ? 'Hide' : 'Show'}`}
        expanded={open}
        onPress={() => setOpen((value) => !value)}
        hint={open ? 'Hide' : 'Show'}
      >
        <MealNutrientBars bars={group.bars} />
      </ExpandableRow>
      {open ? <View style={{ gap: 8 }}>{children}</View> : null}
    </View>
  );
}
