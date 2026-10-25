import { parseIsoDay } from '@/domain/dates';
import { classStatus, type ClassEdges } from '@/domain/goalWeightRange';
import { drinkFreeRing, soberMilestoneRing, type ChartBar } from '@/domain/distance';
import { hrvReading } from '@/domain/healthBands';
import { healthChangeNote, HRV_MIN_READINGS, personalChange, shiftDay, type HealthInsightKind } from '@/domain/healthInsights';
import {
  BHF_RESTING_MAX_BPM,
  BHF_RESTING_MIN_BPM,
  CMO_MODERATE_MINUTES_WEEK,
  NHS_ADULT_SLEEP_MAX_HOURS,
  NHS_ADULT_SLEEP_MIN_HOURS,
} from '@/domain/guidance';
import { UK_LOW_RISK_WEEKLY_UNITS } from '@/domain/units';
import type { StatsTone } from '@/domain/statsOverview';

/**
 * Plain figures for the nutrition-card pattern.
 * A ring is progress against a target. Bars compare categories.
 * A zone is a published healthy band. A split is two parts of one total.
 * Colour is chosen here and always sits next to these words.
 */

export type MeasureRing = {
  centre: string;
  unit: string;
  fill: number;
  status: string;
  tone: StatsTone;
  /** Replaces the tone word. Early days and On pace use this. */
  signal?: string;
  /** Icon and word in ink, rather than a coloured signal. */
  neutral?: boolean;
};

export type MeasureBars = {
  caption: string;
  max: number;
  bars: ChartBar[];
};

export type MeasureZone = {
  value: number;
  zoneLow: number;
  zoneHigh: number;
  scaleMin: number;
  scaleMax: number;
  status: string;
  zoneCaption: string;
  tone: StatsTone;
};

export type MeasureSplit = {
  leftLabel: string;
  rightLabel: string;
  left: number;
  right: number;
  caption: string;
  rightTone: 'watch' | 'info';
};

export type HealthFigure = {
  ring?: { label: string; ring: MeasureRing };
  zone?: MeasureZone;
  bars?: { label: string; bars: MeasureBars };
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function oneDp(value: number): number {
  return Math.round(value * 10) / 10;
}

function oneDpText(value: number): string {
  const rounded = oneDp(value);
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function uk(value: number): string {
  return Math.round(value).toLocaleString('en-GB');
}

function weekday(day: string): string {
  return WEEKDAYS[parseIsoDay(day).getDay()] ?? '';
}

function ordered(points: readonly { day: string; value: number }[], today: string) {
  return points.filter((point) => point.day <= today).sort((left, right) => left.day.localeCompare(right.day));
}

function latestPoint(points: readonly { day: string; value: number }[], today: string) {
  return ordered(points, today).at(-1) ?? null;
}

function recentPoints(points: readonly { day: string; value: number }[], today: string) {
  const start = shiftDay(today, -6);
  return ordered(points, today).filter((point) => point.day >= start);
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function rangedRing(
  centre: string,
  unit: string,
  value: number,
  low: number,
  high: number,
  within: boolean,
  status: string,
): MeasureRing {
  let fill = 1;
  if (!within) {
    if (value < low && low > 0) fill = clamp01(value / low);
    else if (value > high && value > 0) fill = clamp01(high / value);
    else fill = 0;
  }
  return { centre, unit, fill, status, tone: within ? 'good' : 'watch' };
}

export function soberFigure(startedAt: Date, now: Date): MeasureRing {
  return { ...soberMilestoneRing(startedAt, now), tone: 'good' };
}

export function drinkFreeFigure(free: number, goal: number | null): MeasureRing {
  if (goal != null && goal > 0) {
    return { ...drinkFreeRing(free, goal), tone: free >= goal ? 'good' : 'info' };
  }
  return {
    centre: String(Math.max(0, free)),
    unit: free === 1 ? 'day' : 'days',
    fill: 0,
    status: 'No weekly goal yet',
    tone: 'info',
  };
}

export function countSplit(done: number, total: number, doneWord: string, otherWord: string): MeasureSplit {
  const safeTotal = Math.max(0, total);
  const safeDone = Math.max(0, Math.min(safeTotal, done));
  const other = safeTotal - safeDone;
  const caption = safeDone > other
    ? `More ${doneWord} than ${otherWord}.`
    : safeDone < other
      ? `Fewer ${doneWord} than ${otherWord}.`
      : `As many ${doneWord} as ${otherWord}.`;
  const title = (words: string) => words.charAt(0).toUpperCase() + words.slice(1);
  return {
    leftLabel: `${title(doneWord)} ${safeDone}`,
    rightLabel: `${title(otherWord)} ${other}`,
    left: safeDone,
    right: other,
    caption,
    rightTone: 'info',
  };
}

export function moodFigure(mood: number): MeasureRing {
  const score = Math.max(0, Math.min(10, Math.round(mood)));
  const tone: StatsTone = score >= 6 ? 'good' : score >= 4 ? 'info' : 'watch';
  const status = score >= 6 ? 'On the higher side today' : score >= 4 ? 'A middle score today' : 'On the lower side today';
  return { centre: String(score), unit: '/10', fill: score / 10, status, tone };
}

export function moodCravingBars(mood: number, craving: number): MeasureBars {
  const moodScore = Math.max(0, Math.min(10, Math.round(mood)));
  const cravingScore = Math.max(0, Math.min(10, Math.round(craving)));
  const caption = cravingScore < moodScore
    ? 'Craving is lower than mood.'
    : cravingScore > moodScore
      ? 'Craving is higher than mood.'
      : 'Mood and craving match.';
  return {
    max: 10,
    caption,
    bars: [
      { key: 'mood', label: `Mood ${moodScore}`, value: moodScore, tone: moodScore >= 6 ? 'good' : moodScore >= 4 ? 'info' : 'watch' },
      { key: 'craving', label: `Craving ${cravingScore}`, value: cravingScore, tone: cravingScore <= 3 ? 'good' : cravingScore >= 7 ? 'watch' : 'info' },
    ],
  };
}

export function checkInWeekFigure(count: number): MeasureRing {
  const logged = Math.max(0, Math.min(7, Math.round(count)));
  const left = 7 - logged;
  return {
    centre: String(logged),
    unit: 'of 7',
    fill: logged / 7,
    status: logged >= 7 ? 'A full week of check-ins' : logged === 0 ? 'None this week' : left === 1 ? '1 day to go' : `${left} days to go`,
    tone: logged >= 5 ? 'good' : 'info',
  };
}

export function planProgressFigure(
  sections: readonly { key: string; label: string; done: number; total: number }[],
): { ring: MeasureRing; bars: MeasureBars } | null {
  const total = sections.reduce((sum, section) => sum + Math.max(0, section.total), 0);
  const done = sections.reduce((sum, section) => sum + Math.max(0, Math.min(section.total, section.done)), 0);
  if (total <= 0) return null;
  const left = total - done;
  const shown = sections.filter((section) => section.total > 0);
  return {
    ring: {
      centre: String(done),
      unit: `of ${total}`,
      fill: done / total,
      status: done >= total ? 'Everything ticked' : left === 1 ? '1 left this week' : `${left} left this week`,
      tone: done >= total ? 'good' : 'info',
    },
    bars: {
      max: 1,
      caption: 'Ticked in each part of the plan.',
      bars: shown.map((section) => ({
        key: section.key,
        label: `${section.label} ${section.done} of ${section.total}`,
        value: section.total > 0 ? section.done / section.total : 0,
        tone: section.done >= section.total ? 'good' : 'info',
      })),
    },
  };
}

export function breathPhaseFigure(leftSeconds: number, totalSeconds: number, phaseLabel: string): MeasureRing {
  const total = Math.max(0, totalSeconds);
  const left = Math.max(0, Math.min(total || leftSeconds, leftSeconds));
  const fill = total <= 0 ? 0 : clamp01((total - left) / total);
  return {
    centre: String(Math.max(0, Math.round(left))),
    unit: 's',
    fill,
    status: phaseLabel,
    tone: 'info',
  };
}

export function urgeStepFigure(stepNumber: number, total: number, title: string): MeasureRing {
  const safeTotal = Math.max(1, total);
  const step = Math.max(1, Math.min(safeTotal, stepNumber));
  return {
    centre: String(step),
    unit: `of ${safeTotal}`,
    fill: step / safeTotal,
    status: title,
    tone: step >= safeTotal ? 'good' : 'info',
  };
}

/** Units against the UK low-risk guideline. Stopped weeks are a comparison, not a target to drink. */
export function unitsWeekFigure(units: number, stage: string | null): MeasureRing {
  const shown = oneDp(Math.max(0, units));
  const within = shown <= UK_LOW_RISK_WEEKLY_UNITS;
  const stopped = stage === 'stopped';
  let status = within ? 'Within 14 units' : 'Over 14 units';
  if (stopped) status = within ? 'Within 14, not a target' : 'Over 14, not a target';
  return {
    centre: oneDpText(shown),
    unit: 'units',
    fill: clamp01(shown / UK_LOW_RISK_WEEKLY_UNITS),
    status,
    tone: stopped ? 'info' : within ? 'good' : 'watch',
  };
}

export function drinkCountBars(rows: readonly { key: string; label: string; count: number }[]): MeasureBars | null {
  const used = rows.filter((row) => row.count > 0);
  if (used.length === 0) return null;
  return {
    max: Math.max(...used.map((row) => row.count), 1),
    caption: used.length === 1 ? 'Only one drink type in this week.' : "How this week's drinks compare.",
    bars: used.map((row) => ({
      key: row.key,
      label: `${row.label} ${row.count}`,
      value: row.count,
      tone: 'info',
    })),
  };
}

function sleepRing(hours: number): { ring: MeasureRing; zone: MeasureZone } {
  const under = hours < NHS_ADULT_SLEEP_MIN_HOURS;
  const over = hours > NHS_ADULT_SLEEP_MAX_HOURS;
  const within = !under && !over;
  const tone: StatsTone = within ? 'good' : under ? 'watch' : 'info';
  const status = within ? 'Within 7 to 9 hours' : under ? 'Under 7 hours' : 'Over 9 hours, not a warning on its own';
  const fill = within ? 1 : under ? clamp01(hours / NHS_ADULT_SLEEP_MIN_HOURS) : clamp01(NHS_ADULT_SLEEP_MAX_HOURS / hours);
  const ring: MeasureRing = { centre: oneDpText(hours), unit: 'h', fill, status, tone };
  return {
    ring,
    zone: {
      value: hours,
      zoneLow: NHS_ADULT_SLEEP_MIN_HOURS,
      zoneHigh: NHS_ADULT_SLEEP_MAX_HOURS,
      scaleMin: 0,
      scaleMax: 12,
      status,
      zoneCaption: 'Healthy range 7–9 h',
      tone,
    },
  };
}

function heartRing(bpm: number): { ring: MeasureRing; zone: MeasureZone } {
  const rounded = Math.round(bpm);
  const low = rounded < BHF_RESTING_MIN_BPM;
  const high = rounded > BHF_RESTING_MAX_BPM;
  const within = !low && !high;
  const tone: StatsTone = within ? 'good' : low ? 'info' : 'watch';
  const status = within
    ? 'Within 60 to 100 bpm'
    : low
      ? "Under 60 bpm, which can be normal if you're very fit"
      : 'Over 100 bpm';
  const fill = within ? 1 : low ? clamp01(rounded / BHF_RESTING_MIN_BPM) : clamp01(BHF_RESTING_MAX_BPM / rounded);
  return {
    ring: { centre: String(rounded), unit: 'bpm', fill, status, tone },
    zone: {
      value: rounded,
      zoneLow: BHF_RESTING_MIN_BPM,
      zoneHigh: BHF_RESTING_MAX_BPM,
      scaleMin: 40,
      scaleMax: 120,
      status,
      zoneCaption: 'Usual range 60–100 bpm',
      tone,
    },
  };
}

function workoutFigure(points: readonly { day: string; value: number }[], today: string): HealthFigure {
  const recent = recentPoints(points, today);
  const minutes = Math.round(recent.reduce((sum, point) => sum + point.value, 0));
  const left = Math.max(0, CMO_MODERATE_MINUTES_WEEK - minutes);
  const met = minutes >= CMO_MODERATE_MINUTES_WEEK;
  const bars = recent
    .filter((point) => point.value > 0)
    .map((point) => ({
      key: point.day,
      label: `${weekday(point.day)} ${Math.round(point.value)} min`,
      value: point.value,
      tone: 'info' as const,
    }));
  return {
    ring: {
      label: 'This week',
      ring: {
        centre: String(minutes),
        unit: 'min',
        fill: clamp01(minutes / CMO_MODERATE_MINUTES_WEEK),
        status: met ? '150 minutes logged' : minutes === 0 ? '150 minutes to go' : left === 1 ? '1 minute to 150' : `${left} minutes to 150`,
        tone: met ? 'good' : 'info',
      },
    },
    bars: {
      label: 'Logged days',
      bars: {
        max: Math.max(...bars.map((bar) => bar.value), 1),
        caption: 'Logged workouts may not include walking.',
        bars,
      },
    },
  };
}

function stepsFigure(points: readonly { day: string; value: number }[], today: string): HealthFigure | null {
  const recent = recentPoints(points, today);
  if (recent.length === 0) return null;
  const todayPoint = recent.find((point) => point.day === today) ?? null;
  const earlier = recent.filter((point) => point.day !== today);
  const average = mean(earlier.map((point) => point.value));
  const bars: ChartBar[] = [];
  if (todayPoint) bars.push({ key: 'today', label: `Today ${uk(todayPoint.value)}`, value: todayPoint.value, tone: 'info' });
  if (average != null) bars.push({ key: 'average', label: `Recent average ${uk(average)}`, value: average, tone: 'info' });
  const compared = todayPoint && average != null
    ? (todayPoint.value >= average ? 'Higher than your recent average.' : 'Lower than your recent average.')
    : !todayPoint
      ? 'No steps logged today.'
      : '';
  const caption = compared || 'No steps logged today.';
  return {
    bars: {
      label: 'Steps',
      bars: { max: Math.max(...bars.map((bar) => bar.value), 1), caption, bars },
    },
  };
}

function hrvFigure(points: readonly { day: string; value: number }[], today: string): HealthFigure | null {
  const history = ordered(points, today);
  const latest = history.at(-1);
  if (!latest) return null;
  const change = history.length >= HRV_MIN_READINGS ? personalChange(history, today) : null;
  const note = change ? healthChangeNote('hrv_sdnn', history, today) : null;
  const bars: ChartBar[] = [{ key: 'latest', label: `Latest ${Math.round(latest.value)} ms`, value: latest.value, tone: 'info' }];
  if (change) {
    bars.push({
      key: 'average',
      label: `30-day average ${Math.round(change.baseline)} ms`,
      value: change.baseline,
      tone: 'info',
    });
  }
  const band = hrvReading(latest.value, null).status;
  const caption = note ? `${note}.` : band;
  return {
    bars: {
      label: 'Your own readings',
      bars: { max: Math.max(...bars.map((bar) => bar.value), 1), caption, bars },
    },
  };
}

function weightFigure(
  points: readonly { day: string; value: number }[],
  today: string,
  classWindow: ClassEdges | null,
): HealthFigure | null {
  const history = ordered(points, today);
  const latest = history.at(-1);
  const earlier = history.length >= 2 ? history[0] : null;
  if (!latest) return null;
  const figure: HealthFigure = {};
  const hasClass = classWindow != null && (classWindow.lowKg != null || classWindow.highKg != null);
  if (hasClass && classWindow) {
    const status = classStatus(latest.value, classWindow);
    figure.ring = {
      label: 'Against the class',
      ring: {
        centre: oneDpText(latest.value),
        unit: 'kg',
        fill: status.fill,
        status: status.line,
        tone: status.tone,
        signal: status.signal,
      },
    };
  }
  if (earlier) {
    const delta = latest.value - earlier.value;
    const caption = Math.abs(delta) < 0.3
      ? 'Near the earlier reading.'
      : delta < 0
        ? 'Lower than the earlier reading.'
        : 'Higher than the earlier reading.';
    figure.bars = {
      label: 'Earlier and latest',
      bars: {
        max: Math.max(earlier.value, latest.value, 1),
        caption: hasClass ? `${caption} This is not a cut.` : caption,
        bars: [
          { key: 'earlier', label: `Earlier ${oneDpText(earlier.value)} kg`, value: earlier.value, tone: 'info' },
          { key: 'latest', label: `Latest ${oneDpText(latest.value)} kg`, value: latest.value, tone: 'info' },
        ],
      },
    };
  }
  if (!figure.ring && !figure.bars) return null;
  return figure;
}

/** Ring, zone, or labelled bars for one health metric. Null when there is nothing to measure. */
export function healthFigure(
  kind: HealthInsightKind,
  points: readonly { day: string; value: number }[],
  today: string,
  options?: { classWindow?: ClassEdges | null },
): HealthFigure | null {
  if (kind === 'sleep_hours') {
    const night = latestPoint(points, today);
    if (!night) return null;
    const sleep = sleepRing(night.value);
    return { ring: { label: night.day === today ? 'Last night' : 'Latest night', ring: sleep.ring }, zone: sleep.zone };
  }
  if (kind === 'resting_heart_rate') {
    const reading = latestPoint(points, today);
    if (!reading) return null;
    const heart = heartRing(reading.value);
    return { ring: { label: 'Resting', ring: heart.ring }, zone: heart.zone };
  }
  if (kind === 'workout_minutes') return workoutFigure(points, today);
  if (kind === 'steps') return stepsFigure(points, today);
  if (kind === 'hrv_sdnn') return hrvFigure(points, today);
  if (kind === 'weight_kg') return weightFigure(points, today, options?.classWindow ?? null);
  return null;
}
