import { useState } from 'react';
import { Pressable, View } from 'react-native';

import {
  APPLE_HEALTH_CONSENT,
  APPLE_HEALTH_DENIED,
  APPLE_HEALTH_DETAILS,
  APPLE_HEALTH_INTRO,
  APPLE_HEALTH_REFRESH,
  APPLE_HEALTH_TURN_ON,
  APPLE_HEALTH_UNAVAILABLE,
  APPLE_HEALTH_UPDATED,
  APPLE_HEALTH_WEB,
  appleHealthStatusLine,
  healthCardState,
  type AppleHealthAccess,
} from '@/health/connection';
import { HEALTH_VISIBILITY_TITLE } from '@/domain/healthVisibility';
import { PlanTick } from '@/ui/PlanTick';
import { useAppTheme } from '@/ui/theme';
import { Button, Card, ErrorNote, T } from '@/ui/ui';

export function AppleHealthCard({
  consent,
  ios,
  access,
  syncedAt,
  missing,
  pending,
  updated,
  refreshError,
  turnOnNote,
  onRefresh,
  onConnect,
  onManage,
  onSettings,
  onPrivacy,
  onSee,
  onTurnOn,
}: {
  consent: boolean;
  ios: boolean;
  access: AppleHealthAccess | null;
  syncedAt: string | null;
  missing: boolean;
  pending: boolean;
  updated: boolean;
  refreshError: string | null;
  turnOnNote: string | null;
  onRefresh: () => void;
  onConnect: () => void;
  onManage: () => void;
  onSettings: () => void;
  onPrivacy: () => void;
  onSee: () => void;
  onTurnOn: () => Promise<void>;
}) {
  const theme = useAppTheme();
  const [details, setDetails] = useState(false);
  const [asking, setAsking] = useState(false);
  const state = healthCardState({ consent, ios, access, syncedAt });
  const line = appleHealthStatusLine({ consent, ios, access, syncedAt, missing });
  const link = {
    minHeight: 44,
    justifyContent: 'center' as const,
    paddingRight: 12,
  };

  return (
    <Card>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
        <T style={{ flexGrow: 1, flexShrink: 1, minWidth: 180, fontFamily: theme.font.bodyStrong }}>{line}</T>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={pending ? 'Refreshing' : APPLE_HEALTH_REFRESH}
          accessibilityState={{ disabled: pending }}
          disabled={pending}
          onPress={onRefresh}
          style={{
            minHeight: 44,
            justifyContent: 'center',
            paddingHorizontal: 14,
            borderWidth: 1,
            borderColor: theme.colors.ink,
            borderRadius: theme.radius.md,
            backgroundColor: theme.colors.surface,
            opacity: pending ? 0.45 : 1,
          }}
        >
          <T style={{ fontFamily: theme.font.bodyStrong }}>{pending ? 'Refreshing' : APPLE_HEALTH_REFRESH}</T>
        </Pressable>
      </View>
      {updated ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <PlanTick done />
          <T>{APPLE_HEALTH_UPDATED}</T>
        </View>
      ) : null}
      <ErrorNote>{refreshError}</ErrorNote>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }}>
        <Pressable accessibilityRole="link" accessibilityLabel={HEALTH_VISIBILITY_TITLE} onPress={onSee} style={link}>
          <T style={{ textDecorationLine: 'underline' }}>{HEALTH_VISIBILITY_TITLE}</T>
        </Pressable>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={asking ? 'Asking Apple Health' : APPLE_HEALTH_TURN_ON}
          disabled={asking}
          onPress={() => {
            setAsking(true);
            void onTurnOn().finally(() => setAsking(false));
          }}
          style={link}
        >
          <T style={{ textDecorationLine: 'underline' }}>{asking ? 'Asking Apple Health' : APPLE_HEALTH_TURN_ON}</T>
        </Pressable>
      </View>
      {turnOnNote ? <T>{turnOnNote}</T> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={APPLE_HEALTH_DETAILS}
        accessibilityState={{ expanded: details }}
        onPress={() => setDetails((value) => !value)}
        style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
      >
        <T style={{ fontFamily: theme.font.bodyStrong }}>{APPLE_HEALTH_DETAILS}</T>
        <T variant="muted">{details ? 'Hide' : 'Show'}</T>
      </Pressable>
      {details ? (
        <View style={{ gap: 8 }}>
          {state.kind === 'consent' ? (
            <>
              <T>{APPLE_HEALTH_CONSENT}</T>
              <Button label="Turn on health data" onPress={onPrivacy} />
            </>
          ) : null}
          {state.kind === 'web' ? <T>{APPLE_HEALTH_WEB}</T> : null}
          {state.kind === 'checking' || state.kind === 'prompt' || state.kind === 'connected' ? <T>{APPLE_HEALTH_INTRO}</T> : null}
          {state.kind === 'prompt' ? (
            <Button label="Connect Apple Health" pending={pending} onPress={onConnect} />
          ) : null}
          {state.kind === 'connected' ? (
            <Pressable
              accessibilityRole="link"
              accessibilityLabel="Manage in Health app"
              onPress={onManage}
              style={link}
            >
              <T style={{ textDecorationLine: 'underline' }}>Manage in Health app</T>
            </Pressable>
          ) : null}
          {state.kind === 'denied' ? (
            <>
              <T>{APPLE_HEALTH_DENIED}</T>
              <Button label="Open Settings" onPress={onSettings} />
            </>
          ) : null}
          {state.kind === 'unavailable' ? <T>{APPLE_HEALTH_UNAVAILABLE}</T> : null}
        </View>
      ) : null}
    </Card>
  );
}
