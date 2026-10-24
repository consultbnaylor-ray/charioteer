import { useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useAppTheme } from '@/ui/theme';
import { T } from '@/ui/ui';

/**
 * One disclosure for a longer explanation.
 * A short summary, when there is one, stays on screen so a disclaimer is not hidden.
 */
export function MoreInfo({
  about,
  children,
  summary,
  open,
  onToggle,
}: {
  /** Spoken subject, as in “More info about steps”. */
  about: string;
  children: ReactNode;
  /** Always visible. Use this for a line that must not be hidden. */
  summary?: ReactNode;
  open?: boolean;
  onToggle?: () => void;
}) {
  const theme = useAppTheme();
  const [localOpen, setLocalOpen] = useState(false);
  const expanded = open ?? localOpen;
  const label = expanded ? 'Less info' : 'More info';

  function toggle() {
    if (onToggle) onToggle();
    else setLocalOpen((current) => !current);
  }

  return (
    <View style={{ alignSelf: 'stretch', gap: 4 }}>
      {summary ? (
        <View style={{ gap: 4 }}>
          {typeof summary === 'string' ? <T variant="muted">{summary}</T> : summary}
        </View>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label} about ${about}`}
        accessibilityState={{ expanded }}
        onPress={toggle}
        style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
      >
        <T
          style={{
            fontFamily: theme.font.bodyStrong,
            fontSize: 15 * theme.scale,
            lineHeight: 22 * theme.scale,
            textDecorationLine: 'underline',
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
            <Path d="M6 9l6 6 6-6" stroke={theme.colors.ink} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </View>
      </Pressable>
      {expanded ? <View style={{ gap: 8, paddingBottom: 4 }}>{children}</View> : null}
    </View>
  );
}
