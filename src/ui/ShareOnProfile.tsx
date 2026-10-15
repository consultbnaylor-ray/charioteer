import { useState } from 'react';
import { Switch, View } from 'react-native';

import { useRepository, useSnapshot } from '@/data';
import { shownError } from '@/domain/errors';
import {
  sensitiveShareConfirm,
  type ProfileSharing,
} from '@/domain/profileSharing';
import { useAppTheme } from '@/ui/theme';
import { Button, QuietNote, T } from '@/ui/ui';

/**
 * One labelled switch for the box above it. The first health or sobriety
 * item names itself and waits for the switch to be turned on again.
 * Later items remember that consent. There is no separate share button.
 */
export function ShareOnProfile({
  label,
  item,
  on,
  sensitive = false,
  lines,
  apply,
}: {
  label: string;
  /** Named in the one-time confirmation, for example "Days sober". */
  item: string;
  on: boolean;
  sensitive?: boolean;
  /** Caps the visible label. The switch name stays the full text. */
  lines?: number;
  apply: (sharing: ProfileSharing, selected: boolean) => ProfileSharing;
}) {
  const snap = useSnapshot();
  const repo = useRepository();
  const theme = useAppTheme();
  const [ask, setAsk] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(selected: boolean, consent: boolean) {
    setError(null);
    setAsk(false);
    try {
      let next = apply(repo.getSnapshot().sharing, selected);
      if (consent) next = { ...next, sensitiveConsentAt: new Date().toISOString() };
      await repo.setProfileSharing(next);
    } catch (err) {
      setError(shownError(err, 'Could not update sharing.'));
    }
  }

  function change(value: boolean) {
    if (!value) {
      setAsk(false);
      if (on) void save(false, false);
      return;
    }
    if (sensitive && !snap.sharing.sensitiveConsentAt && !ask) {
      setAsk(true);
      return;
    }
    void save(true, Boolean(sensitive && !snap.sharing.sensitiveConsentAt));
  }

  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
        <T style={{ flex: 1 }} numberOfLines={lines}>{label}</T>
        <Switch
          accessibilityLabel={label}
          value={on}
          onValueChange={change}
          trackColor={{ true: theme.colors.ink, false: theme.colors.line }}
          thumbColor={theme.colors.surface}
        />
      </View>
      {ask ? (
        <View style={{ gap: 8 }}>
          <T>{sensitiveShareConfirm(item)}</T>
          <Button label="Keep it private" tone="quiet" onPress={() => setAsk(false)} />
        </View>
      ) : null}
      <QuietNote>{error}</QuietNote>
    </View>
  );
}
