import { useRouter } from 'expo-router';
import { useSyncExternalStore } from 'react';
import { Pressable } from 'react-native';

import { runningOutingKind, stopRunningOuting, subscribeOutingPresence } from '@/app/(main)/activity';
import { OUTING_IN_PROGRESS_LINE } from '@/domain/activitySession';
import { Button, Card, T } from '@/ui/ui';

/** Stays on Outside is Good and home while an outing is measuring. The sentence is not approved. */
export function OutingInProgressBanner() {
  const router = useRouter();
  const kind = useSyncExternalStore(subscribeOutingPresence, runningOutingKind, runningOutingKind);
  if (!kind) return null;
  return (
    <Card>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open the outing"
        onPress={() => router.push(`/activity?kind=${kind}` as never)}
      >
        <T>{OUTING_IN_PROGRESS_LINE}</T>
      </Pressable>
      <Button label="Stop" tone="quiet" onPress={() => { stopRunningOuting(); }} />
    </Card>
  );
}
