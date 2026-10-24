import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { useRepository, useSnapshot } from '@/data';
import {
  GARMIN_ASKED,
  GARMIN_CHECK_AGAIN,
  GARMIN_RECENT,
  garminHintLine,
  REFRESH_FAILED,
  SYNC_REFRESH,
  appleCheckIsFresh,
  garminAfterCheckLine,
  garminCheckCooling,
  garminCheckFoundNew,
  garminReceiptAdvanced,
  garminStoredMark,
  laterSyncClock,
  refreshCooling,
  syncAppleClause,
  syncStatusShowsRefresh,
  type GarminCheckView,
} from '@/domain/healthRefresh';
import { noteGarminRefreshRefused } from '@/domain/garminPermission';
import { GarminConnectNudge } from '@/ui/GarminConnectNudge';
import { GarminPermissionNotice } from '@/ui/GarminPermissionNotice';
import { refreshAppleHealth } from '@/health/catchUp';
import { reloadHealthSources } from '@/health/useHealthSources';
import { loadLastSynced } from '@/health/syncedAt';
import { PlanTick } from '@/ui/PlanTick';
import { useAppTheme } from '@/ui/theme';
import { ErrorNote, T } from '@/ui/ui';

let cooldownFrom: number | null = null;
let garminCheckFrom: number | null = null;

export function useManualHealthRefresh(garminConnected: boolean) {
  const repo = useRepository();
  const snap = useSnapshot();
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [garminNote, setGarminNote] = useState<string | null>(null);
  const [permission, setPermission] = useState(false);
  const [history, setHistory] = useState(false);
  const [appleCheckedAt, setAppleCheckedAt] = useState<string | null>(null);

  useEffect(() => {
    void loadLastSynced().then((stored) => {
      if (stored) setAppleCheckedAt(stored);
    }).catch(() => undefined);
  }, []);

  const run = useCallback(async () => {
    if (refreshing || refreshCooling(cooldownFrom, Date.now())) return;
    cooldownFrom = Date.now();
    setRefreshing(true);
    setError(null);
    setGarminNote(null);
    setPermission(false);
    setHistory(false);
    try {
      if (snap.profile?.consentHealth) {
        const apple = await refreshAppleHealth(repo, { authorize: false });
        if (!apple.ok) {
          setError(apple.message || REFRESH_FAILED);
        } else {
          setAppleCheckedAt(apple.syncedAt);
        }
      }
      if (garminConnected) {
        const garmin = await repo.refreshGarmin();
        if (garmin.code === 'history') {
          setHistory(true);
        } else if (!garmin.ok) {
          if (garmin.code === 'permission') {
            setPermission(true);
            noteGarminRefreshRefused(true);
          } else {
            setError(garmin.message);
          }
        } else if (garmin.garmin === 'asked') {
          noteGarminRefreshRefused(false);
          setGarminNote(GARMIN_ASKED);
        } else if (garmin.garmin === 'recent') {
          setGarminNote(GARMIN_RECENT);
        }
      }
      reloadHealthSources();
    } catch {
      setError(REFRESH_FAILED);
    } finally {
      setRefreshing(false);
    }
  }, [garminConnected, refreshing, repo, snap.profile?.consentHealth]);

  return {
    refreshing,
    error,
    permission,
    history,
    garminNote,
    appleCheckedAt,
    run,
  };
}

export function HealthRefreshBar({
  refreshing,
  appleCheckedAt,
  garminConnected,
  garminReceivedAt,
  garminMark,
  error,
  permission,
  garminNote,
  onPress,
}: {
  refreshing: boolean;
  appleCheckedAt: string | null;
  garminConnected: boolean;
  garminReceivedAt: string | null;
  garminMark: string;
  error: string | null;
  permission?: boolean;
  /** Accepted from the refresh hook. A refused backfill must not add a second hint. */
  history?: boolean;
  garminNote: string | null;
  onPress: () => void;
}) {
  const theme = useAppTheme();
  const repo = useRepository();
  const fresh = appleCheckIsFresh(appleCheckedAt, Date.now());
  const showRefresh = syncStatusShowsRefresh({ appleCheckedAt, now: Date.now(), error: Boolean(error) });
  const [checking, setChecking] = useState(false);
  const [garminTick, setGarminTick] = useState(false);
  const [checkView, setCheckView] = useState<GarminCheckView>('idle');
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [nothingSince, setNothingSince] = useState<string | null>(null);
  const [seenPushAt, setSeenPushAt] = useState<string | null>(null);
  const receivedAt = laterSyncClock(garminReceivedAt, seenPushAt);

  useEffect(() => {
    if (checkView !== 'nothing') return;
    if (!garminReceiptAdvanced(nothingSince, garminReceivedAt)) return;
    setCheckView('idle');
    setGarminTick(false);
    setSeenPushAt(garminReceivedAt);
  }, [checkView, garminReceivedAt, nothingSince]);

  const checkStored = useCallback(async () => {
    if (checking || garminCheckCooling(garminCheckFrom, Date.now())) return;
    garminCheckFrom = Date.now();
    setChecking(true);
    setCheckView('idle');
    setGarminTick(false);
    try {
      const next = await repo.loadGarmin();
      const at = new Date().toISOString();
      if (!next.connected && next.lastPushAt == null) {
        setCheckView('failed');
      } else {
        const found = garminCheckFoundNew(
          { lastPushAt: receivedAt, mark: garminMark },
          { connected: next.connected, lastPushAt: next.lastPushAt, mark: garminStoredMark(next) },
        );
        if (found) {
          setCheckView('arrived');
          setGarminTick(true);
          if (next.lastPushAt) setSeenPushAt(next.lastPushAt);
        } else {
          setCheckView('nothing');
          setCheckedAt(at);
          setNothingSince(receivedAt);
        }
      }
      reloadHealthSources();
    } catch {
      setCheckView('failed');
    } finally {
      setChecking(false);
    }
  }, [checking, garminMark, receivedAt, repo]);

  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {fresh ? <PlanTick done /> : null}
        <T style={{ flexShrink: 1 }}>{syncAppleClause(appleCheckedAt)}</T>
        {garminConnected ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
            <T>·</T>
            {garminTick ? <PlanTick done /> : null}
            <T style={{ flexShrink: 1 }}>{garminAfterCheckLine({ view: checking ? 'idle' : checkView, checkedAt, receivedAt })}</T>
            <T>·</T>
            {checking ? (
              <ActivityIndicator accessibilityLabel="Checking Garmin" size="small" color={theme.colors.ink} />
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={GARMIN_CHECK_AGAIN}
                onPress={() => void checkStored()}
                hitSlop={8}
              >
                <T variant="muted" style={{ textDecorationLine: 'underline' }}>{GARMIN_CHECK_AGAIN}</T>
              </Pressable>
            )}
          </View>
        ) : null}
        {showRefresh ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={SYNC_REFRESH}
            accessibilityState={{ disabled: refreshing }}
            disabled={refreshing}
            onPress={onPress}
            style={{
              alignSelf: 'flex-start',
              minHeight: 36,
              justifyContent: 'center',
              paddingHorizontal: 12,
              borderWidth: 1,
              borderColor: theme.colors.ink,
              borderRadius: theme.radius.md,
              opacity: refreshing ? 0.45 : 1,
            }}
          >
            <T>{refreshing ? 'Refreshing' : SYNC_REFRESH}</T>
          </Pressable>
        ) : null}
      </View>
      {garminConnected ? <GarminConnectNudge receivedAt={receivedAt} now={Date.now()} /> : null}
      {garminConnected ? <T variant="muted">{garminHintLine(receivedAt, Date.now())}</T> : null}
      {garminNote ? <T variant="muted">{garminNote}</T> : null}
      {permission ? <GarminPermissionNotice force /> : null}
      <ErrorNote>{error}</ErrorNote>
    </View>
  );
}
