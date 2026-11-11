import { useEffect, useState } from 'react';

import { useSnapshot } from '@/data';
import { GARMIN_WATCH_LINK_HIDE, GARMIN_WATCH_LINK_NOTE, garminWatchLinkDue } from '@/domain/healthRefresh';
import { garminWatchLinkHidden, hideGarminWatchLink } from '@/ui/garminWatchLinkStore';
import { Button, T } from '@/ui/ui';

/** Watch-to-Garmin Connect has gone quiet. A missing Charioteer link is a different note. */
export function GarminWatchLinkNote({
  connected,
  lastPushAt,
  latestDailyDay,
}: {
  connected: boolean;
  lastPushAt: string | null;
  latestDailyDay: string | null;
}) {
  const userId = useSnapshot().profile?.id ?? '';
  const due = garminWatchLinkDue({ connected, lastPushAt, latestDailyDay, now: Date.now() });
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if (!due || !userId) {
      setHidden(true);
      return;
    }
    let live = true;
    void garminWatchLinkHidden(userId).then((value) => {
      if (live) setHidden(value);
    });
    return () => {
      live = false;
    };
  }, [due, userId, lastPushAt, latestDailyDay]);

  if (!due || hidden) return null;
  return (
    <>
      <T>{GARMIN_WATCH_LINK_NOTE}</T>
      <Button
        label={GARMIN_WATCH_LINK_HIDE}
        tone="quiet"
        onPress={() => {
          setHidden(true);
          void hideGarminWatchLink(userId);
        }}
      />
    </>
  );
}
