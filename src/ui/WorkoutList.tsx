import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { formatUkCompactDay, londonDay, weekdayShort } from '@/domain/healthInsights';
import { CHART_DIRECTION_HINT } from '@/domain/readingChart';
import {
  DIFFICULTY_LIST_FOLD,
  DIFFICULTY_NOTE,
  ROUTE_MARK,
  WORKOUT_CHART_SPANS,
  WORKOUT_LIST_FOLD,
  difficultyMarks,
  durationBars,
  durationScaleLabel,
  durationTypeOrder,
  foldedCount,
  nextWorkoutDay,
  previousWorkoutDay,
  workoutActivityDays,
  workoutDaySummary,
  workoutRowLine,
  workoutWeek,
  workoutsOnDay,
  type DifficultyMark,
  type DurationBar,
  type WorkoutChartSpan,
} from '@/domain/workoutDay';
import type { DeviceWorkout } from '@/domain/workoutRoute';
import { workoutTypeColor } from '@/domain/workoutTypeColor';
import { useAppTheme } from '@/ui/theme';
import { Card, Choice, T } from '@/ui/ui';

const BAR_HEIGHT = 88;

function SeriesLegend({ labels }: { labels: readonly string[] }) {
  const theme = useAppTheme();
  if (labels.length === 0) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      {labels.map((label) => (
        <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 24 }}>
          <View
            accessibilityElementsHidden
            style={{ width: 10, height: 10, backgroundColor: workoutTypeColor(label), borderWidth: 1, borderColor: theme.colors.line }}
          />
          <T>{label}</T>
        </View>
      ))}
    </View>
  );
}

function dayNumber(day: string): string {
  return String(Number(day.slice(8, 10)));
}

function WorkoutRow({ workout }: { workout: DeviceWorkout }) {
  const theme = useAppTheme();
  const router = useRouter();
  const line = workoutRowLine(workout);
  if (!workout.routeExpected) {
    return (
      <View style={{ minHeight: 44, justifyContent: 'center' }}>
        <T numberOfLines={1}>{line}</T>
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`View route, ${line}`}
      onPress={() => router.push(`/workout/${encodeURIComponent(workout.id)}` as never)}
      style={{ minHeight: 44, justifyContent: 'center' }}
    >
      <T numberOfLines={1} style={{ fontFamily: theme.font.body }}>{`${line} ${ROUTE_MARK}`}</T>
    </Pressable>
  );
}

function DurationChart({
  bars,
  span,
  selected,
  onSelect,
}: {
  bars: readonly DurationBar[];
  span: WorkoutChartSpan;
  selected: string;
  onSelect: (day: string) => void;
}) {
  const theme = useAppTheme();
  const [open, setOpen] = useState(false);
  const order = durationTypeOrder(bars);
  const most = Math.max(1, ...bars.map((bar) => bar.totalMinutes));
  const scale = durationScaleLabel(bars);
  const named = bars.filter((bar) => bar.totalMinutes > 0);
  const hidden = foldedCount(named.length, WORKOUT_LIST_FOLD);
  const listed = hidden > 0 && !open ? [] : named;

  return (
    <View style={{ gap: 8 }}>
      <T variant="label">Duration</T>
      <T variant="muted">Minutes per day, stacked by workout type.</T>
      {scale ? <T variant="muted">{scale}</T> : null}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: span === 30 ? 1 : 4, minHeight: BAR_HEIGHT + 36 }}>
        {bars.map((bar) => {
          const chosen = bar.day === selected;
          return (
            <Pressable
              key={bar.day}
              accessibilityRole="button"
              accessibilityLabel={`${bar.label}. Select this day.`}
              accessibilityState={{ selected: chosen }}
              onPress={() => onSelect(bar.day)}
              style={{ flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'flex-end' }}
            >
              {span === 7 && bar.totalMinutes > 0 ? (
                <T style={{ fontSize: 10, lineHeight: 12, textAlign: 'center' }}>{`${bar.totalMinutes} min`}</T>
              ) : null}
              <View
                style={{
                  height: BAR_HEIGHT,
                  alignSelf: 'stretch',
                  justifyContent: 'flex-end',
                  borderWidth: chosen ? 1 : 0,
                  borderColor: theme.colors.ink,
                  backgroundColor: chosen ? theme.colors.emphasisSoft : 'transparent',
                }}
              >
                {bar.totalMinutes === 0 ? (
                  <View style={{ height: 2, backgroundColor: theme.colors.line }} />
                ) : (
                  [...bar.segments].reverse().map((segment) => (
                    <View
                      key={segment.label}
                      style={{
                        height: Math.max(2, (segment.minutes / most) * BAR_HEIGHT),
                        backgroundColor: workoutTypeColor(segment.label),
                      }}
                    />
                  ))
                )}
              </View>
              <T style={{ fontSize: 10, lineHeight: 12, color: theme.colors.muted }}>{span === 7 ? weekdayShort(bar.day).slice(0, 1) : dayNumber(bar.day)}</T>
            </Pressable>
          );
        })}
      </View>
      {order.length > 0 ? <SeriesLegend labels={order} /> : <T variant="muted">No workouts in these days.</T>}
      {hidden > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={open ? 'Hide daily duration' : `Show daily duration, ${named.length} days`}
          accessibilityState={{ expanded: open }}
          onPress={() => setOpen((value) => !value)}
          style={{ minHeight: 44, justifyContent: 'center' }}
        >
          <T>{open ? 'Hide daily duration' : 'Show daily duration'}</T>
        </Pressable>
      ) : null}
      {listed.map((bar) => (
        <T key={bar.day} variant="muted">{bar.label}</T>
      ))}
      <T variant="muted" style={{ textAlign: 'center' }}>{CHART_DIRECTION_HINT}</T>
    </View>
  );
}

function DifficultyChart({
  marks,
  onSelect,
}: {
  marks: readonly DifficultyMark[];
  onSelect: (day: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const hidden = foldedCount(marks.length, DIFFICULTY_LIST_FOLD);
  const shown = hidden > 0 && !open ? [] : marks;
  const types: string[] = [];
  for (const mark of marks) {
    if (!types.includes(mark.typeLabel)) types.push(mark.typeLabel);
  }

  return (
    <View style={{ gap: 8 }}>
      <T variant="label">Difficulty</T>
      <T variant="muted">{DIFFICULTY_NOTE}</T>
      {marks.length === 0 ? <T variant="muted">No workout effort score or average heart rate for these days.</T> : (
        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, minHeight: BAR_HEIGHT }}>
            {marks.map((mark) => (
              <Pressable
                key={mark.id}
                accessibilityRole="button"
                accessibilityLabel={`${mark.caption}. Select this day.`}
                onPress={() => onSelect(mark.day)}
                style={{ flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'flex-end' }}
              >
                <View
                  style={{
                    height: Math.max(4, mark.fill * BAR_HEIGHT),
                    alignSelf: 'stretch',
                    backgroundColor: workoutTypeColor(mark.typeLabel),
                  }}
                />
              </Pressable>
            ))}
          </View>
          <SeriesLegend labels={types} />
        </View>
      )}
      {hidden > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={open ? 'Hide difficulty readings' : `Show difficulty readings, ${marks.length} workouts`}
          accessibilityState={{ expanded: open }}
          onPress={() => setOpen((value) => !value)}
          style={{ minHeight: 44, justifyContent: 'center' }}
        >
          <T>{open ? 'Hide difficulty readings' : 'Show difficulty readings'}</T>
        </Pressable>
      ) : null}
      {shown.map((mark) => (
        <T key={mark.id}>{mark.caption}</T>
      ))}
      <T variant="muted" style={{ textAlign: 'center' }}>{CHART_DIRECTION_HINT}</T>
    </View>
  );
}

/** The selected London day, then the last 7 or 30 days. Opening a row reads a route only when one exists. */
export function WorkoutList({ workouts, age }: { workouts: readonly DeviceWorkout[]; age: number | null }) {
  const theme = useAppTheme();
  const today = londonDay(new Date());
  const [day, setDay] = useState(today);
  const [span, setSpan] = useState<WorkoutChartSpan>(7);
  const [rowsOpen, setRowsOpen] = useState(false);
  const rows = workoutsOnDay(workouts, day);
  const hiddenRows = foldedCount(rows.length, WORKOUT_LIST_FOLD);
  const shownRows = hiddenRows > 0 && !rowsOpen ? rows.slice(0, WORKOUT_LIST_FOLD) : rows;
  const dots = workoutActivityDays(workouts);
  const bars = durationBars(workouts, today, span);
  const marks = difficultyMarks(workouts, today, span, age);

  function choose(next: string) {
    setDay(next);
    setRowsOpen(false);
  }

  return (
    <Card>
      <T variant="label">Workouts</T>
      <T variant="muted">A route stays on this iPhone. It is not uploaded or shared.</T>
      <T style={{ fontFamily: theme.font.bodyStrong }}>{`${weekdayShort(day)} ${formatUkCompactDay(day)}`}</T>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous day"
          onPress={() => choose(previousWorkoutDay(day))}
          style={{ width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
        >
          <T>‹</T>
        </Pressable>
        <View style={{ flex: 1, flexDirection: 'row' }}>
          {workoutWeek(day).map((date) => {
            const selected = date === day;
            return (
              <Pressable
                key={date}
                accessibilityRole="button"
                accessibilityLabel={`${weekdayShort(date)} ${formatUkCompactDay(date)}${dots.has(date) ? ', workout' : ''}${selected ? ', selected' : ''}`}
                accessibilityState={{ selected }}
                onPress={() => choose(date)}
                style={{
                  flex: 1,
                  minHeight: 52,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: selected ? 1 : 0,
                  borderColor: theme.colors.ink,
                  backgroundColor: selected ? theme.colors.emphasisSoft : 'transparent',
                }}
              >
                <T style={{ fontSize: 11, lineHeight: 14, color: theme.colors.muted }}>{weekdayShort(date).slice(0, 1)}</T>
                <T style={{ fontFamily: selected ? theme.font.bodyStrong : theme.font.body }}>{dayNumber(date)}</T>
                <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: dots.has(date) ? theme.colors.ink : 'transparent' }} />
              </Pressable>
            );
          })}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next day"
          accessibilityState={{ disabled: day >= today }}
          disabled={day >= today}
          onPress={() => choose(nextWorkoutDay(day, today))}
          style={{ width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', opacity: day >= today ? 0.35 : 1 }}
        >
          <T>›</T>
        </Pressable>
      </View>
      {day !== today ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Today" onPress={() => choose(today)} style={{ minHeight: 44, justifyContent: 'center' }}>
          <T>Today</T>
        </Pressable>
      ) : null}
      {rows.length > 0 ? <T>{workoutDaySummary(rows)}</T> : <T>No workouts on this day.</T>}
      {shownRows.map((workout) => <WorkoutRow key={workout.id} workout={workout} />)}
      {hiddenRows > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={rowsOpen ? 'Hide the rest' : `Show ${hiddenRows} more`}
          accessibilityState={{ expanded: rowsOpen }}
          onPress={() => setRowsOpen((value) => !value)}
          style={{ minHeight: 44, justifyContent: 'center' }}
        >
          <T>{rowsOpen ? 'Hide the rest' : `Show ${hiddenRows} more`}</T>
        </Pressable>
      ) : null}
      <View accessibilityRole="radiogroup" accessibilityLabel="Chart days" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {WORKOUT_CHART_SPANS.map((value) => (
          <Choice key={value} label={`${value} days`} selected={span === value} onPress={() => setSpan(value)} />
        ))}
      </View>
      <DurationChart bars={bars} span={span} selected={day} onSelect={choose} />
      <DifficultyChart marks={marks} onSelect={choose} />
    </Card>
  );
}
