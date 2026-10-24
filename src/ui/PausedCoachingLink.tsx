import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

import { PAUSED_COACHING_HREF, PAUSED_COACHING_LINK } from '@/domain/pausedCoaching';
import { useAppTheme } from '@/ui/theme';

/** Opens the temporary choice. The press does not change the switch. */
export function PausedCoachingLink() {
  const router = useRouter();
  const theme = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={PAUSED_COACHING_LINK}
      accessibilityHint="Opens Privacy and consent. It does not turn the choice on."
      onPress={() => router.push(PAUSED_COACHING_HREF as never)}
      style={{
        width: '100%',
        minHeight: 44,
        justifyContent: 'center',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.ink,
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radius.md,
        paddingHorizontal: 12,
        paddingVertical: 10,
      }}
    >
      <Text
        style={{
          fontFamily: theme.font.bodyStrong,
          fontSize: 15 * theme.scale,
          lineHeight: 20 * theme.scale,
          color: theme.colors.ink,
          textDecorationLine: 'underline',
        }}
      >
        {PAUSED_COACHING_LINK}
      </Text>
    </Pressable>
  );
}
