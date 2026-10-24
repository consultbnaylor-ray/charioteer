import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { STAT_ICON_PX, STAT_ICON_STROKE, type StatIcon } from '@/domain/statIcons';
import { useAppTheme } from '@/ui/theme';
import { T } from '@/ui/ui';

export { STAT_ICON_PX, STAT_ICON_STROKE, activityTitleIcon, healthTileIcon, workoutStatIcon, type StatIcon } from '@/domain/statIcons';

const pen = {
  fill: 'none' as const,
  strokeWidth: STAT_ICON_STROKE,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

/** A line icon. The row’s words stay the thing someone reads. */
export function StatGlyph({ name, color, label }: { name: StatIcon; color: string; label: string }) {
  return (
    <Svg
      width={STAT_ICON_PX}
      height={STAT_ICON_PX}
      viewBox="0 0 24 24"
      accessibilityRole="image"
      accessibilityLabel={label}
    >
      {name === 'ruler' ? <Path d="M4 15h16M7 15v-3M11 15v-2M15 15v-3M19 15v-2" stroke={color} {...pen} /> : null}
      {name === 'timer' ? (
        <>
          <Circle cx={12} cy={13} r={6.2} stroke={color} {...pen} />
          <Path d="M12 7.2V5.2M10 5.2h4M12 13V10" stroke={color} {...pen} />
        </>
      ) : null}
      {name === 'gauge' ? (
        <>
          <Path d="M5.5 16.5a7 7 0 1 1 13 0" stroke={color} {...pen} />
          <Path d="M12 16.2 15.2 11" stroke={color} {...pen} />
        </>
      ) : null}
      {name === 'heart' ? <Path d="M12 18.2C8.2 15 5.2 12.6 5.2 9.4a3.4 3.4 0 0 1 6.2-1.8 3.4 3.4 0 0 1 6.2 1.8c0 3.2-3 5.6-5.6 8.8z" stroke={color} {...pen} /> : null}
      {name === 'flame' ? <Path d="M12 19.2c-2.6 0-4.4-1.8-4.4-4.4 0-2 1.3-3.4 2.4-4.8.3 1.2 1 1.7 1.9 1.7.2-1.8 1-3.3 1.9-4.7 1.8 1.4 2.6 3.4 2.6 5.6 0 3.6-1.8 6.6-4.4 6.6z" stroke={color} {...pen} /> : null}
      {name === 'elevation' ? <Path d="M3.5 18 8 10.5 12 15l4-7.2L20.5 18" stroke={color} {...pen} /> : null}
      {name === 'run' ? (
        <>
          <Circle cx={14} cy={5.2} r={1.5} stroke={color} {...pen} />
          <Path d="M13.2 8.2 10.5 12.2 8 17.5M10.5 12.2 14.8 17.8M12.2 9.4 16.2 11.2 18 9" stroke={color} {...pen} />
        </>
      ) : null}
      {name === 'walk' ? (
        <>
          <Circle cx={13} cy={5.2} r={1.5} stroke={color} {...pen} />
          <Path d="M12.4 8 11.2 12.4 8.2 17.6M11.2 12.4 14.6 17.4M12 9.6 15.4 11" stroke={color} {...pen} />
        </>
      ) : null}
      {name === 'cycle' ? (
        <>
          <Circle cx={7.2} cy={16} r={2.6} stroke={color} {...pen} />
          <Circle cx={16.8} cy={16} r={2.6} stroke={color} {...pen} />
          <Path d="M7.2 16 11.2 9.6h4.2L16.8 16M11.2 9.6 9 13.2h5.2" stroke={color} {...pen} />
        </>
      ) : null}
      {name === 'row' ? (
        <>
          <Path d="M4 15.5Q12 19.2 20 15.5" stroke={color} {...pen} />
          <Path d="M6.5 8.5 16.5 14" stroke={color} {...pen} />
        </>
      ) : null}
      {name === 'swim' ? <Path d="M3.5 14q2.2-2.4 4.4 0t4.4 0 4.4 0 3.8 0M3.5 18q2.2-2.4 4.4 0t4.4 0 4.4 0 3.8 0" stroke={color} {...pen} /> : null}
      {name === 'strength' ? <Path d="M8.2 12h7.6M6.4 9.2v5.6M17.6 9.2v5.6M4.2 10.2v3.6M19.8 10.2v3.6" stroke={color} {...pen} /> : null}
      {name === 'yoga' ? (
        <>
          <Circle cx={12} cy={6.2} r={1.5} stroke={color} {...pen} />
          <Path d="M12 8.2v4.2M7.5 18.2Q12 12.4 16.5 18.2" stroke={color} {...pen} />
        </>
      ) : null}
      {name === 'hiit' ? <Path d="M13 4.2 8.4 12.6h3.6L10.6 19.8 16.8 10.6h-3.6L13 4.2z" stroke={color} {...pen} /> : null}
      {name === 'other' ? <Circle cx={12} cy={12} r={5.5} stroke={color} {...pen} /> : null}
      {name === 'steps' ? <Path d="M9.2 7.2c1.6 0 2.4 1.4 2 3.2S9.2 14.6 8 13.2 7.2 8.8 9.2 7.2zM14.6 11.2c1.4 0 2.2 1.2 1.8 2.8s-1.8 3.6-2.8 2.6-1.4-3.6.2-4.8c.4-.4.6-.6.8-.6z" stroke={color} {...pen} /> : null}
      {name === 'moon' ? <Path d="M14.6 5.2a6.2 6.2 0 1 0 0 13.2 5.2 5.2 0 0 1 0-13.2z" stroke={color} {...pen} /> : null}
      {name === 'pulse' ? <Path d="M3.5 12h3.4l2.1-5.2 3.2 10.4 2.1-5.2h6.2" stroke={color} {...pen} /> : null}
      {name === 'spo2' ? <Path d="M12 5.2C12 5.2 7.4 10.4 7.4 14a4.6 4.6 0 0 0 9.2 0c0-3.6-4.6-8.8-4.6-8.8z" stroke={color} {...pen} /> : null}
      {name === 'scale' ? <Path d="M7 18.2h10M8.2 18.2V10.2h7.6v8M12 10.2V7.2M9.2 7.2h5.6" stroke={color} {...pen} /> : null}
      {name === 'battery' ? <Path d="M8 7.2h8v11.2H8zM10 5.2h4V7" stroke={color} {...pen} /> : null}
      {name === 'stress' ? <Path d="M6 8.2h12M6 12h8M6 15.8h10" stroke={color} {...pen} /> : null}
      {name === 'body' ? (
        <>
          <Circle cx={12} cy={6} r={1.7} stroke={color} {...pen} />
          <Path d="M12 8.4v4.2M8.2 18.4Q12 12.6 15.8 18.4" stroke={color} {...pen} />
        </>
      ) : null}
      {name === 'glass' ? <Path d="M8 4.5h8l-1.6 6.8a3.2 3.2 0 0 1-4.8 0L8 4.5zM12 14.6V19M9.2 19.4h5.6" stroke={color} {...pen} /> : null}
      {name === 'day' ? (
        <>
          <Path d="M7 5.2h10v13.6H7z" stroke={color} {...pen} />
          <Path d="M7 8.6h10M10 4.2v2.2M14 4.2v2.2" stroke={color} {...pen} />
        </>
      ) : null}
    </Svg>
  );
}

/**
 * A heading with one icon in the same column as the stat rows.
 * No circle behind it. The words stay the heading.
 */
export function IconLabel({ name, children }: { name: StatIcon; children: string }) {
  const theme = useAppTheme();
  return (
    <View style={{ alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 32 }}>
      <View style={{ width: 28, alignItems: 'center', flexShrink: 0 }}>
        <StatGlyph name={name} color={theme.colors.muted} label={children} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <T variant="label">{children}</T>
      </View>
    </View>
  );
}

/**
 * Icon and words on one line. The icon column is fixed so numbers line up.
 * The icon does not grow with the text size. Nothing is drawn behind it.
 */
export function IconLine({
  name,
  label,
  muted = false,
  children,
}: {
  name: StatIcon;
  label: string;
  muted?: boolean;
  children: ReactNode;
}) {
  const theme = useAppTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 }}>
      <View style={{ width: 28, alignItems: 'center', flexShrink: 0 }}>
        <StatGlyph name={name} color={theme.colors.muted} label={label} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        {typeof children === 'string' ? <T variant={muted ? 'muted' : 'body'}>{children}</T> : children}
      </View>
    </View>
  );
}
