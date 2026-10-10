import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { useRepository, useSnapshot } from '@/data';
import { HEALTH_LABELS } from '@/data/catalogue';
import { formatUkCompact, formatUkDate, formatUkLong, isoDay } from '@/domain/dates';
import { earnedMilestones, MILESTONES, milestoneReachedOn } from '@/domain/milestones';
import { formatGbp, savingsFromTypicalWeek } from '@/domain/savings';
import { shownError } from '@/domain/errors';
import { soberElapsed } from '@/domain/sober';
import { daysUntil, drinkFreeThisWeek, showsSoberRecord, SUDDEN_STOP_WARNING, toggleDrinkFreeDay } from '@/domain/stage';
import { Button, Card, ErrorNote, Field, Meter, Screen, T } from '@/ui/ui';
import { radius, useAppTheme } from '@/ui/theme';

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
  const sober = showsSoberRecord(profile.stage);
  const started = sober && profile.sobrietyStartedAt ? new Date(profile.sobrietyStartedAt) : null;
  const today = isoDay(now);
  const freeThisWeek = drinkFreeThisWeek(profile.drinkFreeOn, now);
  const quitDays = profile.plannedQuitAt ? daysUntil(profile.plannedQuitAt, now) : null;
  const elapsed = started ? soberElapsed(started, now) : null;
  const saved = elapsed && profile.weeklySpendGbp != null && profile.weeklyUnits != null
    ? savingsFromTypicalWeek(profile.weeklySpendGbp, profile.weeklyUnits, elapsed.totalMs)
    : null;
  const earned = new Set((started ? earnedMilestones(started, now) : []).map((item) => item.key));
  const trend = [...snap.checkIns].slice(0, 7).reverse();
  const checkedToday = snap.checkIns.some((item) => localDay(new Date(item.createdAt)) === localDay(now));
  const latestHealth = new Map<string, (typeof snap.health)[number]>();
  for (const sample of snap.health) {
    if (!latestHealth.has(sample.kind)) latestHealth.set(sample.kind, sample);
  }

  return (
    <Screen eyebrow={greeting(now)} title={profile.displayName || 'Friend'}>
      {sober ? (
      <Card>
        <T variant="label">Sober</T>
        <T variant="hero">{elapsed ? elapsed.days : '—'}</T>
        <T variant="title">{elapsed ? (elapsed.days === 1 ? 'day' : 'days') : 'Set a start date'}</T>
        {elapsed ? (
          <T variant="muted">
            {elapsed.days === 0 && elapsed.hours === 0
              ? 'The clock has just started.'
              : elapsed.hours === 1
                ? 'and 1 hour'
                : `and ${elapsed.hours} hours`}
          </T>
        ) : null}
        {started ? <T variant="muted">Since {formatUkDate(started)}</T> : null}
      </Card>
      ) : (
      <Card>
        {profile.stage === 'trying_to_stop' ? (
          <>
            <T variant="label">Trying to stop</T>
            <T variant="title">{quitDays == null ? 'No date yet' : quitDays === 0 ? 'Today' : quitDays === 1 ? '1 day to go' : quitDays > 1 ? `${quitDays} days to go` : 'That date has passed'}</T>
            {profile.plannedQuitAt ? <T variant="muted">{formatUkLong(profile.plannedQuitAt)}</T> : <T>You can set a date when you are ready.</T>}
            <T>{SUDDEN_STOP_WARNING}</T>
          </>
        ) : null}
        {profile.stage === 'cutting_down' ? (
          <>
            <T variant="label">Cutting down</T>
            {profile.drinkFreeDaysGoal != null ? (
              <T variant="title">{freeThisWeek} of {profile.drinkFreeDaysGoal}</T>
            ) : (
              <T variant="title">{freeThisWeek}</T>
            )}
            <T>{profile.drinkFreeDaysGoal != null ? 'drink-free days this week, against your goal.' : 'drink-free days this week.'}</T>
            {profile.weeklyUnitsGoal != null ? <T variant="muted">Units goal: {profile.weeklyUnitsGoal} a week.</T> : null}
            <Button
              label={profile.drinkFreeOn.includes(today) ? 'Today stays drink-free' : 'Mark today drink-free'}
              tone="quiet"
              onPress={() => {
                void repo.updateProfile({ drinkFreeOn: toggleDrinkFreeDay(profile.drinkFreeOn, today) }).catch((err: unknown) => setError(shownError(err, 'Could not save.')));
              }}
            />
          </>
        ) : null}
        {profile.stage === 'exploring' ? (
          <>
            <T variant="label">When you’re ready</T>
            <T>You can look around, talk to Thumos, and decide what you want. Nothing here assumes you have stopped.</T>
          </>
        ) : null}
      </Card>
      )}
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
      {sober ? <Card>
        <T variant="label">Milestones</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
          {MILESTONES.map((milestone) => {
            const on = earned.has(milestone.key);
            return (
              <View key={milestone.key} style={{ paddingVertical: 6, paddingHorizontal: 10, borderRadius: radius.sm, borderWidth: 1, borderColor: on ? theme.colors.ink : theme.colors.line, backgroundColor: on ? theme.colors.ink : theme.colors.sunken }}>
                <T variant="label" style={{ color: on ? theme.colors.bg : theme.colors.muted }}>{milestone.badge}</T>
                {on && started ? (
                  <T style={{ color: theme.colors.bg, fontFamily: theme.font.body, fontSize: 12 * theme.scale, letterSpacing: 0 }}>{formatUkCompact(milestoneReachedOn(milestone.key, started))}</T>
                ) : null}
              </View>
            );
          })}
        </View>
      </Card> : null}
      {trend.length > 0 ? (
        <Card>
          <T variant="label">Recent check-ins</T>
          <Meter label="Mood" max={5} points={trend.map((item) => ({ id: item.id, value: item.mood }))} />
          <Meter label="Craving" max={10} points={trend.map((item) => ({ id: `${item.id}-craving`, value: item.craving }))} />
        </Card>
      ) : null}
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
      {sober ? <Card>
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
                }).catch((err: unknown) => setError(shownError(err, 'Could not save that.')));
              }}
            />
          </View>
        ) : (
          <Button label="I need to reset the clock" tone="quiet" onPress={() => setRelapseOpen(true)} />
        )}
        {snap.relapses[0] ? <T variant="muted">Last reset {formatUkDate(snap.relapses[0].occurredAt)}, kept {snap.relapses[0].daysKept} days before it.</T> : null}
      </Card> : null}
      <ErrorNote>{error}</ErrorNote>
    </Screen>
  );
}
