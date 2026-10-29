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
    void repo.loadGarmin().then(setReadings).catch(() => setReadings(emptyGarminReadings()));
  }, [repo]);

  useFocusEffect(load);

  useEffect(() => subscribeGarminAppReturn(() => {
    setReturned(peekGarminAppReturn());
    load();
  }), [load]);

  const justConnected = params.garmin === 'connected' || returned === 'connected';
  const connected = readings.connected || (justConnected && !cleared);

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
      setReadings(emptyGarminReadings());
    } catch (err) {
      setError(shownError(err, 'Could not disconnect Garmin Connect.'));
    } finally {
      setPending(null);
    }
  }

  return { connected, pending, error, connect, disconnect };
}
