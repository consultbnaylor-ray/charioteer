import { View } from 'react-native';

import { GARMIN_PRIVACY } from '@/domain/garminConnect';
import { GARMIN_CONNECT_BUTTON } from '@/domain/garminTip';
import { PlanTick } from '@/ui/PlanTick';
import { useGarminConnect } from '@/ui/useGarminConnect';
import { Button, Card, ErrorNote, T } from '@/ui/ui';

/** You tab. Connect opens Garmin. A green tick means the link succeeded. */
export function GarminConnectRow() {
  const { connected, pending, error, connect, disconnect } = useGarminConnect();

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
        <Button label={GARMIN_CONNECT_BUTTON} pending={pending === 'connect'} disabled={pending != null} onPress={() => void connect()} />
      )}
      <ErrorNote>{error}</ErrorNote>
    </Card>
  );
}
