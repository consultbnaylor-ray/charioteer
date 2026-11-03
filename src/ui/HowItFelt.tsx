import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { useRepository, useSnapshot } from '@/data';
import { formatUkDate } from '@/domain/dates';
import { shownError } from '@/domain/errors';
import { appleDayValues } from '@/domain/dailyActivity';
import type { GarminSleep } from '@/domain/garminConnect';
import type { DeviceWorkout } from '@/domain/workoutRoute';
import { feelPatternLine, mealsBeforeSession, sleepHoursOnDay } from '@/domain/workoutFeel';
import { statsToneColors } from '@/ui/statsPalette';
import { useAppTheme } from '@/ui/theme';
import { Button, Choice, Field, T, playSavedHaptic } from '@/ui/ui';

const SCORES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

/** Closed until someone opens it. Notes stay on the account and are not sent to the coach. */
export function HowItFelt({
  day,
  workouts,
  sleep,
}: {
  day: string;
  workouts: readonly DeviceWorkout[];
  sleep: readonly GarminSleep[];
}) {
  const theme = useAppTheme();
  const snap = useSnapshot();
  const repo = useRepository();
  const [open, setOpen] = useState(false);
  const green = statsToneColors(theme.scheme).good.ink;
  const first = workouts[0];
  const key = first?.id ?? '';
  const saved = (snap.workoutFeelings ?? []).find((row) => row.recordedOn === day && row.workoutKey === key);
  const [note, setNote] = useState(saved?.note ?? '');
  const [effort, setEffort] = useState<number | null>(saved?.effort ?? null);
  const [mood, setMood] = useState<number | null>(saved?.mood ?? null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setNote(saved?.note ?? '');
    setEffort(saved?.effort ?? null);
    setMood(saved?.mood ?? null);
    setMessage(null);
  }, [day, key, saved?.note, saved?.effort, saved?.mood]);
  const hours = sleepHoursOnDay(
    day,
    sleep.map((row) => ({ calendarDate: row.calendarDate, durationSeconds: row.durationSeconds })),
    appleDayValues(snap.health, 'sleep_hours').map((row) => ({ day: row.day, value: row.value })),
  );
  const meals = mealsBeforeSession(snap.foodLogs, day, first?.startedAt ?? null);
  const pattern = feelPatternLine((snap.workoutFeelings ?? []).map((row) => ({
    effort: row.effort,
    sleepHours: sleepHoursOnDay(
      row.recordedOn,
      sleep.map((night) => ({ calendarDate: night.calendarDate, durationSeconds: night.durationSeconds })),
      appleDayValues(snap.health, 'sleep_hours').map((sample) => ({ day: sample.day, value: sample.value })),
    ),
  })));

  async function save() {
    setPending(true);
    setMessage(null);
    try {
      await repo.saveWorkoutFeeling({ recordedOn: day, workoutKey: key, note, effort, mood });
      setMessage('Saved');
      playSavedHaptic();
    } catch (err) {
      setMessage(shownError(err, 'Could not save that note.'));
    } finally {
      setPending(false);
    }
  }

  return (
    <View style={{ gap: 8, alignSelf: 'stretch' }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="How it felt"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        style={{ minHeight: 44, justifyContent: 'center' }}
      >
        <T variant="label" style={{ color: open ? green : theme.colors.muted }}>{open ? 'How it felt' : 'How it felt'}</T>
      </Pressable>
      {open ? (
        <View style={{ gap: 8 }}>
          <T>{formatUkDate(day)}</T>
          <T variant="muted">{workouts.length ? workouts.map((row) => row.label).join(', ') : 'No workout on this day. You can still note how the day felt.'}</T>
          <T>{hours == null ? 'Last night’s sleep: not logged' : `Last night’s sleep: ${hours} h`}</T>
          <T>{meals.count ? `${meals.count} meal${meals.count === 1 ? '' : 's'} before the session, ${meals.kcal} kcal` : 'No meals logged before the session'}</T>
          {pattern ? <T style={{ color: green }}>{pattern}</T> : null}
          <T variant="label">Effort, 1 to 10</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {SCORES.map((score) => (
              <Choice key={`effort-${score}`} label={String(score)} selected={effort === score} onPress={() => setEffort(score)} />
            ))}
          </View>
          <T variant="label">Mood, 1 to 10</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {SCORES.map((score) => (
              <Choice key={`mood-${score}`} label={String(score)} selected={mood === score} onPress={() => setMood(score)} />
            ))}
          </View>
          <Field label="How you felt after" value={note} onChangeText={setNote} placeholder="Optional" maxLength={500} />
          <Button label="Save how it felt" pending={pending} pendingLabel="Saving..." onPress={() => void save()} />
          {message ? <T>{message}</T> : null}
        </View>
      ) : null}
    </View>
  );
}
