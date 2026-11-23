import { useState } from 'react';
import { View } from 'react-native';

import { checkInChart } from '@/domain/chartSeries';
import {
  checkInChartBucket,
  checkInChartMeaning,
  checkInChartPeriod,
  checkInDayForPoint,
  checkInLoggedSplit,
  checkInPreviousWindow,
  checkInRangeFigure,
  checkInWindow,
  latestCheckInOnDay,
  CHECK_IN_CHART_PERIODS,
  type CheckInSeriesKind,
} from '@/domain/checkInCharts';
import { formatMoodAverage, weeklyMoodAverage, type CheckInDay, type CheckInPoint } from '@/domain/checkIns';
import { formatUkDate } from '@/domain/dates';
import { moodCravingBars, moodFigure } from '@/domain/measureFigures';
import { periodHeading, periodPhrase } from '@/domain/statWindow';
import type { WorkoutHistoryPeriod } from '@/domain/workoutHistoryCharts';
import { useStatPeriod } from '@/health/useStatPeriod';
import { MeasureBarsView, MeasureRingView, MeasureSplitView } from '@/ui/MeasuredFigure';
import { MoreInfo } from '@/ui/MoreInfo';
import { ReadingChart } from '@/ui/ReadingChart';
import { StatPeriodToggle } from '@/ui/StatPeriodToggle';
import { chartAccent } from '@/ui/statsPalette';
import { useAppTheme } from '@/ui/theme';
import { T } from '@/ui/ui';

export function CheckInWeek({
  days,
  checkIns,
  ranged = false,
}: {
  /** Fixed window, used by Today. The check-in page passes `checkIns` and `ranged` instead. */
  days?: CheckInDay[];
  checkIns?: readonly (CheckInPoint & { note?: string })[];
  ranged?: boolean;
}) {
  const [period] = useStatPeriod();
  const shownPeriod = checkInChartPeriod(period);
  const [selected, setSelected] = useState<string | null>(null);
  const today = new Date();
  const windowDays = ranged && checkIns ? checkInWindow(checkIns, today, shownPeriod) : (days ?? []);
  const previous = ranged && checkIns
    ? checkInPreviousWindow(checkIns, today, shownPeriod)
    : checkIns
      ? checkInPreviousWindow(checkIns, today, '7')
      : null;
  const periodForCopy: WorkoutHistoryPeriod = ranged ? shownPeriod : '7';
  const empty = windowDays.every((day) => day.mood == null && day.craving == null);
  const logged = windowDays.filter((day) => day.mood != null).length;
  const span = Math.max(windowDays.length, 1);
  const latest = [...windowDays].reverse().find((day) => day.mood != null);
  const moodAverage = weeklyMoodAverage(windowDays);
  const cravingAverage = weeklyMoodAverage(windowDays.map((day) => ({ mood: day.craving })));
  const todayKey = windowDays[windowDays.length - 1]?.day ?? '';
  const selectedDay = selected && windowDays.some((day) => day.day === selected) ? selected : null;
  const bucket = ranged ? checkInChartBucket(shownPeriod) : 'day';
  const emptyLine = !ranged || shownPeriod === '7'
    ? 'No check-ins in the last 7 days.'
    : `No check-ins in ${periodPhrase(shownPeriod)}.`;
  const splitLabel = !ranged || span === 7 ? 'This week' : periodHeading(shownPeriod);

  function choose(pointDay: string) {
    setSelected(checkInDayForPoint(pointDay, bucket, windowDays, todayKey));
  }

  return (
    <View style={{ gap: 12 }}>
      <T variant="label">Recent check-ins</T>
      {ranged ? <StatPeriodToggle periods={CHECK_IN_CHART_PERIODS} selected={shownPeriod} /> : null}
      <MeasureRingView label="Check-ins" ring={checkInRangeFigure(logged, span)} />
      <MeasureSplitView label={splitLabel} split={checkInLoggedSplit(logged, span)} />
      {latest?.mood != null ? (
        <>
          <MeasureRingView label="Mood" ring={moodFigure(latest.mood)} />
          {latest.craving != null ? (
            <MeasureBarsView label="Mood and craving" bars={moodCravingBars(latest.mood, latest.craving)} />
          ) : null}
        </>
      ) : null}
      {empty ? (
        <T variant="muted">{emptyLine}</T>
      ) : (
        <>
          <Series
            kind="mood"
            label="Mood"
            unit="/10"
            average={moodAverage == null ? null : formatMoodAverage(moodAverage)}
            days={windowDays}
            previous={previous}
            period={periodForCopy}
            bucket={bucket}
            onSelectDay={ranged ? choose : undefined}
          />
          <Series
            kind="craving"
            label="Craving"
            unit="/10"
            average={cravingAverage == null ? null : formatMoodAverage(cravingAverage)}
            days={windowDays}
            previous={previous}
            period={periodForCopy}
            bucket={bucket}
            onSelectDay={ranged ? choose : undefined}
          />
        </>
      )}
      {ranged && selectedDay ? <SelectedDay day={selectedDay} days={windowDays} checkIns={checkIns} /> : null}
    </View>
  );
}

function SelectedDay({
  day,
  days,
  checkIns,
}: {
  day: string;
  days: readonly CheckInDay[];
  checkIns?: readonly (CheckInPoint & { note?: string })[];
}) {
  const match = checkIns ? latestCheckInOnDay(checkIns, day) : null;
  const fromWindow = days.find((item) => item.day === day);
  const mood = match?.mood ?? fromWindow?.mood ?? null;
  const craving = match?.craving ?? fromWindow?.craving ?? null;
  return (
    <View accessibilityLabel={`Selected day ${formatUkDate(day)}`} style={{ gap: 4 }}>
      <T>{formatUkDate(day)}</T>
      {mood == null ? <T>No check-in on this day.</T> : <T>Mood {mood}/10 · craving {craving ?? '—'}/10</T>}
      {match?.note ? <T>{match.note}</T> : null}
    </View>
  );
}

function Series({
  kind,
  label,
  days,
  previous,
  period,
  bucket,
  onSelectDay,
  unit = '',
  average = null,
}: {
  kind: CheckInSeriesKind;
  label: string;
  days: CheckInDay[];
  previous: CheckInDay[] | null;
  period: WorkoutHistoryPeriod;
  bucket: 'day' | 'week' | 'month';
  onSelectDay?: (day: string) => void;
  unit?: string;
  average?: string | null;
}) {
  const theme = useAppTheme();
  const pick = (day: CheckInDay) => (kind === 'mood' ? day.mood : day.craving);
  const points = checkInChart(days.map((day) => ({ day: day.day, value: pick(day) })));
  const start = days[0]?.day;
  const end = days[days.length - 1]?.day;
  const meaning = checkInChartMeaning({
    kind,
    period,
    current: days.map((day) => ({ day: day.day, value: pick(day) })),
    previous: previous ? previous.map((day) => ({ day: day.day, value: pick(day) })) : null,
  });
  return (
    <View accessibilityLabel={`${label} chart`} style={{ gap: 6 }}>
      <T variant="label">{label}</T>
      {average ? <T variant="muted">{average}</T> : null}
      {start && end ? (
        <ReadingChart
          points={points}
          start={start}
          end={end}
          unit={unit}
          yTitle="Score"
          aggregate="mean"
          bucket={bucket}
          accent={chartAccent(label, theme.scheme) ?? undefined}
          accessibilityLabel={`${label} chart`}
          meaning="none"
          onSelectDay={onSelectDay}
        />
      ) : null}
      <MoreInfo about={`${label} chart`} title="What this means">
        {meaning.map((line, index) => <T key={`${index}-${line}`} variant="muted">{line}</T>)}
      </MoreInfo>
    </View>
  );
}
