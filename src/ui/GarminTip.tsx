import { GARMIN_CONNECT_BUTTON, GARMIN_CONNECT_HINT, GARMIN_CONNECTED_LABEL } from '@/domain/garminTip';
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
      <T variant="muted">{GARMIN_CONNECT_HINT}</T>
      {connected ? (
        <Button
          label="Disconnect"
          tone="quiet"
          pending={pending === 'disconnect'}
          disabled={pending != null}
          onPress={() => void disconnect()}
        />
      ) : null}
      <ErrorNote>{error}</ErrorNote>
    </Card>
  );
}
