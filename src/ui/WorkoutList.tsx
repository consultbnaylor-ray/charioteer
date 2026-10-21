import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { formatUkCompactDay, londonDay, weekdayShort } from '@/domain/healthInsights';
import { CHART_DIRECTION_HINT } from '@/domain/readingChart';
import {
  DIFFICULTY_DAY_LINK,
  DIFFICULTY_NOTE,
  ROUTE_MARK,
  WORKOUT_CHART_SPANS,
  WORKOUT_LIST_FOLD,
  chartDayLabel,
  chartLabelIndexes,
  chartLabelStride,
  difficultyAxis,
  difficultyDetailLines,
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
import { routeSummaryLine, type DeviceWorkout } from '@/domain/workoutRoute';
import { workoutTypeColor } from '@/domain/workoutTypeColor';
import { useAppTheme } from '@/ui/theme';
import { Card, Choice, T } from '@/ui/ui';

const BAR_HEIGHT = 88;
const AXIS_WIDTH = 72;

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

function WorkoutRow({ workout, routeDetail = false }: { workout: DeviceWorkout; routeDetail?: boolean }) {
  const theme = useAppTheme();
  const router = useRouter();
  const line = workoutRowLine(workout);
  const stats = routeDetail ? routeSummaryLine(workout) : null;
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
      <T style={{ fontFamily: theme.font.body }}>{`${line} ${ROUTE_MARK}`}</T>
      {stats ? <T>{stats}</T> : null}
      {routeDetail ? <T style={{ textDecorationLine: 'underline' }}>View route</T> : null}
    </Pressable>
  );
}

function DurationChart({
  bars,
  workouts,
  span,
  selected,
  onSelect,
}: {
  bars: readonly DurationBar[];
  workouts: readonly DeviceWorkout[];
  span: WorkoutChartSpan;
  selected: string;
  onSelect: (day: string) => void;
}) {
  const theme = useAppTheme();
  const order = durationTypeOrder(bars);
  const most = Math.max(1, ...bars.map((bar) => bar.totalMinutes));
  const scale = durationScaleLabel(bars);
  const dayRows = workoutsOnDay(workouts, selected);

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
      <View style={{ gap: 4 }}>
        <T variant="label">{chartDayLabel(selected)}</T>
        {dayRows.length === 0 ? <T>No workouts on this day.</T> : dayRows.map((workout) => <WorkoutRow key={workout.id} workout={workout} routeDetail />)}
      </View>
      <T variant="muted" style={{ textAlign: 'center' }}>{CHART_DIRECTION_HINT}</T>
    </View>
  );
}

function DifficultyChart({
  marks,
  workouts,
  age,
  day,
  onSelect,
}: {
  marks: readonly DifficultyMark[];
  workouts: readonly DeviceWorkout[];
  age: number | null;
  day: string;
  onSelect: (day: string) => void;
}) {
  const theme = useAppTheme();
  const router = useRouter();
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [plotWidth, setPlotWidth] = useState(0);
  const dayMarks = marks.filter((mark) => mark.day === day);
  const types: string[] = [];
  for (const mark of marks) {
    if (!types.includes(mark.typeLabel)) types.push(mark.typeLabel);
  }
  const axis = difficultyAxis(marks);
  const picked = marks.find((mark) => mark.id === pickedId) ?? null;
  const pickedWorkout = picked ? workouts.find((workout) => workout.id === picked.id) ?? null : null;
  const dateIndexes = new Set(chartLabelIndexes(marks.length, chartLabelStride(marks.length, plotWidth)));

  return (
    <View style={{ gap: 8 }}>
      <T variant="label">Difficulty</T>
      <T variant="muted">{DIFFICULTY_NOTE}</T>
      {axis.mixedNote ? <T>{axis.mixedNote}</T> : null}
      {marks.length === 0 ? <T variant="muted">No workout effort score or average heart rate for these days.</T> : (
        <View style={{ gap: 8 }}>
          <T variant="label">{axis.heading}</T>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6 }}>
            <View style={{ width: AXIS_WIDTH, height: BAR_HEIGHT, justifyContent: 'space-between' }}>
              {axis.ticks.map((tick) => (
                <T key={tick} style={{ fontSize: 10, lineHeight: 12, textAlign: 'right' }}>{tick}</T>
              ))}
            </View>
            <View
              style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-end', gap: 3, minHeight: BAR_HEIGHT }}
              onLayout={(event) => setPlotWidth(event.nativeEvent.layout.width)}
            >
              {marks.map((mark) => {
                const chosen = mark.id === picked?.id;
                return (
                  <Pressable
                    key={mark.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${mark.caption}. Show this workout.`}
                    accessibilityState={{ selected: chosen }}
                    onPress={() => {
                      setPickedId(mark.id);
                      onSelect(mark.day);
                    }}
                    style={{ flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'flex-end' }}
                  >
                    <View
                      style={{
                        height: BAR_HEIGHT,
                        alignSelf: 'stretch',
                        justifyContent: 'flex-end',
                        borderWidth: chosen ? 2 : 0,
                        borderColor: theme.colors.ink,
                        backgroundColor: chosen ? theme.colors.emphasisSoft : 'transparent',
                      }}
                    >
                      <View
                        style={{
                          height: Math.max(4, mark.fill * BAR_HEIGHT),
                          backgroundColor: workoutTypeColor(mark.typeLabel),
                        }}
                      />
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <View style={{ width: AXIS_WIDTH }} />
            <View style={{ flex: 1, flexDirection: 'row', gap: 3 }}>
              {marks.map((mark, index) => (
                <View key={mark.id} style={{ flex: 1, minWidth: 0, minHeight: 14, alignItems: 'center', overflow: 'visible' }}>
                  {dateIndexes.has(index) ? (
                    <T style={{ fontSize: 10, lineHeight: 12, textAlign: 'center' }}>{chartDayLabel(mark.day)}</T>
                  ) : null}
                </View>
              ))}
            </View>
          </View>
          <SeriesLegend labels={types} />
          {picked && pickedWorkout ? (
            <View style={{ gap: 4 }}>
              {difficultyDetailLines(pickedWorkout, age).map((line) => <T key={line}>{line}</T>)}
              {routeSummaryLine(pickedWorkout) ? <T>{routeSummaryLine(pickedWorkout)}</T> : null}
              {pickedWorkout.routeExpected ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`View route, ${pickedWorkout.label}`}
                  onPress={() => router.push(`/workout/${encodeURIComponent(pickedWorkout.id)}` as never)}
                  style={{ minHeight: 44, justifyContent: 'center' }}
                >
                  <T style={{ textDecorationLine: 'underline' }}>View route</T>
                </Pressable>
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${DIFFICULTY_DAY_LINK}, ${picked.day}`}
                onPress={() => onSelect(picked.day)}
                style={{ minHeight: 44, justifyContent: 'center' }}
              >
                <T style={{ textDecorationLine: 'underline' }}>{DIFFICULTY_DAY_LINK}</T>
              </Pressable>
            </View>
          ) : null}
          <T variant="label">{chartDayLabel(day)}</T>
          {dayMarks.length === 0 ? <T>No difficulty reading on this day.</T> : dayMarks.map((mark) => <T key={mark.id}>{mark.caption}</T>)}
        </View>
      )}
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
      <DurationChart bars={bars} workouts={workouts} span={span} selected={day} onSelect={choose} />
      <DifficultyChart marks={marks} workouts={workouts} age={age} day={day} onSelect={choose} />
    </Card>
  );
}
