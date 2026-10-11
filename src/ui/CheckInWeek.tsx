import { View } from 'react-native';

import type { CheckInDay } from '@/domain/checkIns';
import { useAppTheme } from '@/ui/theme';
import { T } from '@/ui/ui';

const BAR_MAX = 56;

export function CheckInWeek({ days }: { days: CheckInDay[] }) {
  const empty = days.every((day) => day.mood == null && day.craving == null);
  return (
    <View style={{ gap: 12 }}>
      <T variant="label">Recent check-ins</T>
      {empty ? (
        <T variant="muted">No check-ins in the last 7 days.</T>
      ) : (
        <>
          <Series label="Mood" max={5} days={days} pick={(day) => day.mood} />
          <Series label="Craving" max={10} days={days} pick={(day) => day.craving} />
        </>
      )}
    </View>
  );
}

function Series({
  label,
  max,
  days,
  pick,
}: {
  label: string;
  max: number;
  days: CheckInDay[];
  pick: (day: CheckInDay) => number | null;
}) {
  const theme = useAppTheme();
  return (
    <View accessibilityLabel={`${label} chart`} style={{ gap: 6 }}>
      <T variant="label">{label}</T>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
        {days.map((day) => {
          const value = pick(day);
          const missing = value == null;
          const ratio = missing ? 0 : Math.max(0, Math.min(1, value / max));
          const height = missing ? 2 : Math.max(4, Math.round(ratio * BAR_MAX));
          return (
            <View
              key={`${label}-${day.day}`}
              accessibilityLabel={missing ? `${label} ${day.label}, none` : `${label} ${day.label} ${value}`}
              style={{ width: `${100 / 7}%`, alignItems: 'center', gap: 4 }}
            >
              <T style={{ fontSize: 12 * theme.scale, lineHeight: 16 * theme.scale, color: theme.colors.muted }}>
                {missing ? '–' : String(value)}
              </T>
              <View
                style={{
                  width: 8,
                  height,
                  flexGrow: 0,
                  backgroundColor: missing ? theme.colors.line : theme.colors.ink,
                }}
              />
              <T style={{ fontSize: 11 * theme.scale, lineHeight: 14 * theme.scale, color: theme.colors.muted }}>{day.label}</T>
            </View>
          );
        })}
      </View>
    </View>
  );
}
