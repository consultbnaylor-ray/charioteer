import { useRouter } from 'expo-router';

import { paywallEnabled } from '@/domain/subscription';
import type { AiGateNotice } from '@/domain/aiGate';
import { Button, Card, T } from '@/ui/ui';

/** A calm limit or subscription note, with a way to change plan when the paywall is on. */
export function AiLimitCard({ notice, onClose }: { notice: AiGateNotice; onClose?: () => void }) {
  const router = useRouter();
  const upgrade = paywallEnabled();
  return (
    <Card>
      <T>{notice.message}</T>
      {upgrade ? (
        <Button
          label={notice.code === 'subscription_required' ? 'See plans' : 'Upgrade'}
          onPress={() => {
            onClose?.();
            router.push('/paywall' as never);
          }}
        />
      ) : null}
    </Card>
  );
}
