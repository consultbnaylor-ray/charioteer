import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { useRepository, useSnapshot } from '@/data';
import { shownError } from '@/domain/errors';
import { normaliseTrainingSchedule, trainingScheduleSummary } from '@/domain/healthPlan';
import { useAppTheme } from '@/ui/theme';
import { Button, Card, Choice, ErrorNote, Field, playSavedHaptic, T } from '@/ui/ui';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

/** Usual gym week on You. Closed until they open it. */
export function TrainingScheduleCard() {
  const snap = useSnapshot();
  const repo = useRepository();
  const theme = useAppTheme();
  const saved = snap.trainingSchedule;
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState<string[]>(saved?.days ?? []);
  const [typical, setTypical] = useState(String(saved?.typicalMinutes ?? 30));
  const [longerDay, setLongerDay] = useState<string | null>(saved?.longerDay ?? null);
  const [longerMinutes, setLongerMinutes] = useState(saved?.longerMinutes ? String(saved.longerMinutes) : '45');
  const [walkDay, setWalkDay] = useState<string | null>(saved?.walkDay ?? null);
  const [note, setNote] = useState(saved?.note ?? '');
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);

  useEffect(() => {
    if (dirty) return;
    setDays(saved?.days ?? []);
    setTypical(String(saved?.typicalMinutes ?? 30));
    setLongerDay(saved?.longerDay ?? null);
    setLongerMinutes(saved?.longerMinutes ? String(saved.longerMinutes) : '45');
    setWalkDay(saved?.walkDay ?? null);
    setNote(saved?.note ?? '');
  }, [saved, dirty]);

  function edit(apply: () => void) {
    setDirty(true);
    setSavedNote(null);
    apply();
  }

  function toggleDay(day: string) {
    edit(() => {
      setDays((current) => {
        const on = current.includes(day);
        if (on && longerDay === day) setLongerDay(null);
        if (!on && walkDay === day) setWalkDay(null);
        return on ? current.filter((item) => item !== day) : [...current, day];
      });
    });
  }

  async function save() {
    setError(null);
    const typicalMinutes = Number(typical.trim());
    const longerValue = Number(longerMinutes.trim());
    if (!days.length) {
      setError('Choose at least one training day.');
      return;
    }
    if (!Number.isInteger(typicalMinutes) || typicalMinutes < 10 || typicalMinutes > 180) {
      setError('Typical minutes need to be between 10 and 180.');
      return;
    }
    if (longerDay && (!Number.isInteger(longerValue) || longerValue <= typicalMinutes || longerValue > 240)) {
      setError('The longer day needs more minutes than a usual day, up to 240.');
      return;
    }
    const next = normaliseTrainingSchedule({
      days,
      typicalMinutes,
      longerDay,
      longerMinutes: longerDay ? longerValue : null,
      walkDay,
      note,
    });
    if (!next) {
      setError('Could not save that training schedule.');
      return;
    }
    setPending(true);
    try {
      await repo.saveTrainingSchedule(next);
      setDirty(false);
      setSavedNote('Saved ✓');
      playSavedHaptic();
    } catch (err) {
      setError(shownError(err, 'Could not save that training schedule.'));
    } finally {
      setPending(false);
    }
  }

  async function clear() {
    setPending(true);
    setError(null);
    try {
      await repo.saveTrainingSchedule(null);
      setDirty(false);
      setSavedNote('Cleared');
      playSavedHaptic();
    } catch (err) {
      setError(shownError(err, 'Could not save that training schedule.'));
    } finally {
      setPending(false);
    }
  }

  const offDays = DAYS.filter((day) => !days.includes(day));

  return (
    <Card>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="My training schedule"
        accessibilityState={{ expanded: open }}
        aria-expanded={open}
        onPress={() => setOpen((value) => !value)}
        style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
      >
        <T style={{ fontFamily: theme.font.bodyStrong, flex: 1 }}>My training schedule</T>
        <T variant="muted">{open ? 'Hide' : 'Show'}</T>
      </Pressable>
      {open ? null : <T variant="muted">{trainingScheduleSummary(saved)}</T>}
      {open ? (
        <View style={{ gap: 8 }}>
          <T variant="muted">Days you usually train, and how long. A walk day stays a walk.</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {DAYS.map((day) => (
              <Choice key={day} label={day} selected={days.includes(day)} onPress={() => toggleDay(day)} />
            ))}
          </View>
          <Field
            label="Typical minutes"
            value={typical}
            onChangeText={(value) => edit(() => setTypical(value))}
            keyboardType="number-pad"
          />
          <T variant="label">Longer day</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            <Choice label="No longer day" selected={longerDay == null} onPress={() => edit(() => setLongerDay(null))} />
            {days.map((day) => (
              <Choice key={`longer-${day}`} label={`Longer ${day}`} selected={longerDay === day} onPress={() => edit(() => setLongerDay(day))} />
            ))}
          </View>
          {longerDay ? (
            <Field
              label="Longer session (min)"
              value={longerMinutes}
              onChangeText={(value) => edit(() => setLongerMinutes(value))}
              keyboardType="number-pad"
            />
          ) : null}
          <T variant="label">Walk day</T>
          {days.length && offDays.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              <Choice label="No walk day" selected={walkDay == null} onPress={() => edit(() => setWalkDay(null))} />
              {offDays.map((day) => (
                <Choice key={`walk-${day}`} label={`Walk ${day}`} selected={walkDay === day} onPress={() => edit(() => setWalkDay(day))} />
              ))}
            </View>
          ) : (
            <T variant="muted">{days.length ? 'Turn a day off to mark a walk.' : 'Choose the days you train. A day you leave off can be a walk.'}</T>
          )}
          <Field
            label="Note"
            value={note}
            onChangeText={(value) => edit(() => setNote(value))}
            placeholder="Optional"
            multiline
          />
          {savedNote ? <T>{savedNote}</T> : null}
          <ErrorNote>{error}</ErrorNote>
          <Button label="Save schedule" pending={pending} disabled={pending} onPress={() => void save()} />
          {saved ? <Button label="Clear schedule" tone="quiet" pending={pending} disabled={pending} onPress={() => void clear()} /> : null}
        </View>
      ) : null}
    </Card>
  );
}
