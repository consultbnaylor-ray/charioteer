import { useState } from 'react';
import { Switch, View } from 'react-native';

import { useRepository, useSnapshot } from '@/data';
import { shownError } from '@/domain/errors';
import {
  PROFILE_HIDDEN_SHARE,
  SENSITIVE_SHARE_BODY,
  SHARE_HINT,
  type ProfileSharing,
} from '@/domain/profileSharing';
import { useAppTheme } from '@/ui/theme';
import { Button, ErrorNote, T } from '@/ui/ui';

/**
 * One Share on profile switch. Sensitive sections ask once, then remember
 * the consent time. Community off still stores the choice, and says so.
 */
export function ShareOnProfile({
  on,
  sensitive = false,
  detail,
  apply,
}: {
  on: boolean;
  sensitive?: boolean;
  detail?: string;
  apply: (sharing: ProfileSharing, selected: boolean) => ProfileSharing;
}) {
  const snap = useSnapshot();
  const repo = useRepository();
  const theme = useAppTheme();
  const [ask, setAsk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const communityOn = Boolean(snap.profile?.communityVisible && snap.profile?.ageConfirmed18);
  const label = detail ? `Share on profile, ${detail}` : 'Share on profile';

  async function save(selected: boolean, consent: boolean) {
    setPending(true);
    setError(null);
    try {
      let next = apply(snap.sharing, selected);
      if (consent) next = { ...next, sensitiveConsentAt: new Date().toISOString() };
      await repo.setProfileSharing(next);
      setAsk(false);
    } catch (err) {
      setError(shownError(err, 'Could not update sharing.'));
    } finally {
      setPending(false);
    }
  }

  function change(value: boolean) {
    if (!value) {
      setAsk(false);
      void save(false, false);
      return;
    }
    if (sensitive && !snap.sharing.sensitiveConsentAt) {
      setAsk(true);
      return;
    }
    void save(true, false);
  }

  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
        <T style={{ flex: 1 }}>Share on profile</T>
        <Switch
          accessibilityLabel={label}
          value={on}
          disabled={pending}
          onValueChange={change}
          trackColor={{ true: theme.colors.ink, false: theme.colors.line }}
          thumbColor={theme.colors.surface}
        />
      </View>
      <T variant="muted">{communityOn ? SHARE_HINT : PROFILE_HIDDEN_SHARE}</T>
      {ask ? (
        <View style={{ gap: 8 }}>
          <T>{SENSITIVE_SHARE_BODY}</T>
          <Button label="Share this" pending={pending} onPress={() => void save(true, true)} />
          <Button label="Keep it private" tone="quiet" disabled={pending} onPress={() => setAsk(false)} />
        </View>
      ) : null}
      {error ? <ErrorNote>{error}</ErrorNote> : null}
    </View>
  );
}
