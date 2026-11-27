import { useRouter } from 'expo-router';

import { aiLimitButtonLabel } from '@/domain/aiCredits';
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
  const label = aiLimitButtonLabel(notice, { comp: entitlement.comp != null, compLoading: entitlement.compLoading });
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
      {onClose ? <Button label="Close" tone="quiet" onPress={onClose} /> : null}
    </Card>
  );
}
