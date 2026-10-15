import { Image } from 'expo-image';
import { useEffect, useState, type ReactNode, type RefObject } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import {
  TODAY_MEALS_EMPTY,
  todayMealTotalLine,
  todayMealsNeedCollapse,
  type TodayMealRow,
  type TodayMealTotals,
  type TodayRing,
} from '@/domain/nutrition';
import { useAppTheme } from '@/ui/theme';
import { T } from '@/ui/ui';

function MonoRing({ fill, label }: { fill: number; label: string }) {
  const theme = useAppTheme();
  const ring = 56;
  const stroke = 6;
  const radius = (ring - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const shown = Math.max(0, Math.min(1, fill));
  const mid = ring / 2;
  return (
    <View accessibilityLabel={label} style={{ width: ring, height: ring }}>
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

export function TodayMeals({
  rows,
  totals,
  hideCalories,
  ring,
  activeId,
  onOpen,
  activeTools,
  highlightId,
  rowRef,
}: {
  rows: readonly TodayMealRow[];
  totals: TodayMealTotals;
  hideCalories: boolean;
  ring: TodayRing | null;
  activeId: string | null;
  onOpen: (id: string) => void;
  activeTools: ReactNode;
  highlightId?: string | null;
  rowRef?: RefObject<View | null>;
}) {
  const theme = useAppTheme();
  const [open, setOpen] = useState(false);
  const long = todayMealsNeedCollapse(rows.length);
  const pinned = highlightId != null && rows.some((row) => row.id === highlightId);
  const shown = rows.length > 0 && (!long || open || pinned);
  useEffect(() => {
    if (pinned) setOpen(true);
  }, [pinned]);
  const total = rows.length > 0 ? todayMealTotalLine(totals, hideCalories) : '';
  return (
    <View style={{ gap: 8 }}>
      {long ? (
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
      {rows.length === 0 ? <T variant="muted">{TODAY_MEALS_EMPTY}</T> : null}
      {total ? <T>{total}</T> : null}
      {ring ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <MonoRing fill={ring.fill} label={ring.status} />
          <T style={{ flex: 1 }}>{ring.status}</T>
        </View>
      ) : null}
      {shown ? rows.map((row) => {
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
            {activeId === row.id ? activeTools : null}
          </View>
        );
      }) : null}
    </View>
  );
}
