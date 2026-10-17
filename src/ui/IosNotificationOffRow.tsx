import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, Platform, Pressable } from 'react-native';

import { useAppTheme } from '@/ui/theme';
import { T } from '@/ui/ui';

export const NOTIFICATIONS_OFF_LINE = 'Notifications are off for Charioteer — Open Settings';

/** iOS only. Denied means the system will not show the permission sheet again. */
async function iosNotificationsDenied(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try {
    const Notifications = await import('expo-notifications');
    const existing = await Notifications.getPermissionsAsync();
    return existing.status === 'denied';
  } catch {
    return false;
  }
}

/** A row that opens this app's page in iOS Settings. */
export function IosNotificationOffRow() {
  const theme = useAppTheme();
  const [denied, setDenied] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      void iosNotificationsDenied().then((next) => {
        if (live) setDenied(next);
      });
      return () => {
        live = false;
      };
    }, []),
  );

  if (!denied) return null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={NOTIFICATIONS_OFF_LINE}
      onPress={() => void Linking.openSettings()}
      style={{ minHeight: 44, justifyContent: 'center', paddingVertical: 6 }}
    >
      <T style={{ color: theme.colors.ink }}>{NOTIFICATIONS_OFF_LINE}</T>
    </Pressable>
  );
}
