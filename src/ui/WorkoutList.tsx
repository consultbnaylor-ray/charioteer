import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import type { AppleDayValue } from '@/domain/dailyActivity';
import type { GarminDaily, GarminHrvSummary, GarminPulseOx, GarminRespiration, GarminSleep, GarminUserMetric } from '@/domain/garminConnect';
import type { NutritionSex } from '@/domain/nutrition';
import { formatUkCompactDay, londonDay, weekdayShort } from '@/domain/healthInsights';
import { CHART_DIRECTION_HINT } from '@/domain/readingChart';
import {
  DIFFICULTY_DAY_LINK,
  DIFFICULTY_NOTE,
  NO_WORKOUT_MARKER,
  ROUTE_MARK,
  WORKOUT_CHART_SPANS,
  WORKOUT_LIST_FOLD,
  WORKOUT_OPEN_HINT,
  chartDayLabel,
  chartLabelIndexes,
  chartLabelStride,
  difficultyAxis,
  difficultyDetailLines,
  difficultyMarks,
  difficultySlots,
  durationBars,
  durationScaleLabel,
  durationTypeOrder,
  foldedCount,
  nextWorkoutDay,
  previousWorkoutDay,
  workoutActivityDays,
  workoutDaySummary,
  workoutHistory,
  workoutHistoryChip,
  workoutHistoryDetail,
  workoutHistoryLine,
  workoutRowLine,
  workoutWeek,
  workoutsOnDay,
  WORKOUT_HISTORY_EMPTY,
  WORKOUT_HISTORY_FOLD,
  WORKOUT_HISTORY_HINT,
  WORKOUT_HISTORY_SHOW_ALL,
  type DifficultyEmptySlot,
  type DifficultyMark,
  type DurationBar,
  type WorkoutChartSpan,
} from '@/domain/workoutDay';
import { routeSummaryLine, type DeviceWorkout } from '@/domain/workoutRoute';
import { workoutTypeColor } from '@/domain/workoutTypeColor';
import { DailyActivityCharts } from '@/ui/DailyActivity';
import { StatGlyph, workoutStatIcon, type StatIcon } from '@/ui/statIcons';
import { TowardTargetActivity } from '@/ui/TowardTargetActivity';
import { radius, stroke, useAppTheme } from '@/ui/theme';
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
  const router = useRouter();
  const theme = useAppTheme();
  const line = workoutRowLine(workout);
  const stats = routeDetail ? routeSummaryLine(workout) : null;
  const glyph = workoutStatIcon(workout.activityType);
  if (!workout.routeExpected) {
    return (
      <View style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 28, alignItems: 'center', flexShrink: 0 }}>
          <StatGlyph name={glyph} color={theme.colors.muted} label={workout.label} />
        </View>
        <T style={{ flex: 1, minWidth: 0 }}>{line}</T>
      </View>
    );
  }
  return (
    <TapRow
      label={`View route, ${line}`}
      title={workout.label}
      detail={workoutHistoryDetail(workout)}
      glyph={glyph}
      glyphLabel={workout.label}
      onPress={() => router.push(`/workout/${encodeURIComponent(workout.id)}` as never)}
      extra={stats ? <T>{stats}</T> : routeDetail ? <T style={{ textDecorationLine: 'underline' }}>View route</T> : null}
    />
  );
}

function TapRow({
  label,
  title,
  detail,
  onPress,
  expanded,
  extra,
  glyph,
  glyphLabel,
}: {
  label: string;
  title: string;
  detail?: string;
  onPress: () => void;
  expanded?: boolean;
  extra?: ReactNode;
  glyph?: StatIcon | null;
  glyphLabel?: string;
}) {
  const theme = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={expanded == null ? undefined : { expanded }}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 44,
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderWidth: stroke.control,
        borderColor: theme.colors.line,
        borderRadius: radius.md,
        backgroundColor: pressed ? theme.colors.emphasisSoft : theme.colors.surface,
      })}
    >
      {glyph ? (
        <View style={{ width: 28, alignItems: 'center', flexShrink: 0 }}>
          <StatGlyph name={glyph} color={theme.colors.muted} label={glyphLabel ?? title} />
        </View>
      ) : null}
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <T style={{ fontFamily: theme.font.bodyStrong }}>{title}</T>
        {detail ? <T variant="muted">{detail}</T> : null}
        {extra}
      </View>
      <T style={{ fontSize: 22, lineHeight: 26, flexShrink: 0 }}>{ROUTE_MARK}</T>
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
  const order = durationTypeOrder(bars);
  const most = Math.max(1, ...bars.map((bar) => bar.totalMinutes));
  const scale = durationScaleLabel(bars);

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
      <T variant="muted">{WORKOUT_HISTORY_HINT}</T>
      <T variant="muted" style={{ textAlign: 'center' }}>{CHART_DIRECTION_HINT}</T>
    </View>
  );
}

function isEmptySlot(slot: DifficultyMark | DifficultyEmptySlot): slot is DifficultyEmptySlot {
  return 'empty' in slot && slot.empty;
}

function DifficultyChart({
  slots,
  workouts,
  age,
  day,
  onSelect,
}: {
  slots: readonly (DifficultyMark | DifficultyEmptySlot)[];
  workouts: readonly DeviceWorkout[];
  age: number | null;
  day: string;
  onSelect: (day: string) => void;
}) {
  const theme = useAppTheme();
  const router = useRouter();
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [plotWidth, setPlotWidth] = useState(0);
  const marks = slots.filter((slot): slot is DifficultyMark => !isEmptySlot(slot));
  const dayMarks = marks.filter((mark) => mark.day === day);
  const dayHasWorkout = workouts.some((workout) => londonDay(workout.startedAt) === day);
  const types: string[] = [];
  for (const mark of marks) {
    if (!types.includes(mark.typeLabel)) types.push(mark.typeLabel);
  }
  const axis = difficultyAxis(marks);
  const picked = marks.find((mark) => mark.id === pickedId) ?? null;
  const pickedWorkout = picked ? workouts.find((workout) => workout.id === picked.id) ?? null : null;
  const dateIndexes = new Set(chartLabelIndexes(slots.length, chartLabelStride(slots.length, plotWidth)));

  return (
    <View style={{ gap: 8 }}>
      <T variant="label">Difficulty</T>
      <T variant="muted">{DIFFICULTY_NOTE}</T>
      {axis.mixedNote ? <T>{axis.mixedNote}</T> : null}
      {slots.length === 0 ? <T variant="muted">No workout effort score or average heart rate for these days.</T> : (
        <View style={{ gap: 8 }}>
          <T variant="label">{axis.heading}</T>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, overflow: 'visible' }}>
            <View style={{ width: AXIS_WIDTH, flexShrink: 0, height: BAR_HEIGHT, justifyContent: 'space-between', paddingRight: 8 }}>
              {axis.ticks.map((tick) => (
                <T key={tick} numberOfLines={1} style={{ fontSize: 10, lineHeight: 14, textAlign: 'right' }}>{tick}</T>
              ))}
            </View>
            <View
              style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-end', gap: 3, minHeight: BAR_HEIGHT }}
              onLayout={(event) => setPlotWidth(event.nativeEvent.layout.width)}
            >
              {slots.map((slot) => {
                if (isEmptySlot(slot)) {
                  const chosen = slot.day === day;
                  return (
                    <Pressable
                      key={slot.id}
                      accessibilityRole="button"
                      accessibilityLabel={`${chartDayLabel(slot.day)}. ${NO_WORKOUT_MARKER}. Select this day.`}
                      accessibilityState={{ selected: chosen }}
                      onPress={() => onSelect(slot.day)}
                      style={{ flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'flex-end' }}
                    >
                      <T style={{ fontSize: 10, lineHeight: 12, textAlign: 'center', color: theme.colors.muted }}>{NO_WORKOUT_MARKER}</T>
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
                        <View style={{ height: 2, backgroundColor: theme.colors.line }} />
                      </View>
                    </Pressable>
                  );
                }
                const mark = slot;
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
            <View style={{ width: AXIS_WIDTH, flexShrink: 0 }} />
            <View style={{ flex: 1, flexDirection: 'row', gap: 3 }}>
              {slots.map((slot, index) => {
                return (
                <View key={slot.id} style={{ flex: 1, minWidth: 0, minHeight: 14, alignItems: 'center', overflow: 'visible' }}>
                  {dateIndexes.has(index) ? (
                    <T style={{ fontSize: 10, lineHeight: 12, textAlign: 'center' }}>{chartDayLabel(slot.day)}</T>
                  ) : null}
                </View>
                );
              })}
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
          {dayMarks.length === 0 ? <T>{dayHasWorkout ? 'No difficulty reading on this day.' : NO_WORKOUT_MARKER}</T> : dayMarks.map((mark) => <T key={mark.id}>{mark.caption}</T>)}
        </View>
      )}
      <T variant="muted" style={{ textAlign: 'center' }}>{CHART_DIRECTION_HINT}</T>
    </View>
  );
}

function WorkoutHistory({
  workouts,
  historyDay,
  open,
  onToggle,
  onClear,
}: {
  workouts: readonly DeviceWorkout[];
  historyDay: string | null;
  open: boolean;
  onToggle: () => void;
  onClear: () => void;
}) {
  const theme = useAppTheme();
  const router = useRouter();
  const rows = workoutHistory(workouts, historyDay);
  const hidden = foldedCount(rows.length, WORKOUT_HISTORY_FOLD);
  const shown = hidden > 0 && !open ? rows.slice(0, WORKOUT_HISTORY_FOLD) : rows;
  return (
    <View style={{ gap: 4 }}>
      <T variant="label">Workout history</T>
      {historyDay ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={workoutHistoryChip(historyDay)}
          onPress={onClear}
          style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start', borderWidth: 1, borderColor: theme.colors.line, paddingHorizontal: 10 }}
        >
          <T>{workoutHistoryChip(historyDay)}</T>
        </Pressable>
      ) : null}
      {rows.length === 0 ? <T>{historyDay ? 'No workouts on this day.' : WORKOUT_HISTORY_EMPTY}</T> : <T variant="muted">{WORKOUT_OPEN_HINT}</T>}
      {shown.map((workout) => {
        const line = workoutHistoryLine(workout);
        return (
          <TapRow
            key={workout.id}
            label={`${line}. Open workout.`}
            title={workout.label}
            detail={workoutHistoryDetail(workout)}
            glyph={workoutStatIcon(workout.activityType)}
            glyphLabel={workout.label}
            onPress={() => router.push(`/workout/${encodeURIComponent(workout.id)}` as never)}
          />
        );
      })}
      {hidden > 0 ? (
        <TapRow
          label={open ? 'Hide the rest' : WORKOUT_HISTORY_SHOW_ALL}
          title={open ? 'Hide the rest' : WORKOUT_HISTORY_SHOW_ALL}
          expanded={open}
          onPress={onToggle}
        />
      ) : null}
    </View>
  );
}

/** The selected London day, then the last 7 or 30 days. Opening a row reads a route only when one exists. */
export function WorkoutList({
  workouts,
  age,
  consent,
  exerciseMinutes,
  activeKcal,
  dailies,
  steps = [],
  restingHeart = [],
  sleep = [],
  respiration = [],
  pulseOx = [],
  hrv = [],
  userMetrics = [],
  sex = null,
  exercisePermissionMissing = false,
}: {
  workouts: readonly DeviceWorkout[];
  age: number | null;
  consent: boolean;
  exerciseMinutes: readonly AppleDayValue[];
  activeKcal: readonly AppleDayValue[];
  dailies: readonly GarminDaily[];
  steps?: readonly AppleDayValue[];
  restingHeart?: readonly AppleDayValue[];
  sleep?: readonly GarminSleep[];
  respiration?: readonly GarminRespiration[];
  pulseOx?: readonly GarminPulseOx[];
  hrv?: readonly GarminHrvSummary[];
  userMetrics?: readonly GarminUserMetric[];
  sex?: NutritionSex | null;
  exercisePermissionMissing?: boolean;
}) {
  const theme = useAppTheme();
  const today = londonDay(new Date());
  const [day, setDay] = useState(today);
  const [historyDay, setHistoryDay] = useState<string | null>(null);
  const [span, setSpan] = useState<WorkoutChartSpan>(7);
  const [rowsOpen, setRowsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const rows = workoutsOnDay(workouts, day);
  const hiddenRows = foldedCount(rows.length, WORKOUT_LIST_FOLD);
  const shownRows = hiddenRows > 0 && !rowsOpen ? rows.slice(0, WORKOUT_LIST_FOLD) : rows;
  const dots = workoutActivityDays(workouts);
  const bars = durationBars(workouts, today, span);
  const marks = difficultyMarks(workouts, today, span, age);
  const slots = difficultySlots(marks, today, workoutsOnDay(workouts, today).length);

  function choose(next: string) {
    setDay(next);
    setRowsOpen(false);
  }

  function selectBar(next: string) {
    setHistoryDay(next);
    setHistoryOpen(false);
    choose(next);
  }

  function clearHistory() {
    setHistoryDay(null);
    setHistoryOpen(false);
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
        <TapRow
          label={rowsOpen ? 'Hide the rest' : `Show ${hiddenRows} more`}
          title={rowsOpen ? 'Hide the rest' : `Show ${hiddenRows} more`}
          expanded={rowsOpen}
          onPress={() => setRowsOpen((value) => !value)}
        />
      ) : null}
      <View accessibilityRole="radiogroup" accessibilityLabel="Chart days" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {WORKOUT_CHART_SPANS.map((value) => (
          <Choice key={value} label={`${value} days`} selected={span === value} onPress={() => setSpan(value)} />
        ))}
      </View>
      <DurationChart bars={bars} span={span} selected={historyDay ?? ''} onSelect={selectBar} />
      <TowardTargetActivity compact />
      <DailyActivityCharts
        endDay={today}
        span={span}
        consent={consent}
        exerciseMinutes={exerciseMinutes}
        activeKcal={activeKcal}
        dailies={dailies}
        steps={steps}
        restingHeart={restingHeart}
        sleep={sleep}
        respiration={respiration}
        pulseOx={pulseOx}
        hrv={hrv}
        userMetrics={userMetrics}
        age={age}
        sex={sex}
        exercisePermissionMissing={exercisePermissionMissing}
      />
      <WorkoutHistory workouts={workouts} historyDay={historyDay} open={historyOpen} onToggle={() => setHistoryOpen((value) => !value)} onClear={clearHistory} />
      <DifficultyChart slots={slots} workouts={workouts} age={age} day={day} onSelect={choose} />
    </Card>
  );
}
