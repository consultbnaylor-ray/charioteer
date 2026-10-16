import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';

import { useRepository } from '@/data';
import { offerMessageNotifications } from '@/notifications/register';
import { markMessagePromptSeen, messagePromptSeen } from '@/ui/messagePromptStore';
import { Button, Card, T } from '@/ui/ui';
import { GENERIC_MESSAGE_ALERT } from '../../supabase/functions/_shared/messagePush';

/**
 * Once, on the first signed-in launch, before the system permission sheet.
 * Allow then asks iOS. Not now does not.
 */
export function MessageNotificationPrompt({ userId }: { userId: string }) {
  const repo = useRepository();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;
    let live = true;
    void (async () => {
      if (await messagePromptSeen(userId)) return;
      try {
        const Notifications = await import('expo-notifications');
        const existing = await Notifications.getPermissionsAsync();
        if (!live) return;
        if (existing.status === 'granted' || existing.status === 'denied') {
          await markMessagePromptSeen(userId);
          return;
        }
        setShow(true);
      } catch (error: unknown) {
        console.error('message notifications', error);
      }
    })();
    return () => {
      live = false;
    };
  }, [userId]);

  if (!show) return null;

  function dismiss() {
    setShow(false);
    void markMessagePromptSeen(userId);
  }

  return (
    <Card style={{ marginHorizontal: 16, marginTop: 12 }}>
      <T variant="label">{GENERIC_MESSAGE_ALERT}</T>
      <T>A private message can alert this phone. The alert does not include what they wrote.</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Button
          label="Allow notifications"
          onPress={() => {
            dismiss();
            void offerMessageNotifications(repo).catch((error: unknown) => console.error('message notifications', error));
          }}
        />
        <Button label="Not now" tone="quiet" onPress={dismiss} />
      </View>
    </Card>
  );
}
