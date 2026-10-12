import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { useRepository, useSnapshot } from '@/data';
import { recentCheckInDays } from '@/domain/checkIns';
import { correctedSoberStart } from '@/domain/correctStart';
import { formatUkDate, formatUkLong, isoDay, startOfLocalDay } from '@/domain/dates';
import { earnedMilestones, MILESTONES, milestoneReachedOn } from '@/domain/milestones';
import { formatGbp, savingsFromTypicalWeek } from '@/domain/savings';
import { shownError } from '@/domain/errors';
import { soberElapsed } from '@/domain/sober';
import { buildHealthInsights } from '@/domain/healthInsights';
import { quoteOfTheDay } from '@/domain/stoicQuotes';
import { VISION_EMPTY_STATEMENT } from '@/domain/visionBoard';
import { daysUntil, drinkFreeThisWeek, showsSoberRecord, SUDDEN_STOP_WARNING, toggleDrinkFreeDay } from '@/domain/stage';
import { CheckInWeek } from '@/ui/CheckInWeek';
import { ShareOnProfile } from '@/ui/ShareOnProfile';
import { UnitsGuide } from '@/ui/UnitsGuide';
import { DateField } from '@/ui/DateField';
import { InPlainWords } from '@/ui/InPlainWords';
import { Button, Card, EditMark, EditSheet, ErrorNote, Field, Screen, T } from '@/ui/ui';
import { radius, useAppTheme } from '@/ui/theme';

function greeting(date: Date) {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function Home() {
  const snap = useSnapshot();
  const repo = useRepository();
  const router = useRouter();
  const theme = useAppTheme();
  const profile = snap.profile;
  const [now, setNow] = useState(() => new Date());
  const dailyQuote = quoteOfTheDay(now);
  const [relapseOpen, setRelapseOpen] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [edit, setEdit] = useState<null | 'sober' | 'week'>(null);
  const [draftDate, setDraftDate] = useState(() => startOfLocalDay(new Date()));
  const [draftSpend, setDraftSpend] = useState('');
  const [draftUnits, setDraftUnits] = useState('');
  const [pending, setPending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void repo.reload();
    }, [repo]),
  );

  async function pullToRefresh() {
    setRefreshing(true);
    try {
      await repo.reload();
    } finally {
      setRefreshing(false);
    }
  }

  function openCorrection() {
    if (!profile?.sobrietyStartedAt) return;
    setError(null);
    setDraftDate(new Date(profile.sobrietyStartedAt));
    setEdit('sober');
  }

  function openWeek() {
    setError(null);
    setDraftSpend(profile?.weeklySpendGbp?.toString() ?? '');
    setDraftUnits(profile?.weeklyUnits?.toString() ?? '');
    setEdit('week');
  }

  async function saveCorrection() {
    if (!profile) return;
    setPending(true);
    setError(null);
    try {
      await repo.updateProfile({ sobrietyStartedAt: correctedSoberStart(draftDate, profile.sobrietyStartedAt) });
      setEdit(null);
    } catch (err) {
      setError(shownError(err, 'Could not save the date.'));
    } finally {
      setPending(false);
    }
  }

  async function saveWeek() {
    const weeklySpendGbp = Number(draftSpend);
    const weeklyUnits = Number(draftUnits);
    if (!Number.isFinite(weeklySpendGbp) || weeklySpendGbp < 0 || !Number.isFinite(weeklyUnits) || weeklyUnits < 0) {
      setError('Spend and units need to be zero or more.');
      return;
    }
    setPending(true);
    setError(null);
    try {
      await repo.updateProfile({ weeklySpendGbp, weeklyUnits });
      setEdit(null);
    } catch (err) {
      setError(shownError(err, 'Could not save.'));
    } finally {
      setPending(false);
    }
  }

  if (!profile) return null;
  const sober = showsSoberRecord(profile.stage);
  const started = sober && profile.sobrietyStartedAt ? new Date(profile.sobrietyStartedAt) : null;
  const todayKey = isoDay(now);
  const freeThisWeek = drinkFreeThisWeek(profile.drinkFreeOn, now);
  const quitDays = profile.plannedQuitAt ? daysUntil(profile.plannedQuitAt, now) : null;
  const elapsed = started ? soberElapsed(started, now) : null;
  const saved = elapsed && profile.weeklySpendGbp != null && profile.weeklyUnits != null
    ? savingsFromTypicalWeek(profile.weeklySpendGbp, profile.weeklyUnits, elapsed.totalMs)
    : null;
  const earned = new Set((started ? earnedMilestones(started, now) : []).map((item) => item.key));
  const week = recentCheckInDays(snap.checkIns, now);
  const today = week[week.length - 1];
  const checkedToday = today.mood != null;
  const healthHeadlines = buildHealthInsights({
    today: todayKey,
    samples: snap.health,
    soberOn: sober && profile.sobrietyStartedAt ? isoDay(new Date(profile.sobrietyStartedAt)) : null,
    stage: profile.stage,
  }).headlines.slice(0, 3);

  return (
    <Screen eyebrow={greeting(now)} title={profile.displayName || 'Friend'} refreshing={refreshing} onRefresh={() => void pullToRefresh()}>
      {sober ? (
      <View style={{ gap: 8 }}>
      <Card onPress={openCorrection} accessibilityLabel="Correct the sober start date">
        <EditMark label="Sober" />
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
      <ShareOnProfile
        label="Share days sober"
        item="Days sober"
        on={snap.sharing.soberDays}
        sensitive
        apply={(sharing, selected) => ({ ...sharing, soberDays: selected })}
      />
      </View>
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
              label={profile.drinkFreeOn.includes(todayKey) ? 'Today stays drink-free' : 'Mark today drink-free'}
              tone="quiet"
              onPress={() => {
                void repo.updateProfile({ drinkFreeOn: toggleDrinkFreeDay(profile.drinkFreeOn, todayKey) }).catch((err: unknown) => setError(shownError(err, 'Could not save.')));
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
      <Card>
        <T variant="label">Quote of the day</T>
        <T>{dailyQuote.text}</T>
        <T variant="muted">{dailyQuote.author} · {dailyQuote.source}</T>
        <InPlainWords plain={dailyQuote.plain} />
        <Button label="Stoic quotes" tone="quiet" onPress={() => router.push('/quotes' as never)} />
      </Card>
      {sober ? (
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Card style={{ flex: 1 }} onPress={openWeek} accessibilityLabel="Edit weekly spend">
            <EditMark label="Saved" />
            <T variant="title">{saved ? formatGbp(saved.moneyGbp) : '—'}</T>
            <T variant="muted">{profile.weeklySpendGbp != null ? `from £${profile.weeklySpendGbp} a week` : 'Add your usual spend'}</T>
          </Card>
          <Card style={{ flex: 1 }} onPress={openWeek} accessibilityLabel="Edit weekly units">
            <EditMark label="Units avoided" />
            <T variant="title">{saved ? saved.units : '—'}</T>
            <T variant="muted">{profile.weeklyUnits != null ? `from ${profile.weeklyUnits} a week` : 'Add your usual units'}</T>
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
                  <T style={{ color: theme.colors.bg, fontFamily: theme.font.body, fontSize: 12 * theme.scale, letterSpacing: 0 }}>{formatUkLong(milestoneReachedOn(milestone.key, started))}</T>
                ) : null}
              </View>
            );
          })}
        </View>
      </Card> : null}
      <Card>
        <CheckInWeek days={week} />
      </Card>
      <Card>
        <T variant="label">Today</T>
        <T>{checkedToday ? `Mood ${today.mood}/10 · craving ${today.craving}/10. You can add another if the day changed shape.` : 'A check-in takes a few seconds: mood, sleep, craving.'}</T>
        <Button label={checkedToday ? 'Update check-in' : 'Check in'} tone="quiet" onPress={() => router.push('/check-in' as never)} />
      </Card>
      <Card>
        <T variant="label">Health Stats</T>
        {healthHeadlines.length === 0 ? (
          <T variant="muted">Not enough readings yet to compare this week with the one before.</T>
        ) : (
          healthHeadlines.map((line) => <T key={line}>{line}</T>)
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="See all health stats"
          onPress={() => router.push('/health' as never)}
          style={{ minHeight: 44, justifyContent: 'center' }}
        >
          <T style={{ fontFamily: theme.font.bodyStrong }}>See all</T>
        </Pressable>
      </Card>
      <Card>
        <T variant="label">My 5-year vision</T>
        {profile.visionStatement ? (
          <T>{profile.visionStatement}</T>
        ) : (
          <T style={{ color: theme.colors.placeholder }}>{VISION_EMPTY_STATEMENT}</T>
        )}
        {snap.visionItems.length ? (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {snap.visionItems.slice(0, 3).map((item) => (
              <View key={item.id} style={{ width: 56, height: 56, borderRadius: 10, overflow: 'hidden', backgroundColor: theme.colors.sunken }}>
                {item.previewUrl ? <Image source={{ uri: item.previewUrl }} style={{ width: 56, height: 56 }} contentFit="cover" accessibilityIgnoresInvertColors /> : null}
              </View>
            ))}
          </View>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open vision board"
          onPress={() => router.push('/vision' as never)}
          style={{ minHeight: 44, justifyContent: 'center' }}
        >
          <T style={{ fontFamily: theme.font.bodyStrong }}>Open</T>
        </Pressable>
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
      <EditSheet
        visible={edit != null}
        title={edit === 'week' ? 'Your usual week' : 'Correct the start date'}
        intro={edit === 'week'
          ? 'An estimate from what you tell us. Savings and units avoided use these figures.'
          : 'This fixes the day you stopped. It is a correction, not a relapse, and it does not add a reset to your history.'}
        saveLabel={edit === 'week' ? 'Save spend and units' : 'Save the correction'}
        pending={pending}
        onClose={() => { if (!pending) setEdit(null); }}
        onSave={() => void (edit === 'week' ? saveWeek() : saveCorrection())}
      >
        {edit === 'week' ? (
          <>
            <Field label="Typical spend per week (£)" value={draftSpend} onChangeText={setDraftSpend} keyboardType="decimal-pad" />
            <Field label="Typical units per week" value={draftUnits} onChangeText={setDraftUnits} keyboardType="decimal-pad" />
            <UnitsGuide onChange={setDraftUnits} stage={profile.stage} weeklySpend={draftSpend} currentUnits={draftUnits} />
          </>
        ) : (
          <DateField label="Date you stopped" value={draftDate} onChange={setDraftDate} maximumDate={new Date()} hint="Today or an earlier day." />
        )}
        <ErrorNote>{error}</ErrorNote>
      </EditSheet>
    </Screen>
  );
}
