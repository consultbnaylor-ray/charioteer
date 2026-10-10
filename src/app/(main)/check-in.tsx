import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useRepository, useSnapshot } from '@/data';
import { MOODS } from '@/data/catalogue';
import type { Mood } from '@/data/types';
import { shownError } from '@/domain/errors';
import { Button, Card, Choice, ErrorNote, Field, Screen, T } from '@/ui/ui';

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
  const [pending, setPending] = useState(false);

  return (
    <Screen eyebrow="Daily" title="How is today?" intro="Mood, sleep, and craving. Thumos reads this history. It is not a score.">
      <T variant="label">Mood</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {MOODS.map((item) => (
          <Choice key={item.value} label={item.label} selected={mood === item.value} onPress={() => setMood(item.value)} />
        ))}
      </View>
      <Field label="Sleep last night (hours)" value={sleep} onChangeText={setSleep} keyboardType="decimal-pad" />
      <T variant="label">Craving, 0 to 10</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {Array.from({ length: 11 }, (_, value) => (
          <Choice key={value} label={String(value)} selected={craving === value} onPress={() => setCraving(value)} />
        ))}
      </View>
      <Field label="Note, if you want" value={note} onChangeText={setNote} multiline placeholder="What is actually going on?" />
      <ErrorNote>{error}</ErrorNote>
      <Button
        label="Save check-in"
        pending={pending}
        onPress={() => {
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
          }).catch((err: unknown) => setError(shownError(err, 'Could not save.'))).finally(() => setPending(false));
        }}
      />
      {savedCraving != null && savedCraving >= 6 ? (
        <Card>
          <T variant="title">That craving is high.</T>
          <T>You do not have to wait it out alone. Craving support has a timer, a breathing exercise, and your reasons.</T>
          <Button label="Open support" tone="sos" onPress={() => router.push('/thumos?mode=craving' as never)} />
        </Card>
      ) : null}
      <T variant="label">Recent</T>
      {snap.checkIns.length === 0 ? <T variant="muted">No check-ins yet.</T> : null}
      {snap.checkIns.slice(0, 8).map((item) => (
        <Card key={item.id}>
          <T>{new Date(item.createdAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</T>
          <T variant="muted">Mood {item.mood}/5 · sleep {item.sleepHours}h · craving {item.craving}/10</T>
          {item.note ? <T>{item.note}</T> : null}
        </Card>
      ))}
    </Screen>
  );
}
