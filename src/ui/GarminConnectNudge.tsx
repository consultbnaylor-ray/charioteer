import { useEffect, useState } from 'react';
import { Linking, Pressable } from 'react-native';

import { GARMIN_CONNECT_NUDGE, garminConnectNudge, garminConnectOpenUrl } from '@/domain/healthRefresh';
import { useAppTheme } from '@/ui/theme';
import { T } from '@/ui/ui';

/**
 * One calm line beside the existing Garmin clock.
 * It opens Garmin Connect when that app’s scheme is installed. Otherwise the same words stay as text.
 */
export function GarminConnectNudge({ receivedAt, now }: { receivedAt: string | null; now: number }) {
  const theme = useAppTheme();
  const url = garminConnectOpenUrl();
  const show = garminConnectNudge(receivedAt, now);
  const [canOpen, setCanOpen] = useState(false);

  useEffect(() => {
    if (!show || !url) {
      setCanOpen(false);
      return;
    }
    let live = true;
    void Linking.canOpenURL(url).then((ok) => {
      if (live) setCanOpen(ok === true);
    }).catch(() => {
      if (live) setCanOpen(false);
    });
    return () => {
      live = false;
    };
  }, [show, url]);

  if (!show) return null;
  if (!url || !canOpen) return <T variant="muted">{GARMIN_CONNECT_NUDGE}</T>;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={GARMIN_CONNECT_NUDGE}
      accessibilityHint="Opens the Garmin Connect app when it is installed."
      onPress={() => {
        void Linking.openURL(url).catch(() => undefined);
      }}
      style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }}
    >
      <T style={{ color: theme.colors.ink, textDecorationLine: 'underline' }}>{GARMIN_CONNECT_NUDGE}</T>
    </Pressable>
  );
}
