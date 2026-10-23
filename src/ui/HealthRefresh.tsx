import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { useRepository, useSnapshot } from '@/data';
import {
  GARMIN_ASKED,
  GARMIN_RECENT,
  REFRESH_FAILED,
  REFRESH_UPDATED,
  lastUpdatedLine,
  refreshButtonLabel,
  refreshCooling,
} from '@/domain/healthRefresh';
import { refreshAppleHealth } from '@/health/catchUp';
import { reloadHealthSources } from '@/health/useHealthSources';
import { loadLastSynced } from '@/health/syncedAt';
import { PlanTick } from '@/ui/PlanTick';
import { Button, ErrorNote, T } from '@/ui/ui';

let cooldownFrom: number | null = null;

export function useManualHealthRefresh(garminConnected: boolean) {
  const repo = useRepository();
  const snap = useSnapshot();
  const [refreshing, setRefreshing] = useState(false);
  const [updated, setUpdated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [garminNote, setGarminNote] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    void loadLastSynced().then((stored) => {
      if (stored) setUpdatedAt(stored);
    }).catch(() => undefined);
  }, []);

  const run = useCallback(async () => {
    if (refreshing || refreshCooling(cooldownFrom, Date.now())) return;
    cooldownFrom = Date.now();
    setRefreshing(true);
    setUpdated(false);
    setError(null);
    setGarminNote(null);
    let failed = false;
    try {
      if (snap.profile?.consentHealth) {
        const apple = await refreshAppleHealth(repo, { authorize: false });
        if (!apple.ok) {
          failed = true;
          setError(apple.message || REFRESH_FAILED);
        } else {
          setUpdatedAt(apple.syncedAt);
        }
      }
      if (garminConnected) {
        const garmin = await repo.refreshGarmin();
        if (!garmin.ok) {
          failed = true;
          setError(garmin.message);
        } else if (garmin.garmin === 'asked') {
          setGarminNote(GARMIN_ASKED);
        } else if (garmin.garmin === 'recent') {
          setGarminNote(GARMIN_RECENT);
        }
      }
      reloadHealthSources();
      if (!failed) {
        setUpdated(true);
        setUpdatedAt((current) => current ?? new Date().toISOString());
      }
    } catch {
      setError(REFRESH_FAILED);
    } finally {
      setRefreshing(false);
    }
  }, [garminConnected, refreshing, repo, snap.profile?.consentHealth]);

  return {
    refreshing,
    updated,
    error,
    garminNote,
    label: refreshButtonLabel(garminConnected),
    lastLine: lastUpdatedLine(updatedAt),
    run,
  };
}

export function HealthRefreshBar({
  label,
  lastLine,
  refreshing,
  updated,
  error,
  garminNote,
  onPress,
}: {
  label: string;
  lastLine: string;
  refreshing: boolean;
  updated: boolean;
  error: string | null;
  garminNote: string | null;
  onPress: () => void;
}) {
  return (
    <View style={{ gap: 8 }}>
      <Button
        label={label}
        pending={refreshing}
        pendingLabel="Refreshing..."
        disabled={refreshing}
        onPress={onPress}
      />
      <T variant="muted">{lastLine}</T>
      {updated && !error ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <PlanTick done />
          <T>{REFRESH_UPDATED}</T>
        </View>
      ) : null}
      {garminNote ? <T variant="muted">{garminNote}</T> : null}
      <ErrorNote>{error}</ErrorNote>
    </View>
  );
}
