import { useState } from 'react';
import { Switch, View } from 'react-native';

import { useRepository, useSnapshot } from '@/data';
import { shownError } from '@/domain/errors';
import { offerMessageNotifications } from '@/notifications/register';
import { IosNotificationOffRow } from '@/ui/IosNotificationOffRow';
import { useAppTheme } from '@/ui/theme';
import { Card, ErrorNote, Screen, T } from '@/ui/ui';
import { GENERIC_MESSAGE_ALERT } from '../../../supabase/functions/_shared/messagePush';

export default function NotificationsScreen() {
  const snap = useSnapshot();
  const repo = useRepository();
  const theme = useAppTheme();
  const profile = snap.profile;
  const [error, setError] = useState<string | null>(null);

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
              void repo.saveConsents({
                communityVisible: profile.communityVisible,
                consentHealth: profile.consentHealth,
                consentAi: profile.consentAi,
                messageNotifications: value,
                termsAccepted: true,
              }).then(() => {
                if (value) void offerMessageNotifications(repo).catch((error: unknown) => console.error('message notifications', error));
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
        <IosNotificationOffRow />
      </Card>
    </Screen>
  );
}
