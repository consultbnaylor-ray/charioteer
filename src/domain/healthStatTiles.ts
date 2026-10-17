/**
 * Compact tiles for the signed-in person's own health readings.
 * A shaded band is drawn only where this app already has a published or
 * on-screen guide. Walking heart rate, recovery, session heart rate, lean
 * mass, and active energy have no band here.
 */

import { bodyFatRange } from '@/domain/distance';
import {
  activityTypeFromKind,
  buildFitnessSnapshot,
  CONDITIONING_NOTE,
  MIX_HOW,
  VO2_WHAT,
  workoutBucket,
  workoutTypeLabel,
} from '@/domain/fitnessSnapshot';
import { goalBandLegend, goalWeightRange, IBA_RULES_URL, NO_CUT } from '@/domain/goalWeightRange';
import {
  BHF_HEART_RATE_URL,
  BHF_RESTING_MAX_BPM,
  BHF_RESTING_MIN_BPM,
  CMO_ACTIVITY_URL,
  CMO_MODERATE_MINUTES_WEEK,
  CMO_VIGOROUS_MINUTES_WEEK,
  GUIDANCE_CAVEAT,
  HEIGHT_CM_MAX,
  HEIGHT_CM_MIN,
  NHS_ADULT_SLEEP_MAX_HOURS,
  NHS_ADULT_SLEEP_MIN_HOURS,
  NHS_SLEEP_URL,
  NICE_BMI_HEALTHY_MAX,
  NICE_BMI_HEALTHY_MIN,
  NICE_BMI_URL,
} from '@/domain/guidance';
import { dailyValues, shiftDay, weekdayShort, type DayValue } from '@/domain/healthInsights';
import {
  GOAL_LABEL,
  isAnyBoxer,
  parseBodyFatPct,
  parseLeanMassKg,
  WAIST_HEIGHT_HEALTHY,
  WORKOUT_BUCKETS,
  type BodyBuild,
  type NutritionGoal,
  type NutritionSex,
  type WorkoutBucket,
  type WorkoutBucketMap,
} from '@/domain/nutrition';
import { STATS_SIGNAL, type StatsTone } from '@/domain/statsOverview';

export const HEALTH_STATS_MISSING = 'Not available yet - turn on in Apple Health';
export const HEALTH_TURN_ON = 'Turn on in Apple Health';
export const HEALTH_SHARING_STEPS = 'Health > Sharing > Apps > Charioteer > turn on';

const ADULT_HIDDEN = 'These adult ranges are not shown under 18. Nothing here is guessed.';
const NO_BAND = 'There is no guideline band here.';

/** Day, seven days, or thirty days. Seven days is the page default. */
export const HEALTH_STAT_PERIODS = ['day', '7', '30'] as const;
export type HealthStatPeriod = (typeof HEALTH_STAT_PERIODS)[number];

export const HEALTH_STAT_PERIOD_LABEL: Record<HealthStatPeriod, string> = {
  day: 'Day',
  '7': '7 days',
  '30': '30 days',
};

export function parseHealthStatPeriod(value: unknown): HealthStatPeriod {
  return value === 'day' || value === '7' || value === '30' ? value : '7';
}

/** Shown on the value line, beside the number, so the window is not a footnote. */
export const PERIOD_LATEST = 'latest reading';
export const PERIOD_LAST_NIGHT = 'last night';
export const PERIOD_TODAY = 'today';
export const PERIOD_LAST_7 = 'last 7 days';
export const PERIOD_LAST_30 = 'last 30 days';

/** Where a missing reading comes from, and the HealthKit type to ask for. */
const HEALTH_STAT_GAPS: Record<string, { source: string; healthType: string | null; manual: boolean }> = {
  resting_heart_rate: {
    source: 'Resting heart rate comes from Apple Watch while you are still.',
    healthType: 'HKQuantityTypeIdentifierRestingHeartRate',
    manual: false,
  },
  walking_heart_rate: {
    source: 'Walking heart rate comes from Apple Watch on a walk.',
    healthType: 'HKQuantityTypeIdentifierWalkingHeartRateAverage',
    manual: false,
  },
  heart_rate_recovery: {
    source: 'Heart rate recovery needs a recent Apple Watch workout.',
    healthType: 'HKQuantityTypeIdentifierHeartRateRecoveryOneMinute',
    manual: false,
  },
  session_heart_rate: {
    source: 'Session heart rate comes from a logged Apple Watch workout.',
    healthType: 'HKWorkoutTypeIdentifier',
    manual: false,
  },
  vo2_max: {
    source: 'Cardio fitness comes from Apple Watch after outdoor walks or runs.',
    healthType: 'HKQuantityTypeIdentifierVO2Max',
    manual: false,
  },
  mix: {
    source: 'Strength, cardio, and other come from logged workouts.',
    healthType: 'HKWorkoutTypeIdentifier',
    manual: false,
  },
  sleep_hours: {
    source: 'Sleep comes from Apple Watch or a sleep tracker in Health.',
    healthType: 'HKCategoryTypeIdentifierSleepAnalysis',
    manual: false,
  },
  hrv_sdnn: {
    source: 'Heart rate variability comes from Apple Watch overnight.',
    healthType: 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
    manual: false,
  },
  weight_kg: {
    source: 'Weight comes from a scale in Health, or you can log it on this page.',
    healthType: 'HKQuantityTypeIdentifierBodyMass',
    manual: false,
  },
  body_fat: {
    source: 'Body fat comes from a smart scale or manual entry in Health.',
    healthType: 'HKQuantityTypeIdentifierBodyFatPercentage',
    manual: true,
  },
  waist: {
    source: 'Waist is entered by hand. Apple Health does not supply it.',
    healthType: null,
    manual: false,
  },
  lean_mass: {
    source: 'Lean mass comes from a smart scale or manual entry in Health.',
    healthType: 'HKQuantityTypeIdentifierLeanBodyMass',
    manual: true,
  },
  steps: {
    source: 'Steps come from your iPhone or Apple Watch.',
    healthType: 'HKQuantityTypeIdentifierStepCount',
    manual: false,
  },
  active_energy: {
    source: 'Active energy comes from Apple Watch.',
    healthType: 'HKQuantityTypeIdentifierActiveEnergyBurned',
    manual: false,
  },
  workouts: {
    source: 'Workouts come from Apple Watch or a workout app in Health.',
    healthType: 'HKWorkoutTypeIdentifier',
    manual: false,
  },
  weekly_active_minutes: {
    source: 'Weekly active minutes come from logged workouts.',
    healthType: 'HKWorkoutTypeIdentifier',
    manual: false,
  },
};

export type HealthStatGap = {
  id: string;
  title: string;
  source: string;
  healthType: string | null;
  /** Body fat and lean mass can be typed in the app. */
  manual: boolean;
};

export type HealthAuthRequest = 'unknown' | 'shouldRequest' | 'unnecessary';

/** iOS shows the Health sheet only while the decision is still open. */
export function missingHealthAction(status: HealthAuthRequest): 'request' | 'open' {
  return status === 'unnecessary' ? 'open' : 'request';
}

export function healthSharingSteps(titles: readonly string[]): string {
  return `${HEALTH_SHARING_STEPS} ${titles.join(', ')}.`;
}

export function healthTypesForGaps(gaps: readonly Pick<HealthStatGap, 'healthType'>[]): string[] {
  const types: string[] = [];
  for (const gap of gaps) {
    if (gap.healthType && !types.includes(gap.healthType)) types.push(gap.healthType);
  }
  return types;
}

export function gapForStat(id: string, title: string): HealthStatGap {
  const info = HEALTH_STAT_GAPS[id];
  return {
    id,
    title,
    source: info?.source ?? `${title} comes from Apple Health.`,
    healthType: info?.healthType ?? null,
    manual: info?.manual ?? false,
  };
}

/** The same checks as the body card. An empty field is left unset. */
export function parseBodyGap(
  fat: string,
  lean: string,
): { ok: true; bodyFatPct: number | null; leanMassKg: number | null } | { ok: false; error: string } {
  const bodyFatPct = fat.trim() ? parseBodyFatPct(Number(fat)) : null;
  if (fat.trim() && bodyFatPct == null) return { ok: false, error: 'Body fat sits between 2% and 70%.' };
  const leanMassKg = lean.trim() ? parseLeanMassKg(Number(lean)) : null;
  if (lean.trim() && leanMassKg == null) return { ok: false, error: 'Lean body mass sits between 20 and 200 kg.' };
  if (bodyFatPct == null && leanMassKg == null) return { ok: false, error: 'Add body fat or lean mass.' };
  return { ok: true, bodyFatPct, leanMassKg };
}
export const BMI_MUSCLE_NOTE = 'Above the BMI band - common for muscular builds; body fat and waist tell you more';

/** A zone or ring already draws the signal and the status. The sheet must not repeat them. */
export function detailShowsStatusAgain(kind: HealthStatVisual['kind']): boolean {
  return kind !== 'zone' && kind !== 'ring';
}

function athleteGoal(goal: NutritionGoal | null): boolean {
  return goal === 'elite_runner' || goal === 'body_builder' || isAnyBoxer(goal);
}

export type HealthStatSectionId = 'heart' | 'fitness' | 'sleep' | 'body' | 'activity';

export const HEALTH_STAT_SECTIONS: readonly { id: HealthStatSectionId; title: string }[] = [
  { id: 'heart', title: 'Heart' },
  { id: 'fitness', title: 'Fitness' },
  { id: 'sleep', title: 'Sleep and recovery' },
  { id: 'body', title: 'Body' },
  { id: 'activity', title: 'Activity' },
];

export const HEALTH_STAT_CATALOGUE: readonly { id: string; section: HealthStatSectionId; title: string }[] = [
  { id: 'resting_heart_rate', section: 'heart', title: 'Resting heart rate' },
  { id: 'walking_heart_rate', section: 'heart', title: 'Walking heart rate' },
  { id: 'heart_rate_recovery', section: 'heart', title: 'Heart rate recovery' },
  { id: 'session_heart_rate', section: 'heart', title: 'Session heart rate' },
  { id: 'vo2_max', section: 'fitness', title: 'Cardio fitness' },
  { id: 'mix', section: 'fitness', title: 'Strength, cardio, and other' },
  { id: 'sleep_hours', section: 'sleep', title: 'Sleep' },
  { id: 'hrv_sdnn', section: 'sleep', title: 'Heart rate variability' },
  { id: 'weight_kg', section: 'body', title: 'Weight' },
  { id: 'body_fat', section: 'body', title: 'Body fat' },
  { id: 'waist', section: 'body', title: 'Waist' },
  { id: 'lean_mass', section: 'body', title: 'Lean mass' },
  { id: 'steps', section: 'activity', title: 'Steps' },
  { id: 'active_energy', section: 'activity', title: 'Active energy' },
  { id: 'workouts', section: 'activity', title: 'Workouts' },
  { id: 'weekly_active_minutes', section: 'activity', title: 'Weekly active minutes' },
];

export type HealthStatSample = { kind: string; value: number; recordedOn: string };

export type HealthStatBody = {
  recordedOn: string;
  bodyFatPct: number | null;
  leanMassKg: number | null;
  waistCm: number | null;
};

export type HealthStatBoardInput = {
  today: string;
  samples: readonly HealthStatSample[];
  body: readonly HealthStatBody[];
  activityEnergyKcal: number | null;
  heightCm: number | null;
  adult: boolean;
  goalAge: number | null;
  goalSex: NutritionSex | null;
  goal: NutritionGoal | null;
  build: BodyBuild | null;
  /** Saved workout-type choices. Empty uses the default mapping. */
  workoutBuckets?: WorkoutBucketMap;
  /** Omitted means the last 7 days. */
  period?: HealthStatPeriod;
};

export type HealthStatVisual =
  | {
    kind: 'ring';
    centre: string;
    unit: string;
    fill: number;
    status: string;
    tone: StatsTone;
  }
  | {
    kind: 'zone';
    value: number;
    zoneLow: number;
    zoneHigh: number;
    scaleMin: number;
    scaleMax: number;
    status: string;
    zoneCaption: string;
    /** Second band on the same bar. Null high means the class has no upper limit. */
    goalLow?: number | null;
    goalHigh?: number | null;
    goalCaption?: string | null;
    tone: StatsTone;
  }
  | {
    kind: 'bars';
    max: number;
    caption: string;
    bars: { key: string; label: string; value: number; tone: StatsTone }[];
  }
  | { kind: 'line'; points: number[] };

export type HealthStatTile = {
  id: string;
  section: HealthStatSectionId;
  title: string;
  valueText: string;
  unit: string;
  /** Window the figure covers, written on the same line as the number. */
  period: string;
  /** A week-sized reading of a total that covers more than seven days. */
  weeklyLine: string | null;
  /** Older readings exist, but none fall in the chosen period. */
  empty: boolean;
  status: string;
  tone: StatsTone;
  mark: string;
  trend: string | null;
  hasGuideline: boolean;
  visual: HealthStatVisual;
  history: number[];
  about: string;
  meaning: string;
  rangeNote: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
  extraSourceName?: string | null;
  extraSourceUrl?: string | null;
  /** Per workout type in the chosen period. Present on the mix tile when types were stored. */
  breakdown?: { activityType: number; label: string; minutes: number; bucket: WorkoutBucket }[];
};

export type HealthStatSection = {
  id: HealthStatSectionId;
  title: string;
  tiles: HealthStatTile[];
};

export type HealthStatBoardModel = {
  sections: HealthStatSection[];
  missing: string[];
  gaps: HealthStatGap[];
  missingLine: string | null;
  caveat: string;
};

type CatalogItem = (typeof HEALTH_STAT_CATALOGUE)[number];

export function buildHealthStatBoard(input: HealthStatBoardInput): HealthStatBoardModel {
  const grown = isGrown(input);
  const height = usableHeight(input.heightCm);
  const tiles: HealthStatTile[] = [];
  const missing: string[] = [];
  const gaps: HealthStatGap[] = [];
  const take = (item: CatalogItem, tile: HealthStatTile | null) => {
    if (tile) tiles.push(tile);
    else {
      missing.push(item.title);
      gaps.push(gapForStat(item.id, item.title));
    }
  };

  for (const item of HEALTH_STAT_CATALOGUE) {
    take(item, tileFor(item, input, grown, height));
  }

  const sections = HEALTH_STAT_SECTIONS.map((section) => ({
    id: section.id,
    title: section.title,
    tiles: tiles.filter((tile) => tile.section === section.id),
  })).filter((section) => section.tiles.length > 0);

  return {
    sections,
    missing,
    gaps,
    missingLine: missing.length ? `${HEALTH_STATS_MISSING}: ${missing.join(', ')}` : null,
    caveat: GUIDANCE_CAVEAT,
  };
}

function tileFor(
  item: CatalogItem,
  input: HealthStatBoardInput,
  grown: boolean,
  height: number | null,
): HealthStatTile | null {
  if (item.id === 'resting_heart_rate') return heartBandTile(item, input, grown);
  if (item.id === 'walking_heart_rate') {
    return plainSeriesTile(item, input, 'bpm', 0, 2, 'Walking heart rate: your heart rate while walking. The unit is bpm. Apple Watch can estimate it.', NO_BAND);
  }
  if (item.id === 'heart_rate_recovery') {
    return plainSeriesTile(item, input, 'bpm', 0, 2, 'Heart rate recovery: how far your heart rate drops in the first minute after effort. The unit is bpm.', NO_BAND);
  }
  if (item.id === 'session_heart_rate') {
    return plainSeriesTile(item, input, 'bpm', 0, 2, 'Session heart rate: the average heart rate during logged workouts. The unit is bpm.', NO_BAND);
  }
  if (item.id === 'vo2_max') return vo2Tile(item, input, grown);
  if (item.id === 'mix') return mixTile(item, input);
  if (item.id === 'sleep_hours') return sleepTile(item, input, grown);
  if (item.id === 'hrv_sdnn') return hrvTile(item, input);
  if (item.id === 'weight_kg') return weightTile(item, input, grown, height);
  if (item.id === 'body_fat') return bodyFatTile(item, input, grown);
  if (item.id === 'waist') return waistTile(item, input, grown, height);
  if (item.id === 'lean_mass') return leanTile(item, input);
  if (item.id === 'steps') return stepsTile(item, input);
  if (item.id === 'active_energy') return energyTile(item, input);
  if (item.id === 'workouts') return workoutTile(item, input);
  return weeklyTile(item, input);
}

function heartBandTile(item: CatalogItem, input: HealthStatBoardInput, grown: boolean): HealthStatTile | null {
  const all = series(input.samples, item.id, input.today);
  const window = slicePeriod(all, input);
  if (window === 'none') return null;
  if (window === 'gap') return emptyTile(item, input);
  const period = periodOf(input);
  const label = periodLabel(period);
  const bpm = Math.round(averageOf(window.current));
  const trend = movementTrend(window.current, window.previous, 'mean', 2, period);
  const about = 'Resting heart rate: how many times your heart beats in a minute while you are at rest. The unit is bpm.';
  if (!grown) {
    return finish(item, {
      valueText: String(bpm),
      unit: 'bpm',
      period: label,
      status: ADULT_HIDDEN,
      tone: 'info',
      trend,
      hasGuideline: false,
      visual: spark(window.current, `${bpm} bpm`),
      history: nums(window.current),
      about,
      meaning: ADULT_HIDDEN,
      rangeNote: null,
      sourceName: null,
      sourceUrl: null,
    });
  }
  const low = bpm < BHF_RESTING_MIN_BPM;
  const high = bpm > BHF_RESTING_MAX_BPM;
  const tone: StatsTone = high ? 'watch' : low ? 'info' : 'good';
  const status = high
    ? 'Over 100 bpm'
    : low
      ? "Under 60 bpm, which can be normal if you're very fit"
      : 'Within 60 to 100 bpm';
  return finish(item, {
    valueText: String(bpm),
    unit: 'bpm',
    period: label,
    status,
    tone,
    trend,
    hasGuideline: true,
    visual: {
      kind: 'zone',
      value: bpm,
      zoneLow: BHF_RESTING_MIN_BPM,
      zoneHigh: BHF_RESTING_MAX_BPM,
      scaleMin: Math.min(40, bpm - 5),
      scaleMax: Math.max(120, bpm + 5),
      status,
      zoneCaption: 'Usual range 60–100 bpm',
      tone,
    },
    history: nums(window.current),
    about,
    meaning: 'The British Heart Foundation says a usual adult resting rate is 60 to 100 bpm. Below 60 can be normal if you are very fit. The band is the same for a day, a week, or a month.',
    rangeNote: null,
    sourceName: 'British Heart Foundation',
    sourceUrl: BHF_HEART_RATE_URL,
  });
}

function sleepTile(item: CatalogItem, input: HealthStatBoardInput, grown: boolean): HealthStatTile | null {
  const all = series(input.samples, 'sleep_hours', input.today);
  const window = slicePeriod(all, input);
  if (window === 'none') return null;
  if (window === 'gap') return emptyTile(item, input, true);
  const period = periodOf(input);
  const label = periodLabel(period, period === 'day');
  const hours = Math.round(averageOf(window.current) * 10) / 10;
  const trend = movementTrend(window.current, window.previous, 'mean', 0.3, period);
  const about = 'Sleep: hours asleep. The unit is hours.';
  if (!grown) {
    return finish(item, {
      valueText: oneText(hours),
      unit: 'h',
      period: label,
      status: ADULT_HIDDEN,
      tone: 'info',
      trend,
      hasGuideline: false,
      visual: spark(window.current, `${oneText(hours)} h`),
      history: nums(window.current),
      about,
      meaning: ADULT_HIDDEN,
      rangeNote: null,
      sourceName: null,
      sourceUrl: null,
    });
  }
  const under = hours < NHS_ADULT_SLEEP_MIN_HOURS;
  const over = hours > NHS_ADULT_SLEEP_MAX_HOURS;
  const tone: StatsTone = under ? 'watch' : over ? 'info' : 'good';
  const status = under
    ? 'Under 7 hours'
    : over
      ? 'Over 9 hours, not a warning on its own'
      : 'Within 7 to 9 hours';
  return finish(item, {
    valueText: oneText(hours),
    unit: 'h',
    period: label,
    status,
    tone,
    trend,
    hasGuideline: true,
    visual: {
      kind: 'zone',
      value: hours,
      zoneLow: NHS_ADULT_SLEEP_MIN_HOURS,
      zoneHigh: NHS_ADULT_SLEEP_MAX_HOURS,
      scaleMin: 0,
      scaleMax: Math.max(12, hours + 1),
      status,
      zoneCaption: 'Healthy range 7–9 h',
      tone,
    },
    history: nums(window.current),
    about,
    meaning: 'The NHS says adults need 7 to 9 hours a night. That range is not stretched across a week or a month.',
    rangeNote: null,
    sourceName: 'NHS',
    sourceUrl: NHS_SLEEP_URL,
  });
}

function vo2Tile(item: CatalogItem, input: HealthStatBoardInput, grown: boolean): HealthStatTile | null {
  const history = series(input.samples, 'vo2_max', input.today).filter((point) => point.value > 0);
  const latest = history.at(-1);
  if (!latest) return null;
  const period = periodOf(input);
  const window = slicePeriod(history, input);
  const current = window === 'gap' || window === 'none' ? [] : window.current;
  const previous = window === 'gap' || window === 'none' ? [] : window.previous;
  const value = Math.round(latest.value * 10) / 10;
  const fitness = buildFitnessSnapshot({
    today: input.today,
    goal: grown ? input.goal : null,
    goalAge: grown ? input.goalAge : null,
    goalSex: grown ? input.goalSex : null,
    scheduleWeekMinutes: null,
    health: input.samples,
    permission: 'unknown',
    build: grown ? input.build : null,
  });
  const cardio = fitness.cardio;
  const band = cardio?.compare.age ?? null;
  const named = cardio?.status === 'Developing' || cardio?.status === 'Steady' || cardio?.status === 'Strong';
  const status = named && cardio
    ? `${cardio.status} for your age and sex`
    : cardio
      ? 'Add age and sex for a typical band. Nothing here is guessed.'
      : 'Logged';
  const tone: StatsTone = cardio?.tone ?? 'info';
  const visual: HealthStatVisual = band
    ? {
      kind: 'zone',
      value,
      zoneLow: band.low,
      zoneHigh: band.high,
      scaleMin: Math.max(0, band.low - 10),
      scaleMax: Math.max(band.high + 10, value + 5),
      status,
      zoneCaption: 'Typical for your age and sex',
      tone,
    }
    : spark(current.length > 0 ? current : [{ day: latest.day, value: latest.value }], `${oneText(value)} ml/kg/min`);
  const trend = current.length > 0
    ? movementTrend(current, previous, 'mean', 1, period)
    : noReadingsLine(period, false);
  return finish(item, {
    valueText: oneText(value),
    unit: 'ml/kg/min',
    period: PERIOD_LATEST,
    status,
    tone,
    trend,
    hasGuideline: band != null,
    visual,
    history: current.map((point) => Math.round(point.value * 10) / 10),
    about: VO2_WHAT,
    meaning: cardio?.compare.words ?? 'Apple Watch estimates this. Nothing here is guessed.',
    rangeNote: cardio?.compare.goalNote ?? null,
    sourceName: cardio?.compare.sources.length ? cardio.compare.sources.join(' ') : null,
    sourceUrl: null,
  });
}

function mixTotals(input: HealthStatBoardInput, start: string): {
  buckets: Record<WorkoutBucket, number>;
  breakdown: { activityType: number; label: string; minutes: number; bucket: WorkoutBucket }[];
} {
  const byType = new Map<number, number>();
  for (const sample of input.samples) {
    const activityType = activityTypeFromKind(sample.kind);
    if (activityType == null || sample.recordedOn < start || sample.recordedOn > input.today) continue;
    if (!Number.isFinite(sample.value) || sample.value <= 0) continue;
    byType.set(activityType, (byType.get(activityType) ?? 0) + sample.value);
  }
  const buckets: Record<WorkoutBucket, number> = { strength: 0, cardio: 0, conditioning: 0, other: 0 };
  if (byType.size > 0) {
    const breakdown = [...byType.entries()]
      .map(([activityType, minutes]) => ({
        activityType,
        label: workoutTypeLabel(activityType),
        minutes: Math.round(minutes),
        bucket: workoutBucket(activityType, input.workoutBuckets),
      }))
      .filter((row) => row.minutes > 0)
      .sort((left, right) => right.minutes - left.minutes || left.label.localeCompare(right.label));
    for (const row of breakdown) buckets[row.bucket] += row.minutes;
    return { buckets, breakdown };
  }
  for (const bucket of WORKOUT_BUCKETS) {
    const kind = bucket === 'strength'
      ? 'strength_minutes'
      : bucket === 'cardio'
        ? 'cardio_minutes'
        : bucket === 'conditioning'
          ? 'conditioning_minutes'
          : 'other_minutes';
    buckets[bucket] = sumBetween(series(input.samples, kind, input.today), start, input.today);
  }
  return { buckets, breakdown: [] };
}

function mixTile(item: CatalogItem, input: HealthStatBoardInput): HealthStatTile | null {
  const period = periodOf(input);
  const start = windowStart(input.today, period);
  const { buckets, breakdown } = mixTotals(input, start);
  const strength = buckets.strength;
  const cardio = buckets.cardio;
  const conditioning = buckets.conditioning;
  const other = buckets.other;
  const total = strength + cardio + conditioning + other;
  if (total <= 0) {
    const any = mixTotals(input, '1970-01-01');
    const anyTotal = any.buckets.strength + any.buckets.cardio + any.buckets.conditioning + any.buckets.other;
    return anyTotal > 0 ? emptyTile(item, input) : null;
  }
  const parts = WORKOUT_BUCKETS.map((name) => ({ name, value: buckets[name] })).sort((left, right) => right.value - left.value);
  const even = parts[0].value === parts[1].value;
  const share = Math.round((parts[0].value / total) * 100);
  const status = even
    ? 'An even mix. There is no guideline mix.'
    : `Mostly ${parts[0].name}, about ${share}%. There is no guideline mix.`;
  const listed = breakdown.map((row) => `${row.label} ${whole(row.minutes)} min`).join(', ');
  return finish(item, {
    valueText: whole(total),
    unit: 'min',
    period: periodLabel(period),
    weeklyLine: period === '30' ? weeklyAverageWords(total, 30) : null,
    status,
    tone: 'info',
    trend: MIX_HOW,
    hasGuideline: false,
    visual: {
      kind: 'bars',
      max: Math.max(strength, cardio, conditioning, other, 1),
      caption: '',
      bars: [
        { key: 'strength', label: `Strength ${whole(strength)} min`, value: strength, tone: 'good' },
        { key: 'cardio', label: `Cardio ${whole(cardio)} min`, value: cardio, tone: 'info' },
        { key: 'conditioning', label: `Conditioning ${whole(conditioning)} min`, value: conditioning, tone: 'watch' },
        { key: 'other', label: `Other ${whole(other)} min`, value: other, tone: 'info' },
      ],
    },
    history: [],
    about: `Strength, cardio, conditioning, and other: minutes from the workout type recorded over ${periodPhrase(period)}. ${MIX_HOW} ${CONDITIONING_NOTE} Overlapping workouts from more than one app are counted once. The minutes are the workout duration, not time in a heart-rate zone.`,
    meaning: listed ? `${listed}. ${CONDITIONING_NOTE}` : `${status} ${CONDITIONING_NOTE}`,
    rangeNote: 'There is no guideline mix. You can count a workout type as strength, cardio, conditioning, or other. That choice stays on your account.',
    sourceName: null,
    sourceUrl: null,
    breakdown,
  });
}

function hrvTile(item: CatalogItem, input: HealthStatBoardInput): HealthStatTile | null {
  const all = series(input.samples, 'hrv_sdnn', input.today);
  const window = slicePeriod(all, input);
  if (window === 'none') return null;
  if (window === 'gap') return emptyTile(item, input);
  const period = periodOf(input);
  const ms = Math.round(averageOf(window.current));
  return finish(item, {
    valueText: String(ms),
    unit: 'ms',
    period: periodLabel(period),
    status: 'There is no official UK target.',
    tone: 'info',
    trend: movementTrend(window.current, window.previous, 'mean', 5, period),
    hasGuideline: false,
    visual: spark(window.current, `${ms} ms`),
    history: nums(window.current),
    about: 'Heart rate variability, in milliseconds (SDNN). Devices measure it in different ways.',
    meaning: 'There is no official UK target. This is the average of your own readings in this period.',
    rangeNote: 'There is no official UK target.',
    sourceName: null,
    sourceUrl: null,
  });
}

function weightTile(
  item: CatalogItem,
  input: HealthStatBoardInput,
  grown: boolean,
  height: number | null,
): HealthStatTile | null {
  const all = series(input.samples, 'weight_kg', input.today).filter((point) => point.value > 0);
  const window = slicePeriod(all, input);
  if (window === 'none') return null;
  if (window === 'gap') return emptyTile(item, input);
  const period = periodOf(input);
  const label = periodLabel(period);
  const history = window.current;
  const kg = Math.round(averageOf(history) * 10) / 10;
  const about = 'Weight, in kilograms.';
  const trend = movementTrend(history, window.previous, 'mean', 0.3, period);
  if (!grown) {
    return finish(item, plainReading(kg, 'kg', ADULT_HIDDEN, trend, history, about, ADULT_HIDDEN, label));
  }
  if (height == null) {
    const meaning = 'Add your height, then a BMI band can be shown. Nothing here is guessed.';
    return finish(item, plainReading(kg, 'kg', meaning, trend, history, about, meaning, label));
  }
  const low = kgForBmi(NICE_BMI_HEALTHY_MIN, height);
  const high = kgForBmi(NICE_BMI_HEALTHY_MAX, height);
  const within = kg >= low && kg <= high;
  const under = kg < low;
  const fatWindow = slicePeriod(bodySeries(input.body, input.today, (row) => row.bodyFatPct), input);
  const waistWindow = slicePeriod(bodySeries(input.body, input.today, (row) => row.waistCm), input);
  const fatPct = fatWindow === 'none' || fatWindow === 'gap' ? null : averageOf(fatWindow.current);
  const waistCm = waistWindow === 'none' || waistWindow === 'gap' ? null : averageOf(waistWindow.current);
  const fatCount = fatPct == null ? 0 : 1;
  const waistCount = waistCm == null ? 0 : 1;
  const fatFine = fatPct != null && bodyFatRange(fatPct, input.goalSex).within;
  const waistFine = waistCm != null && waistCm / height < WAIST_HEIGHT_HEALTHY;
  const compositionFine = (fatPct != null || waistCm != null)
    && (fatPct == null || fatFine)
    && (waistCm == null || waistFine);
  const soften = !within && !under && (athleteGoal(input.goal) || compositionFine);
  const tone: StatsTone = within ? 'good' : under ? 'watch' : soften ? 'info' : 'watch';
  const status = within
    ? 'Within the healthy BMI band'
    : under
      ? 'Under the healthy BMI band'
      : soften
        ? BMI_MUSCLE_NOTE
        : 'Over the healthy BMI band';
  const ranged = input.goalSex && (input.goalAge != null || input.adult)
    ? goalWeightRange({
      goal: input.goal,
      weightKg: kg,
      heightCm: height,
      age: input.goalAge ?? 18,
      sex: input.goalSex,
      build: input.build,
      bodyFatPct: fatPct,
      waistCm,
    })
    : null;
  const classBand = ranged?.status === 'ready' && ranged.goal?.lowExclusive ? ranged.goal : null;
  const goalCaption = classBand ? goalBandLegend(classBand, 'kg') : null;
  const marks = [low, high, kg, classBand?.lowKg, classBand?.highKg].filter((point): point is number => point != null);
  const scaleMin = Math.max(1, Math.min(...marks) * 0.92);
  const scaleMax = classBand?.highKg == null && classBand
    ? Math.max(...marks, classBand.lowKg + 8) * 1.08
    : Math.max(...marks) * 1.06;
  const extra = input.build === 'carrying_extra'
    ? ' Waist and body fat tell more than BMI when they are logged. A steady change is enough. Check with a doctor before big changes.'
    : input.build === 'muscular' || fatCount > 0 || waistCount > 0
      ? ' Body fat and waist tell more than the scales when they are logged.'
      : '';
  const meaning = weightMeaning(input.goal, ranged, extra);
  return finish(item, {
    valueText: oneText(kg),
    unit: 'kg',
    period: label,
    status,
    tone,
    trend,
    hasGuideline: true,
    visual: {
      kind: 'zone',
      value: kg,
      zoneLow: low,
      zoneHigh: high,
      scaleMin,
      scaleMax,
      status,
      zoneCaption: `Healthy BMI band ${oneText(low)}–${oneText(high)} kg`,
      goalLow: classBand?.lowKg ?? null,
      goalHigh: classBand?.highKg ?? null,
      goalCaption,
      tone,
    },
    history: nums(history),
    about,
    meaning,
    rangeNote: null,
    sourceName: 'NICE NG246 and the NHS',
    sourceUrl: NICE_BMI_URL,
    extraSourceName: classBand ? 'IBA Technical and Competition Rules, effective 15 April 2026, section 2.2' : null,
    extraSourceUrl: classBand ? IBA_RULES_URL : null,
  });
}

function weightMeaning(
  goal: NutritionGoal | null,
  ranged: ReturnType<typeof goalWeightRange> | null,
  extra: string,
): string {
  const parts = [`Healthy BMI for this height is ${NICE_BMI_HEALTHY_MIN} to ${NICE_BMI_HEALTHY_MAX}. BMI is a rough guide.`];
  if (ranged?.status === 'ready' && athleteGoal(goal)) {
    if (ranged.words && ranged.words !== 'Within range') parts.push(ranged.words);
    if (ranged.gap && ranged.gap !== ranged.words) parts.push(ranged.gap.endsWith('.') ? ranged.gap : `${ranged.gap}.`);
    if (ranged.classReference) parts.push(ranged.classReference);
    else if (ranged.goalNote) parts.push(ranged.goalNote);
  } else if (goal && athleteGoal(goal)) {
    parts.push(`For ${GOAL_LABEL[goal]}.`);
  }
  parts.push('This is not a weight cut.');
  if (!ranged?.classReference) parts.push(NO_CUT);
  return `${parts.join(' ')}${extra}`;
}

function bodyFatTile(item: CatalogItem, input: HealthStatBoardInput, grown: boolean): HealthStatTile | null {
  const all = bodySeries(input.body, input.today, (row) => row.bodyFatPct);
  const window = slicePeriod(all, input);
  if (window === 'none') return null;
  if (window === 'gap') return emptyTile(item, input);
  const period = periodOf(input);
  const label = periodLabel(period);
  const history = window.current;
  const pct = Math.round(averageOf(history) * 10) / 10;
  const trend = movementTrend(history, window.previous, 'mean', 0.5, period);
  const about = 'Body fat, as a percentage of body weight.';
  if (!grown) {
    return finish(item, plainReading(pct, '%', ADULT_HIDDEN, trend, history, about, ADULT_HIDDEN, label));
  }
  const range = bodyFatRange(pct, input.goalSex);
  const tone: StatsTone = range.within ? 'good' : pct < range.zoneLow ? 'info' : 'watch';
  const status = range.within
    ? 'Within the screen band'
    : pct < range.zoneLow
      ? 'Under the screen band'
      : 'Above the screen band';
  return finish(item, {
    valueText: oneText(pct),
    unit: '%',
    period: label,
    status,
    tone,
    trend,
    hasGuideline: true,
    visual: {
      kind: 'zone',
      value: pct,
      zoneLow: range.zoneLow,
      zoneHigh: range.zoneHigh,
      scaleMin: range.scaleMin,
      scaleMax: range.scaleMax,
      status,
      zoneCaption: `Screen band ${range.zoneLow}–${range.zoneHigh}%. Not an NHS category.`,
      tone,
    },
    history: nums(history),
    about,
    meaning: 'This is a descriptive band on this screen, not an NHS category.',
    rangeNote: 'Not an NHS category.',
    sourceName: null,
    sourceUrl: null,
  });
}

function waistTile(
  item: CatalogItem,
  input: HealthStatBoardInput,
  grown: boolean,
  height: number | null,
): HealthStatTile | null {
  const all = bodySeries(input.body, input.today, (row) => row.waistCm);
  const window = slicePeriod(all, input);
  if (window === 'none') return null;
  if (window === 'gap') return emptyTile(item, input);
  const period = periodOf(input);
  const label = periodLabel(period);
  const history = window.current;
  const cm = Math.round(averageOf(history) * 10) / 10;
  const about = 'Waist measurement, in centimetres.';
  const trend = movementTrend(history, window.previous, 'mean', 1, period);
  if (!grown) {
    return finish(item, plainReading(cm, 'cm', ADULT_HIDDEN, trend, history, about, ADULT_HIDDEN, label));
  }
  if (height == null) {
    const meaning = 'Add your height to compare waist with 0.5. Nothing here is guessed.';
    return finish(item, plainReading(cm, 'cm', meaning, trend, history, about, meaning, label));
  }
  const ratio = cm / height;
  const within = ratio < WAIST_HEIGHT_HEALTHY;
  const tone: StatsTone = within ? 'good' : 'watch';
  const status = within ? 'Within the healthy range' : 'Above the healthy range';
  const scaleMin = Math.min(0.25, Math.max(0, ratio - 0.05));
  const scaleMax = Math.max(0.75, ratio + 0.05);
  return finish(item, {
    valueText: oneText(cm),
    unit: 'cm',
    period: label,
    status,
    tone,
    trend,
    hasGuideline: true,
    visual: {
      kind: 'zone',
      value: ratio,
      zoneLow: scaleMin,
      zoneHigh: Math.min(WAIST_HEIGHT_HEALTHY, scaleMax),
      scaleMin,
      scaleMax,
      status,
      zoneCaption: 'Healthy range under 0.5',
      tone,
    },
    history: nums(history),
    about,
    meaning: `Waist divided by height is ${ratio.toFixed(2)}. Under ${WAIST_HEIGHT_HEALTHY} is the healthy band on this screen.`,
    rangeNote: null,
    sourceName: null,
    sourceUrl: null,
  });
}

function leanTile(item: CatalogItem, input: HealthStatBoardInput): HealthStatTile | null {
  const all = bodySeries(input.body, input.today, (row) => row.leanMassKg);
  const window = slicePeriod(all, input);
  if (window === 'none') return null;
  if (window === 'gap') return emptyTile(item, input);
  const period = periodOf(input);
  const kg = Math.round(averageOf(window.current) * 10) / 10;
  return finish(item, {
    valueText: oneText(kg),
    unit: 'kg',
    period: periodLabel(period),
    status: NO_BAND,
    tone: 'info',
    trend: movementTrend(window.current, window.previous, 'mean', 0.3, period),
    hasGuideline: false,
    visual: spark(window.current, `${oneText(kg)} kg`),
    history: nums(window.current),
    about: 'Lean mass: muscle, bone, and the rest of the body that is not fat. The unit is kilograms.',
    meaning: NO_BAND,
    rangeNote: NO_BAND,
    sourceName: null,
    sourceUrl: null,
  });
}

function stepsTile(item: CatalogItem, input: HealthStatBoardInput): HealthStatTile | null {
  const all = series(input.samples, 'steps', input.today);
  const window = slicePeriod(all, input);
  if (window === 'none') return null;
  if (window === 'gap') return emptyTile(item, input);
  const period = periodOf(input);
  const total = Math.round(window.current.reduce((sum, point) => sum + point.value, 0));
  const status = period === 'day'
    ? 'There is no daily step target.'
    : 'There is no step target for this period.';
  return finish(item, {
    valueText: whole(total),
    unit: 'steps',
    period: periodLabel(period),
    weeklyLine: period === '30' ? weeklyAverageWords(total, 30, 'steps') : null,
    status,
    tone: 'info',
    trend: movementTrend(window.current, window.previous, 'sum', 1, period),
    hasGuideline: false,
    visual: spark(window.current, `${whole(total)} steps`),
    history: nums(window.current),
    about: period === 'day' ? 'Steps in a day.' : `Steps over ${periodPhrase(period)}.`,
    meaning: 'There is no NHS or UK Chief Medical Officer step target.',
    rangeNote: status,
    sourceName: null,
    sourceUrl: null,
  });
}

function energyTile(item: CatalogItem, input: HealthStatBoardInput): HealthStatTile | null {
  const kcal = input.activityEnergyKcal;
  if (kcal == null || !Number.isFinite(kcal) || kcal < 0 || kcal > 2500) return null;
  const period = periodOf(input);
  const days = periodDays(period);
  const shown = Math.round(kcal * days);
  return finish(item, {
    valueText: whole(shown),
    unit: 'kcal',
    period: periodLabel(period),
    weeklyLine: period === '30' ? weeklyAverageWords(shown, 30, 'kcal') : null,
    status: 'From the recent daily average.',
    tone: 'info',
    trend: null,
    hasGuideline: false,
    visual: {
      kind: 'bars',
      max: Math.max(shown, 1),
      caption: NO_BAND,
      bars: [{ key: 'energy', label: `${whole(shown)} kcal`, value: shown, tone: 'info' }],
    },
    history: [],
    about: 'Active energy is scaled from the recent daily average stored from Apple Health. A day shows that average, 7 days shows seven times it, and 30 days shows thirty times it. The unit is kilocalories.',
    meaning: 'From the recent daily average. Apple Health is not storing a separate total for each day here.',
    rangeNote: NO_BAND,
    sourceName: null,
    sourceUrl: null,
  });
}

function workoutTile(item: CatalogItem, input: HealthStatBoardInput): HealthStatTile | null {
  const history = series(input.samples, 'workout_minutes', input.today);
  const window = slicePeriod(history, input);
  if (window === 'none') return null;
  if (window === 'gap') return emptyTile(item, input);
  const period = periodOf(input);
  const total = window.current.reduce((sum, point) => sum + point.value, 0);
  const bars = window.current.filter((point) => point.value > 0).map((point) => ({
    key: point.day,
    label: `${weekdayShort(point.day)} ${whole(point.value)} min`,
    value: point.value,
    tone: 'info' as const,
  }));
  const visual: HealthStatVisual = bars.length
    ? { kind: 'bars', max: Math.max(...bars.map((bar) => bar.value), 1), caption: '', bars }
    : spark(window.current, `${whole(total)} min`);
  return finish(item, {
    valueText: whole(total),
    unit: 'min',
    period: periodLabel(period),
    weeklyLine: period === '30' ? weeklyAverageWords(total, 30) : null,
    status: 'Logged workouts may not include walking.',
    tone: 'info',
    trend: movementTrend(window.current, window.previous, 'sum', 5, period),
    hasGuideline: false,
    visual,
    history: nums(window.current),
    about: `Workouts: minutes logged over ${periodPhrase(period)}. They may not include walking. The unit is minutes.`,
    meaning: 'This tile is the logged workouts. The activity-minute mark sits on active minutes.',
    rangeNote: 'Logged workouts may not include walking.',
    sourceName: null,
    sourceUrl: null,
  });
}

function weeklyTile(item: CatalogItem, input: HealthStatBoardInput): HealthStatTile | null {
  const workouts = series(input.samples, 'workout_minutes', input.today);
  const strength = series(input.samples, 'strength_minutes', input.today);
  const cardio = series(input.samples, 'cardio_minutes', input.today);
  const conditioning = series(input.samples, 'conditioning_minutes', input.today);
  const other = series(input.samples, 'other_minutes', input.today);
  const history = workouts.length > 0 ? workouts : mergeDays([strength, cardio, conditioning, other]);
  const window = slicePeriod(history, input);
  if (window === 'none') return null;
  if (window === 'gap') return emptyTile(item, input);
  const period = periodOf(input);
  const rounded = Math.round(window.current.reduce((sum, point) => sum + point.value, 0));
  const target = scaledActivityMinutes(CMO_MODERATE_MINUTES_WEEK, period);
  const vigorous = scaledActivityMinutes(CMO_VIGOROUS_MINUTES_WEEK, period);
  const left = Math.max(0, target - rounded);
  const met = rounded >= target;
  const tone: StatsTone = met ? 'good' : 'info';
  const status = met
    ? `${whole(target)} minutes logged`
    : rounded === 0
      ? `${whole(target)} minutes to go`
      : left === 1
        ? `1 minute to ${whole(target)}`
        : `${whole(left)} minutes to ${whole(target)}`;
  const scaleMax = Math.max(target * 2, rounded + 20);
  return finish(item, {
    valueText: whole(rounded),
    unit: 'min',
    period: periodLabel(period),
    weeklyLine: period === '30' ? weeklyAverageWords(rounded, 30) : null,
    status,
    tone,
    trend: movementTrend(window.current, window.previous, 'sum', 5, period),
    hasGuideline: true,
    visual: {
      kind: 'zone',
      value: rounded,
      zoneLow: target,
      zoneHigh: scaleMax,
      scaleMin: 0,
      scaleMax,
      status,
      zoneCaption: activityCaption(period, target),
      tone,
    },
    history: nums(window.current),
    about: `Active minutes: time counted over ${periodPhrase(period)}. The unit is minutes.`,
    meaning: `The UK Chief Medical Officers recommend at least ${CMO_MODERATE_MINUTES_WEEK} minutes of moderate activity a week, or ${CMO_VIGOROUS_MINUTES_WEEK} minutes of vigorous activity. For ${periodPhrase(period)} that is at least ${whole(target)} minutes, or ${whole(vigorous)} minutes of vigorous activity. Logged workouts may not include walking, and this app cannot tell how hard the minutes were.`,
    rangeNote: null,
    sourceName: 'UK Chief Medical Officers',
    sourceUrl: CMO_ACTIVITY_URL,
  });
}

function plainSeriesTile(
  item: CatalogItem,
  input: HealthStatBoardInput,
  unit: string,
  digits: number,
  epsilon: number,
  about: string,
  note: string,
): HealthStatTile | null {
  const all = series(input.samples, item.id, input.today).filter((point) => point.value > 0);
  const window = slicePeriod(all, input);
  if (window === 'none') return null;
  if (window === 'gap') return emptyTile(item, input);
  const period = periodOf(input);
  const value = averageOf(window.current);
  const shown = digits === 0 ? String(Math.round(value)) : oneText(value);
  return finish(item, {
    valueText: shown,
    unit,
    period: periodLabel(period),
    status: note,
    tone: 'info',
    trend: movementTrend(window.current, window.previous, 'mean', epsilon, period),
    hasGuideline: false,
    visual: spark(window.current, `${shown} ${unit}`),
    history: nums(window.current),
    about,
    meaning: note,
    rangeNote: note,
    sourceName: null,
    sourceUrl: null,
  });
}

function plainReading(
  value: number,
  unit: string,
  status: string,
  trend: string | null,
  history: DayValue[],
  about: string,
  meaning: string,
  period: string,
): Omit<HealthStatTile, 'id' | 'section' | 'title' | 'mark'> {
  return {
    valueText: oneText(value),
    unit,
    period,
    weeklyLine: null,
    empty: false,
    status,
    tone: 'info',
    trend,
    hasGuideline: false,
    visual: spark(history, `${oneText(value)} ${unit}`),
    history: nums(history),
    about,
    meaning,
    rangeNote: null,
    sourceName: null,
    sourceUrl: null,
  };
}

function finish(
  item: CatalogItem,
  tile: Omit<HealthStatTile, 'id' | 'section' | 'title' | 'mark' | 'weeklyLine' | 'empty'> & {
    weeklyLine?: string | null;
    empty?: boolean;
  },
): HealthStatTile {
  return {
    id: item.id,
    section: item.section,
    title: item.title,
    mark: STATS_SIGNAL[tile.tone],
    weeklyLine: null,
    empty: false,
    ...tile,
  };
}

/** A 30-day total of 1,198 minutes is about 280 minutes a week. */
function weeklyAverageWords(total: number, days: number, unit = 'min'): string {
  const perWeek = Math.round(total / (days / 7));
  return `About ${whole(perWeek)} ${unit} a week.`;
}

function periodOf(input: HealthStatBoardInput): HealthStatPeriod {
  return parseHealthStatPeriod(input.period);
}

function periodDays(period: HealthStatPeriod): number {
  if (period === 'day') return 1;
  if (period === '30') return 30;
  return 7;
}

/** The 150-minute week, scaled to the chosen period. 21 today, 150 in 7 days, 643 in 30 days. */
export function scaledActivityMinutes(weekly: number, period: HealthStatPeriod): number {
  return Math.round((weekly * periodDays(period)) / 7);
}

function activityCaption(period: HealthStatPeriod, target: number): string {
  if (period === 'day') return `At least ${target} min today`;
  return `At least ${target} min in ${period === '30' ? 30 : 7} days`;
}

function periodLabel(period: HealthStatPeriod, night = false): string {
  if (period === 'day') return night ? PERIOD_LAST_NIGHT : PERIOD_TODAY;
  if (period === '30') return PERIOD_LAST_30;
  return PERIOD_LAST_7;
}

function periodPhrase(period: HealthStatPeriod): string {
  if (period === 'day') return 'today';
  if (period === '30') return 'the last 30 days';
  return 'the last 7 days';
}

function noReadingsLine(period: HealthStatPeriod, night: boolean): string {
  if (period === 'day') return night ? 'No readings last night.' : 'No readings today.';
  if (period === '30') return 'No readings in the last 30 days.';
  return 'No readings in the last 7 days.';
}

function windowStart(today: string, period: HealthStatPeriod): string {
  return shiftDay(today, -(periodDays(period) - 1));
}

function previousBounds(today: string, period: HealthStatPeriod): { start: string; end: string } {
  const end = shiftDay(windowStart(today, period), -1);
  return { start: shiftDay(end, -(periodDays(period) - 1)), end };
}

type PeriodSlice = { current: DayValue[]; previous: DayValue[] };

function slicePeriod(points: readonly DayValue[], input: HealthStatBoardInput): PeriodSlice | 'none' | 'gap' {
  if (points.length === 0) return 'none';
  const period = periodOf(input);
  const start = windowStart(input.today, period);
  const current = points.filter((point) => point.day >= start && point.day <= input.today);
  if (current.length === 0) return 'gap';
  const previousWindow = previousBounds(input.today, period);
  const previous = points.filter((point) => point.day >= previousWindow.start && point.day <= previousWindow.end);
  return { current, previous };
}

function emptyTile(item: CatalogItem, input: HealthStatBoardInput, night = false): HealthStatTile {
  const period = periodOf(input);
  const asleep = night && period === 'day';
  const status = noReadingsLine(period, asleep);
  return finish(item, {
    valueText: 'No readings',
    unit: '',
    period: periodLabel(period, asleep),
    status,
    tone: 'info',
    trend: null,
    hasGuideline: false,
    empty: true,
    visual: { kind: 'line', points: [] },
    history: [],
    about: status,
    meaning: status,
    rangeNote: null,
    sourceName: null,
    sourceUrl: null,
  });
}

function averageOf(points: readonly DayValue[]): number {
  return points.reduce((sum, point) => sum + point.value, 0) / points.length;
}

function movementTrend(
  current: readonly DayValue[],
  previous: readonly DayValue[],
  mode: 'sum' | 'mean',
  epsilon: number,
  period: HealthStatPeriod,
): string | null {
  const aggregate = (points: readonly DayValue[]): number | null => {
    if (points.length === 0) return null;
    const total = points.reduce((sum, point) => sum + point.value, 0);
    return mode === 'sum' ? total : total / points.length;
  };
  const now = aggregate(current);
  const before = aggregate(previous);
  if (now != null && before != null) return trendWords(now, before, epsilon, periodBefore(period));
  if (current.length >= 2) {
    const latest = current[current.length - 1]!.value;
    const earlier = current.slice(0, -1);
    const usual = earlier.reduce((sum, point) => sum + point.value, 0) / earlier.length;
    return trendWords(latest, usual, epsilon, 'the earlier days in this period');
  }
  return null;
}

function periodBefore(period: HealthStatPeriod): string {
  if (period === 'day') return 'the day before';
  if (period === '30') return 'the 30 days before';
  return 'the 7 days before';
}

function trendWords(latest: number, previous: number, epsilon: number, against: string): string {
  const delta = latest - previous;
  if (Math.abs(delta) <= epsilon) return `Steady against ${against}.`;
  if (delta > 0) return `Up from ${against}.`;
  return `Down from ${against}.`;
}

function spark(history: readonly DayValue[], label: string): HealthStatVisual {
  if (history.length >= 2) return { kind: 'line', points: history.map((point) => point.value) };
  const latest = history.at(-1);
  const value = latest?.value ?? 0;
  return {
    kind: 'bars',
    max: Math.max(value, 1),
    caption: '',
    bars: [{ key: 'latest', label, value, tone: 'info' }],
  };
}

function series(samples: readonly HealthStatSample[], kind: string, today: string): DayValue[] {
  return dailyValues([...samples], kind).filter((point) => point.day <= today);
}

function bodySeries(
  rows: readonly HealthStatBody[],
  today: string,
  pick: (row: HealthStatBody) => number | null,
): DayValue[] {
  const map = new Map<string, number>();
  const ordered = [...rows]
    .filter((row) => row.recordedOn.slice(0, 10) <= today)
    .sort((left, right) => left.recordedOn.localeCompare(right.recordedOn));
  for (const row of ordered) {
    const value = pick(row);
    if (value == null || !Number.isFinite(value) || value <= 0) continue;
    map.set(row.recordedOn.slice(0, 10), value);
  }
  return [...map.entries()].map(([day, value]) => ({ day, value }));
}

function sumBetween(points: readonly DayValue[], start: string, end: string): number {
  return points.filter((point) => point.day >= start && point.day <= end).reduce((sum, point) => sum + point.value, 0);
}

function mergeDays(groups: DayValue[][]): DayValue[] {
  const map = new Map<string, number>();
  for (const group of groups) {
    for (const point of group) map.set(point.day, (map.get(point.day) ?? 0) + point.value);
  }
  return [...map.entries()]
    .sort((left, right) => (left[0] < right[0] ? -1 : 1))
    .map(([day, value]) => ({ day, value }));
}

function nums(history: readonly DayValue[]): number[] {
  return history.map((point) => point.value);
}

function isGrown(input: HealthStatBoardInput): boolean {
  if (!input.adult) return false;
  if (input.goalAge != null && input.goalAge < 18) return false;
  return true;
}

function usableHeight(cm: number | null): number | null {
  if (cm == null || !Number.isFinite(cm) || cm < HEIGHT_CM_MIN || cm > HEIGHT_CM_MAX) return null;
  return cm;
}

function kgForBmi(bmi: number, heightCm: number): number {
  const metres = heightCm / 100;
  return Math.round(bmi * metres * metres * 10) / 10;
}

function oneText(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function whole(value: number): string {
  return new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 }).format(Math.round(value));
}
