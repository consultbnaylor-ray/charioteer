import { Pressable } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { useAppTheme } from '@/ui/theme';

export const SHOW_MY_LOCATION = 'Show my location';

/** A target control on the map. It does not ask for a route. */
export function ShowMyLocationButton({
  onPress,
  pending,
}: {
  onPress: () => void;
  pending?: boolean;
}) {
  const theme = useAppTheme();
  const ink = theme.scheme === 'dark' ? '#F3F3EE' : '#121212';
  const fill = theme.scheme === 'dark' ? '#1C1C1C' : '#FFFFFF';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={SHOW_MY_LOCATION}
      accessibilityState={{ disabled: Boolean(pending), busy: Boolean(pending) }}
      disabled={Boolean(pending)}
      onPress={onPress}
      style={{
        position: 'absolute',
        top: 8,
        right: 8,
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: fill,
        borderWidth: 1,
        borderColor: ink,
        opacity: pending ? 0.45 : 1,
        zIndex: 2,
      }}
    >
      <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" accessibilityElementsHidden>
        <Path d="M12 2.5v3.2M12 18.3v3.2M2.5 12h3.2M18.3 12h3.2" stroke={ink} strokeWidth={1.8} strokeLinecap="round" />
        <Circle cx={12} cy={12} r={4.2} stroke={ink} strokeWidth={1.8} />
        <Circle cx={12} cy={12} r={1.4} fill={ink} />
      </Svg>
    </Pressable>
  );
}
