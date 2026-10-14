import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Platform, View } from 'react-native';

import { useRepository, useSnapshot } from '@/data';
import type { HealthKind, NewHealthSample } from '@/data/types';
import { isoDay, startOfLocalDay } from '@/domain/dates';
import { shownError } from '@/domain/errors';
import { parseHeightCm } from '@/domain/guidance';
import type { WeightReadingDraft } from '@/domain/weightEntry';
import { isHealthAccessDenied, type AppleHealthAccess } from '@/health/connection';
import { connectAppleHealth, openAppSettings, openHealthApp, readAppleHealthAccess } from '@/health/link';
import { loadLastSynced, saveLastSynced } from '@/health/syncedAt';
import { syncAppleHealth } from '@/health/sync';
import { AppleHealthCard } from '@/ui/AppleHealthCard';
import { HealthSectionShare } from '@/ui/SectionShare';
import { HealthBoard, HealthReadings } from '@/ui/HealthBoard';
import { DateField } from '@/ui/DateField';
import { useAppTheme } from '@/ui/theme';
import { Button, Choice, ErrorNote, Field, playSavedHaptic, Screen, T } from '@/ui/ui';

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
  const [savePending, setSavePending] = useState(false);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [weightDraft, setWeightDraft] = useState<WeightReadingDraft | null>(null);
  const [weightReset, setWeightReset] = useState(0);
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
    for (const row of result.composition ?? []) {
      await repo.saveBodyComposition({
        recordedOn: row.recordedOn,
        bodyFatPct: row.bodyFatPct,
        leanMassKg: row.leanMassKg,
        waistCm: null,
        source: 'healthkit',
      });
    }
    if (result.activeEnergyKcal != null) {
      await repo.setNutritionSettings({
        ...repo.getSnapshot().nutrition,
        activityEnergyKcal: result.activeEnergyKcal,
      });
    }
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

  useEffect(() => {
    if (!savedNote) return;
    const timer = setTimeout(() => setSavedNote(null), 2500);
    return () => clearTimeout(timer);
  }, [savedNote]);

  const reportWeight = useCallback((draft: WeightReadingDraft | null) => {
    setWeightDraft((current) => {
      if (current == null && draft == null) return current;
      if (
        current
        && draft
        && current.kg === draft.kg
        && current.recordedOn === draft.recordedOn
        && current.heightText === draft.heightText
      ) {
        return current;
      }
      return draft;
    });
  }, []);

  function saveReading() {
    const samples: NewHealthSample[] = [];
    if (value.trim()) {
      const amount = Number(value);
      if (!Number.isFinite(amount) || amount < 0) {
        setError('Enter a number that is zero or more.');
        return;
      }
      if (isoDay(day) > isoDay(new Date())) {
        setError('Choose today or an earlier day.');
        return;
      }
      samples.push({ kind, value: amount, unit: chosen.unit, recordedOn: isoDay(day), source: 'manual' });
    }
    let nextHeight: number | null | undefined;
    if (weightDraft) {
      if (weightDraft.recordedOn > isoDay(new Date())) {
        setError('Choose today or an earlier day.');
        return;
      }
      const height = parseHeightCm(weightDraft.heightText);
      if (!height.ok) {
        setError(height.error);
        return;
      }
      samples.push({
        kind: 'weight_kg',
        value: weightDraft.kg,
        unit: 'kg',
        recordedOn: weightDraft.recordedOn,
        source: 'manual',
      });
      if (height.value !== (snap.profile?.heightCm ?? null)) nextHeight = height.value;
    }
    if (samples.length === 0 && nextHeight === undefined) return;
    setError(null);
    setSavePending(true);
    const reading = value.trim();
    const loggedWeight = weightDraft != null;
    void (async () => {
      try {
        if (nextHeight !== undefined) await repo.updateProfile({ heightCm: nextHeight });
        if (samples.length) await repo.saveHealth(samples);
        if (reading) setValue('');
        if (loggedWeight) setWeightReset((token) => token + 1);
        setSavedNote('Saved');
        playSavedHaptic();
      } catch (err: unknown) {
        setError(shownError(err, 'Could not save.'));
      } finally {
        setSavePending(false);
      }
    })();
  }

  return (
    <Screen
      eyebrow="Health Stats"
      title="What your body is doing."
      footer={(
        <View style={{ gap: 8 }}>
          {savedNote ? <T>{savedNote}</T> : null}
          <Button label="Save reading" pending={savePending} disabled={!consent || savePending || (!value.trim() && weightDraft == null)} onPress={saveReading} />
        </View>
      )}
    >
      <HealthSectionShare />
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
        heightCm={snap.profile?.heightCm ?? null}
        adult={snap.profile?.ageConfirmed18 !== false}
        canSaveHeight={consent}
        onSaveHeight={async (heightCm) => {
          await repo.updateProfile({ heightCm });
        }}
        onWeightDraftChange={reportWeight}
        weightReset={weightReset}
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
      <HealthReadings samples={snap.health} />
    </Screen>
  );
}
