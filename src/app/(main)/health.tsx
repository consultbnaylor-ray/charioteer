import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Platform, View } from 'react-native';

import { useRepository, useSnapshot } from '@/data';
import type { HealthKind } from '@/data/types';
import { isoDay, startOfLocalDay } from '@/domain/dates';
import { shownError } from '@/domain/errors';
import { isHealthAccessDenied, type AppleHealthAccess } from '@/health/connection';
import { connectAppleHealth, openAppSettings, openHealthApp, readAppleHealthAccess } from '@/health/link';
import { loadLastSynced, saveLastSynced } from '@/health/syncedAt';
import { syncAppleHealth } from '@/health/sync';
import { AppleHealthCard } from '@/ui/AppleHealthCard';
import { HealthBoard, HealthReadings } from '@/ui/HealthBoard';
import { DateField } from '@/ui/DateField';
import { useAppTheme } from '@/ui/theme';
import { Button, Choice, ErrorNote, Field, Screen, T } from '@/ui/ui';

const KINDS: { id: HealthKind; unit: string; label: string }[] = [
  { id: 'steps', unit: 'steps', label: 'Steps' },
  { id: 'sleep_hours', unit: 'h', label: 'Sleep (hours)' },
  { id: 'resting_heart_rate', unit: 'bpm', label: 'Resting heart rate' },
  { id: 'hrv_sdnn', unit: 'ms', label: 'HRV (SDNN)' },
  { id: 'workout_minutes', unit: 'min', label: 'Workout minutes' },
  { id: 'weight_kg', unit: 'kg', label: 'Weight (kg)' },
];

export default function Health() {
  const snap = useSnapshot();
  const repo = useRepository();
  const router = useRouter();
  const theme = useAppTheme();
  const ios = Platform.OS === 'ios';
  const consent = Boolean(snap.profile?.consentHealth);
  const [kind, setKind] = useState<HealthKind>('steps');
  const [value, setValue] = useState('');
  const [day, setDay] = useState(() => startOfLocalDay(new Date()));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [access, setAccess] = useState<AppleHealthAccess | null>(ios ? null : 'web');
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const chosen = KINDS.find((item) => item.id === kind) ?? KINDS[0];

  const refreshLink = useCallback(() => {
    if (!ios) return;
    void readAppleHealthAccess().then(setAccess).catch(() => setAccess('prompt'));
    void loadLastSynced().then(setSyncedAt);
  }, [ios]);

  useFocusEffect(refreshLink);

  async function pullFromHealth() {
    const result = await syncAppleHealth();
    if (!result.ok) {
      if (isHealthAccessDenied(result.message)) setAccess('denied');
      setError(result.message);
      return;
    }
    await repo.saveHealth(result.samples);
    const stamp = new Date().toISOString();
    await saveLastSynced(stamp);
    setSyncedAt(stamp);
    setAccess('connected');
  }

  async function connect() {
    setPending(true);
    setError(null);
    try {
      const next = await connectAppleHealth();
      setAccess(next);
      if (next === 'connected') await pullFromHealth();
    } catch (err) {
      setError(shownError(err, 'Could not connect to Apple Health.'));
    } finally {
      setPending(false);
    }
  }

  return (
    <Screen eyebrow="Health" title="What your body is doing.">
      <AppleHealthCard
        consent={consent}
        ios={ios}
        access={access}
        syncedAt={syncedAt}
        pending={pending}
        onConnect={() => void connect()}
        onSync={() => {
          setPending(true);
          setError(null);
          void pullFromHealth().catch((err: unknown) => setError(shownError(err, 'Sync failed.'))).finally(() => setPending(false));
        }}
        onManage={() => void openHealthApp()}
        onSettings={() => void openAppSettings()}
        onPrivacy={() => router.push('/privacy' as never)}
      />
      <HealthBoard
        samples={snap.health}
        today={isoDay(new Date())}
        soberOn={snap.profile?.stage === 'stopped' && snap.profile.sobrietyStartedAt ? isoDay(new Date(snap.profile.sobrietyStartedAt)) : null}
        stage={snap.profile?.stage ?? null}
      />
      <T style={{ fontFamily: theme.font.bodyStrong }}>Or add a reading yourself</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {KINDS.map((item) => (
          <Choice key={item.id} label={item.label} selected={kind === item.id} onPress={() => setKind(item.id)} />
        ))}
      </View>
      <Field label={`Value (${chosen.unit})`} value={value} onChangeText={setValue} keyboardType="decimal-pad" />
      <DateField label="Date" value={day} onChange={setDay} maximumDate={new Date()} />
      <ErrorNote>{error}</ErrorNote>
      <Button
        label="Save reading"
        disabled={!consent}
        onPress={() => {
          const amount = Number(value);
          if (!Number.isFinite(amount) || amount < 0) {
            setError('Enter a number that is zero or more.');
            return;
          }
          if (isoDay(day) > isoDay(new Date())) {
            setError('Choose today or an earlier day.');
            return;
          }
          setError(null);
          void repo.saveHealth([{ kind, value: amount, unit: chosen.unit, recordedOn: isoDay(day), source: 'manual' }])
            .then(() => setValue(''))
            .catch((err: unknown) => setError(shownError(err, 'Could not save.')));
        }}
      />
      <HealthReadings samples={snap.health} />
    </Screen>
  );
}
