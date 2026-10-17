import { Image } from 'expo-image';
import { useEffect, useState, type ReactNode, type RefObject } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import {
  TODAY_MEALS_EMPTY,
  mealChartStartsOpen,
  todayMealTotalLine,
  todayMealsNeedCollapse,
  type LoggedProteinRing,
  type TodayMealRow,
  type TodayMealTotals,
  type TodayRing,
} from '@/domain/nutrition';
import { MealBreakdown } from '@/ui/MealNutrientBars';
import { useAppTheme } from '@/ui/theme';
import { T } from '@/ui/ui';

function MonoRing({ fill }: { fill: number }) {
  const theme = useAppTheme();
  const ring = 56;
  const stroke = 6;
  const radius = (ring - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const shown = Math.max(0, Math.min(1, fill));
  const mid = ring / 2;
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: ring, height: ring }}>
      <Svg width={ring} height={ring}>
        <Circle cx={mid} cy={mid} r={radius} stroke={theme.colors.line} strokeWidth={stroke} fill="none" />
        {shown > 0 ? (
          <Circle
            cx={mid}
            cy={mid}
            r={radius}
            stroke={theme.colors.ink}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${circumference * shown} ${circumference}`}
            transform={`rotate(-90 ${mid} ${mid})`}
          />
        ) : null}
      </Svg>
    </View>
  );
}

/** Ink tick beside "Protein target met". The words already name it. */
function ProteinTick() {
  const theme = useAppTheme();
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 22, height: 22 }}>
      <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
        <Path d="M5 12.5 9.2 16.7 19 7" stroke={theme.colors.ink} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </Svg>
    </View>
  );
}

function RingLine({ fill, status, tick }: { fill: number; status: string; tick: boolean }) {
  return (
    <View
      accessible
      accessibilityLabel={status}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexGrow: 1, flexShrink: 1, flexBasis: '46%', minWidth: 200 }}
    >
      <MonoRing fill={fill} />
      {tick ? <ProteinTick /> : null}
      <T style={{ flex: 1 }}>{status}</T>
    </View>
  );
}

export function TodayMeals({
  rows,
  totals,
  hideCalories,
  ring,
  protein = null,
  activeId,
  onOpen,
  activeTools,
  highlightId,
  rowRef,
  bare = false,
}: {
  rows: readonly TodayMealRow[];
  totals: TodayMealTotals;
  hideCalories: boolean;
  ring: TodayRing | null;
  /** Protein still to eat, using the same target as the day bar. */
  protein?: LoggedProteinRing | null;
  activeId: string | null;
  onOpen: (id: string) => void;
  activeTools: ReactNode;
  highlightId?: string | null;
  rowRef?: RefObject<View | null>;
  /** The day row already opens and closes this list. */
  bare?: boolean;
}) {
  const theme = useAppTheme();
  const [open, setOpen] = useState(false);
  const long = !bare && todayMealsNeedCollapse(rows.length);
  const pinned = highlightId != null && rows.some((row) => row.id === highlightId);
  const shown = rows.length > 0 && (!long || open || pinned);
  useEffect(() => {
    if (pinned) setOpen(true);
  }, [pinned]);
  const total = rows.length > 0 ? todayMealTotalLine(totals, hideCalories) : '';
  return (
    <View style={{ gap: 8 }}>
      {bare ? null : long ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={open ? "Hide today's meals" : "Show today's meals"}
          onPress={() => setOpen((value) => !value)}
          style={{ minHeight: 44, justifyContent: 'center' }}
        >
          <T variant="label">{open ? "Hide today's meals" : `Today's meals · ${rows.length}`}</T>
        </Pressable>
      ) : (
        <T variant="label">Today's meals</T>
      )}
      {!bare && rows.length === 0 ? <T variant="muted">{TODAY_MEALS_EMPTY}</T> : null}
      {total ? <T>{total}</T> : null}
      {ring || protein ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
          {ring ? <RingLine fill={ring.fill} status={ring.status} tick={false} /> : null}
          {protein ? <RingLine fill={protein.fill} status={protein.status} tick={protein.met} /> : null}
        </View>
      ) : null}
      {shown ? rows.map((row, index) => {
        const kcal = hideCalories ? '' : ` · ${row.kcal.toLocaleString('en-GB')} kcal`;
        const justSaved = row.id === highlightId;
        return (
          <View
            key={row.id}
            ref={justSaved ? rowRef : undefined}
            nativeID={justSaved ? 'saved-meal-row' : undefined}
            collapsable={false}
            style={{ gap: 6, borderTopWidth: 1, borderTopColor: theme.colors.line, paddingTop: 8 }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${row.typeLabel}, ${row.name}${kcal}`}
              onPress={() => onOpen(row.id)}
              style={{ minHeight: 44, justifyContent: 'center', gap: 6 }}
            >
              {row.previewUrl ? (
                <Image
                  source={{ uri: row.previewUrl }}
                  style={{ width: 96, height: 96, borderRadius: 10 }}
                  contentFit="cover"
                  accessibilityLabel="Saved meal photo"
                />
              ) : null}
              <T>{`${row.typeLabel} · ${row.name}${kcal}`}</T>
            </Pressable>
            <MealBreakdown bars={row.bars} startOpen={mealChartStartsOpen(index, rows.length)} />
            {activeId === row.id ? activeTools : null}
          </View>
        );
      }) : null}
    </View>
  );
}
