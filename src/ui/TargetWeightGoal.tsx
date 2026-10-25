import { useState } from 'react';
import { View } from 'react-native';

import { useRepository, useSnapshot } from '@/data';
import { shownError } from '@/domain/errors';
import { isoDay, parseIsoDay } from '@/domain/dates';
import { formatWeightAmount, type WeightUnitMode } from '@/domain/goalWeightRange';
import { weightPointsFrom } from '@/domain/nutrition';
import {
  TARGET_BELOW_HEALTHY,
  formatIsoDay,
  reviewTargetWeight,
  settingsForTarget,
  targetProgressFill,
  targetTrendEstimate,
  type TargetDirection,
} from '@/domain/targetWeight';
import { KG_PER_POUND, POUNDS_PER_STONE, weightReadingKg } from '@/domain/weightEntry';
import { DateField } from '@/ui/DateField';
import { PlanTick } from '@/ui/PlanTick';
import { statsToneColors } from '@/ui/statsPalette';
import { useAppTheme } from '@/ui/theme';
import { UpdateWeightLink } from '@/ui/UpdateWeightLink';
import { Button, Choice, Field, T, playSavedHaptic } from '@/ui/ui';

export const TARGET_SAVED_LINE = 'Target weight saved';

function splitStones(kg: number): { stones: string; pounds: string } {
  const total = kg / KG_PER_POUND;
  let stones = Math.floor(total / POUNDS_PER_STONE);
  let pounds = Math.round((total - stones * POUNDS_PER_STONE) * 10) / 10;
  if (pounds >= POUNDS_PER_STONE) {
    stones += 1;
    pounds = 0;
  }
  return { stones: String(stones), pounds: String(pounds) };
}

export function TargetWeightProgress() {
  const snap = useSnapshot();
  const theme = useAppTheme();
  const settings = snap.nutrition;
  const targetKg = settings?.targetWeightKg ?? null;
  if (targetKg == null) return null;
  const readings = weightPointsFrom(snap.health ?? []);
  const current = readings.length ? readings[readings.length - 1] : undefined;
  const startKg = settings?.targetStartKg ?? readings[0]?.kg ?? null;
  const currentKg = current?.kg ?? null;
  const fill = targetProgressFill(startKg, currentKg, targetKg);
  const estimate = targetTrendEstimate({ currentKg, targetKg, readings });
  const direction: TargetDirection = currentKg == null ? 'hold' : currentKg - targetKg > 0.3 ? 'lose' : targetKg - currentKg > 0.3 ? 'gain' : 'hold';
  const height = snap.profile?.heightCm ?? null;
  const low = height != null && targetKg / ((height / 100) * (height / 100)) < 18.5;
  const lines = [
    startKg == null ? null : `Start weight ${formatWeightAmount(startKg, 'kg')}, when this target was set`,
    currentKg == null ? 'Current weight is not logged yet' : `Current weight ${formatWeightAmount(currentKg, 'kg')}, latest reading`,
    `Target weight ${formatWeightAmount(targetKg, 'kg')}`,
    `Progress ${Math.round(fill * 100)}% of the way, from the start weight to the target`,
    direction === 'lose' ? 'Direction, lose' : direction === 'gain' ? 'Direction, gain' : 'Direction, hold',
  ].filter((line): line is string => line != null);
  return (
    <View style={{ gap: 8 }}>
      <T variant="label">Target weight</T>
      {lines.map((line) => <T key={line}>{line}</T>)}
      <UpdateWeightLink />
      <View
        accessibilityLabel={`Progress ${Math.round(fill * 100)} percent of the way, from the start weight to the target`}
        style={{ height: 8, borderRadius: 4, backgroundColor: theme.colors.line, overflow: 'hidden' }}
      >
        <View style={{ width: `${Math.round(fill * 100)}%`, height: 8, backgroundColor: theme.colors.ink }} />
      </View>
      {settings?.targetOn ? <T>{`Target date ${formatIsoDay(settings.targetOn)}`}</T> : null}
      <T>{estimate.text}</T>
      {low ? <T>{TARGET_BELOW_HEALTHY}</T> : null}
    </View>
  );
}

export function TargetWeightForm() {
  const snap = useSnapshot();
  const repo = useRepository();
  const theme = useAppTheme();
  const settings = snap.nutrition;
  const saved = settings?.targetWeightKg ?? null;
  const [unit, setUnit] = useState<WeightUnitMode>('kg');
  const [kgText, setKgText] = useState(saved == null ? '' : String(saved));
  const [stonesText, setStonesText] = useState(saved == null ? '' : splitStones(saved).stones);
  const [poundsText, setPoundsText] = useState(saved == null ? '' : splitStones(saved).pounds);
  const [useDate, setUseDate] = useState(settings?.targetOn != null);
  const [date, setDate] = useState(parseIsoDay(settings?.targetOn ?? isoDay(new Date())));
  const [note, setNote] = useState<string | null>(null);
  const [savedTick, setSavedTick] = useState(false);
  const [pending, setPending] = useState(false);
  const readings = weightPointsFrom(snap.health ?? []);
  const current = readings.length ? readings[readings.length - 1] : undefined;
  const green = statsToneColors(theme.scheme).good.ink;
  const parsed = weightReadingKg({ unit, kilograms: kgText, stones: stonesText, pounds: poundsText });

  async function save() {
    if (!parsed.ok || parsed.kg == null) {
      setNote(parsed.ok ? 'Enter a target weight.' : parsed.error);
      setSavedTick(false);
      return;
    }
    const today = isoDay(new Date());
    const review = reviewTargetWeight({
      currentKg: current?.kg ?? null,
      heightCm: snap.profile?.heightCm ?? null,
      targetKg: parsed.kg,
      targetOn: useDate ? isoDay(date) : null,
      today,
    });
    if (!review.ok) {
      setNote(review.note);
      setSavedTick(false);
      return;
    }
    setPending(true);
    setNote(review.note);
    try {
      const start = settings?.targetStartKg ?? current?.kg ?? null;
      await repo.setNutritionSettings(settingsForTarget(repo.getSnapshot().nutrition, review, start));
      setSavedTick(true);
      if (review.targetOn) setDate(parseIsoDay(review.targetOn));
      playSavedHaptic();
    } catch (err) {
      setSavedTick(false);
      setNote(shownError(err, 'Could not save that target.'));
    } finally {
      setPending(false);
    }
  }

  return (
    <View style={{ gap: 8 }}>
      <T>{current ? `Current weight ${formatWeightAmount(current.kg, unit)}, latest reading` : 'Current weight is not logged yet. Add it on Body, or from Apple Health.'}</T>
      <UpdateWeightLink />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Choice label="kg" selected={unit === 'kg'} onPress={() => setUnit('kg')} />
        <Choice label="st-lb" selected={unit === 'stlb'} onPress={() => setUnit('stlb')} />
      </View>
      {unit === 'kg' ? (
        <Field label="Target weight (kg)" value={kgText} onChangeText={setKgText} keyboardType="decimal-pad" placeholder="78.0" />
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
      {!parsed.ok ? <T>{parsed.error}</T> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Choice label="No date" selected={!useDate} onPress={() => setUseDate(false)} />
        <Choice label="Target date" selected={useDate} onPress={() => setUseDate(true)} />
      </View>
      {useDate ? (
        <DateField label="Target date" value={date} onChange={setDate} earliestDate={parseIsoDay(isoDay(new Date()))} />
      ) : null}
      <Button label={pending ? 'Saving...' : 'Save target weight'} pending={pending} pendingLabel="Saving..." onPress={() => void save()} />
      {savedTick ? (
        <View accessibilityRole="text" accessibilityLabel={TARGET_SAVED_LINE} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <PlanTick done />
          </View>
          <T style={{ color: green }}>{TARGET_SAVED_LINE}</T>
        </View>
      ) : null}
      {note ? <T>{note}</T> : null}
      <TargetWeightProgress />
    </View>
  );
}
