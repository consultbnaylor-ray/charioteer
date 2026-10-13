import { useState } from 'react';
import { Switch, View } from 'react-native';

import { useRepository, useSnapshot } from '@/data';
import { shownError } from '@/domain/errors';
import type { NutritionSettings } from '@/domain/nutrition';
import { sensitiveShareConfirm } from '@/domain/profileSharing';
import { useAppTheme } from '@/ui/theme';
import { Button, ErrorNote, T } from '@/ui/ui';

/**
 * One labelled switch for a nutrition share. The first health or sobriety
 * item still uses the existing confirmation. Later items remember that consent.
 */
export function NutritionShareSwitch({
  label,
  item,
  on,
  apply,
}: {
  label: string;
  item: string;
  on: boolean;
  apply: (settings: NutritionSettings, selected: boolean) => NutritionSettings;
}) {
  const snap = useSnapshot();
  const repo = useRepository();
  const theme = useAppTheme();
  const [ask, setAsk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function save(selected: boolean, consent: boolean) {
    setPending(true);
    setError(null);
    try {
      await repo.setNutritionSettings(apply(snap.nutrition, selected));
      if (consent) {
        await repo.setProfileSharing({ ...snap.sharing, sensitiveConsentAt: new Date().toISOString() });
      }
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
      if (on) void save(false, false);
      return;
    }
    if (!snap.sharing.sensitiveConsentAt && !ask) {
      setAsk(true);
      return;
    }
    void save(true, !snap.sharing.sensitiveConsentAt);
  }

  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
        <T style={{ flex: 1 }}>{label}</T>
        <Switch
          accessibilityLabel={label}
          value={on}
          disabled={pending}
          onValueChange={change}
          trackColor={{ true: theme.colors.ink, false: theme.colors.line }}
          thumbColor={theme.colors.surface}
        />
      </View>
      {ask ? (
        <View style={{ gap: 8 }}>
          <T>{sensitiveShareConfirm(item)}</T>
          <Button label="Share" pending={pending} pendingLabel="Saving..." onPress={() => void save(true, true)} />
          <Button label="Not now" tone="quiet" disabled={pending} onPress={() => setAsk(false)} />
        </View>
      ) : null}
      {error ? <ErrorNote>{error}</ErrorNote> : null}
    </View>
  );
}
