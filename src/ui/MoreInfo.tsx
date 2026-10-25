import { useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { statsToneColors } from '@/ui/statsPalette';
import { radius, stroke, useAppTheme } from '@/ui/theme';
import { T } from '@/ui/ui';

/**
 * The shared More info control.
 * Outlined pill, bright green ink, 44pt target. It expands in place.
 */
export function MoreInfoButton({
  label,
  expanded = false,
  accessibilityLabel,
  onPress,
}: {
  label: string;
  expanded?: boolean;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  const theme = useAppTheme();
  const green = statsToneColors(theme.scheme).good.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ expanded }}
      onPress={onPress}
      style={{
        minHeight: 44,
        alignSelf: 'stretch',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderWidth: stroke.control,
        borderColor: theme.colors.ink,
        borderRadius: radius.md,
        backgroundColor: 'transparent',
      }}
    >
      <T
        style={{
          color: green,
          fontFamily: theme.font.bodyStrong,
          fontSize: 16 * theme.scale,
          lineHeight: 22 * theme.scale,
        }}
      >
        {label}
      </T>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }}
      >
        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
          <Path d="M6 9l6 6 6-6" stroke={green} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </View>
    </Pressable>
  );
}

export function MoreInfo({
  about,
  children,
  summary,
  open,
  onToggle,
  title,
}: {
  /** Spoken subject, as in “More info about steps”. */
  about: string;
  children: ReactNode;
  /** Always visible. Use this for a line that must not be hidden. */
  summary?: ReactNode;
  open?: boolean;
  onToggle?: () => void;
  /**
   * A fixed name, such as “Apple Watch info”.
   * It stays put when open, so two source buttons are not both called Less info.
   */
  title?: string;
}) {
  const [localOpen, setLocalOpen] = useState(false);
  const expanded = open ?? localOpen;
  const label = title ?? (expanded ? 'Less info' : 'More info');
  const spoken = title
    ? `${title}, ${expanded ? 'expanded' : 'collapsed'}`
    : `${label} about ${about}`;

  function toggle() {
    if (onToggle) onToggle();
    else setLocalOpen((current) => !current);
  }

  return (
    <View style={{ alignSelf: 'stretch', gap: 8 }}>
      {summary ? (
        <View style={{ gap: 4 }}>
          {typeof summary === 'string' ? <T variant="muted">{summary}</T> : summary}
        </View>
      ) : null}
      <MoreInfoButton label={label} expanded={expanded} accessibilityLabel={spoken} onPress={toggle} />
      {expanded ? <View style={{ gap: 8, paddingBottom: 4 }}>{children}</View> : null}
    </View>
  );
}
