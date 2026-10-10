import { useState } from 'react';
import { View } from 'react-native';

import { useRepository, useSnapshot } from '@/data';
import { HEALTH_LABELS } from '@/data/catalogue';
import type { HealthKind } from '@/data/types';
import { shownError } from '@/domain/errors';
import { syncAppleHealth } from '@/health/sync';
import { Button, Card, Choice, ErrorNote, Field, Screen, T } from '@/ui/ui';

const KINDS: { id: HealthKind; unit: string; label: string }[] = [
  { id: 'steps', unit: 'steps', label: 'Steps' },
  { id: 'sleep_hours', unit: 'h', label: 'Sleep (hours)' },
  { id: 'resting_heart_rate', unit: 'bpm', label: 'Resting heart rate' },
  { id: 'hrv_sdnn', unit: 'ms', label: 'HRV (SDNN)' },
  { id: 'workout_minutes', unit: 'min', label: 'Workout minutes' },
  { id: 'weight_kg', unit: 'kg', label: 'Weight (kg)' },
];

function today() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

export default function Health() {
  const snap = useSnapshot();
  const repo = useRepository();
  const [kind, setKind] = useState<HealthKind>('steps');
  const [value, setValue] = useState('');
  const [day, setDay] = useState(today());
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const chosen = KINDS.find((item) => item.id === kind) ?? KINDS[0];

  return (
    <Screen
      eyebrow="Health"
      title="What your body is doing."
      intro="On iPhone, a dev build can read Apple Health. On the web, log the same readings yourself. Other people never see them."
    >
      {!snap.profile?.consentHealth ? (
        <Card>
          <T>Health consent is off. Turn it on if you want these readings stored.</T>
          <Button label="Allow health data" onPress={() => void repo.updateProfile({ consentHealth: true })} />
        </Card>
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {KINDS.map((item) => (
          <Choice key={item.id} label={item.label} selected={kind === item.id} onPress={() => setKind(item.id)} />
        ))}
      </View>
      <Field label={`Value (${chosen.unit})`} value={value} onChangeText={setValue} keyboardType="decimal-pad" />
      <Field label="Date" value={day} onChangeText={setDay} placeholder="YYYY-MM-DD" />
      <ErrorNote>{error}</ErrorNote>
      {note ? <T variant="muted">{note}</T> : null}
      <Button
        label="Save reading"
        disabled={!snap.profile?.consentHealth}
        onPress={() => {
          const amount = Number(value);
          if (!Number.isFinite(amount) || amount < 0) {
            setError('Enter a number that is zero or more.');
            return;
          }
          if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
            setError('Use a date like 2026-10-10.');
            return;
          }
          setError(null);
          void repo.saveHealth([{ kind, value: amount, unit: chosen.unit, recordedOn: day, source: 'manual' }])
            .then(() => {
              setValue('');
              setNote('Saved.');
            })
            .catch((err: unknown) => setError(shownError(err, 'Could not save.')));
        }}
      />
      <Button
        label="Sync from Apple Health"
        tone="quiet"
        pending={pending}
        disabled={!snap.profile?.consentHealth}
        onPress={() => {
          setPending(true);
          setError(null);
          void syncAppleHealth().then(async (result) => {
            if (!result.ok) {
              setNote(result.message);
              return;
            }
            await repo.saveHealth(result.samples);
            setNote(`Brought in ${result.samples.length} readings from Apple Health.`);
          }).catch((err: unknown) => setError(shownError(err, 'Sync failed.'))).finally(() => setPending(false));
        }}
      />
      <T variant="label">Saved</T>
      {snap.health.length === 0 ? <T variant="muted">Nothing logged yet.</T> : null}
      {snap.health.map((sample) => (
        <Card key={sample.id}>
          <T>{HEALTH_LABELS[sample.kind] ?? sample.kind}</T>
          <T variant="muted">{sample.value} {sample.unit} · {sample.recordedOn} · {sample.source === 'healthkit' ? 'Apple Health' : 'Logged here'}</T>
        </Card>
      ))}
    </Screen>
  );
}
