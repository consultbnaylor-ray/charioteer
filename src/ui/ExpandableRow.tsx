import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Pressable, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useReduceMotion } from '@/ui/gridChrome';
import { radius, stroke, useAppTheme } from '@/ui/theme';
import { T } from '@/ui/ui';

/** Down while closed. A half turn points it up. */
const CHEVRON = 'M6 9l6 6 6-6';

/**
 * A row that opens in place.
 * The chevron sits on the right, the whole row is the button, and a press tints the row.
 */
export function ExpandableRow({
  label,
  accessibilityLabel,
  expanded,
  onPress,
  hint,
  children,
  variant = 'outline',
}: {
  label: string;
  /** Spoken name. Defaults to the visible label. */
  accessibilityLabel?: string;
  expanded: boolean;
  onPress: () => void;
  /** A short word beside the chevron, such as Show. The chevron stays either way. */
  hint?: string;
  /** Extra content inside the tap target, under the title. */
  children?: ReactNode;
  /** An outline reads as a control. A divider suits a stacked list. */
  variant?: 'outline' | 'divider';
}) {
  const theme = useAppTheme();
  const outlined = variant === 'outline';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ expanded }}
      aria-expanded={expanded}
      onPress={onPress}
      style={({ pressed }) => ({
        alignSelf: 'stretch',
        minHeight: 44,
        justifyContent: 'center',
        gap: 6,
        paddingHorizontal: outlined ? 12 : 0,
        paddingVertical: 10,
        borderWidth: outlined ? stroke.control : 0,
        borderBottomWidth: outlined ? stroke.control : 1,
        borderColor: theme.colors.line,
        borderRadius: outlined ? radius.md : 0,
        backgroundColor: pressed ? theme.colors.emphasisSoft : 'transparent',
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <T style={{ flex: 1, fontFamily: theme.font.bodyStrong }}>{label}</T>
        {hint ? <T variant="muted">{hint}</T> : null}
        <DisclosureChevron expanded={expanded} color={theme.colors.ink} />
      </View>
      {children}
    </Pressable>
  );
}

function DisclosureChevron({ expanded, color }: { expanded: boolean; color: string }) {
  const reduce = useReduceMotion();
  const turn = useRef(new Animated.Value(expanded ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(turn, {
      toValue: expanded ? 1 : 0,
      duration: reduce ? 0 : 160,
      useNativeDriver: true,
    }).start();
  }, [expanded, reduce, turn]);
  const rotate = turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: 18, height: 18, flexShrink: 0, transform: [{ rotate }] }}
    >
      <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
        <Path d={CHEVRON} stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </Animated.View>
  );
}
