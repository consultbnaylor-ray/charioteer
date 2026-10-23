import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { SIGN_IN_FIRST } from '@/domain/errors';
import {
  APPLE_HEALTH_CONSENT,
  APPLE_HEALTH_DENIED,
  APPLE_HEALTH_DETAILS,
  APPLE_HEALTH_INTRO,
  APPLE_HEALTH_TURN_ON,
  APPLE_HEALTH_UNAVAILABLE,
  APPLE_HEALTH_WEB,
  appleHealthStatusLine,
  appleHealthUpdatedLine,
  healthCardState,
  type AppleHealthAccess,
} from '@/health/connection';
import { HEALTH_MISSING_DETAIL, HEALTH_VISIBILITY_TITLE, type HealthMissingReading } from '@/domain/healthVisibility';
import { PlanTick } from '@/ui/PlanTick';
import { useAppTheme } from '@/ui/theme';
import { Button, Card, ErrorNote, T } from '@/ui/ui';

export function AppleHealthCard({
  consent,
  ios,
  access,
  syncedAt,
  gaps,
  pending,
  updatedAt,
  refreshError,
  turnOnNote,
  onSignIn,
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
  gaps: readonly HealthMissingReading[];
  pending: boolean;
  updatedAt: string | null;
  refreshError: string | null;
  turnOnNote: string | null;
  onSignIn: () => void;
  onConnect: () => void;
  onManage: () => void;
  onSettings: () => void;
  onPrivacy: () => void;
  onSee: () => void;
  onTurnOn: () => Promise<void>;
}) {
  const theme = useAppTheme();
  const [details, setDetails] = useState(false);
  const [missingOpen, setMissingOpen] = useState(false);
  const [asking, setAsking] = useState(false);
  const state = healthCardState({ consent, ios, access, syncedAt });
  const line = appleHealthStatusLine({
    consent,
    ios,
    access,
    syncedAt,
    missingTitles: gaps.map((gap) => gap.title),
  });
  const link = {
    minHeight: 44,
    justifyContent: 'center' as const,
    paddingRight: 12,
  };

  return (
    <Card>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
        <Pressable
          accessibilityRole={gaps.length ? 'button' : 'text'}
          accessibilityLabel={line}
          accessibilityState={gaps.length ? { expanded: missingOpen } : undefined}
          disabled={!gaps.length}
          onPress={() => setMissingOpen((value) => !value)}
          style={{ flexGrow: 1, flexShrink: 1, minWidth: 180, minHeight: 44, justifyContent: 'center' }}
        >
          <T style={{ fontFamily: theme.font.bodyStrong }}>{line}</T>
        </Pressable>
      </View>
      {gaps.length ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={HEALTH_MISSING_DETAIL}
          accessibilityState={{ expanded: missingOpen }}
          onPress={() => setMissingOpen((value) => !value)}
          style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
        >
          <T style={{ fontFamily: theme.font.bodyStrong }}>{HEALTH_MISSING_DETAIL}</T>
          <T variant="muted">{missingOpen ? 'Hide' : 'Show'}</T>
        </Pressable>
      ) : null}
      {missingOpen && gaps.length ? (
        <View style={{ gap: 8 }}>
          {gaps.map((gap) => (
            <T key={gap.type}>{gap.line}</T>
          ))}
        </View>
      ) : null}
      {updatedAt ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <PlanTick done />
          <T>{appleHealthUpdatedLine(updatedAt)}</T>
        </View>
      ) : null}
      <ErrorNote>{refreshError}</ErrorNote>
      {refreshError === SIGN_IN_FIRST ? <Button label="Sign in" onPress={onSignIn} /> : null}
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
