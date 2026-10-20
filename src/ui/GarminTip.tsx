import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { useSnapshot } from '@/data';
import { GARMIN_TIP_BODY, GARMIN_TIP_TITLE, garminTipProfileKey } from '@/domain/garminTip';
import { garminTipDismissed, markGarminTipDismissed } from '@/ui/garminTipStore';
import { useAppTheme } from '@/ui/theme';
import { T } from '@/ui/ui';

/**
 * Short note on sending Garmin readings through Apple Health.
 * Starts closed. Dismiss hides it on every screen for this profile.
 */
export function GarminTip() {
  const snap = useSnapshot();
  const theme = useAppTheme();
  const profileId = garminTipProfileKey(snap.profile?.id);
  const [dismissed, setDismissed] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let live = true;
    void garminTipDismissed(profileId).then((value) => {
      if (live) setDismissed(value);
    });
    return () => {
      live = false;
    };
  }, [profileId]);

  if (dismissed !== false) return null;

  function dismiss() {
    setDismissed(true);
    void markGarminTipDismissed(profileId);
  }

  return (
    <View
      style={{
        alignSelf: 'stretch',
        gap: 6,
        borderWidth: 1,
        borderColor: theme.colors.line,
        borderRadius: theme.radius.md,
        paddingHorizontal: 14,
        paddingVertical: 4,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={GARMIN_TIP_TITLE}
          accessibilityState={{ expanded: open }}
          onPress={() => setOpen((value) => !value)}
          style={{ minHeight: 44, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
        >
          <T style={{ color: theme.colors.ink, fontFamily: theme.font.bodyStrong, flex: 1 }}>{GARMIN_TIP_TITLE}</T>
          <T variant="muted">{open ? 'Hide' : 'Show'}</T>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss Using a Garmin?"
          onPress={dismiss}
          style={{ minHeight: 44, justifyContent: 'center' }}
        >
          <T variant="muted">Dismiss</T>
        </Pressable>
      </View>
      {open ? <T style={{ paddingBottom: 10 }}>{GARMIN_TIP_BODY}</T> : null}
    </View>
  );
}
