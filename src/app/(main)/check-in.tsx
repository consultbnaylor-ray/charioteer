import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { useRepository, useSnapshot } from '@/data';
import { MOODS } from '@/data/catalogue';
import type { Mood } from '@/data/types';
import { formatUkWhen } from '@/domain/dates';
import { shownError } from '@/domain/errors';
import { ShareOnProfile } from '@/ui/ShareOnProfile';
import { Button, Card, Choice, ErrorNote, Field, playSavedHaptic, Screen, T } from '@/ui/ui';

export default function CheckIn() {
  const repo = useRepository();
  const snap = useSnapshot();
  const router = useRouter();
  const [mood, setMood] = useState<Mood>(3);
  const [sleep, setSleep] = useState('7');
  const [craving, setCraving] = useState(3);
  const [note, setNote] = useState('');
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
    const sleepHours = Number(sleep);
    if (!Number.isFinite(sleepHours) || sleepHours < 0 || sleepHours > 24) {
      setError('Sleep needs to be between 0 and 24 hours.');
      return;
    }
    setPending(true);
    setError(null);
    void repo.addCheckIn({ mood, sleepHours, craving, note }).then(() => {
      setSavedCraving(craving);
      setNote('');
      setDirty(false);
      setSavedNote('Saved');
      playSavedHaptic();
    }).catch((err: unknown) => setError(shownError(err, 'Could not save.'))).finally(() => setPending(false));
  }

  return (
    <Screen
      eyebrow="Daily"
      title="How is today?"
      intro="Mood, sleep, and craving. Thumos reads this history. It is not a score."
      footer={(
        <View style={{ gap: 8 }}>
          {savedNote ? <T>{savedNote}</T> : null}
          <Button label="Save check-in" pending={pending} disabled={!dirty || pending} onPress={save} />
        </View>
      )}
    >
      <T variant="label">Mood</T>
      <ShareOnProfile
        detail="mood streak"
        on={snap.sharing.moodStreak}
        sensitive
        apply={(sharing, selected) => ({ ...sharing, moodStreak: selected })}
      />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {MOODS.map((item) => (
          <Choice key={item.value} label={item.label} selected={mood === item.value} onPress={() => touch(setMood)(item.value)} />
        ))}
      </View>
      <Field label="Sleep last night (hours)" value={sleep} onChangeText={touch(setSleep)} keyboardType="decimal-pad" />
      <T variant="label">Craving, 0 to 10</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {Array.from({ length: 11 }, (_, value) => (
          <Choice key={value} label={String(value)} selected={craving === value} onPress={() => touch(setCraving)(value)} />
        ))}
      </View>
      <Field label="Note, if you want" value={note} onChangeText={touch(setNote)} multiline placeholder="What is actually going on?" />
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
      <T variant="label">Recent</T>
      {snap.checkIns.length === 0 ? <T variant="muted">No check-ins yet.</T> : null}
      {snap.checkIns.slice(0, 8).map((item) => (
        <Card key={item.id}>
          <T>{formatUkWhen(item.createdAt)}</T>
          <T variant="muted">Mood {item.mood}/5 · sleep {item.sleepHours}h · craving {item.craving}/10</T>
          {item.note ? <T>{item.note}</T> : null}
        </Card>
      ))}
    </Screen>
  );
}
