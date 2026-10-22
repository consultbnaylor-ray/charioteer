import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, View } from 'react-native';

import { useRepository } from '@/data';
import { GARMIN_PRIVACY, emptyGarminReadings, type GarminReadings } from '@/domain/garminConnect';
import { shownError } from '@/domain/errors';
import { PlanTick } from '@/ui/PlanTick';
import { Button, Card, ErrorNote, T } from '@/ui/ui';

/** Profile row. Connect opens Garmin. A green tick means the link succeeded. */
export function GarminConnectRow() {
  const repo = useRepository();
  const params = useLocalSearchParams<{ garmin?: string }>();
  const [readings, setReadings] = useState<GarminReadings>(emptyGarminReadings);
  const [pending, setPending] = useState<'connect' | 'disconnect' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cleared, setCleared] = useState(false);
  const justConnected = params.garmin === 'connected';
  const connected = readings.connected || (justConnected && !cleared);

  const load = useCallback(() => {
    void repo.loadGarmin().then(setReadings).catch(() => setReadings(emptyGarminReadings()));
  }, [repo]);

  useFocusEffect(load);

  async function connect() {
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

  return (
    <Card>
      <T variant="label">Garmin Connect</T>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {connected ? <PlanTick done /> : null}
        <T>{connected ? 'Connected' : 'Not connected'}</T>
      </View>
      <T variant="muted">{GARMIN_PRIVACY}</T>
      {connected ? (
        <Button label="Disconnect" tone="quiet" pending={pending === 'disconnect'} disabled={pending != null} onPress={() => void disconnect()} />
      ) : (
        <Button label="Connect" pending={pending === 'connect'} disabled={pending != null} onPress={() => void connect()} />
      )}
      <ErrorNote>{error}</ErrorNote>
    </Card>
  );
}
