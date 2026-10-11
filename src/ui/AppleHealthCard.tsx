import { Pressable } from 'react-native';

import {
  APPLE_HEALTH_CONSENT,
  APPLE_HEALTH_DENIED,
  APPLE_HEALTH_INTRO,
  APPLE_HEALTH_UNAVAILABLE,
  APPLE_HEALTH_WEB,
  healthCardState,
  type AppleHealthAccess,
} from '@/health/connection';
import { Button, Card, T } from '@/ui/ui';

export function AppleHealthCard({
  consent,
  ios,
  access,
  syncedAt,
  pending,
  onConnect,
  onSync,
  onManage,
  onSettings,
  onPrivacy,
}: {
  consent: boolean;
  ios: boolean;
  access: AppleHealthAccess | null;
  syncedAt: string | null;
  pending: boolean;
  onConnect: () => void;
  onSync: () => void;
  onManage: () => void;
  onSettings: () => void;
  onPrivacy: () => void;
}) {
  const state = healthCardState({ consent, ios, access, syncedAt });
  return (
    <Card>
      <T variant="label">Apple Health</T>
      {state.kind === 'consent' ? (
        <>
          <T>{APPLE_HEALTH_CONSENT}</T>
          <Button label="Turn on health data" onPress={onPrivacy} />
        </>
      ) : null}
      {state.kind === 'web' ? <T>{APPLE_HEALTH_WEB}</T> : null}
      {state.kind === 'checking' || state.kind === 'prompt' ? <T>{APPLE_HEALTH_INTRO}</T> : null}
      {state.kind === 'prompt' ? (
        <Button label="Connect Apple Health" pending={pending} onPress={onConnect} />
      ) : null}
      {state.kind === 'connected' ? (
        <>
          <T>{state.line}</T>
          <Button label="Sync now" pending={pending} onPress={onSync} />
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Manage in Health app"
            onPress={onManage}
            style={{ minHeight: 44, justifyContent: 'center' }}
          >
            <T>Manage in Health app</T>
          </Pressable>
        </>
      ) : null}
      {state.kind === 'denied' ? (
        <>
          <T>{APPLE_HEALTH_DENIED}</T>
          <Button label="Open Settings" onPress={onSettings} />
        </>
      ) : null}
      {state.kind === 'unavailable' ? <T>{APPLE_HEALTH_UNAVAILABLE}</T> : null}
    </Card>
  );
}
