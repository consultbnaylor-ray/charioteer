import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';

import { useRepository, useSnapshot } from '@/data';
import type { CheckIn, Mood } from '@/data/types';
import {
  CHECK_IN_SAVED_BANNER,
  checkInCoversDay,
  checkInSaveError,
  checkInSaveView,
  gratefulForLine,
  MOOD_SCORES,
  planCheckInGratitude,
} from '@/domain/checkIns';
import { formatUkWhen, isoDay } from '@/domain/dates';
import { randomId } from '@/domain/id';
import { moodStreakCount } from '@/domain/profileSharing';
import { CheckInWeek } from '@/ui/CheckInWeek';
import { ScrollTarget } from '@/ui/ScrollTarget';
import { CheckInSectionShare } from '@/ui/SectionShare';
import { ShareOnProfile } from '@/ui/ShareOnProfile';
import { statsToneColors } from '@/ui/statsPalette';
import { useAppTheme } from '@/ui/theme';
import { Button, Card, Choice, ErrorNote, Field, playSavedHaptic, Screen, T } from '@/ui/ui';

function SavedBanner() {
  const theme = useAppTheme();
  const good = statsToneColors(theme.scheme).good;
  return (
    <Card style={{ backgroundColor: good.bg, borderColor: good.ink }}>
      <T style={{ color: good.ink }}>{CHECK_IN_SAVED_BANNER}</T>
    </Card>
  );
}

export default function CheckIn() {
  const repo = useRepository();
  const snap = useSnapshot();
  const router = useRouter();
  const todayKey = isoDay(new Date());
  const [mood, setMood] = useState<Mood>(5);
  const [sleep, setSleep] = useState('7');
  const [craving, setCraving] = useState(3);
  const [note, setNote] = useState('');
  const [grateful, setGrateful] = useState('');
  const draftId = useRef(randomId());
  const saving = useRef(false);
  const touched = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [savedCraving, setSavedCraving] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const [dirty, setDirty] = useState(() => !checkInCoversDay(snap.checkIns, todayKey));
  const [flashed, setFlashed] = useState(false);
  const [loggedNow, setLoggedNow] = useState<CheckIn | null>(null);

  const checkIns = useMemo(() => {
    if (!loggedNow) return snap.checkIns;
    if (snap.checkIns.some((item) => item.id === loggedNow.id)) return snap.checkIns;
    return [loggedNow, ...snap.checkIns];
  }, [loggedNow, snap.checkIns]);
  const savedToday = checkInCoversDay(checkIns, todayKey);
  const saveView = checkInSaveView({ dirty, pending, failed, savedToday, flashed });

  useEffect(() => {
    if (touched.current) return;
    if (checkInCoversDay(checkIns, todayKey)) setDirty(false);
  }, [checkIns, todayKey]);

  useEffect(() => {
    if (!flashed) return;
    const timer = setTimeout(() => setFlashed(false), 2500);
    return () => clearTimeout(timer);
  }, [flashed]);

  function touch<T>(set: (value: T) => void) {
    return (value: T) => {
      touched.current = true;
      setDirty(true);
      setFlashed(false);
      setFailed(false);
      setError(null);
      set(value);
    };
  }

  function save() {
    if (saving.current || saveView.hold) return;
    const sleepHours = Number(sleep);
    if (!Number.isFinite(sleepHours) || sleepHours < 0 || sleepHours > 24) {
      setFailed(false);
      setError('Sleep needs to be between 0 and 24 hours.');
      return;
    }
    const planned = planCheckInGratitude(grateful);
    if (!planned.ok) {
      setFailed(false);
      setError(planned.message);
      return;
    }
    const id = draftId.current;
    saving.current = true;
    setPending(true);
    setError(null);
    setFailed(false);
    void repo.addCheckIn({ id, mood, sleepHours, craving, note, gratitude: planned.body }).then(() => {
      draftId.current = randomId();
      setSavedCraving(craving);
      setNote('');
      setGrateful('');
      setDirty(false);
      setFlashed(true);
      setLoggedNow({
        id,
        mood,
        sleepHours,
        craving,
        note: note.trim(),
        createdAt: new Date().toISOString(),
      });
      playSavedHaptic();
    }).catch((err: unknown) => {
      setError(checkInSaveError(err));
      setFailed(true);
      setFlashed(false);
    }).finally(() => {
      saving.current = false;
      setPending(false);
    });
  }

  return (
    <Screen
      eyebrow="Daily"
      title="How is today?"
      intro="Mood, sleep, and craving. Thumos reads this history. It is not a score."
      banner={flashed ? <SavedBanner /> : null}
      footer={(
        <View style={{ gap: 8 }}>
          <ErrorNote>{error}</ErrorNote>
          <Button
            label={saveView.label}
            accessibilityLabel={saveView.spoken}
            pending={pending}
            pendingLabel="Saving..."
            tone={saveView.success ? 'success' : 'primary'}
            disabled={saveView.hold || pending}
            onPress={save}
          />
        </View>
      )}
    >
      <CheckInSectionShare />
      <View style={{ gap: 8 }}>
        <Card>
          <T variant="label">Mood streak</T>
          <T variant="title">{moodStreakCount(checkIns, todayKey)}</T>
          <T variant="muted">Check-in days in a row. Only this count can be shared.</T>
        </Card>
        <ShareOnProfile
          boxed
          label="Share mood streak"
          item="Mood streak"
          on={snap.sharing.moodStreak}
          sensitive
          apply={(sharing, selected) => ({ ...sharing, moodStreak: selected })}
        />
      </View>
      <ScrollTarget id="mood">
        <Card>
          <T variant="label">Mood, 1 to 10</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {MOOD_SCORES.map((value) => (
              <Choice key={value} label={String(value)} selected={mood === value} onPress={() => touch(setMood)(value)} />
            ))}
          </View>
        </Card>
      </ScrollTarget>
      <Field label="Sleep last night (hours)" value={sleep} onChangeText={touch(setSleep)} keyboardType="decimal-pad" />
      <ScrollTarget id="craving">
        <Card>
          <T variant="label">Craving, 0 to 10</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {Array.from({ length: 11 }, (_, value) => (
              <Choice key={value} label={String(value)} selected={craving === value} onPress={() => touch(setCraving)(value)} />
            ))}
          </View>
        </Card>
      </ScrollTarget>
      <Field label="Note, if you want" value={note} onChangeText={touch(setNote)} multiline placeholder="What is actually going on?" />
      <Field
        label="Grateful for, if you want"
        value={grateful}
        onChangeText={touch(setGrateful)}
        multiline
        maxLength={602}
        placeholder="Up to three short lines"
        hint="Saved into your Gratitude Diary. Leave it empty and nothing is added."
      />
      {savedCraving != null && savedCraving >= 6 ? (
        <Card>
          <T variant="title">That craving is high.</T>
          <T>You do not have to wait it out alone. Craving support has a timer, a breathing exercise, and your reasons.</T>
          <Button label="Open support" tone="sos" onPress={() => router.push('/thumos?mode=craving' as never)} />
        </Card>
      ) : null}
      {savedCraving != null ? (
        <Card>
          <T variant="title">Add to your Gratitude Diary</T>
          <T>A line you want to keep. There is no streak to break.</T>
          <Button label="Add to your Gratitude Diary" onPress={() => router.push('/gratitude' as never)} />
        </Card>
      ) : null}
      <Card>
        <CheckInWeek checkIns={checkIns} ranged />
      </Card>
      <ScrollTarget id="recent">
      <T variant="label">Recent</T>
      {checkIns.length === 0 ? <T variant="muted">No check-ins yet.</T> : null}
      {checkIns.slice(0, 8).map((item) => {
        const gratefulLine = gratefulForLine(snap.gratitude.find((entry) => entry.checkInId === item.id)?.body ?? '');
        return (
          <Card key={item.id}>
            <T>{formatUkWhen(item.createdAt)}</T>
            <T variant="muted">Mood {item.mood}/10 · sleep {item.sleepHours}h · craving {item.craving}/10</T>
            {item.note ? <T>{item.note}</T> : null}
            {gratefulLine ? <T variant="muted">{gratefulLine}</T> : null}
          </Card>
        );
      })}
      </ScrollTarget>
    </Screen>
  );
}
