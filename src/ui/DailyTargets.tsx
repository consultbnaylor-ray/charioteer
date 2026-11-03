import { Image } from 'expo-image';
import { useState } from 'react';
import { Modal, Pressable, View } from 'react-native';

import { useRepository, useSnapshot } from '@/data';
import { buildDailyTargets, DAILY_TARGETS_CAVEAT } from '@/domain/dailyTargets';
import { formatUkCompact } from '@/domain/dates';
import { isoDay } from '@/domain/dates';
import { shownError } from '@/domain/errors';
import { athleticVo2Target } from '@/domain/fitnessSnapshot';
import { chartScale, goalProgressSeries, type DatedValue, type GoalProgressPhoto } from '@/domain/goalProgress';
import { londonDay } from '@/domain/healthInsights';
import { weightPointsFrom } from '@/domain/nutrition';
import { weightReadingKg, weightWaistWrite, type WeightUnitMode } from '@/domain/weightEntry';
import { useHealthSources } from '@/health/useHealthSources';
import { pickProgressPhoto } from '@/ui/prepareProgressPhoto';
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
  const { samples, readings: watch } = useHealthSources();
  const settings = snap.nutrition;
  const targetKg = settings?.targetWeightKg ?? null;
  const targetOn = settings?.targetOn ?? null;
  const today = londonDay(new Date());
  const readings = weightPointsFrom(samples.length ? samples : snap.health ?? []);
  const current = readings.length ? readings[readings.length - 1] : undefined;
  const hasAim = settings?.goal != null || targetKg != null;
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
  if (!hasAim) return null;
  const vo2 = vo2Points(samples, (watch.userMetrics ?? []).flatMap((row) => (
    row.vo2Max != null && row.vo2Max > 0 ? [{ day: row.calendarDate, value: row.vo2Max }] : []
  )));
  const series = goalProgressSeries({
    today,
    targetOn,
    goal: settings?.goal ?? null,
    sex: settings?.goalSex ?? null,
    weight: readings.map((row) => ({ day: row.day, kg: row.kg })),
    vo2,
    weightTargetKg: targetKg,
    weightStartKg: settings?.targetStartKg ?? readings[0]?.kg ?? null,
  });
  const photos = snap.goalProgressPhotos ?? [];
  const green = statsToneColors(theme.scheme).good.ink;
  return (
    <Card>
      <T variant="label">Daily Targets</T>
      {plan ? (
        <>
          <T>{plan.headline}</T>
          <T>{plan.intake}</T>
          <T>{plan.activity}</T>
          <T>{plan.weigh}</T>
          {plan.pace ? <T>{plan.pace}</T> : null}
        </>
      ) : (
        <T variant="muted">{targetOn ? `Target date ${targetOn}` : 'Set an optional target date on the goal if you want a path on the graph.'}</T>
      )}
      <GoalProgressGraph
        series={series}
        photos={photos}
        ink={theme.colors.ink}
        line={theme.colors.line}
        accent={green}
        surface={theme.colors.surface}
      />
      <ProgressPhotoButton today={today} />
      {targetKg != null ? <WeightInline /> : null}
      <T variant="muted">{plan?.caveat ?? DAILY_TARGETS_CAVEAT}</T>
      {athleticVo2Target(settings?.goal ?? null, settings?.goalSex ?? null) ? null : (
        <T variant="muted">VO2 max is shown from the watch. A dashed VO2 path appears when the saved aim has a VO2 target.</T>
      )}
    </Card>
  );
}

function vo2Points(
  samples: readonly { kind: string; value: number; recordedOn: string }[],
  watch: readonly { day: string; value: number }[],
): DatedValue[] {
  const map = new Map<string, number>();
  for (const row of watch) {
    if (row.value > 0 && /^\d{4}-\d{2}-\d{2}$/.test(row.day)) map.set(row.day, row.value);
  }
  for (const sample of samples) {
    const day = sample.recordedOn.slice(0, 10);
    if (sample.kind === 'vo2_max' && sample.value > 0 && /^\d{4}-\d{2}-\d{2}$/.test(day)) map.set(day, sample.value);
  }
  return [...map.entries()].map(([day, value]) => ({ day, value }));
}

function GoalProgressGraph({
  series,
  photos,
  ink,
  line,
  accent,
  surface,
}: {
  series: ReturnType<typeof goalProgressSeries>;
  photos: readonly GoalProgressPhoto[];
  ink: string;
  line: string;
  accent: string;
  surface: string;
}) {
  const [open, setOpen] = useState<GoalProgressPhoto | null>(null);
  const repo = useRepository();
  const start = Date.parse(`${series.start}T00:00:00Z`);
  const span = Math.max(1, Date.parse(`${series.end}T00:00:00Z`) - start);
  const weightScale = chartScale([...series.weightActual, ...(series.weightPath ?? [])].map((point) => point.value));
  const vo2Scale = chartScale([...series.vo2Actual, ...(series.vo2Path ?? [])].map((point) => point.value));
  const xOf = (day: string) => Math.min(1, Math.max(0, (Date.parse(`${day}T00:00:00Z`) - start) / span));
  const yOf = (value: number, scale: { low: number; high: number }) => 1 - Math.min(1, Math.max(0, (value - scale.low) / Math.max(0.01, scale.high - scale.low)));
  const marks = [series.start, series.end].filter((day, index, all) => all.indexOf(day) === index);
  const nearest = (day: string, rows: DatedValue[]) => {
    const hit = rows.find((row) => row.day === day);
    return hit ? hit.value : null;
  };
  return (
    <View style={{ gap: 8, alignSelf: 'stretch' }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        <T>Weight, kg</T>
        <T style={{ color: accent }}>VO2 max, ml/kg/min</T>
        <T variant="muted">Dashed lines are the path to the target date.</T>
      </View>
      <View
        accessibilityLabel="Goal progress. Weight and VO2 max, with a dashed path when a target date is set."
        style={{ height: 180, alignSelf: 'stretch', borderWidth: 1, borderColor: line, borderRadius: 8, backgroundColor: surface }}
      >
        {[0.25, 0.5, 0.75].map((fraction) => (
          <View key={fraction} style={{ position: 'absolute', left: 36, right: 36, top: `${fraction * 100}%`, height: 1, backgroundColor: line }} />
        ))}
        <T style={{ position: 'absolute', left: 4, top: 4 }}>{Math.round(weightScale.high)}</T>
        <T style={{ position: 'absolute', left: 4, bottom: 4 }}>{Math.round(weightScale.low)}</T>
        <T style={{ position: 'absolute', right: 4, top: 4, color: accent }}>{Math.round(vo2Scale.high)}</T>
        <T style={{ position: 'absolute', right: 4, bottom: 4, color: accent }}>{Math.round(vo2Scale.low)}</T>
        <SeriesLine points={series.weightActual} xOf={xOf} yOf={(value) => yOf(value, weightScale)} color={ink} dashed={false} />
        <SeriesLine points={series.weightPath ?? []} xOf={xOf} yOf={(value) => yOf(value, weightScale)} color={ink} dashed />
        <SeriesLine points={series.vo2Actual} xOf={xOf} yOf={(value) => yOf(value, vo2Scale)} color={accent} dashed={false} />
        <SeriesLine points={series.vo2Path ?? []} xOf={xOf} yOf={(value) => yOf(value, vo2Scale)} color={accent} dashed />
        {photos.map((photo) => (
          <Pressable
            key={photo.id}
            accessibilityRole="button"
            accessibilityLabel={`Progress photo ${formatUkCompact(photo.recordedOn)}`}
            onPress={() => setOpen(photo)}
            style={{ position: 'absolute', left: `${xOf(photo.recordedOn) * 100}%`, top: '46%', width: 14, height: 14, marginLeft: -7, borderRadius: 7, borderWidth: 2, borderColor: accent, backgroundColor: surface }}
          />
        ))}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {marks.map((day) => <T key={day} variant="muted">{formatUkCompact(day)}</T>)}
      </View>
      <Modal visible={open != null} transparent animationType="fade" onRequestClose={() => setOpen(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'center', padding: 16 }}>
          {open ? (
            <View style={{ gap: 8, backgroundColor: surface, padding: 12, borderRadius: 8 }}>
              <T>{formatUkCompact(open.recordedOn)}</T>
              <T>{`Weight ${nearest(open.recordedOn, series.weightActual) ?? 'not logged'} kg`}</T>
              <T>{`VO2 max ${nearest(open.recordedOn, series.vo2Actual) ?? 'not logged'} ml/kg/min`}</T>
              {open.previewUrl ? <Image source={{ uri: open.previewUrl }} style={{ width: '100%', height: 240 }} contentFit="contain" accessibilityLabel="Progress photo" /> : <T>Photo saved. The preview appears after it syncs.</T>}
              <Button label="Delete photo" tone="quiet" onPress={() => { void repo.deleteGoalProgressPhoto(open.id).then(() => setOpen(null)); }} />
              <Button label="Close" tone="quiet" onPress={() => setOpen(null)} />
            </View>
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

function SeriesLine({
  points,
  xOf,
  yOf,
  color,
  dashed,
}: {
  points: readonly DatedValue[];
  xOf: (day: string) => number;
  yOf: (value: number) => number;
  color: string;
  dashed: boolean;
}) {
  return (
    <>
      {points.slice(1).map((point, index) => {
        if (dashed && index % 2 === 1) return null;
        const previous = points[index];
        if (!previous) return null;
        const left = xOf(previous.day) * 100;
        const width = Math.max(2, (xOf(point.day) - xOf(previous.day)) * 100);
        return (
          <View
            key={`${point.day}-${index}`}
            style={{ position: 'absolute', left: `${left}%`, width: `${width}%`, top: `${yOf(point.value) * 100}%`, height: 3, backgroundColor: color }}
          />
        );
      })}
      {points.map((point) => (
        <View
          key={`dot-${point.day}-${point.value}`}
          accessibilityLabel={`${point.day}, ${point.value}`}
          style={{ position: 'absolute', left: `${xOf(point.day) * 100}%`, top: `${yOf(point.value) * 100}%`, width: 8, height: 8, marginLeft: -4, marginTop: -4, borderRadius: 4, backgroundColor: color }}
        />
      ))}
    </>
  );
}

function ProgressPhotoButton({ today }: { today: string }) {
  const repo = useRepository();
  const [pending, setPending] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  async function take() {
    setPending(true);
    setNote(null);
    try {
      const picked = await pickProgressPhoto('camera');
      if (!picked) return;
      await repo.addGoalProgressPhoto(picked.bytes, picked.takenOn || today);
      setNote('Photo saved on that day. It is private and is not sent to Thumos.');
    } catch (err) {
      setNote(shownError(err, 'Could not save that photo.'));
    } finally {
      setPending(false);
    }
  }
  return (
    <View style={{ gap: 8 }}>
      <Button label="Take a photo to track progress visually" pending={pending} pendingLabel="Saving..." onPress={() => void take()} />
      {note ? <T variant="muted">{note}</T> : null}
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
