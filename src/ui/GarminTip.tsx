import { GARMIN_CONNECT_BUTTON, GARMIN_CONNECT_HINT, GARMIN_CONNECTED_LABEL, GARMIN_DISCONNECT_NOTE } from '@/domain/garminTip';
import { GarminPermissionNotice } from '@/ui/GarminPermissionNotice';
import { Explain, MoreInfo } from '@/ui/MoreInfo';
import { useGarminConnect } from '@/ui/useGarminConnect';
import { Button, Card, ErrorNote, T } from '@/ui/ui';

/** Health and fitness card. Always visible, in the same monochrome cards as the rest of the screen. */
export function GarminTip() {
  const { connected, pending, error, connect, disconnect } = useGarminConnect();

  return (
    <Card>
      {connected ? (
        <T>{GARMIN_CONNECTED_LABEL}</T>
      ) : (
        <Button
          label={GARMIN_CONNECT_BUTTON}
          pending={pending === 'connect'}
          disabled={pending != null}
          onPress={() => void connect()}
        />
      )}
      {connected ? (
        <MoreInfo title="About Garmin" about="connecting Garmin">
          <T variant="muted">{GARMIN_CONNECT_HINT}</T>
        </MoreInfo>
      ) : (
        <Explain title="About Garmin" about="connecting Garmin" text={GARMIN_CONNECT_HINT} />
      )}
      <GarminPermissionNotice />
      {connected ? (
        <>
          <MoreInfo title="About disconnecting" about="disconnecting Garmin">
            <T variant="muted">{GARMIN_DISCONNECT_NOTE}</T>
          </MoreInfo>
          <Button
            label="Disconnect"
            tone="quiet"
            pending={pending === 'disconnect'}
            disabled={pending != null}
            onPress={() => void disconnect()}
          />
        </>
      ) : null}
      <ErrorNote>{error}</ErrorNote>
    </Card>
  );
}
