import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { useRepository, useSnapshot } from '@/data';
import type { Mood } from '@/data/types';
import { checkInSaveError, gratefulForLine, MOOD_SCORES, planCheckInGratitude, recentCheckInDays } from '@/domain/checkIns';
import { formatUkWhen, isoDay } from '@/domain/dates';
import { randomId } from '@/domain/id';
import { moodStreakCount } from '@/domain/profileSharing';
import { CheckInWeek } from '@/ui/CheckInWeek';
import { ScrollTarget } from '@/ui/ScrollTarget';
import { CheckInSectionShare } from '@/ui/SectionShare';
import { ShareOnProfile } from '@/ui/ShareOnProfile';
import { Button, Card, Choice, ErrorNote, Field, playSavedHaptic, Screen, T } from '@/ui/ui';

export default function CheckIn() {
  const repo = useRepository();
  const snap = useSnapshot();
  const router = useRouter();
  const [mood, setMood] = useState<Mood>(5);
  const [sleep, setSleep] = useState('7');
  const [craving, setCraving] = useState(3);
  const [note, setNote] = useState('');
  const [grateful, setGrateful] = useState('');
  const draftId = useRef(randomId());
  const saving = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [savedCraving, setSavedCraving] = useState<number | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [dirty, setDirty] = useState(true);

  useEffect(() => {
    if (!savedNote) return;
    const timer = setTimeout(() => setSavedNote(null), 2500);
    return () => clearTimeout(timer);
  }, [savedNote]);

  function touch<T>(set: (value: T) => void) {
    return (value: T) => {
      setDirty(true);
      setSavedNote(null);
      set(value);
    };
  }

  function save() {
    if (saving.current) return;
    const sleepHours = Number(sleep);
    if (!Number.isFinite(sleepHours) || sleepHours < 0 || sleepHours > 24) {
      setError('Sleep needs to be between 0 and 24 hours.');
      return;
    }
    const planned = planCheckInGratitude(grateful);
    if (!planned.ok) {
      setError(planned.message);
      return;
    }
    const id = draftId.current;
    saving.current = true;
    setPending(true);
    setError(null);
    void repo.addCheckIn({ id, mood, sleepHours, craving, note, gratitude: planned.body }).then(() => {
      draftId.current = randomId();
      setSavedCraving(craving);
      setNote('');
      setGrateful('');
      setDirty(false);
      setSavedNote('Saved');
      playSavedHaptic();
    }).catch((err: unknown) => setError(checkInSaveError(err))).finally(() => {
      saving.current = false;
      setPending(false);
    });
  }

  return (
    <Screen
      eyebrow="Daily"
      title="How is today?"
      intro="Mood, sleep, and craving. Thumos reads this history. It is not a score."
      footer={(
        <View style={{ gap: 8 }}>
          {savedNote ? <T>{savedNote}</T> : null}
          <Button label="Save check-in" pending={pending} disabled={!dirty || pending} disabledReason={dirty ? undefined : 'Change the check-in to save.'} onPress={save} />
        </View>
      )}
    >
      <CheckInSectionShare />
      <View style={{ gap: 8 }}>
        <Card>
          <T variant="label">Mood streak</T>
          <T variant="title">{moodStreakCount(snap.checkIns, isoDay(new Date()))}</T>
          <T variant="muted">Check-in days in a row. Only this count can be shared.</T>
        </Card>
        <ShareOnProfile
          label="Share mood streak"
          item="Mood streak"
          on={snap.sharing.moodStreak}
          sensitive
          apply={(sharing, selected) => ({ ...sharing, moodStreak: selected })}
        />
      </View>
      <ScrollTarget id="mood">
        <T variant="label">Mood, 1 to 10</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {MOOD_SCORES.map((value) => (
            <Choice key={value} label={String(value)} selected={mood === value} onPress={() => touch(setMood)(value)} />
          ))}
        </View>
      </ScrollTarget>
      <Field label="Sleep last night (hours)" value={sleep} onChangeText={touch(setSleep)} keyboardType="decimal-pad" />
      <ScrollTarget id="craving">
        <T variant="label">Craving, 0 to 10</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {Array.from({ length: 11 }, (_, value) => (
            <Choice key={value} label={String(value)} selected={craving === value} onPress={() => touch(setCraving)(value)} />
          ))}
        </View>
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
      <ErrorNote>{error}</ErrorNote>
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
        <CheckInWeek days={recentCheckInDays(snap.checkIns, new Date())} />
      </Card>
      <ScrollTarget id="recent">
      <T variant="label">Recent</T>
      {snap.checkIns.length === 0 ? <T variant="muted">No check-ins yet.</T> : null}
      {snap.checkIns.slice(0, 8).map((item) => {
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
