import { useRouter } from 'expo-router';

import { creditUpgradeLabel } from '@/domain/aiCredits';
import type { AiGateNotice } from '@/domain/aiGate';
import { useEntitlement } from '@/ui/useEntitlement';
import { Button, Card, T } from '@/ui/ui';

function shownMessage(message: string, comp: boolean): string {
  if (!comp) return message;
  return message.replace(/\s*Upgrade to [^.]+\./g, '').trim();
}

/**
 * A calm limit or subscription note. The button opens the paywall even when
 * the build flag is off, so a TestFlight build reaches the same screen.
 */
export function AiLimitCard({ notice, onClose }: { notice: AiGateNotice; onClose?: () => void }) {
  const router = useRouter();
  const entitlement = useEntitlement();
  const label = entitlement.comp || entitlement.compLoading
    ? null
    : notice.code === 'subscription_required' ? 'See plans' : creditUpgradeLabel(notice.tier);
  return (
    <Card>
      <T>{shownMessage(notice.message, entitlement.comp != null)}</T>
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
