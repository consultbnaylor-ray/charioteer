import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, Platform, Switch, View } from 'react-native';

import { useRepository, useSnapshot } from '@/data';
import { shownError } from '@/domain/errors';
import { offerMessageNotifications } from '@/notifications/register';
import { useAppTheme } from '@/ui/theme';
import { Button, Card, ErrorNote, Screen, T } from '@/ui/ui';
import { GENERIC_MESSAGE_ALERT } from '../../../supabase/functions/_shared/messagePush';

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

export default function NotificationsScreen() {
  const snap = useSnapshot();
  const repo = useRepository();
  const theme = useAppTheme();
  const profile = snap.profile;
  const [error, setError] = useState<string | null>(null);
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

  if (!profile) return null;

  return (
    <Screen
      eyebrow="Account"
      title="Notifications"
      intro="A private message can alert this phone. The alert does not include what they wrote."
    >
      <ErrorNote>{error}</ErrorNote>
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
          <T style={{ flex: 1 }}>Message notifications</T>
          <Switch
            accessibilityLabel="Message notifications"
            value={profile.messageNotifications}
            onValueChange={(value) => {
              setError(null);
              void repo.updateProfile({ messageNotifications: value }).then(() => {
                if (value) void offerMessageNotifications(repo);
              }).catch((err: unknown) => setError(shownError(err, 'Could not save.')));
            }}
            trackColor={{ true: theme.colors.ink, false: theme.colors.line }}
            thumbColor={theme.colors.surface}
          />
        </View>
        <T variant="muted">The same choice as Turn off Message Notifications in Edit profile.</T>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
          <T style={{ flex: 1 }}>Show sender's name</T>
          <Switch
            accessibilityLabel="Show sender's name"
            value={profile.notifySenderName}
            onValueChange={(value) => {
              setError(null);
              void repo.updateProfile({ notifySenderName: value }).catch((err: unknown) => setError(shownError(err, 'Could not save.')));
            }}
            trackColor={{ true: theme.colors.ink, false: theme.colors.line }}
            thumbColor={theme.colors.surface}
          />
        </View>
        <T variant="muted">Off, the alert says {GENERIC_MESSAGE_ALERT}.</T>
      </Card>
      {denied ? (
        <Button label="Open iOS Settings" onPress={() => void Linking.openSettings()} />
      ) : null}
    </Screen>
  );
}
