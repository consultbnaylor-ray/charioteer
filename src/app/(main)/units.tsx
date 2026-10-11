import { useState } from 'react';

import { useRepository, useSnapshot } from '@/data';
import { shownError } from '@/domain/errors';
import { UnitsGuide } from '@/ui/UnitsGuide';
import { Button, ErrorNote, Field, Screen, T } from '@/ui/ui';

export default function UnitsScreen() {
  const repo = useRepository();
  const snap = useSnapshot();
  const profile = snap.profile;
  const [units, setUnits] = useState(profile?.weeklyUnits?.toString() ?? '');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  if (!profile) return null;

  return (
    <Screen eyebrow="You" title="Drinks & units calculator" intro="An estimate for a usual week. These figures are not medical advice.">
      <Field label="Typical units per week" value={units} onChangeText={setUnits} keyboardType="decimal-pad" />
      <UnitsGuide onChange={setUnits} stage={profile.stage} weeklySpend={profile.weeklySpendGbp?.toString() ?? ''} currentUnits={units} />
      <ErrorNote>{error}</ErrorNote>
      {message ? <T variant="muted">{message}</T> : null}
      <Button
        label="Save weekly units"
        pending={pending}
        onPress={() => {
          const weeklyUnits = Number(units);
          if (!Number.isFinite(weeklyUnits) || weeklyUnits < 0) {
            setError('Units need to be zero or more.');
            setMessage(null);
            return;
          }
          setPending(true);
          setError(null);
          void repo.updateProfile({ weeklyUnits }).then(() => {
            setMessage('Saved.');
          }).catch((err: unknown) => setError(shownError(err, 'Could not save.'))).finally(() => setPending(false));
        }}
      />
    </Screen>
  );
}
