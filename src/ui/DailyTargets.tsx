import { useState } from 'react';
import { View } from 'react-native';

import { useRepository, useSnapshot } from '@/data';
import { buildDailyTargets } from '@/domain/dailyTargets';
import { isoDay } from '@/domain/dates';
import { shownError } from '@/domain/errors';
import { londonDay } from '@/domain/healthInsights';
import { weightPointsFrom } from '@/domain/nutrition';
import { weightReadingKg, weightWaistWrite, type WeightUnitMode } from '@/domain/weightEntry';
import { useHealthSources } from '@/health/useHealthSources';
import { statsToneColors } from '@/ui/statsPalette';
import { useAppTheme } from '@/ui/theme';
import { Button, Card, Choice, Field, T, playSavedHaptic } from '@/ui/ui';

function shiftDay(day: string, delta: number): string {
  const [year, month, date] = day.split('-').map(Number);
  const next = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, date ?? 1));
  next.setUTCDate(next.getUTCDate() + delta);
  return next.toISOString().slice(0, 10);
}

function averageRecentEnergy(samples: readonly { kind: string; value: number; recordedOn: string }[], today: string): number | null {
  const start = shiftDay(today, -6);
  const rows = samples.filter((sample) => sample.kind === 'active_energy' && sample.value > 0 && sample.recordedOn.slice(0, 10) >= start && sample.recordedOn.slice(0, 10) <= today);
  if (!rows.length) return null;
  return rows.reduce((sum, sample) => sum + sample.value, 0) / rows.length;
}

export function DailyTargets() {
  const snap = useSnapshot();
  const repo = useRepository();
  const theme = useAppTheme();
  const { samples } = useHealthSources();
  const settings = snap.nutrition;
  const targetKg = settings?.targetWeightKg ?? null;
  const targetOn = settings?.targetOn ?? null;
  const today = londonDay(new Date());
  const readings = weightPointsFrom(samples.length ? samples : snap.health ?? []);
  const current = readings.length ? readings[readings.length - 1] : undefined;
  const plan = targetKg != null && targetOn && current
    ? buildDailyTargets({
      currentKg: current.kg,
      targetKg,
      targetOn,
      today,
      heightCm: snap.profile?.heightCm ?? null,
      age: settings?.goalAge ?? null,
      sex: settings?.goalSex ?? null,
      activeEnergyKcal: settings?.activityEnergyKcal ?? averageRecentEnergy(samples, today),
      startKg: settings?.targetStartKg ?? readings[0]?.kg ?? null,
      startDay: readings[0]?.day ?? null,
    })
    : null;
  if (!plan) return null;
  const green = statsToneColors(theme.scheme).good.ink;
  return (
    <Card>
      <T variant="label">Daily Targets</T>
      <T>{plan.headline}</T>
      <T>{plan.intake}</T>
      <T>{plan.activity}</T>
      <T>{plan.weigh}</T>
      {plan.pace ? <T>{plan.pace}</T> : null}
      <WeightPath readings={readings.map((row) => ({ day: row.day, kg: row.kg }))} path={plan.path} ink={theme.colors.ink} accent={green} />
      <WeightInline />
      <T variant="muted">{plan.caveat}</T>
    </Card>
  );
}

function WeightPath({
  readings,
  path,
  ink,
  accent,
}: {
  readings: { day: string; kg: number }[];
  path: { day: string; kg: number }[];
  ink: string;
  accent: string;
}) {
  if (path.length < 2) return null;
  const start = path[0]?.day ?? '';
  const end = path[path.length - 1]?.day ?? start;
  const span = Math.max(1, Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`));
  const weights = [...path.map((point) => point.kg), ...readings.map((point) => point.kg)];
  const low = Math.min(...weights) - 0.4;
  const high = Math.max(...weights) + 0.4;
  const height = Math.max(0.5, high - low);
  const xOf = (day: string) => Math.min(1, Math.max(0, (Date.parse(`${day}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / span));
  const yOf = (kg: number) => 1 - Math.min(1, Math.max(0, (kg - low) / height));
  return (
    <View
      accessibilityLabel="Weight progress. Weigh-ins against the straight path from the start weight to the target date."
      style={{ height: 140, alignSelf: 'stretch', borderWidth: 1, borderColor: ink, borderRadius: 8, overflow: 'hidden' }}
    >
      {path.slice(1).map((point, index) => {
        const previous = path[index];
        if (!previous) return null;
        const left = xOf(previous.day) * 100;
        const width = Math.max(2, (xOf(point.day) - xOf(previous.day)) * 100);
        return (
          <View
            key={point.day}
            style={{
              position: 'absolute',
              left: `${left}%`,
              top: `${yOf(point.kg) * 100}%`,
              width: `${width}%`,
              height: 2,
              backgroundColor: accent,
            }}
          />
        );
      })}
      {readings.filter((point) => point.day >= start && point.day <= end).map((point) => (
        <View
          key={`${point.day}-${point.kg}`}
          accessibilityLabel={`${point.day}, ${point.kg} kilograms`}
          style={{
            position: 'absolute',
            left: `${xOf(point.day) * 100}%`,
            top: `${yOf(point.kg) * 100}%`,
            width: 8,
            height: 8,
            marginLeft: -4,
            marginTop: -4,
            borderRadius: 4,
            backgroundColor: ink,
          }}
        />
      ))}
    </View>
  );
}

function WeightInline() {
  const repo = useRepository();
  const [unit, setUnit] = useState<WeightUnitMode>('kg');
  const [kgText, setKgText] = useState('');
  const [stonesText, setStonesText] = useState('');
  const [poundsText, setPoundsText] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function save() {
    const parsed = weightReadingKg({ unit, kilograms: kgText, stones: stonesText, pounds: poundsText });
    if (!parsed.ok || parsed.kg == null) {
      setNote(parsed.ok ? 'Enter a weight.' : parsed.error);
      return;
    }
    const today = isoDay(new Date());
    const written = weightWaistWrite({ kg: parsed.kg, recordedOn: today, waistCm: null }, today);
    if (!written.ok || !written.sample) {
      setNote(written.ok ? 'Enter a weight.' : written.error);
      return;
    }
    setPending(true);
    setNote(null);
    try {
      await repo.saveHealth([written.sample]);
      setKgText('');
      setStonesText('');
      setPoundsText('');
      setNote('Weight saved');
      playSavedHaptic();
    } catch (err) {
      setNote(shownError(err, 'Could not save that weight.'));
    } finally {
      setPending(false);
    }
  }

  return (
    <View style={{ gap: 8 }}>
      <T variant="label">Update weight</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Choice label="kg" selected={unit === 'kg'} onPress={() => setUnit('kg')} />
        <Choice label="st-lb" selected={unit === 'stlb'} onPress={() => setUnit('stlb')} />
      </View>
      {unit === 'kg' ? (
        <Field label="Weight (kg)" value={kgText} onChangeText={setKgText} keyboardType="decimal-pad" />
      ) : (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Field label="Stones" value={stonesText} onChangeText={setStonesText} keyboardType="number-pad" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Pounds" value={poundsText} onChangeText={setPoundsText} keyboardType="decimal-pad" />
          </View>
        </View>
      )}
      <Button label="Save weight" pending={pending} pendingLabel="Saving..." onPress={() => void save()} />
      {note ? <T>{note}</T> : null}
    </View>
  );
}
