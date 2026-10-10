import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { useRepository, useSnapshot } from '@/data';
import { HEALTH_LABELS } from '@/data/catalogue';
import { earnedMilestones, MILESTONES } from '@/domain/milestones';
import { formatGbp, savingsFromTypicalWeek } from '@/domain/savings';
import { formatSoberElapsed, soberElapsed } from '@/domain/sober';
import { Button, Card, ErrorNote, Field, Screen, T } from '@/ui/ui';
import { useAppTheme } from '@/ui/theme';

function greeting(date: Date) {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function localDay(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export default function Home() {
  const snap = useSnapshot();
  const repo = useRepository();
  const router = useRouter();
  const theme = useAppTheme();
  const profile = snap.profile;
  const [now, setNow] = useState(() => new Date());
  const [relapseOpen, setRelapseOpen] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  if (!profile) return null;
  const started = profile.sobrietyStartedAt ? new Date(profile.sobrietyStartedAt) : null;
  const elapsed = started ? soberElapsed(started, now) : null;
  const saved = elapsed && profile.weeklySpendGbp != null && profile.weeklyUnits != null
    ? savingsFromTypicalWeek(profile.weeklySpendGbp, profile.weeklyUnits, elapsed.totalMs)
    : null;
  const earned = new Set((started ? earnedMilestones(started, now) : []).map((item) => item.key));
  const checkedToday = snap.checkIns.some((item) => localDay(new Date(item.createdAt)) === localDay(now));
  const latestHealth = new Map<string, (typeof snap.health)[number]>();
  for (const sample of snap.health) {
    if (!latestHealth.has(sample.kind)) latestHealth.set(sample.kind, sample);
  }

  return (
    <Screen eyebrow={greeting(now)} title={profile.displayName || 'Friend'}>
      <Card>
        <T variant="label">Sober</T>
        <T variant="hero">{elapsed ? elapsed.days : '—'}</T>
        <T variant="title">{elapsed ? (elapsed.days === 1 ? 'day' : 'days') : 'Set a start date'}</T>
        {elapsed ? <T variant="muted">and {elapsed.hours === 1 ? '1 hour' : `${elapsed.hours} hours`}. {formatSoberElapsed(elapsed)}.</T> : null}
      </Card>
      {saved ? (
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Card style={{ flex: 1 }}>
            <T variant="label">Saved</T>
            <T variant="title">{formatGbp(saved.moneyGbp)}</T>
            <T variant="muted">from £{profile.weeklySpendGbp} a week</T>
          </Card>
          <Card style={{ flex: 1 }}>
            <T variant="label">Units avoided</T>
            <T variant="title">{saved.units}</T>
            <T variant="muted">from {profile.weeklyUnits} a week</T>
          </Card>
        </View>
      ) : null}
      <Button
        label="SOS"
        tone="sos"
        accessibilityLabel="SOS, open craving support with Thumos"
        onPress={() => router.push('/thumos?mode=craving' as never)}
      />
      <T variant="muted">One tap opens Thumos in craving support: a ten-minute timer, breathing, and your reasons.</T>
      <Card>
        <T variant="label">Milestones</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
          {MILESTONES.map((milestone) => {
            const on = earned.has(milestone.key);
            return (
              <View key={milestone.key} style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, backgroundColor: on ? theme.colors.sageSoft : theme.colors.sunken }}>
                <T variant="muted" style={{ color: on ? theme.colors.sage : theme.colors.muted, fontFamily: theme.font.bodyStrong }}>{milestone.badge}</T>
              </View>
            );
          })}
        </View>
      </Card>
      <Card>
        <T variant="label">Today</T>
        <T>{checkedToday ? 'Check-in done. You can add another if the day changed shape.' : 'A check-in takes a few seconds: mood, sleep, craving.'}</T>
        <Button label={checkedToday ? 'Update check-in' : 'Check in'} tone="quiet" onPress={() => router.push('/check-in' as never)} />
      </Card>
      <Card>
        <T variant="label">Body</T>
        {latestHealth.size === 0 ? <T variant="muted">No readings yet. Log them, or sync Apple Health on iOS.</T> : null}
        {[...latestHealth.values()].slice(0, 4).map((sample) => (
          <T key={sample.id}>{HEALTH_LABELS[sample.kind] ?? sample.kind}: {sample.value} {sample.unit}</T>
        ))}
        <Button label="Health" tone="quiet" onPress={() => router.push('/health' as never)} />
      </Card>
      <Card>
        <T variant="label">If you drank</T>
        <T>A lapse is information, not a verdict. The days you already kept stay in your history. Resetting the clock just starts this stretch again.</T>
        {relapseOpen ? (
          <View style={{ gap: 10 }}>
            <Field label="Anything you want to remember" value={note} onChangeText={setNote} placeholder="Optional" />
            <Button
              label="Reset the clock, kindly"
              onPress={() => {
                setError(null);
                void repo.recordRelapse(note).then(() => {
                  setNote('');
                  setRelapseOpen(false);
                }).catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not save that.'));
              }}
            />
          </View>
        ) : (
          <Button label="I need to reset the clock" tone="quiet" onPress={() => setRelapseOpen(true)} />
        )}
        {snap.relapses[0] ? <T variant="muted">Last reset kept {snap.relapses[0].daysKept} days before it.</T> : null}
      </Card>
      <ErrorNote>{error}</ErrorNote>
    </Screen>
  );
}
