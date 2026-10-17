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

/** Shown on the value line, beside the number, so the window is not a footnote. */
export const PERIOD_LATEST = 'latest reading';
export const PERIOD_LAST_NIGHT = 'last night';
export const PERIOD_TODAY = 'today';
export const PERIOD_LATEST_DAY = 'latest day';
export const PERIOD_THIS_WEEK = 'this week';
export const PERIOD_LAST_28 = 'last 28 days';
export const PERIOD_DAILY_AVERAGE = 'recent daily average';

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
  return goal === 'elite_runner' || goal === 'body_builder' || goal === 'elite_heavy_boxer' || goal === 'elite_middle_boxer';
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
  /** Per workout type, last 28 days. Present on the mix tile when types were stored. */
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
  if (item.id === 'active_energy') return energyTile(item, input.activityEnergyKcal);
  if (item.id === 'workouts') return workoutTile(item, input);
  return weeklyTile(item, input);
}

function heartBandTile(item: CatalogItem, input: HealthStatBoardInput, grown: boolean): HealthStatTile | null {
  const history = series(input.samples, item.id, input.today);
  const latest = history.at(-1);
  if (!latest) return null;
  const bpm = Math.round(latest.value);
  const about = 'Resting heart rate: how many times your heart beats in a minute while you are at rest. The unit is bpm.';
  if (!grown) {
    return finish(item, {
      valueText: String(bpm),
      unit: 'bpm',
      period: PERIOD_LATEST,
      status: ADULT_HIDDEN,
      tone: 'info',
      trend: readingTrend(history, 2),
      hasGuideline: false,
      visual: spark(history, `${bpm} bpm`),
      history: nums(history),
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
    period: PERIOD_LATEST,
    status,
    tone,
    trend: readingTrend(history, 2),
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
    history: nums(history),
    about,
    meaning: 'The British Heart Foundation says a usual adult resting rate is 60 to 100 bpm. Below 60 can be normal if you are very fit.',
    rangeNote: null,
    sourceName: 'British Heart Foundation',
    sourceUrl: BHF_HEART_RATE_URL,
  });
}

function sleepTile(item: CatalogItem, input: HealthStatBoardInput, grown: boolean): HealthStatTile | null {
  const history = series(input.samples, 'sleep_hours', input.today);
  const latest = history.at(-1);
  if (!latest) return null;
  const hours = Math.round(latest.value * 10) / 10;
  const about = 'Sleep: hours asleep. The unit is hours.';
  if (!grown) {
    return finish(item, {
      valueText: oneText(hours),
      unit: 'h',
      period: PERIOD_LAST_NIGHT,
      status: ADULT_HIDDEN,
      tone: 'info',
      trend: readingTrend(history, 0.3),
      hasGuideline: false,
      visual: spark(history, `${oneText(hours)} h`),
      history: nums(history),
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
    period: PERIOD_LAST_NIGHT,
    status,
    tone,
    trend: readingTrend(history, 0.3),
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
    history: nums(history),
    about,
    meaning: 'The NHS says adults need 7 to 9 hours.',
    rangeNote: null,
    sourceName: 'NHS',
    sourceUrl: NHS_SLEEP_URL,
  });
}

function vo2Tile(item: CatalogItem, input: HealthStatBoardInput, grown: boolean): HealthStatTile | null {
  const history = series(input.samples, 'vo2_max', input.today).filter((point) => point.value > 0);
  const latest = history.at(-1);
  if (!latest) return null;
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
    : spark(history, `${oneText(value)} ml/kg/min`);
  return finish(item, {
    valueText: oneText(value),
    unit: 'ml/kg/min',
    period: PERIOD_LATEST,
    status,
    tone,
    trend: readingTrend(history, 1),
    hasGuideline: band != null,
    visual,
    history: history.slice(-8).map((point) => Math.round(point.value * 10) / 10),
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
  const start = shiftDay(input.today, -27);
  const { buckets, breakdown } = mixTotals(input, start);
  const strength = buckets.strength;
  const cardio = buckets.cardio;
  const conditioning = buckets.conditioning;
  const other = buckets.other;
  const total = strength + cardio + conditioning + other;
  if (total <= 0) return null;
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
    period: PERIOD_LAST_28,
    weeklyLine: weeklyAverageWords(total, 28),
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
    about: `Strength, cardio, conditioning, and other: minutes from the workout type recorded over the last 28 days. ${MIX_HOW} ${CONDITIONING_NOTE} Overlapping workouts from more than one app are counted once. The minutes are the workout duration, not time in a heart-rate zone.`,
    meaning: listed ? `${listed}. ${CONDITIONING_NOTE}` : `${status} ${CONDITIONING_NOTE}`,
    rangeNote: 'There is no guideline mix. You can count a workout type as strength, cardio, conditioning, or other. That choice stays on your account.',
    sourceName: null,
    sourceUrl: null,
    breakdown,
  });
}

function hrvTile(item: CatalogItem, input: HealthStatBoardInput): HealthStatTile | null {
  const history = series(input.samples, 'hrv_sdnn', input.today);
  const latest = history.at(-1);
  if (!latest) return null;
  const ms = Math.round(latest.value);
  const earlier = history.slice(0, -1).map((point) => point.value);
  const usual = mean(earlier);
  let trend: string | null = null;
  if (usual != null) {
    const gap = latest.value - usual;
    trend = Math.abs(gap) < 5
      ? 'Near your own usual level.'
      : gap > 0
        ? 'Higher than your own usual level.'
        : 'Lower than your own usual level.';
  }
  return finish(item, {
    valueText: String(ms),
    unit: 'ms',
    period: PERIOD_LATEST,
    status: 'There is no official UK target.',
    tone: 'info',
    trend,
    hasGuideline: false,
    visual: usual == null
      ? spark(history, `${ms} ms`)
      : {
        kind: 'bars',
        max: Math.max(latest.value, usual, 1),
        caption: 'Latest and your own usual level',
        bars: [
          { key: 'latest', label: `Latest ${ms} ms`, value: latest.value, tone: 'info' },
          { key: 'usual', label: `Usual ${Math.round(usual)} ms`, value: usual, tone: 'info' },
        ],
      },
    history: nums(history),
    about: 'Heart rate variability, in milliseconds (SDNN). Devices measure it in different ways.',
    meaning: 'There is no official UK target. This is compared with your own readings.',
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
  const history = series(input.samples, 'weight_kg', input.today).filter((point) => point.value > 0);
  const latest = history.at(-1);
  if (!latest) return null;
  const kg = Math.round(latest.value * 10) / 10;
  const about = 'Weight, in kilograms.';
  const trend = readingTrend(history, 0.3);
  if (!grown) {
    return finish(item, plainReading(kg, 'kg', ADULT_HIDDEN, trend, history, about, ADULT_HIDDEN));
  }
  if (height == null) {
    const meaning = 'Add your height, then a BMI band can be shown. Nothing here is guessed.';
    return finish(item, plainReading(kg, 'kg', meaning, trend, history, about, meaning));
  }
  const low = kgForBmi(NICE_BMI_HEALTHY_MIN, height);
  const high = kgForBmi(NICE_BMI_HEALTHY_MAX, height);
  const within = kg >= low && kg <= high;
  const under = kg < low;
  const fat = bodySeries(input.body, input.today, (row) => row.bodyFatPct);
  const waist = bodySeries(input.body, input.today, (row) => row.waistCm);
  const fatPct = fat.at(-1)?.value ?? null;
  const waistCm = waist.at(-1)?.value ?? null;
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
    : input.build === 'muscular' || fat.length > 0 || waist.length > 0
      ? ' Body fat and waist tell more than the scales when they are logged.'
      : '';
  const meaning = weightMeaning(input.goal, ranged, extra);
  return finish(item, {
    valueText: oneText(kg),
    unit: 'kg',
    period: PERIOD_LATEST,
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
  const history = bodySeries(input.body, input.today, (row) => row.bodyFatPct);
  const latest = history.at(-1);
  if (!latest) return null;
  const pct = Math.round(latest.value * 10) / 10;
  const about = 'Body fat, as a percentage of body weight.';
  if (!grown) {
    return finish(item, plainReading(pct, '%', ADULT_HIDDEN, readingTrend(history, 0.5), history, about, ADULT_HIDDEN));
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
    period: PERIOD_LATEST,
    status,
    tone,
    trend: readingTrend(history, 0.5),
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
  const history = bodySeries(input.body, input.today, (row) => row.waistCm);
  const latest = history.at(-1);
  if (!latest) return null;
  const cm = Math.round(latest.value * 10) / 10;
  const about = 'Waist measurement, in centimetres.';
  const trend = readingTrend(history, 1);
  if (!grown) {
    return finish(item, plainReading(cm, 'cm', ADULT_HIDDEN, trend, history, about, ADULT_HIDDEN));
  }
  if (height == null) {
    const meaning = 'Add your height to compare waist with 0.5. Nothing here is guessed.';
    return finish(item, plainReading(cm, 'cm', meaning, trend, history, about, meaning));
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
    period: PERIOD_LATEST,
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
  const history = bodySeries(input.body, input.today, (row) => row.leanMassKg);
  const latest = history.at(-1);
  if (!latest) return null;
  const kg = Math.round(latest.value * 10) / 10;
  return finish(item, {
    valueText: oneText(kg),
    unit: 'kg',
    period: PERIOD_LATEST,
    status: NO_BAND,
    tone: 'info',
    trend: readingTrend(history, 0.3),
    hasGuideline: false,
    visual: spark(history, `${oneText(kg)} kg`),
    history: nums(history),
    about: 'Lean mass: muscle, bone, and the rest of the body that is not fat. The unit is kilograms.',
    meaning: NO_BAND,
    rangeNote: NO_BAND,
    sourceName: null,
    sourceUrl: null,
  });
}

function stepsTile(item: CatalogItem, input: HealthStatBoardInput): HealthStatTile | null {
  const history = series(input.samples, 'steps', input.today);
  if (history.length === 0) return null;
  const recentStart = shiftDay(input.today, -13);
  const recent = history.filter((point) => point.day >= recentStart);
  const todayPoint = recent.find((point) => point.day === input.today) ?? null;
  const earlier = recent.filter((point) => point.day !== input.today);
  const average = mean(earlier.map((point) => point.value));
  const shown = todayPoint ?? history.at(-1)!;
  const bars: { key: string; label: string; value: number; tone: StatsTone }[] = [];
  if (todayPoint) bars.push({ key: 'today', label: `Today ${whole(todayPoint.value)}`, value: todayPoint.value, tone: 'info' });
  if (average != null) bars.push({ key: 'average', label: `Recent average ${whole(average)}`, value: average, tone: 'info' });
  if (bars.length === 0) bars.push({ key: 'latest', label: `Latest ${whole(shown.value)}`, value: shown.value, tone: 'info' });
  let trend: string | null = null;
  if (todayPoint && average != null) {
    trend = todayPoint.value > average
      ? 'Higher than your recent average.'
      : todayPoint.value < average
        ? 'Lower than your recent average.'
        : 'Level with your recent average.';
  }
  const status = todayPoint
    ? 'There is no daily step target.'
    : 'No steps logged today. There is no daily step target.';
  return finish(item, {
    valueText: whole(shown.value),
    unit: 'steps',
    period: todayPoint ? PERIOD_TODAY : PERIOD_LATEST_DAY,
    status,
    tone: 'info',
    trend,
    hasGuideline: false,
    visual: {
      kind: 'bars',
      max: Math.max(...bars.map((bar) => bar.value), 1),
      caption: 'There is no daily step target.',
      bars,
    },
    history: nums(history),
    about: 'Steps in a day.',
    meaning: 'There is no NHS or UK Chief Medical Officer daily step target.',
    rangeNote: 'There is no daily step target.',
    sourceName: null,
    sourceUrl: null,
  });
}

function energyTile(item: CatalogItem, kcal: number | null): HealthStatTile | null {
  if (kcal == null || !Number.isFinite(kcal) || kcal < 0 || kcal > 2500) return null;
  const shown = Math.round(kcal);
  return finish(item, {
    valueText: whole(shown),
    unit: 'kcal',
    period: PERIOD_DAILY_AVERAGE,
    status: 'Recent daily average',
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
    about: 'Active energy: a recent daily average of energy used in movement. The unit is kilocalories. Apple Health can supply it.',
    meaning: NO_BAND,
    rangeNote: NO_BAND,
    sourceName: null,
    sourceUrl: null,
  });
}

function workoutTile(item: CatalogItem, input: HealthStatBoardInput): HealthStatTile | null {
  const history = series(input.samples, 'workout_minutes', input.today);
  if (history.length === 0) return null;
  const weekStart = shiftDay(input.today, -6);
  const week = history.filter((point) => point.day >= weekStart);
  const total = week.reduce((sum, point) => sum + point.value, 0);
  const bars = week.filter((point) => point.value > 0).map((point) => ({
    key: point.day,
    label: `${weekdayShort(point.day)} ${whole(point.value)} min`,
    value: point.value,
    tone: 'info' as const,
  }));
  const visual: HealthStatVisual = bars.length
    ? { kind: 'bars', max: Math.max(...bars.map((bar) => bar.value), 1), caption: '', bars }
    : { kind: 'bars', max: 1, caption: '', bars: [{ key: 'none', label: 'This week 0 min', value: 0, tone: 'info' }] };
  return finish(item, {
    valueText: whole(total),
    unit: 'min',
    period: PERIOD_THIS_WEEK,
    status: 'Logged workouts may not include walking.',
    tone: 'info',
    trend: weekTrend(history, input.today, 5),
    hasGuideline: false,
    visual,
    history: nums(history),
    about: 'Workouts: minutes logged in workouts. They may not include walking. The unit is minutes.',
    meaning: 'This tile is the logged workouts. The 150-minute mark sits on weekly active minutes.',
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
  if (workouts.length + strength.length + cardio.length + conditioning.length + other.length === 0) return null;
  const weekStart = shiftDay(input.today, -6);
  const workoutWeek = sumBetween(workouts, weekStart, input.today);
  const mixWeek = sumBetween(strength, weekStart, input.today)
    + sumBetween(cardio, weekStart, input.today)
    + sumBetween(conditioning, weekStart, input.today)
    + sumBetween(other, weekStart, input.today);
  const minutes = workouts.length > 0 ? workoutWeek : mixWeek;
  const rounded = Math.round(minutes);
  const left = Math.max(0, CMO_MODERATE_MINUTES_WEEK - rounded);
  const met = rounded >= CMO_MODERATE_MINUTES_WEEK;
  const tone: StatsTone = met ? 'good' : 'info';
  const status = met
    ? '150 minutes logged'
    : rounded === 0
      ? '150 minutes to go'
      : left === 1
        ? '1 minute to 150'
        : `${left} minutes to 150`;
  const scaleMax = Math.max(300, rounded + 20);
  const history = workouts.length > 0 ? workouts : mergeDays([strength, cardio, conditioning, other]);
  return finish(item, {
    valueText: whole(rounded),
    unit: 'min',
    period: PERIOD_THIS_WEEK,
    status,
    tone,
    trend: weekTrend(history, input.today, 5),
    hasGuideline: true,
    visual: {
      kind: 'zone',
      value: rounded,
      zoneLow: CMO_MODERATE_MINUTES_WEEK,
      zoneHigh: scaleMax,
      scaleMin: 0,
      scaleMax,
      status,
      zoneCaption: 'At least 150 min this week',
      tone,
    },
    history: nums(history),
    about: 'Active minutes: time counted toward this week. The unit is minutes.',
    meaning: `The UK Chief Medical Officers recommend at least ${CMO_MODERATE_MINUTES_WEEK} minutes of moderate activity a week, or ${CMO_VIGOROUS_MINUTES_WEEK} minutes of vigorous activity. Logged workouts may not include walking, and this app cannot tell how hard the minutes were.`,
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
  const history = series(input.samples, item.id, input.today).filter((point) => point.value > 0);
  const latest = history.at(-1);
  if (!latest) return null;
  const shown = digits === 0 ? String(Math.round(latest.value)) : oneText(latest.value);
  return finish(item, {
    valueText: shown,
    unit,
    period: PERIOD_LATEST,
    status: note,
    tone: 'info',
    trend: readingTrend(history, epsilon),
    hasGuideline: false,
    visual: spark(history, `${shown} ${unit}`),
    history: nums(history),
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
): Omit<HealthStatTile, 'id' | 'section' | 'title' | 'mark'> {
  return {
    valueText: oneText(value),
    unit,
    period: PERIOD_LATEST,
    weeklyLine: null,
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
  tile: Omit<HealthStatTile, 'id' | 'section' | 'title' | 'mark' | 'weeklyLine'> & { weeklyLine?: string | null },
): HealthStatTile {
  return {
    id: item.id,
    section: item.section,
    title: item.title,
    mark: STATS_SIGNAL[tile.tone],
    weeklyLine: null,
    ...tile,
  };
}

/** A 28-day total of 1,198 minutes is about 300 minutes a week. */
function weeklyAverageWords(total: number, days: number): string {
  const perWeek = Math.round(total / (days / 7));
  return `About ${whole(perWeek)} min a week.`;
}

function spark(history: readonly DayValue[], label: string): HealthStatVisual {
  if (history.length >= 2) return { kind: 'line', points: history.slice(-8).map((point) => point.value) };
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

function readingTrend(history: readonly DayValue[], epsilon: number): string | null {
  if (history.length < 2) return null;
  const latest = history.at(-1)!.value;
  const previous = history.at(-2)!.value;
  return trendFrom(latest, previous, epsilon, 'reading');
}

function weekTrend(history: readonly DayValue[], today: string, epsilon: number): string | null {
  const weekStart = shiftDay(today, -6);
  if (!history.some((point) => point.day < weekStart)) return null;
  const previousStart = shiftDay(today, -13);
  const previousEnd = shiftDay(today, -7);
  return trendFrom(
    sumBetween(history, weekStart, today),
    sumBetween(history, previousStart, previousEnd),
    epsilon,
    'week',
  );
}

function trendFrom(latest: number, previous: number, epsilon: number, noun: 'reading' | 'week'): string {
  const delta = latest - previous;
  if (Math.abs(delta) <= epsilon) {
    return noun === 'week' ? 'Steady against the week before.' : 'Steady against the earlier reading.';
  }
  if (delta > 0) return noun === 'week' ? 'Up from the week before.' : 'Up from the earlier reading.';
  return noun === 'week' ? 'Down from the week before.' : 'Down from the earlier reading.';
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
  return history.slice(-8).map((point) => point.value);
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
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
