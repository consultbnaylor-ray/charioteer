import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { statsToneColors } from '@/ui/statsPalette';
import { useAppTheme } from '@/ui/theme';

const SIZE = 22;

/** Green only on the tick, and the tick is named Done. An open item is an empty circle. */
export function PlanTick({ done }: { done: boolean }) {
  const theme = useAppTheme();
  if (!done) {
    return (
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          width: SIZE,
          height: SIZE,
          borderRadius: SIZE / 2,
          borderWidth: 1.5,
          borderColor: theme.colors.ink,
        }}
      />
    );
  }
  const green = statsToneColors(theme.scheme).good.ink;
  return (
    <View accessibilityRole="image" accessibilityLabel="Done" style={{ width: SIZE, height: SIZE }}>
      <Svg width={SIZE} height={SIZE} viewBox="0 0 24 24" fill="none">
        <Path d="M5 12.5 9.2 16.7 19 7" stroke={green} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </Svg>
    </View>
  );
}
