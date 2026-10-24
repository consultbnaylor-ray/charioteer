import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Linking } from 'react-native';

import { useRepository } from '@/data';
import {
  emptyGarminReadings,
  peekGarminAppReturn,
  subscribeGarminAppReturn,
  type GarminReadings,
} from '@/domain/garminConnect';
import {
  beginGarminPermissionRepair,
  cancelGarminPermissionRepair,
  claimGarminPermissionRepair,
  clearGarminPermissionSession,
  finishGarminPermissionRepair,
  garminPermissionProbeDue,
  markGarminPermissionsOk,
  noteGarminPermissionProbe,
  noteGarminPermissionResult,
} from '@/domain/garminPermission';
import { shownError } from '@/domain/errors';

/** Opens Garmin Connect, then reads the link that already lives on the server. */
export function useGarminConnect() {
  const repo = useRepository();
  const params = useLocalSearchParams<{ garmin?: string }>();
  const [readings, setReadings] = useState<GarminReadings>(emptyGarminReadings);
  const [pending, setPending] = useState<'connect' | 'disconnect' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cleared, setCleared] = useState(false);
  const [returned, setReturned] = useState(peekGarminAppReturn);

  const load = useCallback(() => {
    void repo.loadGarmin().then(async (next) => {
      setReadings(next);
      if (!next.connected || !garminPermissionProbeDue(Date.now())) return;
      noteGarminPermissionProbe(Date.now());
      const checked = await repo.checkGarminPermissions(false).catch(() => null);
      if (!checked?.checked) return;
      noteGarminPermissionResult(checked);
      const again = await repo.loadGarmin().catch(() => null);
      if (!again) return;
      setReadings({
        ...again,
        needsPermissions: again.needsPermissions || checked.needsPermissions,
        missingPermissions: again.missingPermissions.length > 0 ? again.missingPermissions : checked.missing,
      });
    }).catch(() => setReadings(emptyGarminReadings()));
  }, [repo]);

  useFocusEffect(load);

  useEffect(() => subscribeGarminAppReturn(() => {
    setReturned(peekGarminAppReturn());
    const outcome = peekGarminAppReturn();
    if (outcome === 'cancelled') cancelGarminPermissionRepair();
    if (outcome === 'connected' && claimGarminPermissionRepair()) {
      void repo.checkGarminPermissions(true).then((result) => {
        noteGarminPermissionResult(result);
        noteGarminPermissionProbe(Date.now());
        markGarminPermissionsOk(!result.needsPermissions);
        load();
      }).catch(() => {
        markGarminPermissionsOk(false);
        load();
      }).finally(() => {
        finishGarminPermissionRepair();
      });
      return;
    }
    load();
  }), [load, repo]);

  const justConnected = params.garmin === 'connected' || returned === 'connected';
  const connected = readings.connected || (justConnected && !cleared);

  async function fixPermissions() {
    setCleared(false);
    setPending('connect');
    setError(null);
    try {
      const url = await repo.startGarminConnect();
      beginGarminPermissionRepair();
      await Linking.openURL(url);
    } catch (err) {
      cancelGarminPermissionRepair();
      setError(shownError(err, 'Could not open Garmin Connect.'));
    } finally {
      setPending(null);
    }
  }

  async function connect() {
    setCleared(false);
    setPending('connect');
    setError(null);
    try {
      const url = await repo.startGarminConnect();
      await Linking.openURL(url);
    } catch (err) {
      setError(shownError(err, 'Could not open Garmin Connect.'));
    } finally {
      setPending(null);
    }
  }

  async function disconnect() {
    setPending('disconnect');
    setError(null);
    try {
      await repo.disconnectGarmin();
      setCleared(true);
      clearGarminPermissionSession();
      setReadings(emptyGarminReadings());
    } catch (err) {
      setError(shownError(err, 'Could not disconnect Garmin Connect.'));
    } finally {
      setPending(null);
    }
  }

  return {
    connected,
    needsPermissions: readings.needsPermissions,
    missingPermissions: readings.missingPermissions,
    pending,
    error,
    connect,
    fixPermissions,
    disconnect,
  };
}
