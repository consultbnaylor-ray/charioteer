import { View } from 'react-native';

import { GARMIN_PRIVACY } from '@/domain/garminConnect';
import { latestGarminDailyDay } from '@/domain/healthRefresh';
import { GARMIN_CONNECT_BUTTON, GARMIN_DISCONNECT_NOTE } from '@/domain/garminTip';
import { GarminWatchLinkNote } from '@/ui/GarminWatchLinkNote';
import { Explain, MoreInfo } from '@/ui/MoreInfo';
import { PlanTick } from '@/ui/PlanTick';
import { useGarminConnect } from '@/ui/useGarminConnect';
import { Button, Card, ErrorNote, T } from '@/ui/ui';

/** You tab. Connect opens Garmin. A green tick means the link succeeded. */
export function GarminConnectRow() {
  const { connected, pending, error, connect, disconnect, readings } = useGarminConnect();

  return (
    <Card>
      <T variant="label">Garmin Connect</T>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {connected ? <PlanTick done /> : null}
        <T>{connected ? 'Connected' : 'Not connected'}</T>
      </View>
      <Explain title="About Garmin" about="Garmin readings" text={GARMIN_PRIVACY} />
      <GarminWatchLinkNote
        connected={connected}
        lastPushAt={readings.lastPushAt}
        latestDailyDay={latestGarminDailyDay(readings.dailies.map((day) => day.calendarDate))}
      />
      {connected ? (
        <>
          <MoreInfo title="About disconnecting" about="disconnecting Garmin">
            <T variant="muted">{GARMIN_DISCONNECT_NOTE}</T>
          </MoreInfo>
          <Button label="Disconnect" tone="quiet" pending={pending === 'disconnect'} disabled={pending != null} onPress={() => void disconnect()} />
        </>
      ) : (
        <Button label={GARMIN_CONNECT_BUTTON} pending={pending === 'connect'} disabled={pending != null} onPress={() => void connect()} />
      )}
      <ErrorNote>{error}</ErrorNote>
    </Card>
  );
}
