import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform } from 'react-native';

import { useEntitlement } from '@/ui/useEntitlement';
import { paywallEnabled, subscriptionStatusLabel } from '@/domain/subscription';
import { Button, Card, T } from '@/ui/ui';

/** Profile row. Hidden unless the paywall build flag is on. */
export function SubscriptionRow() {
  const entitlement = useEntitlement();
  const router = useRouter();
  const [note, setNote] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  if (!paywallEnabled()) return null;

  async function manage() {
    if (Platform.OS !== 'ios') {
      setNote('Manage the subscription in Settings > Apple ID > Subscriptions on your iPhone.');
      return;
    }
    setPending(true);
    setNote(null);
    try {
      const iap = await import('expo-iap');
      await iap.initConnection();
      try {
        await iap.showManageSubscriptionsIOS();
      } catch {
        await iap.deepLinkToSubscriptions({});
      }
    } catch {
      setNote('Could not open subscription settings.');
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <T variant="label">Subscription</T>
      <T>{subscriptionStatusLabel(entitlement.row)}</T>
      <Button label="Change plan" tone="quiet" onPress={() => router.push('/paywall' as never)} />
      <Button label="Manage subscription" tone="quiet" pending={pending} onPress={() => void manage()} />
      {note ? <T variant="muted">{note}</T> : null}
    </Card>
  );
}
