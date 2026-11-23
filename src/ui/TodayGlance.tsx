import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { useSnapshot } from '@/data';
import { recentCheckInDays } from '@/domain/checkIns';
import { currentRestingHeartRate } from '@/domain/currentResting';
import { appleDayValues, distanceSeries, restingSeries, weekDistanceSummary } from '@/domain/dailyActivity';
import { isoDay } from '@/domain/dates';
import { buildHealthInsights } from '@/domain/healthInsights';
import { londonDay } from '@/domain/healthInsights';
import { dayItems, sumItems } from '@/domain/nutrition';
import { withPlannedMinutes } from '@/domain/plannedSession';
import { moodStreakCount } from '@/domain/profileSharing';
import { formatUkDate } from '@/domain/dates';
import { soberRecord } from '@/domain/soberRecord';
import { showsSoberRecord } from '@/domain/stage';
import { useHealthSources } from '@/health/useHealthSources';
import { GlanceSheet, RestingMeaningBody, StatTrio } from '@/ui/GlanceSheet';
import { GlowRing, MiniBars, MoodMarks, Sparkline, numberRangeLine, useReduceMotion } from '@/ui/gridChrome';
import { DataMeaning } from '@/ui/MoreInfo';
import { ChartMeaningCopy, chartWindowBucket, ReadingChart } from '@/ui/ReadingChart';
import { useAppTheme } from '@/ui/theme';
import { Card, T } from '@/ui/ui';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function shortDay(iso: string): string {
  const [, month, day] = iso.split('-').map(Number);
  return `${day ?? 1} ${MONTHS[(month ?? 1) - 1] ?? ''}`;
}

function sourceName(source: 'garmin' | 'apple'): string {
  return source === 'garmin' ? 'Garmin' : 'Apple Health';
}

/** One line. The figure shrinks instead of wrapping when the tile is narrow. */
function TileFigure({ children, size = 34 }: { children: ReactNode; size?: number }) {
  const theme = useAppTheme();
  return (
    <T
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.5}
      style={{ width: '100%', fontFamily: theme.font.display, fontSize: size * theme.scale, lineHeight: (size + 4) * theme.scale }}
    >
      {children}
    </T>
  );
}

function dateLine(now: Date): string {
  const weekday = now.toLocaleDateString('en-GB', { weekday: 'long' });
  const month = now.toLocaleDateString('en-GB', { month: 'short' });
  return `${weekday} ${now.getDate()} ${month}`;
}

function dayPart(now: Date): string {
  const hour = now.getHours();
  if (hour < 12) return 'Morning';
  if (hour < 18) return 'Afternoon';
  return 'Evening';
}

/**
 * The first screen of Today: one sober ring, four tiles, and one line.
 * Every number comes from the account. An empty tile stays empty.
 */
export function TodayGlance({ now, onCorrectDate }: { now: Date; onCorrectDate: () => void }) {
  const theme = useAppTheme();
  const reduce = useReduceMotion();
  const router = useRouter();
  const snap = useSnapshot();
  const { samples, readings } = useHealthSources();
  const [restingOpen, setRestingOpen] = useState(false);
  const profile = snap.profile;
  if (!profile || !showsSoberRecord(profile.stage)) return null;

  const started = profile.sobrietyStartedAt ? new Date(profile.sobrietyStartedAt) : null;
  const record = soberRecord(started, snap.relapses, now);
  const showTotal = record.streakDays === 0 && record.totalDays > 0;
  const hero = showTotal ? record.totalDays : record.streakDays;
  const heroLabel = showTotal ? 'Total days' : 'Days sober';
  const name = profile.displayName || 'Friend';
  const london = londonDay(now);
  const localDay = isoDay(now);
  const resting = currentRestingHeartRate({
    today: london,
    garmin: readings.dailies.map((day) => ({ day: day.calendarDate, value: day.restingHeartRateBpm })),
    samples,
  });
  const restingPoints = restingSeries(london, 7, appleDayValues(samples, 'resting_heart_rate'), readings.dailies)
    .filter((point) => point.value > 0 && point.empty !== true);
  const distancePoints = distanceSeries(london, 7, readings.dailies);
  const distance = weekDistanceSummary(distancePoints, london, now);
  const bestDistance = distancePoints.reduce((best, point) => (point.value > best ? point.value : best), 0);
  const proteinItems = dayItems(snap.foodLogs, london);
  const protein = proteinItems.length ? Math.round(sumItems(proteinItems).proteinG) : 0;
  const proteinTarget = snap.nutrition.proteinTarget;
  const proteinFill = proteinTarget && proteinTarget > 0 ? Math.min(1, protein / proteinTarget) : protein > 0 ? 1 : 0;
  const week = recentCheckInDays(snap.checkIns, now);
  const run = moodStreakCount(snap.checkIns, localDay);
  const headlines = buildHealthInsights({
    today: london,
    samples: withPlannedMinutes(samples, snap.plannedSessions),
    soberOn: started ? isoDay(started) : null,
    stage: profile.stage,
  }).headlines;
  const restingLine = numberRangeLine(restingPoints.map((point) => point.value), 'bpm');
  const insight = headlines[0] ?? restingLine ?? 'Not enough readings yet to compare the last 7 days with the 7 before.';
  const glow = reduce ? undefined : {
    textShadowColor: theme.grid.sobriety,
    textShadowRadius: 8,
    textShadowOffset: { width: 0, height: 0 },
  };
  const restingValues = restingPoints.map((point) => point.value);
  const restingLow = restingValues.length ? Math.min(...restingValues) : null;
  const restingHigh = restingValues.length ? Math.max(...restingValues) : null;
  const restingAvg = restingValues.length ? Math.round(restingValues.reduce((sum, value) => sum + value, 0) / restingValues.length) : null;

  return (
    <View style={{ gap: 12 }}>
      <View>
        <T variant="label">{dateLine(now)}</T>
        <T variant="display" style={{ textTransform: 'uppercase' }}>{dayPart(now)}, {name}</T>
      </View>
      <Card compact style={{ borderColor: theme.grid.sobriety }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <GlowRing size={132} strokeWidth={10} fill={started ? record.nextFill : 0} color={theme.grid.sobriety} track={theme.scheme === 'dark' ? '#1E2624' : theme.colors.line}>
            <T variant="display" style={[{ fontSize: 40 * theme.scale, lineHeight: 44 * theme.scale }, glow]}>{hero}</T>
            <T variant="label" style={{ textAlign: 'center' }}>{heroLabel}</T>
          </GlowRing>
          <View style={{ flex: 1, gap: 6 }}>
            <T variant="label" style={{ color: theme.grid.sobriety }}>Next milestone</T>
            <T variant="title" style={{ textTransform: 'uppercase' }}>{record.next ? record.next.label : 'A year and on'}</T>
            <T variant="muted">
              {record.daysToNext == null ? 'Set a start date' : record.daysToNext === 0 ? 'Reached' : `${record.daysToNext} to go`}
              {started ? ` · since ${formatUkDate(started)}` : ''}
            </T>
            {showTotal ? <T>This stretch just started. Your total and badges stay.</T> : null}
            {record.streakDays === 0 && record.totalDays === 0 ? <T>The clock has just started.</T> : null}
            <Pressable accessibilityRole="button" accessibilityLabel="Open milestones" onPress={() => router.push('/milestones' as never)} style={{ minHeight: 44, justifyContent: 'center' }}>
              <T style={{ color: theme.grid.sobriety, fontFamily: theme.font.bodyStrong, letterSpacing: 1.1 }}>MILESTONES</T>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Correct the sober start date" onPress={onCorrectDate} style={{ minHeight: 44, justifyContent: 'center' }}>
              <T variant="muted">Correct the date</T>
            </Pressable>
          </View>
        </View>
      </Card>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Card compact style={{ borderColor: theme.grid.heart }}>
            <Pressable accessibilityRole="button" accessibilityLabel="More about resting heart rate" onPress={() => setRestingOpen(true)} style={{ gap: 4, minHeight: 44 }}>
              <T variant="label" style={{ color: theme.grid.heart }}>Resting HR</T>
              <TileFigure>{resting ? resting.value : '—'}</TileFigure>
              <T variant="muted">{resting ? 'bpm' : 'No reading yet'}</T>
              <Sparkline values={restingValues} color={theme.grid.heart} />
              <T variant="muted">{resting ? `${sourceName(resting.source)} · ${shortDay(resting.day)}` : 'Garmin or Apple Health'}</T>
            </Pressable>
          </Card>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Card compact style={{ borderColor: theme.grid.activity }}>
            <Pressable accessibilityRole="button" accessibilityLabel="Open distance" onPress={() => router.push('/health' as never)} style={{ gap: 4, minHeight: 44 }}>
              <T variant="label" style={{ color: theme.grid.activity }}>Distance</T>
              <TileFigure>{distance ? distance.total.replace(' km', '') : '—'}</TileFigure>
              <T variant="muted">{distance ? 'km this week' : 'No distance yet'}</T>
              <MiniBars
                values={distancePoints.map((point) => point.value)}
                color={theme.grid.activity}
                bestIndex={distancePoints.findIndex((point) => point.value === bestDistance && bestDistance > 0)}
                dimIndex={distancePoints.findIndex((point) => point.day === london)}
              />
              <T variant="muted">{distance?.line ?? 'This week'}</T>
            </Pressable>
          </Card>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Card compact style={{ borderColor: theme.grid.food }}>
            <Pressable accessibilityRole="button" accessibilityLabel="Open nutrition" onPress={() => router.push('/nutrition' as never)} style={{ gap: 6, minHeight: 44 }}>
              <T variant="label" style={{ color: theme.grid.food }}>Protein</T>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <GlowRing size={54} strokeWidth={6} fill={proteinFill} color={theme.grid.food} track={theme.scheme === 'dark' ? '#2A2416' : theme.colors.line} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <TileFigure size={24}>{proteinItems.length ? protein : '—'}</TileFigure>
                  <T variant="muted">{proteinTarget ? `of ${Math.round(proteinTarget)} g` : 'No target yet'}</T>
                </View>
              </View>
            </Pressable>
          </Card>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Card compact style={{ borderColor: theme.grid.mind }}>
            <Pressable accessibilityRole="button" accessibilityLabel="Open check-in" onPress={() => router.push('/check-in' as never)} style={{ gap: 4, minHeight: 44 }}>
              <T variant="label" style={{ color: theme.grid.mind }}>Check-ins</T>
              <TileFigure>{run}</TileFigure>
              <T variant="muted">{run === 1 ? 'day run' : 'day run'}</T>
              <MoodMarks values={week.map((day) => day.mood)} color={theme.grid.mind} />
              <T variant="muted">Mood this week</T>
            </Pressable>
          </Card>
        </View>
      </View>
      <Card compact>
        <Pressable accessibilityRole="button" accessibilityLabel="See the health line" onPress={() => router.push('/health' as never)} style={{ minHeight: 44, justifyContent: 'center' }}>
          <T numberOfLines={3}>{insight}</T>
        </Pressable>
      </Card>
      <GlanceSheet visible={restingOpen} title="Resting heart rate" onClose={() => setRestingOpen(false)}>
        <DataMeaning about="resting heart rate">
          <RestingMeaningBody />
          <ChartMeaningCopy bucket={chartWindowBucket(restingPoints[0]?.day ?? london, london)} aggregate="mean" />
        </DataMeaning>
        <T variant="display">{resting ? resting.value : '—'}</T>
        <T variant="muted">{resting ? `${sourceName(resting.source)} · ${shortDay(resting.day)}` : 'No reading in the last 60 days.'}</T>
        {restingPoints.length > 1 ? (
          <ReadingChart
            points={restingPoints.map((point) => ({ day: point.day, value: point.value }))}
            start={restingPoints[0]?.day ?? london}
            end={london}
            unit="bpm"
            aggregate="mean"
            accent={theme.grid.heart}
            accessibilityLabel="Resting heart rate chart"
            meaning="none"
          />
        ) : (
          <T variant="muted">Not enough days for a chart yet.</T>
        )}
        {restingLow != null && restingAvg != null && restingHigh != null ? (
          <StatTrio low={String(restingLow)} average={String(restingAvg)} high={String(restingHigh)} unit="bpm" />
        ) : null}
        {restingLine ? <T>{restingLine}</T> : null}
        <Pressable accessibilityRole="button" accessibilityLabel="Month and year view" onPress={() => { setRestingOpen(false); router.push('/health' as never); }} style={{ minHeight: 44, justifyContent: 'center' }}>
          <T style={{ fontFamily: theme.font.bodyStrong }}>Month and year view</T>
        </Pressable>
      </GlanceSheet>
    </View>
  );
}
