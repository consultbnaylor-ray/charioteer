/**
 * Compact tiles for the signed-in person's own health readings.
 * A lime band is drawn only from a published source in healthBands.
 * Lean mass, active energy, logged workout minutes, and the workout mix stay
 * without a band, and each one says why. Steps name the published research
 * and keep a spark, not a fake NHS band.
 */

import { targetWeightStatusLine } from '@/domain/targetWeight';
import {
  ACTIVE_MINUTES_ABOUT,
  ACTIVE_MINUTES_GARMIN_LINE,
  ACTIVE_MINUTES_MEANING,
  ACTIVE_MINUTES_WORKOUT_LINE,
  ACTIVE_MINUTES_WORKOUT_STATUS,
} from '@/domain/activityMinutes';
import {
  AHA_LINK,
  BAND_CAVEAT,
  BHF_LINK,
  FRIEND_LINK,
  NO_ENERGY_BAND,
  NO_LEAN_BAND,
  NO_MIX_BAND,
  NO_WORKOUT_MINUTE_BAND,
  hrvReading,
  metricFallback,
  recoveryReading,
  restingSexNote,
  sessionHeartReading,
  walkingHeartReading,
  type BandLink,
  type ReadingSheet,
} from '@/domain/healthBands';
import { stepsResearchMeaning } from '@/domain/garminCharts';
import { restingFitnessComment, type RestingFitnessComment } from '@/domain/restingFitness';
import { bodyFatRange } from '@/domain/distance';
import {
  buildFitnessSnapshot,
  CONDITIONING_NOTE,
  MIX_HOW,
  periodActiveMinutes,
  VO2_WHAT,
  workoutMixReport,
} from '@/domain/fitnessSnapshot';
import { paceJudgement, parseStatPeriod, periodDayCount, periodPhrase as sharedPeriodPhrase, rollingWindow, scaledPeriodTarget, STAT_PERIOD_LABEL, STAT_PERIODS, type StatPeriod } from '@/domain/statWindow';
import { goalBandLegend, goalWeightRange, IBA_RULES_URL, NO_CUT } from '@/domain/goalWeightRange';
import {
  BHF_RESTING_MAX_BPM,
  BHF_RESTING_MIN_BPM,
  CMO_ACTIVITY_URL,
  CMO_MODERATE_MINUTES_WEEK,
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
import { healthSampleChart, sparklineFromDays } from '@/domain/chartSeries';
import { formatSleepHours, healthChangeNote, shiftDay, weekdayShort, type DayValue } from '@/domain/healthInsights';
import { ascendingByDay } from '@/domain/readingChart';
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
import { NHS_RESTING_LOW, restingReadingIsLow } from '@/domain/restingFitness';
import { STATS_SIGNAL, type StatsTone } from '@/domain/statsOverview';

export const HEALTH_STATS_MISSING = 'No data found yet';
export const HEALTH_TURN_ON = 'Ask Apple Health';
/** iOS shows the sheet once per type. A later tap cannot reopen it. */
export const HEALTH_SHEET_LIMIT =
  'Apple Health shows its permission sheet only for categories it has not asked about yet. After that, the sheet cannot be opened again.';
export const HEALTH_PRIVACY_STEPS =
  'Health app > profile picture (top right) > Privacy > Apps > Charioteer > turn on those categories.';
export const HEALTH_SETTINGS_STEPS =
  'On iOS versions that have it: Settings > Health > Data Access & Devices > Charioteer.';
export const HEALTH_SHEET_WONT_SHOW =
  'The permission sheet will not appear. The Health app is open. Follow the steps above.';
export const HEALTH_SHEET_ASKED =
  'Apple Health was asked again. A category it has not seen yet uses the permission sheet.';

const ADULT_HIDDEN = 'These adult ranges are not shown under 18. Nothing here is guessed.';

/** The shared Day to 12 months choice. Seven days is the page default. */
export const HEALTH_STAT_PERIODS = STAT_PERIODS;
export type HealthStatPeriod = StatPeriod;

export const HEALTH_STAT_PERIOD_LABEL: Record<HealthStatPeriod, string> = STAT_PERIOD_LABEL;

export function parseHealthStatPeriod(value: unknown): HealthStatPeriod {
  return parseStatPeriod(value);
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
    source: 'VO2 max comes from Apple Watch after outdoor walks or runs.',
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
    source: 'Active minutes come from logged workouts.',
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

/** Ask for the sheet when iOS may still show it. Otherwise explain the real path. */
export function healthTurnOnPlan(status: HealthAuthRequest): 'sheet' | 'explain' {
  return missingHealthAction(status) === 'request' ? 'sheet' : 'explain';
}

export function healthSharingSteps(titles: readonly string[]): string {
  return `${HEALTH_SHEET_LIMIT} For ${titles.join(', ')}: ${HEALTH_PRIVACY_STEPS} ${HEALTH_SETTINGS_STEPS}`;
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

/**
 * The resting card's own figure, under 60. 60 does not qualify.
 * The under-18 card hides adult ranges, so this line stays off it.
 */
export function restingTileShowsFitLine(tile: Pick<HealthStatTile, 'id' | 'status' | 'valueText' | 'visual'>): boolean {
  if (tile.id !== 'resting_heart_rate') return false;
  if (tile.status.includes('under 18')) return false;
  if (tile.visual.kind === 'zone') return tile.visual.value < NHS_RESTING_LOW;
  return restingReadingIsLow(tile.valueText);
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
  { id: 'vo2_max', section: 'fitness', title: 'VO2 max' },
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
  { id: 'weekly_active_minutes', section: 'activity', title: 'Active minutes' },
];

export type HealthStatSample = { kind: string; value: number; recordedOn: string; source?: string };

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
  /** Private target weight. Omitted on screens that do not show weight. */
  targetWeightKg?: number | null;
  targetStartKg?: number | null;
  build: BodyBuild | null;
  /** Saved workout-type choices. Empty uses the default mapping. */
  workoutBuckets?: WorkoutBucketMap;
  /** Omitted means the last 7 days. */
  period?: HealthStatPeriod;
  /**
   * One active-minutes value per day, already chosen from Garmin or logged workouts.
   * When set, the active-minutes tile uses this series and does not add the two sources.
   * `source` says whether that day is the weighted Garmin figure.
   */
  activeMinutes?: readonly (DayValue & { source?: 'garmin' | 'workout' })[];
  /**
   * Raw Garmin moderate and vigorous minutes. The resting comment uses this split
   * so the double count runs once, inside resting fitness.
   */
  garminActivity?: readonly { day: string; moderateMinutes: number | null; vigorousMinutes: number | null }[];
};

export type HealthStatVisual =
  | {
    kind: 'ring';
    centre: string;
    unit: string;
    fill: number;
    status: string;
    tone: StatsTone;
    signal?: string;
    neutral?: boolean;
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
    signal?: string;
    neutral?: boolean;
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
  /** Dated readings behind the chart. Empty buckets are not filled in. */
  readings: DayValue[];
  about: string;
  meaning: string;
  /** Short sections for More info. When set, the sheet is shown instead of the dense paragraph. */
  sheet?: ReadingSheet | null;
  /** Formula, shown only after How we worked this out. */
  workedOut?: string | null;
  /** Sustained resting rate above the NHS usual range. */
  warning?: boolean;
  rangeNote: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
  extraSourceName?: string | null;
  extraSourceUrl?: string | null;
  /** Every opened source for this band. The year is in the name. */
  sources?: BandLink[];
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

/** Keeps a subset of tiles. Missing lines follow the same ids, so a moved section does not leave a ghost. */
export function narrowHealthStatBoard(
  model: HealthStatBoardModel,
  options: { only?: readonly string[]; omit?: readonly string[] },
): HealthStatBoardModel {
  if (!options.only && !options.omit) return model;
  const keep = (id: string) => {
    if (options.only && !options.only.includes(id)) return false;
    if (options.omit?.includes(id)) return false;
    return true;
  };
  const sections = model.sections
    .map((section) => ({ ...section, tiles: section.tiles.filter((tile) => keep(tile.id)) }))
    .filter((section) => section.tiles.length > 0);
  const gaps = model.gaps.filter((gap) => keep(gap.id));
  const missing = gaps.map((gap) => gap.title);
  return {
    ...model,
    sections,
    gaps,
    missing,
    missingLine: missing.length ? `${HEALTH_STATS_MISSING}: ${missing.join(', ')}` : null,
  };
}

function tileFor(
  item: CatalogItem,
  input: HealthStatBoardInput,
  grown: boolean,
  height: number | null,
): HealthStatTile | null {
  if (item.id === 'resting_heart_rate') return heartBandTile(item, input, grown);
  if (item.id === 'walking_heart_rate') return walkingTile(item, input, grown);
  if (item.id === 'heart_rate_recovery') return recoveryTile(item, input, grown);
  if (item.id === 'session_heart_rate') return sessionTile(item, input, grown);
  if (item.id === 'vo2_max') return vo2Tile(item, input, grown);
  if (item.id === 'mix') return mixTile(item, input);
  if (item.id === 'sleep_hours') return sleepTile(item, input, grown);
  if (item.id === 'hrv_sdnn') return hrvTile(item, input, grown);
  if (item.id === 'weight_kg') return weightTile(item, input, grown, height);
  if (item.id === 'body_fat') return bodyFatTile(item, input, grown);
  if (item.id === 'waist') return waistTile(item, input, grown, height);
  if (item.id === 'lean_mass') return leanTile(item, input);
  if (item.id === 'steps') return stepsTile(item, input);
  if (item.id === 'active_energy') return energyTile(item, input);
  if (item.id === 'workouts') return workoutTile(item, input);
  return weeklyTile(item, input);
}

function goalLabel(input: HealthStatBoardInput): string | null {
  return input.goal ? GOAL_LABEL[input.goal] : null;
}

function athleticRestingSources(goal: NutritionGoal | null): BandLink[] {
  const label = goal ? GOAL_LABEL[goal] : null;
  const used = metricFallback({ metricId: 'resting_heart_rate', goalLabel: label }).used;
  return used === 'athlete' ? [BHF_LINK, AHA_LINK] : [BHF_LINK];
}

function citedFrom(
  item: CatalogItem,
  input: HealthStatBoardInput,
  about: string,
  reading: ReturnType<typeof sessionHeartReading>,
  history: DayValue[],
  previous: DayValue[],
  period: HealthStatPeriod,
  bpm: number,
): HealthStatTile {
  const trend = movementTrend(history, previous, 'mean', 2, period);
  if (!reading) {
    return finish(item, {
      valueText: String(bpm),
      unit: 'bpm',
      period: periodLabel(period),
      status: 'Add an age to place this on a published band. Nothing here is guessed.',
      tone: 'info',
      trend,
      hasGuideline: false,
      visual: spark(history, `${bpm} bpm`),
      history: nums(history),
      readings: [...history],
      about,
      meaning: 'Add an age to place this on a published band. Nothing here is guessed.',
      rangeNote: 'No beats-per-minute band until an age is saved.',
      sourceName: null,
      sourceUrl: null,
    });
  }
  return finish(item, {
    valueText: String(bpm),
    unit: 'bpm',
    period: periodLabel(period),
    status: reading.status,
    tone: 'info',
    trend,
    hasGuideline: true,
    visual: {
      kind: 'zone',
      value: bpm,
      zoneLow: reading.zoneLow ?? bpm,
      zoneHigh: reading.zoneHigh ?? bpm,
      scaleMin: reading.scaleMin,
      scaleMax: reading.scaleMax,
      status: reading.status,
      zoneCaption: reading.zoneCaption ?? '',
      goalLow: reading.goalLow,
      goalHigh: reading.goalHigh,
      goalCaption: reading.goalCaption,
      tone: 'info',
    },
    history: nums(history),
    readings: [...history],
    about,
    meaning: reading.meaning,
    sheet: reading.sheet ?? null,
    workedOut: reading.workedOut ?? null,
    rangeNote: reading.rangeNote,
    sourceName: reading.links[0]?.name ?? null,
    sourceUrl: reading.links[0]?.url ?? null,
    sources: reading.links,
  });
}

function sessionTile(item: CatalogItem, input: HealthStatBoardInput, grown: boolean): HealthStatTile | null {
  const about = 'Session heart rate: the average heart rate during logged workouts. The unit is bpm.';
  return bpmBandTile(item, input, grown, about, (bpm) => sessionHeartReading(bpm, input.goalAge, goalLabel(input)));
}

function walkingTile(item: CatalogItem, input: HealthStatBoardInput, grown: boolean): HealthStatTile | null {
  const about = 'Walking heart rate: your heart rate while walking. The unit is bpm. Apple Watch can estimate it. Apple publishes no normal range.';
  return bpmBandTile(item, input, grown, about, (bpm) => walkingHeartReading(bpm, input.goalAge, goalLabel(input)));
}

function recoveryTile(item: CatalogItem, input: HealthStatBoardInput, grown: boolean): HealthStatTile | null {
  const about = 'Heart rate recovery: how far your heart rate drops in the first minute after effort. The unit is bpm.';
  return bpmBandTile(item, input, grown, about, (bpm) => recoveryReading(bpm, goalLabel(input)));
}

function bpmBandTile(
  item: CatalogItem,
  input: HealthStatBoardInput,
  grown: boolean,
  about: string,
  read: (bpm: number) => ReturnType<typeof sessionHeartReading>,
): HealthStatTile | null {
  const all = series(input.samples, item.id, input.today).filter((point) => point.value > 0);
  const window = slicePeriod(all, input);
  if (window === 'none') return null;
  if (window === 'gap') return olderReadingTile(item, input, all, (point) => `Latest ${Math.round(point.value)} bpm`);
  const period = periodOf(input);
  const bpm = Math.round(averageOf(window.current));
  if (!grown) {
    return finish(item, {
      valueText: String(bpm),
      unit: 'bpm',
      period: periodLabel(period),
      status: ADULT_HIDDEN,
      tone: 'info',
      trend: movementTrend(window.current, window.previous, 'mean', 2, period),
      hasGuideline: false,
      visual: spark(window.current, `${bpm} bpm`),
      history: nums(window.current),
      readings: [...window.current],
      about,
      meaning: ADULT_HIDDEN,
      rangeNote: null,
      sourceName: null,
      sourceUrl: null,
    });
  }
  return citedFrom(item, input, about, read(bpm), window.current, window.previous, period, bpm);
}

function heartBandTile(item: CatalogItem, input: HealthStatBoardInput, grown: boolean): HealthStatTile | null {
  const all = series(input.samples, item.id, input.today);
  const window = slicePeriod(all, input);
  if (window === 'none') return null;
  if (window === 'gap') return olderReadingTile(item, input, all, (point) => `Latest ${Math.round(point.value)} bpm`);
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
    readings: [...window.current],
      about,
      meaning: ADULT_HIDDEN,
      rangeNote: null,
      sourceName: null,
      sourceUrl: null,
    });
  }
  const low = bpm < BHF_RESTING_MIN_BPM;
  const high = bpm > BHF_RESTING_MAX_BPM;
  const fitness = restingMonthComment(input);
  const tone: StatsTone = fitness.tier === 'dangerous' ? 'attention' : high ? 'watch' : low ? 'info' : 'good';
  const status = fitness.tier === 'dangerous'
    ? 'Contact your GP or NHS 111.'
    : fitness.tier === 'might'
      ? 'A low resting heart rate like this might be normal.'
      : fitness.tier === 'unhealthy'
        ? 'Seek professional guidance.'
        : low && fitness.tier === 'early'
          ? 'Under 60 bpm. One reading is not a pattern.'
          : high && fitness.tier === 'early'
            ? 'Over 100 bpm. One reading is not a pattern.'
            : high
              ? 'Over 100 bpm'
              : low
                ? 'Under 60 bpm. One reading is not a pattern.'
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
    readings: [...window.current],
    about,
    meaning: `${restingSexNote(goalLabel(input))} The band is the same for a day, a week, or a month. ${BAND_CAVEAT} ${fitness.note}`.replace(/\s+/g, ' ').trim(),
    warning: fitness.warning,
    rangeNote: null,
    sourceName: BHF_LINK.name,
    sourceUrl: BHF_LINK.url,
    sources: athleticRestingSources(input.goal),
  });
}

function sleepTile(item: CatalogItem, input: HealthStatBoardInput, grown: boolean): HealthStatTile | null {
  const all = series(input.samples, 'sleep_hours', input.today);
  const window = slicePeriod(all, input);
  if (window === 'none') return null;
  if (window === 'gap') {
    return olderReadingTile(item, input, all, (point) => `Latest night ${formatSleepHours(point.value)}`, true);
  }
  const period = periodOf(input);
  const label = periodLabel(period, period === 'day');
  const hours = Math.round(averageOf(window.current) * 10) / 10;
  const nights = nightCountLine(window.current.length);
  const trend = movementTrend(window.current, window.previous, 'mean', 0.3, period);
  const about = 'Sleep: hours asleep. The unit is hours. The figure is the average of the nights that have a reading.';
  if (!grown) {
    return finish(item, {
      valueText: oneText(hours),
      unit: 'h',
      period: label,
      status: `${ADULT_HIDDEN} ${nights}`,
      tone: 'info',
      trend,
      hasGuideline: false,
      visual: spark(window.current, `${oneText(hours)} h`),
      history: nums(window.current),
    readings: [...window.current],
      about,
      meaning: `${ADULT_HIDDEN} ${nights}`,
      rangeNote: null,
      sourceName: null,
      sourceUrl: null,
    });
  }
  const under = hours < NHS_ADULT_SLEEP_MIN_HOURS;
  const over = hours > NHS_ADULT_SLEEP_MAX_HOURS;
  const tone: StatsTone = under ? 'watch' : over ? 'info' : 'good';
  const band = under
    ? 'Under 7 hours'
    : over
      ? 'Over 9 hours, not a warning on its own'
      : 'Within 7 to 9 hours';
  const status = `${band}. ${nights}`;
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
    readings: [...window.current],
    about,
    meaning: `The NHS says adults need 7 to 9 hours a night. That range is not stretched across a week or a month. ${nights}`,
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
  const visual: HealthStatVisual = band && cardio
    ? {
      kind: 'ring',
      centre: oneText(value),
      unit: 'ml/kg/min',
      fill: cardio.fill,
      status,
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
    readings: current.map((point) => ({ day: point.day, value: Math.round(point.value * 10) / 10 })),
    about: VO2_WHAT,
    meaning: `${cardio?.compare.words ?? 'Apple Watch estimates this. Nothing here is guessed.'}${band ? ` ${BAND_CAVEAT}` : ''}`,
    rangeNote: cardio?.compare.goalNote ?? null,
    sourceName: cardio?.compare.sources.length ? cardio.compare.sources.join(' ') : null,
    sourceUrl: band ? FRIEND_LINK.url : null,
    sources: band ? [FRIEND_LINK] : undefined,
  });
}

function mixTotals(input: HealthStatBoardInput, start: string, end = input.today): {
  buckets: Record<WorkoutBucket, number>;
  breakdown: { activityType: number; label: string; minutes: number; bucket: WorkoutBucket }[];
  lines: string[];
} {
  const report = workoutMixReport({
    samples: input.samples,
    today: input.today,
    start,
    end,
    overrides: input.workoutBuckets,
  });
  return {
    buckets: {
      strength: report.strength,
      cardio: report.cardio,
      conditioning: report.conditioning,
      other: report.other,
    },
    breakdown: report.types.map((row) => ({
      activityType: row.activityType,
      label: row.label,
      minutes: row.minutes,
      bucket: row.bucket,
    })),
    lines: report.lines,
  };
}

function mixTile(item: CatalogItem, input: HealthStatBoardInput): HealthStatTile | null {
  const period = periodOf(input);
  const start = windowStart(input.today, period);
  const { buckets, breakdown, lines } = mixTotals(input, start);
  const strength = buckets.strength;
  const cardio = buckets.cardio;
  const conditioning = buckets.conditioning;
  const other = buckets.other;
  const total = strength + cardio + conditioning + other;
  if (total <= 0) {
    const days = [...new Set(input.samples.map((sample) => sample.recordedOn.slice(0, 10)))]
      .filter((day) => day <= input.today)
      .sort();
    let latest: DayValue | null = null;
    for (const day of days) {
      const dayTotals = mixTotals(input, day, day);
      const dayTotal = dayTotals.buckets.strength + dayTotals.buckets.cardio + dayTotals.buckets.conditioning + dayTotals.buckets.other;
      if (dayTotal > 0) latest = { day, value: dayTotal };
    }
    return latest ? olderReadingTile(item, input, [latest], (point) => `Latest ${whole(point.value)} min`) : null;
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
    weeklyLine: weeklyLineFor(period, total),
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
    meaning: [listed, ...lines].filter(Boolean).join(' '),
    rangeNote: `${NO_MIX_BAND} You can count a workout type as strength, cardio, conditioning, or other. That choice stays on your account.`,
    sourceName: null,
    sourceUrl: null,
    breakdown,
  });
}

function hrvTile(item: CatalogItem, input: HealthStatBoardInput, grown: boolean): HealthStatTile | null {
  const all = series(input.samples, 'hrv_sdnn', input.today);
  const window = slicePeriod(all, input);
  if (window === 'none') return null;
  if (window === 'gap') return olderReadingTile(item, input, all, (point) => `Latest ${Math.round(point.value)} ms`);
  const period = periodOf(input);
  const ms = Math.round(averageOf(window.current));
  const about = 'Heart rate variability, in milliseconds (SDNN). Devices measure it in different ways.';
  const trend = healthChangeNote('hrv_sdnn', all, input.today);
  if (!grown) {
    return finish(item, {
      valueText: String(ms),
      unit: 'ms',
      period: periodLabel(period),
      status: ADULT_HIDDEN,
      tone: 'info',
      trend,
      hasGuideline: false,
      visual: spark(window.current, `${ms} ms`),
      history: nums(window.current),
      readings: [...window.current],
      about,
      meaning: ADULT_HIDDEN,
      rangeNote: null,
      sourceName: null,
      sourceUrl: null,
    });
  }
  const reading = hrvReading(ms, goalLabel(input));
  return finish(item, {
    valueText: String(ms),
    unit: 'ms',
    period: periodLabel(period),
    status: reading.status,
    tone: 'info',
    trend,
    hasGuideline: true,
    visual: {
      kind: 'zone',
      value: ms,
      zoneLow: reading.zoneLow ?? ms,
      zoneHigh: reading.zoneHigh ?? ms,
      scaleMin: reading.scaleMin,
      scaleMax: reading.scaleMax,
      status: reading.status,
      zoneCaption: reading.zoneCaption ?? '',
      tone: 'info',
    },
    history: nums(window.current),
    readings: [...window.current],
    about,
    meaning: reading.meaning,
    sheet: reading.sheet ?? null,
    workedOut: reading.workedOut ?? null,
    rangeNote: reading.rangeNote,
    sourceName: reading.links[0]?.name ?? null,
    sourceUrl: reading.links[0]?.url ?? null,
    sources: reading.links,
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
  if (window === 'gap') return olderReadingTile(item, input, all, (point) => `Latest ${oneText(point.value)} kg`);
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
  const targetLine = targetWeightStatusLine({
    currentKg: kg,
    targetKg: input.targetWeightKg ?? null,
    startKg: input.targetStartKg ?? null,
  });
  const meaning = `${weightMeaning(input.goal, ranged, extra)}${targetLine ? ` ${targetLine}` : ''}`;
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
    readings: [...history],
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
  if (window === 'gap') return olderReadingTile(item, input, all, (point) => `Latest ${oneText(point.value)}%`);
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
    readings: [...history],
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
  if (window === 'gap') return olderReadingTile(item, input, all, (point) => `Latest ${oneText(point.value)} cm`);
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
    readings: [...history],
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
  if (window === 'gap') return olderReadingTile(item, input, all, (point) => `Latest ${oneText(point.value)} kg`);
  const period = periodOf(input);
  const kg = Math.round(averageOf(window.current) * 10) / 10;
  return finish(item, {
    valueText: oneText(kg),
    unit: 'kg',
    period: periodLabel(period),
    status: 'No published guideline.',
    tone: 'info',
    trend: movementTrend(window.current, window.previous, 'mean', 0.3, period),
    hasGuideline: false,
    visual: spark(window.current, `${oneText(kg)} kg`),
    history: nums(window.current),
    readings: [...window.current],
    about: 'Lean mass: muscle, bone, and the rest of the body that is not fat. The unit is kilograms.',
    meaning: NO_LEAN_BAND,
    rangeNote: NO_LEAN_BAND,
    sourceName: null,
    sourceUrl: null,
  });
}

function stepsTile(item: CatalogItem, input: HealthStatBoardInput): HealthStatTile | null {
  const all = series(input.samples, 'steps', input.today);
  const window = slicePeriod(all, input);
  if (window === 'none') return null;
  if (window === 'gap') return olderReadingTile(item, input, all, (point) => `Latest ${whole(point.value)} steps`);
  const period = periodOf(input);
  const total = Math.round(window.current.reduce((sum, point) => sum + point.value, 0));
  const daily = window.current.length ? Math.round(total / window.current.length) : null;
  const status = 'Compared with published step research. Not an NHS step target.';
  return finish(item, {
    valueText: whole(total),
    unit: 'steps',
    period: periodLabel(period),
    weeklyLine: weeklyLineFor(period, total, 'steps'),
    status,
    tone: 'info',
    trend: movementTrend(window.current, window.previous, 'sum', 1, period),
    hasGuideline: true,
    visual: spark(window.current, `${whole(total)} steps`),
    history: nums(window.current),
    readings: [...window.current],
    about: period === 'day' ? 'Steps in a day.' : `Steps over ${periodPhrase(period)}.`,
    meaning: stepsResearchMeaning(daily),
    rangeNote: 'The NHS publishes minutes of activity, not a daily step count. The comparison is research, not an NHS target.',
    sourceName: 'Ding and colleagues, Lancet Public Health, 2025',
    sourceUrl: 'https://www.thelancet.com/journals/lanpub/article/PIIS2468-2667(25)00164-1/fulltext',
    sources: [
      { name: 'NHS: physical activity guidelines for adults', url: 'https://www.nhs.uk/live-well/exercise/physical-activity-guidelines-for-adults-aged-19-to-64/', year: null },
      { name: 'Paluch and colleagues, Lancet Public Health, 2022', url: 'https://www.thelancet.com/journals/lanpub/article/PIIS2468-2667(21)00302-9/fulltext', year: 2022 },
      { name: 'Ding and colleagues, Lancet Public Health, 2025', url: 'https://www.thelancet.com/journals/lanpub/article/PIIS2468-2667(25)00164-1/fulltext', year: 2025 },
      { name: 'Saint-Maurice and colleagues, JAMA, 2020', url: 'https://jamanetwork.com/journals/jama/fullarticle/2763292', year: 2020 },
      { name: 'Tudor-Locke and Bassett, Sports Medicine, 2004', url: 'https://doi.org/10.2165/00007256-200434010-00001', year: 2004 },
    ],
  });
}

function restingMonthComment(input: HealthStatBoardInput): RestingFitnessComment {
  const start = shiftIsoDay(input.today, -29);
  const resting = input.samples.flatMap((sample) => (
    sample.kind === 'resting_heart_rate' && sample.recordedOn >= start && sample.recordedOn <= input.today && sample.value > 0
      ? [{ day: sample.recordedOn, bpm: sample.value }]
      : []
  ));
  const activity = input.garminActivity
    ? input.garminActivity.flatMap((day) => {
      if (day.day < start || day.day > input.today) return [];
      if (day.moderateMinutes == null && day.vigorousMinutes == null) return [];
      return [{ day: day.day, moderateMinutes: day.moderateMinutes ?? 0, vigorousMinutes: day.vigorousMinutes ?? 0 }];
    })
    : (input.activeMinutes ?? []).flatMap((day) => (
      day.day >= start && day.day <= input.today ? [{ day: day.day, moderateMinutes: day.value, vigorousMinutes: 0 }] : []
    ));
  let vo2Max: number | null = null;
  let vo2Day = '';
  for (const sample of input.samples) {
    if (sample.kind !== 'vo2_max' || !(sample.value > 0) || sample.recordedOn > input.today) continue;
    if (sample.recordedOn >= vo2Day) {
      vo2Day = sample.recordedOn;
      vo2Max = sample.value;
    }
  }
  return restingFitnessComment({
    today: input.today,
    resting,
    activity,
    vo2Max,
    age: input.goalAge,
    sex: input.goalSex,
  });
}

function shiftIsoDay(day: string, delta: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
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
    weeklyLine: weeklyLineFor(period, shown, 'kcal'),
    status: 'From the recent daily average.',
    tone: 'info',
    trend: null,
    hasGuideline: false,
    visual: {
      kind: 'bars',
      max: Math.max(shown, 1),
      caption: 'No published guideline.',
      bars: [{ key: 'energy', label: `${whole(shown)} kcal`, value: shown, tone: 'info' }],
    },
    history: [],
    about: 'Active energy is scaled from the recent daily average stored from Apple Health. A day shows that average, 7 days shows seven times it, and 30 days shows thirty times it. The unit is kilocalories.',
    meaning: NO_ENERGY_BAND,
    rangeNote: NO_ENERGY_BAND,
    sourceName: null,
    sourceUrl: null,
  });
}

function workoutTile(item: CatalogItem, input: HealthStatBoardInput): HealthStatTile | null {
  const history = series(input.samples, 'workout_minutes', input.today);
  const window = slicePeriod(history, input);
  if (window === 'none') return null;
  if (window === 'gap') return olderReadingTile(item, input, history, (point) => `Latest ${whole(point.value)} min`);
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
    weeklyLine: weeklyLineFor(period, total),
    status: 'Logged workouts may not include walking.',
    tone: 'info',
    trend: movementTrend(window.current, window.previous, 'sum', 5, period),
    hasGuideline: false,
    visual,
    history: nums(window.current),
    readings: [...window.current],
    about: `Workouts: minutes logged over ${periodPhrase(period)}. They may not include walking. The unit is minutes.`,
    meaning: NO_WORKOUT_MINUTE_BAND,
    rangeNote: NO_WORKOUT_MINUTE_BAND,
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
  const history = input.activeMinutes
    ? ascendingByDay(input.activeMinutes)
    : workouts.length > 0 ? workouts : mergeDays([strength, cardio, conditioning, other]);
  const window = slicePeriod(history, input);
  if (window === 'none') return null;
  if (window === 'gap') return olderReadingTile(item, input, history, (point) => `Latest ${whole(point.value)} min`);
  const period = periodOf(input);
  const bounds = rollingWindow(input.today, period);
  const active = input.activeMinutes
    ? null
    : periodActiveMinutes({
      samples: input.samples,
      today: input.today,
      start: bounds.start,
      end: bounds.end,
      overrides: input.workoutBuckets,
    });
  const rounded = active ? active.minutes : Math.round(window.current.reduce((sum, point) => sum + point.value, 0));
  const loggedDays = active ? active.days : window.current.filter((point) => point.value > 0).length;
  const target = scaledActivityMinutes(CMO_MODERATE_MINUTES_WEEK, period);
  const left = Math.max(0, target - rounded);
  const met = rounded >= target;
  const pace = paceJudgement({ period, loggedDays, now: new Date(), met, behind: 'Short' });
  const tone: StatsTone = met ? 'good' : pace.neutral ? 'info' : 'info';
  const counted = window.current.filter((point) => point.value > 0) as readonly (DayValue & { source?: 'garmin' | 'workout' })[];
  const garminOnly = counted.length > 0 && counted.every((point) => point.source === 'garmin');
  const status = garminOnly
    ? pace.neutral && !met
      ? pace.word
      : met
        ? `${whole(target)} minutes logged`
        : rounded === 0
          ? `${whole(target)} minutes to go`
          : left === 1
            ? `1 minute to ${whole(target)}`
            : `${whole(left)} minutes to ${whole(target)}`
    : ACTIVE_MINUTES_WORKOUT_STATUS;
  const sourceLine = garminOnly ? ACTIVE_MINUTES_GARMIN_LINE : ACTIVE_MINUTES_WORKOUT_LINE;
  const averageLine = weeklyLineFor(period, rounded);
  const scaleMax = Math.max(target * 2, rounded + 20);
  return finish(item, {
    title: 'Active minutes',
    valueText: whole(rounded),
    unit: 'min',
    period: periodLabel(period),
    weeklyLine: [averageLine, sourceLine].filter((line): line is string => Boolean(line)).join(' '),
    status,
    tone,
    mark: pace.neutral ? pace.word : STATS_SIGNAL[tone],
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
      signal: pace.neutral ? pace.word : undefined,
      neutral: pace.neutral,
    },
    history: nums(window.current),
    readings: [...window.current],
    about: ACTIVE_MINUTES_ABOUT,
    meaning: ACTIVE_MINUTES_MEANING,
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
  if (window === 'gap') return olderReadingTile(item, input, all, (point) => `Latest ${digits === 0 ? String(Math.round(point.value)) : oneText(point.value)} ${unit}`);
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
    readings: [...window.current],
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
    readings: [...history],
    about,
    meaning,
    rangeNote: null,
    sourceName: null,
    sourceUrl: null,
  };
}

function finish(
  item: CatalogItem,
  tile: Omit<HealthStatTile, 'id' | 'section' | 'title' | 'mark' | 'weeklyLine' | 'empty' | 'readings'> & {
    title?: string;
    weeklyLine?: string | null;
    empty?: boolean;
    mark?: string;
    readings?: DayValue[];
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
    readings: tile.readings ?? [],
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
  return periodDayCount(period);
}

/** The 150-minute week, scaled to the chosen period. 21 today, 150 in 7 days, 643 in 30 days. */
export function scaledActivityMinutes(weekly: number, period: HealthStatPeriod): number {
  return scaledPeriodTarget(weekly, period);
}

function activityCaption(period: HealthStatPeriod, target: number): string {
  if (period === 'day') return `At least ${target} min today`;
  const days = periodDayCount(period);
  if (period === '6m') return `At least ${target} min in 6 months`;
  if (period === '12m') return `At least ${target} min in 12 months`;
  return `At least ${target} min in ${days} days`;
}

function periodLabel(period: HealthStatPeriod, night = false): string {
  if (period === 'day') return night ? PERIOD_LAST_NIGHT : PERIOD_TODAY;
  if (period === '7') return PERIOD_LAST_7;
  if (period === '30') return PERIOD_LAST_30;
  return sharedPeriodPhrase(period).replace(/^the /, '');
}

function periodPhrase(period: HealthStatPeriod): string {
  return sharedPeriodPhrase(period);
}

function noReadingsLine(period: HealthStatPeriod, night: boolean): string {
  if (period === 'day') return night ? 'No readings last night.' : 'No readings today.';
  return `No readings in ${sharedPeriodPhrase(period)}.`;
}

function windowStart(today: string, period: HealthStatPeriod): string {
  return rollingWindow(today, period).start;
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
  const current = ascendingByDay(points.filter((point) => point.day >= start && point.day <= input.today));
  if (current.length === 0) return 'gap';
  const previousWindow = previousBounds(input.today, period);
  const previous = ascendingByDay(points.filter((point) => point.day >= previousWindow.start && point.day <= previousWindow.end));
  return { current, previous };
}

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function compactUkDay(iso: string, today: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  const text = `${day} ${SHORT_MONTHS[(month ?? 1) - 1] ?? ''}`;
  if (iso.slice(0, 4) === today.slice(0, 4)) return text;
  return `${text} ${year}`;
}

function olderThanPeriod(period: HealthStatPeriod, night: boolean): string {
  if (period === 'day') return night ? 'older than last night' : 'older than today';
  return `older than ${sharedPeriodPhrase(period)}`;
}

function weeklyLineFor(period: HealthStatPeriod, total: number, unit = 'min'): string | null {
  const days = periodDayCount(period);
  if (days <= 7) return null;
  return weeklyAverageWords(total, days, unit);
}

function nightCountLine(count: number): string {
  if (count === 1) return '1 night.';
  return `Average of ${count} nights.`;
}

/** The latest stored reading, named as older than the selected period. */
function olderReadingTile(
  item: CatalogItem,
  input: HealthStatBoardInput,
  points: readonly DayValue[],
  phrase: (point: DayValue) => string,
  night = false,
): HealthStatTile {
  const latest = points[points.length - 1]!;
  const period = periodOf(input);
  const label = olderThanPeriod(period, night && period === 'day');
  const valueText = `${phrase(latest)} · ${compactUkDay(latest.day, input.today)}`;
  const status = `This reading is ${label}.`;
  return finish(item, {
    valueText,
    unit: '',
    period: label,
    status,
    tone: 'info',
    trend: null,
    hasGuideline: false,
    empty: true,
    visual: { kind: 'line', points: [] },
    history: [],
    about: `${valueText}. ${status}`,
    meaning: `${valueText}. ${status}`,
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
  if (period === '6m') return 'the 6 months before';
  if (period === '12m') return 'the 12 months before';
  return `the ${periodDayCount(period)} days before`;
}

function trendWords(latest: number, previous: number, epsilon: number, against: string): string {
  const delta = latest - previous;
  if (Math.abs(delta) <= epsilon) return `Steady against ${against}.`;
  if (delta > 0) return `Up from ${against}.`;
  return `Down from ${against}.`;
}

function spark(history: readonly DayValue[], label: string): HealthStatVisual {
  const ordered = ascendingByDay(history);
  const values = sparklineFromDays(ordered);
  if (values.length >= 2) return { kind: 'line', points: values };
  const latest = ordered.at(-1);
  const value = latest?.value ?? 0;
  return {
    kind: 'bars',
    max: Math.max(value, 1),
    caption: '',
    bars: [{ key: 'latest', label, value, tone: 'info' }],
  };
}

function series(samples: readonly HealthStatSample[], kind: string, today: string): DayValue[] {
  return healthSampleChart(samples, kind, today);
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
  return ascendingByDay([...map.entries()].map(([day, value]) => ({ day, value })));
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
