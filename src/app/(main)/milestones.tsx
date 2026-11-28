import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { useSnapshot } from '@/data';
import { distanceSeries, weekDistanceSummary } from '@/domain/dailyActivity';
import { formatUkDate, formatUkLong } from '@/domain/dates';
import { londonDay } from '@/domain/healthInsights';
import { MILESTONES, milestoneReachedOn } from '@/domain/milestones';
import { savingsFromTypicalWeek } from '@/domain/savings';
import { DAY_MS, soberElapsed } from '@/domain/sober';
import { soberDaysThisMonth, soberRecord } from '@/domain/soberRecord';
import { showsSoberRecord } from '@/domain/stage';
import { useHealthSources } from '@/health/useHealthSources';
import { GlanceSheet } from '@/ui/GlanceSheet';
import { HexBadge, useReduceMotion } from '@/ui/gridChrome';
import { ShareCard, type ShareCardModel } from '@/ui/ShareCards';
import { useAppTheme } from '@/ui/theme';
import { Button, Card, Screen, T } from '@/ui/ui';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * Sobriety milestones. A slip resets the streak on screen.
 * The total, the longest stretch, and the badges stay.
 */
export default function Milestones() {
  const theme = useAppTheme();
  const reduce = useReduceMotion();
  const router = useRouter();
  const snap = useSnapshot();
  const { readings } = useHealthSources();
  const [why, setWhy] = useState(false);
  const profile = snap.profile;
  if (!profile) return null;
  const now = new Date();
  const sober = showsSoberRecord(profile.stage);
  const started = sober && profile.sobrietyStartedAt ? new Date(profile.sobrietyStartedAt) : null;
  const record = soberRecord(started, snap.relapses, now);
  const showTotal = record.streakDays === 0 && record.totalDays > 0;
  const hero = showTotal ? record.totalDays : record.streakDays;
  const heroLabel = showTotal ? 'Total days' : 'Days';
  const glow = reduce ? undefined : {
    textShadowColor: theme.grid.sobriety,
    textShadowRadius: 10,
    textShadowOffset: { width: 0, height: 0 },
  };
  const saved = savedEstimate(profile.weeklySpendGbp, profile.weeklyUnits, started, snap.relapses, now);
  const month = soberDaysThisMonth(started, snap.relapses, now);
  const london = londonDay(now);
  const monthDistance = weekDistanceSummary(distanceSeries(london, Number(london.slice(8, 10)), readings.dailies), london, now);
  const checkIns = snap.checkIns.filter((item) => {
    const date = new Date(item.createdAt);
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  }).length;
  const milestoneCard = milestoneShare({
    name: profile.displayName || 'Friend',
    hero,
    heroLabel,
    longest: record.longestDays,
    total: record.totalDays,
    next: record.next?.label ?? 'A year and on',
    saved,
  });
  const monthSaved = profile.weeklySpendGbp != null && profile.weeklyUnits != null
    ? savingsFromTypicalWeek(profile.weeklySpendGbp, profile.weeklyUnits, month.days * DAY_MS)
    : null;
  const monthCard = monthShare({
    month: MONTHS[now.getMonth()] ?? 'This month',
    days: month.days,
    checkIns,
    distance: monthDistance?.total ?? null,
    saved: monthSaved,
    resets: month.resets.length,
  });

  return (
    <Screen eyebrow="Your record" title="Sober streak">
      {sober ? null : (
        <Card>
          <T>Milestones start when you stop. Nothing here assumes you already have.</T>
          <Button label="Back to today" tone="quiet" onPress={() => router.dismissTo('/home' as never)} />
        </Card>
      )}
      <Card featured style={{ borderColor: theme.grid.sobriety }}>
        <T variant="label" style={{ color: theme.grid.sobriety, textAlign: 'center' }}>Sober streak</T>
        <T variant="hero" style={[{ textAlign: 'center', color: theme.colors.ink }, glow]}>{hero}</T>
        <T variant="label" style={{ textAlign: 'center' }}>{heroLabel}</T>
        {showTotal ? <T style={{ textAlign: 'center' }}>This stretch just started. Your total and badges stay.</T> : null}
        {record.streakDays === 0 && record.totalDays === 0 ? <T style={{ textAlign: 'center' }}>The clock has just started.</T> : null}
        {started ? <T variant="muted" style={{ textAlign: 'center' }}>Since {formatUkDate(started)} · {record.streakHours === 1 ? '1 hour' : `${record.streakHours} hours`} on this stretch</T> : <T variant="muted" style={{ textAlign: 'center' }}>Set a start date on Today.</T>}
      </Card>
      <Card>
        <T variant="label">Milestones</T>
        <View accessibilityLabel={badgeLabel(record.earned, record.next?.key ?? null)} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
          {MILESTONES.map((milestone) => {
            const state = record.earned.has(milestone.key) ? 'earned' : record.next?.key === milestone.key ? 'next' : 'ahead';
            return <HexBadge key={milestone.key} label={milestone.key} state={state} color={theme.grid.sobriety} />;
          })}
        </View>
        {started && record.next ? (
          <View style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <T variant="label">Next: {record.next.label}</T>
              <T variant="label">{record.daysToNext == null ? '' : `${record.daysToNext} to go`}</T>
            </View>
            <View style={{ height: 8, borderRadius: 4, backgroundColor: theme.colors.line, overflow: 'hidden' }}>
              <View style={{ width: `${Math.round(record.nextFill * 100)}%`, height: 8, backgroundColor: theme.grid.sobriety }} />
            </View>
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Stat label="Longest" value={String(record.longestDays)} />
          <Stat label="Total sober" value={String(record.totalDays)} />
          <Stat label="Saved" value={saved == null ? '—' : formatWholePounds(saved.moneyGbp)} />
        </View>
        <T variant="muted">A slip resets the streak, never your total or your badges.</T>
        {saved ? <T variant="muted">Saved is an estimate from your usual week, across this stretch and earlier ones.</T> : null}
      </Card>
      <ShareCard card={milestoneCard} label="Share milestone" />
      <ShareCard card={monthCard} label="Share this month" />
      <Button label="Why it matters" tone="quiet" onPress={() => setWhy(true)} />
      <Pressable accessibilityRole="button" accessibilityLabel="Back to today" onPress={() => router.dismissTo('/home' as never)} style={{ minHeight: 44, justifyContent: 'center' }}>
        <T style={{ fontFamily: theme.font.bodyStrong }}>Back to today</T>
      </Pressable>
      <GlanceSheet visible={why} title="Why it matters" onClose={() => setWhy(false)}>
        <T>A slip resets this stretch. The days already kept, the longest run, and the badges stay, so one day does not wipe the record.</T>
        {MILESTONES.map((milestone) => (
          <View key={milestone.key} style={{ gap: 2 }}>
            <T style={{ fontFamily: theme.font.bodyStrong }}>{milestone.badge}</T>
            <T variant="muted">{milestone.detail}</T>
            {started && record.earned.has(milestone.key) ? <T variant="muted">{formatUkLong(milestoneReachedOn(milestone.key, started))}</T> : null}
          </View>
        ))}
      </GlanceSheet>
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const theme = useAppTheme();
  return (
    <View style={{ flex: 1, minWidth: 0, borderWidth: 1, borderColor: theme.colors.line, borderRadius: 12, padding: 10, gap: 4 }}>
      <View>
        {label.split(' ').map((word) => (
          <T key={word} variant="label" style={{ letterSpacing: 0.4, fontSize: 11 * theme.scale, lineHeight: 13 * theme.scale }}>{word}</T>
        ))}
      </View>
      <T
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.5}
        style={{ width: '100%', fontFamily: theme.font.display, fontSize: 22 * theme.scale, lineHeight: 26 * theme.scale }}
      >
        {value}
      </T>
    </View>
  );
}

/** Whole pounds. Pence are what pushed £324.08 onto a second line in a third-width tile. */
function formatWholePounds(amount: number): string {
  const pounds = Math.round(amount);
  return `£${pounds.toLocaleString('en-GB')}`;
}

function badgeLabel(earned: ReadonlySet<string>, next: string | null): string {
  const have = [...earned];
  const earnedLine = have.length ? `Earned ${have.join(', ')}.` : 'No badge yet.';
  return `${earnedLine}${next ? ` Next ${next}.` : ''}`;
}

function savedEstimate(
  spend: number | null,
  units: number | null,
  started: Date | null,
  stretches: readonly { daysKept: number }[],
  now: Date,
): { moneyGbp: number; units: number } | null {
  if (spend == null || units == null) return null;
  const current = started ? savingsFromTypicalWeek(spend, units, soberElapsed(started, now).totalMs) : { moneyGbp: 0, units: 0 };
  const past = stretches.reduce((sum, stretch) => {
    const piece = savingsFromTypicalWeek(spend, units, Math.max(0, stretch.daysKept) * DAY_MS);
    return { moneyGbp: sum.moneyGbp + piece.moneyGbp, units: sum.units + piece.units };
  }, { moneyGbp: 0, units: 0 });
  return { moneyGbp: current.moneyGbp + past.moneyGbp, units: current.units + past.units };
}

function milestoneShare(input: {
  name: string;
  hero: number;
  heroLabel: string;
  longest: number;
  total: number;
  next: string;
  saved: { moneyGbp: number } | null;
}): ShareCardModel {
  const savedLine = input.saved ? formatWholePounds(input.saved.moneyGbp) : 'not estimated';
  return {
    kicker: 'Charioteer',
    title: 'Milestone',
    figure: String(input.hero),
    unit: input.heroLabel,
    lines: [
      `${input.name}`,
      `Longest ${input.longest}. Total sober ${input.total}.`,
      `Next: ${input.next}. Saved ${savedLine}.`,
    ],
    message: `Charioteer. ${input.hero} ${input.heroLabel.toLowerCase()}. Longest ${input.longest}. Total sober ${input.total}. Next: ${input.next}. Saved ${savedLine}.`,
  };
}

function monthShare(input: {
  month: string;
  days: number;
  checkIns: number;
  distance: string | null;
  saved: { moneyGbp: number } | null;
  resets: number;
}): ShareCardModel {
  const lines = [
    `${input.days} sober days this month.`,
    `${input.checkIns} check-ins.`,
  ];
  if (input.distance) lines.push(`${input.distance} moved.`);
  if (input.saved) lines.push(`Saved ${formatWholePounds(input.saved.moneyGbp)}, estimated from the usual week.`);
  if (input.resets > 0) lines.push(input.resets === 1 ? 'One reset is already in the history.' : `${input.resets} resets are already in the history.`);
  return {
    kicker: 'Month',
    title: input.month,
    figure: String(input.days),
    unit: 'sober days',
    lines,
    message: `Charioteer, ${input.month}. ${lines.join(' ')}`,
  };
}
