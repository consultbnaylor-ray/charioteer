import { View } from 'react-native';

import { formatMoodAverage, weeklyMoodAverage, type CheckInDay } from '@/domain/checkIns';
import { checkInWeekFigure, countSplit, moodCravingBars, moodFigure } from '@/domain/measureFigures';
import { MeasureBarsView, MeasureRingView, MeasureSplitView } from '@/ui/MeasuredFigure';
import { ReadingChart } from '@/ui/ReadingChart';
import { T } from '@/ui/ui';

export function CheckInWeek({ days }: { days: CheckInDay[] }) {
  const empty = days.every((day) => day.mood == null && day.craving == null);
  const moodAverage = weeklyMoodAverage(days);
  const logged = days.filter((day) => day.mood != null).length;
  const latest = [...days].reverse().find((day) => day.mood != null);
  return (
    <View style={{ gap: 12 }}>
      <T variant="label">Recent check-ins</T>
      <MeasureRingView label="Check-ins" ring={checkInWeekFigure(logged)} />
      <MeasureSplitView label="This week" split={countSplit(logged, 7, 'logged days', 'open days')} />
      {latest?.mood != null ? (
        <>
          <MeasureRingView label="Mood" ring={moodFigure(latest.mood)} />
          {latest.craving != null ? (
            <MeasureBarsView label="Mood and craving" bars={moodCravingBars(latest.mood, latest.craving)} />
          ) : null}
        </>
      ) : null}
      {empty ? (
        <T variant="muted">No check-ins in the last 7 days.</T>
      ) : (
        <>
          <Series label="Mood" unit="/10" average={moodAverage == null ? null : formatMoodAverage(moodAverage)} days={days} pick={(day) => day.mood} />
          <Series label="Craving" unit="/10" days={days} pick={(day) => day.craving} />
        </>
      )}
    </View>
  );
}

function Series({
  label,
  days,
  pick,
  unit = '',
  average = null,
}: {
  label: string;
  days: CheckInDay[];
  pick: (day: CheckInDay) => number | null;
  unit?: string;
  average?: string | null;
}) {
  const points = days.flatMap((day) => {
    const value = pick(day);
    return value == null ? [] : [{ day: day.day, value }];
  });
  const start = days[0]?.day;
  const end = days[days.length - 1]?.day;
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
          bucket="day"
          accessibilityLabel={`${label} chart`}
        />
      ) : null}
    </View>
  );
}
