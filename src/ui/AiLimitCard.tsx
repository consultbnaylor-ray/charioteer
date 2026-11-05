import { useRouter } from 'expo-router';

import { creditUpgradeLabel } from '@/domain/aiCredits';
import type { AiGateNotice } from '@/domain/aiGate';
import { Button, Card, T } from '@/ui/ui';

/**
 * A calm limit or subscription note. The button opens the paywall even when
 * the build flag is off, so a TestFlight build reaches the same screen.
 */
export function AiLimitCard({ notice, onClose }: { notice: AiGateNotice; onClose?: () => void }) {
  const router = useRouter();
  const label = notice.code === 'subscription_required' ? 'See plans' : creditUpgradeLabel(notice.tier);
  return (
    <Card>
      <T>{notice.message}</T>
      {label ? (
        <Button
          label={label}
          onPress={() => {
            onClose?.();
            router.push('/paywall' as never);
          }}
        />
      ) : null}
    </Card>
  );
}
