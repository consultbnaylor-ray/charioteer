import { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { useRepository, useSnapshot } from '@/data';
import {
  GARMIN_ASKED,
  GARMIN_DATA_HINT,
  GARMIN_HISTORY_NOTE,
  GARMIN_RECENT,
  REFRESH_FAILED,
  SYNC_REFRESH,
  appleCheckIsFresh,
  refreshCooling,
  syncStatusShowsRefresh,
  syncStatusText,
} from '@/domain/healthRefresh';
import { noteGarminRefreshRefused } from '@/domain/garminPermission';
import { GarminPermissionNotice } from '@/ui/GarminPermissionNotice';
import { refreshAppleHealth } from '@/health/catchUp';
import { reloadHealthSources } from '@/health/useHealthSources';
import { loadLastSynced } from '@/health/syncedAt';
import { PlanTick } from '@/ui/PlanTick';
import { useAppTheme } from '@/ui/theme';
import { ErrorNote, T } from '@/ui/ui';

let cooldownFrom: number | null = null;

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
  error,
  permission,
  history,
  garminNote,
  onPress,
}: {
  refreshing: boolean;
  appleCheckedAt: string | null;
  garminConnected: boolean;
  garminReceivedAt: string | null;
  error: string | null;
  permission?: boolean;
  history?: boolean;
  garminNote: string | null;
  onPress: () => void;
}) {
  const theme = useAppTheme();
  const fresh = appleCheckIsFresh(appleCheckedAt, Date.now());
  const text = syncStatusText({ appleCheckedAt, garminConnected, garminReceivedAt });
  const showRefresh = syncStatusShowsRefresh({ appleCheckedAt, now: Date.now(), error: Boolean(error) });
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {fresh ? <PlanTick done /> : null}
        <T style={{ flexGrow: 1, flexShrink: 1 }}>{text}</T>
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
      {garminConnected ? <T variant="muted">{GARMIN_DATA_HINT}</T> : null}
      {history ? <T variant="muted">{GARMIN_HISTORY_NOTE}</T> : null}
      {garminNote ? <T variant="muted">{garminNote}</T> : null}
      {permission ? <GarminPermissionNotice force /> : null}
      <ErrorNote>{error}</ErrorNote>
    </View>
  );
}
