/**
 * One registry for every number the app shows on a stat card.
 * Ratings are deterministic and client-side. They read stored figures plus the
 * tables below. They are not sent to Thumos, voice, or the health-plan writer.
 * Women's health is not a metric here.
 *
 * Sources named in `source` are the citation shown once in More info.
 */

import {
  COLE_ABNORMAL_AT_OR_UNDER,
  NUNAN_SDNN_HIGH,
  NUNAN_SDNN_LOW,
  NUNAN_SDNN_MEAN,
  zonePlace,
  intensityZones,
} from '@/domain/healthBands';
import { vo2AthleticShortfall, publishedCardioBand } from '@/domain/fitnessSnapshot';
import {
  CMO_MODERATE_MINUTES_WEEK,
  CMO_VIGOROUS_MINUTES_WEEK,
  NHS_ADULT_SLEEP_MAX_HOURS,
  NHS_ADULT_SLEEP_MIN_HOURS,
  NICE_BMI_HEALTHY_MAX,
  NICE_BMI_HEALTHY_MIN,
} from '@/domain/guidance';
import { GOAL_LABEL, isAnyBoxer, type NutritionGoal, type NutritionSex } from '@/domain/nutrition';

export const METRIC_CAVEAT = 'Not medical advice. Not a diagnosis.';

export type MetricRatingLabel = 'Excellent' | 'Good' | 'Fair' | 'Poor' | 'Usual';

export type MetricBasis = 'body_fat' | 'waist_ratio' | 'bmi';

export type MetricScale = 'score' | 'streak' | 'share';

export type MetricContext = {
  age: number | null;
  sex: NutritionSex | null;
  goal: NutritionGoal | null;
  ownUsual: number | null;
  heightCm?: number | null;
  realAge?: number | null;
  vo2?: number | null;
  restingHr?: number | null;
  bmi?: number | null;
  bodyFat?: number | null;
  vigorousWeek?: number | null;
  windowDays?: number | null;
  calorieTarget?: number | null;
  proteinTarget?: number | null;
  drinkFreeGoal?: number | null;
  processedCount?: number | null;
  wholeCount?: number | null;
  basis?: MetricBasis | null;
  scale?: MetricScale | null;
};

export type MetricReading = {
  id: string;
  label: MetricRatingLabel;
  where: string;
  source: string;
  caveat: typeof METRIC_CAVEAT;
  band: { low: number; high: number } | null;
  /** When the chart has no band of its own, paint this one. */
  draw: boolean;
  goalLine: string | null;
  tips: readonly string[];
  more: string;
  /** No stored figure. The card says "No rating yet" and still shows the range. */
  pending: boolean;
  /** Named inputs on the card, such as the four figures behind fitness age. */
  inputs?: readonly { name: string; detail: string }[];
  /** Short sourced note. The card caveat stays separate. */
  why?: { body: string; sources: string };
};

export type MetricDefinition = {
  id: string;
  unit: string;
  source: string;
  shownOn: string;
  before: string;
  now: string;
  rate: (value: number | null, ctx: MetricContext) => MetricReading;
};

export const EMPTY_METRIC_CONTEXT: MetricContext = {
  age: null,
  sex: null,
  goal: null,
  ownUsual: null,
};

/** Literal ActivityBars titles in DailyActivity. The value is the registry id. */
export const ACTIVITY_BAR_TITLES: Record<string, string> = {
  Steps: 'steps',
  Distance: 'distance',
  Floors: 'floors',
  'Resting heart rate': 'resting_heart_rate',
  'Intensity minutes': 'intensity',
  'Moderate minutes': 'moderate',
  'Vigorous minutes': 'vigorous',
  'Exercise minutes': 'exercise',
  'Active calories': 'active_energy',
  'Heart rate variability': 'hrv',
};

const PALUCH = 'Paluch and colleagues, Lancet Public Health, 2022 (doi:10.1016/S2468-2667(21)00302-9)';
const NHS_SLEEP = 'NHS, insomnia: most adults need 7 to 9 hours (https://www.nhs.uk/conditions/insomnia/). Hirshkowitz and colleagues, Sleep Health, 2015 (doi:10.1016/j.sleh.2014.12.010), National Sleep Foundation: 7–9 hours at 18–64 and 7–8 hours at 65 or over.';
const GARMIN_SLEEP = 'Garmin sleep-score bands published with Garmin Connect: Excellent 90–100, Good 80–89, Fair 60–79, Poor under 60.';
const NHS_REST = 'NHS and British Heart Foundation usual adult resting rate, 60–100 bpm. A trained resting rate is often about 40–60 bpm in sports-medicine texts (ACSM). That is a typical range, not a diagnosis.';
const KAMINSKY = 'Kaminsky, Arena, and Myers, Mayo Clinic Proceedings, 2015. FRIEND treadmill percentiles, ages 20–79.';
const NUNAN_SDNN = `Nunan, Sandercock and Brodie, 2010. Short-term SDNN study averages ${NUNAN_SDNN_LOW}–${NUNAN_SDNN_HIGH} ms, overall mean about ${NUNAN_SDNN_MEAN} ms. Not split by sex. Not a clinical cutoff.`;
const NUNAN_RMSSD = 'Nunan, Sandercock and Brodie, 2010. Short-term RMSSD study means clustered around 42 ms and were not split by sex. It tends to fall with age. A rough guide, not a cutoff, and not averaged with SDNN.';
const CMO = `UK Chief Medical Officers: at least ${CMO_MODERATE_MINUTES_WEEK} moderate minutes a week, or ${CMO_VIGOROUS_MINUTES_WEEK} vigorous minutes.`;
const NHS_BP = 'NHS, high blood pressure: ideal is about 90/60 to 120/80 mmHg (https://www.nhs.uk/conditions/high-blood-pressure/).';
const NHS_BMI = `NHS / NICE NG246 healthy-weight BMI ${NICE_BMI_HEALTHY_MIN}–${NICE_BMI_HEALTHY_MAX}. A muscular build can sit higher. Not a diagnosis.`;
const NHS_WAIST = 'NHS: a waist of 94 cm or more for men, or 80 cm or more for women, is the higher-risk cut. Under 0.5 waist-to-height is the screen band when height is set.';
const ACE_FAT = 'American Council on Exercise adult categories. Men: athletes 6–13%, fitness 14–17%, average 18–24%. Women: athletes 14–20%, fitness 21–24%, average 25–31%. Not split by age.';
const GARMIN_STRESS = 'Garmin stress bands: 0–25 rest, 26–50 low, 51–75 medium, 76–100 high.';
const GARMIN_FITNESS_AGE = 'Garmin Fitness Age: the estimate uses VO2 max, resting heart rate, BMI or body fat, and vigorous minutes (Garmin Connect support).';

/**
 * Mortality figures are the ones those papers report, not a blend.
 * Kodama 2009: about 13% lower all-cause mortality per 1 MET.
 * Mandsager 2018: the fittest group had about an 80% lower risk than the least fit.
 * Ross 2016: fitness is as strong as, or stronger than, smoking, diabetes, and high blood pressure.
 */
export const FITNESS_AGE_WHY = {
  body: 'Fitness age is built mainly from VO2 max. That fitness is one of the strongest predictors of death from any cause, as strong as or stronger than smoking, diabetes, and high blood pressure. Kodama and colleagues found that each 1 MET higher fitness was linked with about a 13% lower risk of death from any cause. Mandsager and colleagues found a large drop in risk once people were above the lowest fitness group, and about an 80% lower risk in the fittest group than the least fit. Garmin’s fitness age is a watch estimate, not a clinical measure: these are links in groups of people, not a guarantee, and they cannot predict how long one person will live.',
  sources: 'Ross and colleagues, Circulation, 2016. Kodama and colleagues, JAMA, 2009 (doi:10.1001/jama.2009.681). Mandsager and colleagues, JAMA Network Open, 2018 (doi:10.1001/jamanetworkopen.2018.3605).',
};
export const GARMIN_EPOCH_SOURCE = 'Garmin Health API epoch summaries.';
export const GARMIN_EPOCH_EXPLAIN = 'Epochs are Garmin’s 15-minute activity blocks through the day. Active minutes here are the time in those blocks that Garmin counts as active, including light movement, so the total is much higher than intensity minutes. Intensity minutes count only moderate and vigorous effort, with vigorous counted twice. There is no published healthy-person range for this total.';
const OWN_APP = 'This app’s own scale. There is no published population norm, so the comparison is with your usual or your own aim.';
const SPO2_SOURCE = 'NHS pulse-oximeter guidance: usual readings are about 95–100%. At 92 or below, contact a GP or NHS 111. Not a diagnosis.';
const BREATH_SOURCE = 'A usual resting adult breathing rate is about 12–20 breaths a minute (standard clinical observation, including British Lung Foundation descriptions).';
const COLE = `Cole and colleagues, New England Journal of Medicine, 1999. A fall of ${COLE_ABNORMAL_AT_OR_UNDER} bpm or less in the first minute was called abnormal in adults referred for a treadmill test. Not a healthy-population cutoff.`;
const TANAKA = 'Walking and session heart rate use the Tanaka 2001 max (208 − 0.7 × age) and ACSM moderate and vigorous percentages. Apple publishes no normal walking-heart-rate range.';

const SLEEP_TIPS = [
  'Keep a steady wake time, including after a late night.',
  'Dim screens in the hour before bed.',
  'Leave caffeine for earlier in the day, and go easy on alcohol in the evening.',
] as const;

const STEP_TIPS = [
  'A short walk after meals adds steps without a formal session.',
  'Break up long sitting with a few minutes on your feet.',
  'Build toward the research range for your age a little at a time.',
] as const;

const MOVE_TIPS = [
  'A brisk walk most days covers a lot of the weekly minutes.',
  'Two or three short harder efforts can fill the vigorous side.',
  'Spread the minutes through the week rather than saving them for one day.',
] as const;

export function leadingNumber(text: string | null | undefined): number | null {
  if (!text) return null;
  const hours = text.match(/(\d+)\s*h(?:\s*(\d+)\s*m)?/i);
  if (hours) {
    const minutes = hours[2] ? Number(hours[2]) / 60 : 0;
    return Math.round((Number(hours[1]) + minutes) * 10) / 10;
  }
  const match = text.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const value = Number(match[0]);
  return Number.isFinite(value) ? value : null;
}

export function metricAudit(): { id: string; shownOn: string; before: string; now: string; source: string; unit: string }[] {
  return Object.values(METRIC_REGISTRY).map((metric) => ({
    id: metric.id,
    unit: metric.unit,
    shownOn: metric.shownOn,
    before: metric.before,
    now: metric.now,
    source: metric.source,
  }));
}

export function readingFor(id: string, value: number | null, ctx: MetricContext): MetricReading {
  const metric = METRIC_REGISTRY[id];
  if (!metric) throw new Error(`stat card ${id} is not in the metric registry`);
  return metric.rate(value, ctx);
}

function sportName(goal: NutritionGoal | null): string | null {
  if (!goal) return null;
  if (!isAnyBoxer(goal) && goal !== 'elite_runner' && goal !== 'body_builder') return null;
  return GOAL_LABEL[goal];
}

function ageNote(ctx: MetricContext): string {
  if (ctx.age != null && ctx.sex != null) {
    return `Using age ${Math.round(ctx.age)} and ${ctx.sex === 'female' ? 'female' : 'male'} categories.`;
  }
  if (ctx.age != null) return `Age is ${Math.round(ctx.age)}. Sex is not set, so this is an adult figure that is not split by sex.`;
  if (ctx.sex != null) return 'Age is not set, so this uses an adult figure rather than an age band.';
  return 'Age and sex are not set, so this uses an adult figure and says so.';
}

function usualClause(value: number, usual: number | null, unit: string): string {
  if (usual == null || !Number.isFinite(usual)) return ' There is not yet a run of your own readings beside this one.';
  const shown = Math.round(usual * 10) / 10;
  const gap = Math.abs(value - usual);
  if (gap <= Math.max(Math.abs(usual) * 0.1, 0.5)) return ` This is about the same as your usual of ${shown} ${unit}.`;
  if (value > usual) return ` This is above your usual of ${shown} ${unit}.`;
  return ` This is below your usual of ${shown} ${unit}.`;
}

function blank(
  id: string,
  source: string,
  where: string,
  moreOrExtra: string | { band?: { low: number; high: number } | null; draw?: boolean; goalLine?: string | null; tips?: readonly string[]; more?: string } = where,
): MetricReading {
  const extra = typeof moreOrExtra === 'string' ? { more: moreOrExtra } : moreOrExtra;
  return {
    id,
    label: 'Usual',
    where,
    source,
    caveat: METRIC_CAVEAT,
    band: extra.band ?? null,
    draw: extra.draw ?? false,
    goalLine: extra.goalLine ?? null,
    tips: extra.tips ?? [],
    more: extra.more ?? where,
    pending: true,
  };
}

function made(
  id: string,
  source: string,
  label: MetricRatingLabel,
  where: string,
  extra: { band?: { low: number; high: number } | null; draw?: boolean; goalLine?: string | null; tips?: readonly string[]; more?: string },
): MetricReading {
  const goalLine = extra.goalLine ?? null;
  const belowGoal = goalLine != null && /below|under the|short of|above that|higher than the trained/i.test(goalLine);
  const showTips = label === 'Fair' || label === 'Poor' || belowGoal;
  return {
    id,
    label,
    where,
    source,
    caveat: METRIC_CAVEAT,
    band: extra.band ?? null,
    draw: extra.draw ?? false,
    goalLine,
    tips: showTips ? (extra.tips ?? []) : [],
    more: extra.more ?? where,
    pending: false,
  };
}

function stepBand(age: number | null): { low: number; high: number; why: string } {
  if (age != null && age >= 60) return { low: 6000, high: 8000, why: 'Paluch 2022 for age 60 or over' };
  if (age != null && age < 60) return { low: 8000, high: 10000, why: 'Paluch 2022 for under 60' };
  return { low: 7000, high: 10000, why: 'the wider adult span used when age is not set' };
}

function scaled(weekly: number, ctx: MetricContext): number {
  const days = ctx.windowDays != null && ctx.windowDays > 0 ? ctx.windowDays : 7;
  return Math.round(weekly * (days / 7));
}

function rateSteps(id: string, value: number | null, ctx: MetricContext): MetricReading {
  const band = stepBand(ctx.age);
  if (value == null || value <= 0) {
    const sport = sportName(ctx.goal);
    return blank(id, PALUCH, `The research range is ${band.low.toLocaleString('en-GB')}–${band.high.toLocaleString('en-GB')} steps a day (${band.why}). ${ageNote(ctx)} The NHS does not set a daily step target.`, {
      band,
      draw: true,
      goalLine: sport ? `${sport}: that step range is the same one used for other adults. There is no reading to compare yet.` : null,
      tips: STEP_TIPS,
    });
  }
  const label: MetricRatingLabel = value >= band.high ? 'Excellent' : value >= band.low ? 'Good' : value >= 5000 ? 'Fair' : 'Poor';
  const sport = sportName(ctx.goal);
  const goalLine = sport
    ? value >= band.low
      ? `${sport}: you are inside the step research range. That range is not a sport test.`
      : `${sport}: you are under the step research range. The range is the same one used for other adults.`
    : null;
  const where = `${Math.round(value).toLocaleString('en-GB')} steps sits ${label === 'Excellent' || label === 'Good' ? 'in' : 'under'} ${band.low.toLocaleString('en-GB')}–${band.high.toLocaleString('en-GB')} a day (${band.why}). ${ageNote(ctx)} The NHS does not set a daily step target.`;
  return made(id, PALUCH, label, where, { band, draw: false, goalLine, tips: STEP_TIPS, more: `${where} Ding and colleagues, 2025, saw the association bend around 5,000–7,000 steps.` });
}

function rateResting(id: string, value: number | null, ctx: MetricContext): MetricReading {
  if (value == null || value <= 0) {
    const sport = sportName(ctx.goal);
    return blank(id, NHS_REST, `The usual adult range is 60–100 bpm. Good on this card is about 50–80. ${ageNote(ctx)}`, {
      band: { low: 60, high: 100 },
      draw: true,
      goalLine: sport ? `${sport}: a typical trained resting rate is about 40–60 bpm. There is no reading to compare yet.` : null,
      tips: [
        'Easy aerobic sessions and walks, most weeks, are what usually brings a high resting rate down.',
        'Sleep and alcohol both move the next morning’s number.',
        'Treat one odd day as a reading, and watch the month.',
      ],
    });
  }
  const bpm = Math.round(value);
  let label: MetricRatingLabel = 'Good';
  if (bpm > 100) label = 'Poor';
  else if (bpm >= 81 || bpm < 50) label = 'Fair';
  else label = 'Good';
  if (bpm >= 50 && bpm <= 60) label = 'Good';
  const talk = bpm > 100 || bpm < 40 ? ' A rate that stays above 100, or under 40, is a reason to contact a GP or NHS 111. Call 999 if you have chest pain, shortness of breath, or feel faint.' : '';
  const sport = sportName(ctx.goal);
  const goalLine = sport
    ? bpm >= 40 && bpm <= 60
      ? `${sport}: ${bpm} bpm sits inside the typical trained range of about 40–60 bpm.`
      : `${sport}: ${bpm} bpm is above that typical trained range of about 40–60 bpm.`
    : null;
  const where = `${bpm} bpm. Good on this card is about 50–80. The NHS usual adult range is 60–100, and a lower rate can come with training. ${ageNote(ctx)}${usualClause(bpm, ctx.ownUsual, 'bpm')}${talk}`;
  return made(id, NHS_REST, label, where, {
    band: { low: 60, high: 100 },
    draw: false,
    goalLine,
    tips: [
      'Easy aerobic sessions and walks, most weeks, are what usually brings a high resting rate down.',
      'Sleep and alcohol both move the next morning’s number.',
      'Treat one odd day as a reading, and watch the month.',
    ],
    more: where,
  });
}

function rateSleepHours(id: string, value: number | null, ctx: MetricContext): MetricReading {
  const older = ctx.age != null && ctx.age >= 65;
  const band = older ? { low: 7, high: 8 } : { low: NHS_ADULT_SLEEP_MIN_HOURS, high: NHS_ADULT_SLEEP_MAX_HOURS };
  if (value == null || value <= 0) return blank(id, NHS_SLEEP, `The adult range used here is ${band.low}–${band.high} hours. ${older ? 'From 65, the National Sleep Foundation range is 7–8 hours.' : ageNote(ctx)}`, { band, draw: true, tips: SLEEP_TIPS });
  const label: MetricRatingLabel = value >= band.low && value <= band.high ? 'Good' : value >= band.low - 1 && value <= band.high + 1 ? 'Fair' : 'Poor';
  const where = `${Math.round(value * 10) / 10} hours against ${band.low}–${band.high} hours. ${older ? 'From 65, the National Sleep Foundation range used here is 7–8 hours.' : ageNote(ctx)}`;
  return made(id, NHS_SLEEP, label, where, { band, draw: true, tips: SLEEP_TIPS, more: where });
}

function rateSleepScore(id: string, value: number | null, ctx: MetricContext): MetricReading {
  const band = { low: 80, high: 100 };
  if (value == null || value <= 0) return blank(id, GARMIN_SLEEP, 'Garmin calls 90–100 Excellent, 80–89 Good, 60–79 Fair, and under 60 Poor. The green band is 80–100.', { band, draw: true, tips: SLEEP_TIPS });
  const score = Math.round(value);
  const label: MetricRatingLabel = score >= 90 ? 'Excellent' : score >= 80 ? 'Good' : score >= 60 ? 'Fair' : 'Poor';
  const where = `Sleep score ${score}. Garmin calls 90–100 Excellent, 80–89 Good, 60–79 Fair, and under 60 Poor. ${ageNote(ctx)}`;
  return made(id, GARMIN_SLEEP, label, where, { band, draw: true, tips: SLEEP_TIPS, more: `${where} The score follows Garmin’s reading of that night. It is not a medical sleep test.` });
}

function rateVo2(id: string, value: number | null, ctx: MetricContext): MetricReading {
  const band = publishedCardioBand(ctx.age, ctx.sex);
  if (value == null || value <= 0) {
    const sport = sportName(ctx.goal);
    return blank(id, KAMINSKY, band ? `The published middle half for this age and sex is ${band.low}–${band.high}. At or above ${band.high} is Good. A cycling estimate is not used.` : `Age and sex are needed before a percentile is shown. ${ageNote(ctx)}`, {
      band,
      draw: Boolean(band),
      goalLine: sport ? `${sport}: trained people often sit at or above the 75th percentile for their age and sex. There is no reading to compare yet.` : null,
      tips: [
        'Four repeats of four hard minutes, with easy movement between, once or twice a week.',
        'Keep the other days easy. Walks still count.',
        'Build up if hard efforts are new. Check with a GP if you are unsure about intense work.',
      ],
    });
  }
  if (!band) {
    return made(id, KAMINSKY, 'Usual', `${value} ml/kg/min. ${ageNote(ctx)} No percentile is shown until age and sex are both set.${usualClause(value, ctx.ownUsual, 'ml/kg/min')}`, {
      tips: [],
      more: 'Cycling VO2 max is not used. The percentile table is Kaminsky, Arena, and Myers, 2015, ages 20–79.',
    });
  }
  const label: MetricRatingLabel = value >= band.high ? 'Good' : value >= band.low ? 'Fair' : 'Poor';
  const shortfall = vo2AthleticShortfall({ vo2: value, sex: ctx.sex, goal: ctx.goal });
  const sport = sportName(ctx.goal);
  const goalLine = shortfall
    ? shortfall
    : sport
      ? value >= band.high
        ? `${sport}: this sits at or above the 75th percentile for your age and sex, where trained people often land.`
        : `${sport}: this is under the upper half of the age and sex range. Trained people often sit at or above the 75th percentile.`
      : null;
  const where = `${value} ml/kg/min. The published middle half for your age and sex is ${band.low}–${band.high}. At or above ${band.high} is Good on this card. A cycling estimate is not used.`;
  return made(id, KAMINSKY, label, where, {
    band,
    draw: false,
    goalLine,
    tips: [
      'Four repeats of four hard minutes, with easy movement between, once or twice a week.',
      'Keep the other days easy. Walks still count.',
      'Build up if hard efforts are new. Check with a GP if you are unsure about intense work.',
    ],
    more: where,
  });
}

function rateMinutes(id: string, value: number | null, ctx: MetricContext, weekly: number, noun: string): MetricReading {
  const aim = scaled(weekly, ctx);
  const days = ctx.windowDays != null && ctx.windowDays > 0 ? ctx.windowDays : 7;
  if (value == null || value <= 0) {
    const sport = sportName(ctx.goal);
    return blank(id, CMO, `The guide for this window is about ${aim} minutes, from ${weekly} a week. ${ageNote(ctx)}`, {
      goalLine: sport ? `${sport}: the general weekly guide is still about ${aim} minutes in this window. There is no reading to compare yet.` : null,
      tips: MOVE_TIPS,
    });
  }
  const label: MetricRatingLabel = value >= aim ? 'Good' : value >= aim * 0.5 ? 'Fair' : 'Poor';
  const sport = sportName(ctx.goal);
  const goalLine = sport
    ? value >= aim
      ? `${sport}: these minutes meet the general weekly guide. A sport plan can still ask for more.`
      : `${sport}: these minutes are under the general weekly guide of about ${aim} in this window.`
    : null;
  const where = `${Math.round(value)} ${noun}. The guide for this window is about ${aim} minutes, from ${weekly} a week. ${ageNote(ctx)}`;
  return made(id, CMO, label, where, { goalLine, tips: MOVE_TIPS, more: where });
}

function rateHrvSdnn(id: string, value: number | null, ctx: MetricContext): MetricReading {
  if (value == null || value <= 0) return blank(id, NUNAN_SDNN, 'No Apple Health SDNN in this window. This is not Garmin RMSSD.');
  const ms = Math.round(value);
  const inside = ms >= NUNAN_SDNN_LOW && ms <= NUNAN_SDNN_HIGH;
  const where = `${ms} ms SDNN. Study averages ran from ${NUNAN_SDNN_LOW} to ${NUNAN_SDNN_HIGH} ms, mean about ${NUNAN_SDNN_MEAN}. That spread is not a personal target and not an age table.${usualClause(ms, ctx.ownUsual, 'ms')} Apple Health HRV is SDNN. Garmin overnight HRV is RMSSD. They are not averaged together.`;
  return made(id, NUNAN_SDNN, inside ? 'Good' : 'Fair', where, {
    tips: [
      'A steady bedtime and a full night move HRV more than one evening’s trick.',
      'A hard day or a drink can drop the next reading. Watch the week, not one night.',
    ],
    more: where,
  });
}

function rateHrvRmssd(id: string, value: number | null, ctx: MetricContext): MetricReading {
  if (value == null || value <= 0) return blank(id, NUNAN_RMSSD, `${NUNAN_RMSSD} This is not mixed with Apple SDNN.`, {
    tips: [
      'Keep the next night’s sleep long enough, and make the training day easier if this keeps dropping.',
      'One low night is common. The trend over a fortnight matters more.',
    ],
  });
  const ms = Math.round(value);
  const usual = ctx.ownUsual;
  let label: MetricRatingLabel = 'Usual';
  if (usual != null && ms < usual * 0.75) label = 'Fair';
  else if (usual != null && ms >= usual * 0.9) label = 'Good';
  const where = `${ms} ms RMSSD. ${NUNAN_RMSSD}${usualClause(ms, usual, 'ms')} This is not mixed with Apple SDNN.`;
  return made(id, NUNAN_RMSSD, label, where, {
    tips: [
      'Keep the next night’s sleep long enough, and make the training day easier if this keeps dropping.',
      'One low night is common. The trend over a fortnight matters more.',
    ],
    more: where,
  });
}

function bmiOf(kg: number, heightCm: number | null | undefined): number | null {
  if (heightCm == null || heightCm <= 0) return null;
  const metres = heightCm / 100;
  return Math.round((kg / (metres * metres)) * 10) / 10;
}

function rateBmiValue(id: string, bmi: number, ctx: MetricContext): MetricReading {
  const band = { low: NICE_BMI_HEALTHY_MIN, high: NICE_BMI_HEALTHY_MAX };
  let label: MetricRatingLabel = 'Good';
  if (bmi < 18.5 || bmi >= 30) label = 'Poor';
  else if (bmi > NICE_BMI_HEALTHY_MAX) label = 'Fair';
  const sport = sportName(ctx.goal);
  const goalLine = sport && bmi > NICE_BMI_HEALTHY_MAX
    ? `${sport}: BMI ${bmi} is above the NHS healthy-weight range. A muscular build can sit there without extra fat, so this is not a failing on its own.`
    : sport
      ? `${sport}: BMI ${bmi} is inside the NHS healthy-weight range. Muscle can still change what that means.`
      : null;
  const where = `BMI ${bmi}. The NHS healthy-weight range is ${band.low}–${band.high}. A muscular build can sit above it. ${ageNote(ctx)}`;
  const talk = bmi < 18.5 || bmi >= 30 ? ' If this is new or you feel unwell, contact a GP or NHS 111.' : '';
  return made(id, NHS_BMI, label, `${where}${talk}`, {
    band,
    draw: true,
    goalLine,
    tips: [
      'Steady meals and walks most days are the general advice. This is not a diet plan.',
      'If you train hard, waist and body fat tell a fairer story than BMI alone.',
    ],
    more: where,
  });
}

function rateWeight(id: string, value: number | null, ctx: MetricContext): MetricReading {
  if (value == null || value <= 0) return blank(id, NHS_BMI, 'No weight in this window. A kilogram figure is not rated without a height, because the NHS range is a BMI.');
  const bmi = bmiOf(value, ctx.heightCm);
  if (bmi == null) {
    return made(id, NHS_BMI, 'Usual', `${Math.round(value * 10) / 10} kg. Height is not set, so this is not placed on the NHS BMI range.${usualClause(value, ctx.ownUsual, 'kg')}`, { more: 'Add a height and the card can use BMI. Nothing here is guessed.' });
  }
  const rated = rateBmiValue(id, bmi, ctx);
  return { ...rated, where: `${Math.round(value * 10) / 10} kg is BMI ${bmi}. ${rated.where}` };
}

function aceBand(sex: NutritionSex | null, sport: boolean): { low: number; high: number } | null {
  if (sex === 'male') return sport ? { low: 6, high: 13 } : { low: 6, high: 17 };
  if (sex === 'female') return sport ? { low: 14, high: 20 } : { low: 14, high: 24 };
  return null;
}

function rateBodyFat(id: string, value: number | null, ctx: MetricContext): MetricReading {
  if (value == null || value <= 0) {
    const sport = sportName(ctx.goal);
    const span = aceBand(ctx.sex, Boolean(sport));
    const who = ctx.sex === 'female' ? 'women' : ctx.sex === 'male' ? 'men' : null;
    return blank(id, ACE_FAT, span && who ? `For ${who}, the ACE span on this card is ${span.low}–${span.high}%. Categories are not split by age. ${ageNote(ctx)}` : `Sex is not set, so the ACE categories are not applied. ${ageNote(ctx)}`, {
      band: span,
      draw: Boolean(span),
      goalLine: sport && span ? `${sport}: the comparison uses the ACE athlete span, ${span.low}–${span.high}%. There is no reading yet.` : null,
      tips: [
        'Steady meals with protein and vegetables, and walking most days.',
        'This is general guidance, not a meal plan and not a judgement.',
      ],
    });
  }
  const sport = sportName(ctx.goal);
  const band = aceBand(ctx.sex, Boolean(sport));
  if (!band || ctx.sex == null) {
    return made(id, ACE_FAT, 'Usual', `${Math.round(value * 10) / 10}%. Sex is not set, so the ACE categories are not applied.${usualClause(value, ctx.ownUsual, '%')}`, { more: ACE_FAT });
  }
  const pct = Math.round(value * 10) / 10;
  const averageHigh = ctx.sex === 'male' ? 24 : 31;
  let label: MetricRatingLabel = 'Fair';
  if (pct >= band.low && pct <= band.high) label = 'Good';
  else if (pct > averageHigh || pct < band.low) label = 'Poor';
  const who = ctx.sex === 'male' ? 'men' : 'women';
  const goalLine = sport
    ? pct >= band.low && pct <= band.high
      ? `${sport}: ${pct}% sits in the ACE athlete range for ${who}.`
      : `${sport}: ${pct}% is outside the ACE athlete range for ${who} (${band.low}–${band.high}%).`
    : null;
  const where = `${pct}% body fat. For ${who}, the green band is the ACE athlete-to-fitness span, ${band.low}–${band.high}%. Average runs up to about ${averageHigh}%. ${ageNote(ctx)} These categories are not split by age.`;
  return made(id, ACE_FAT, label, where, {
    band,
    draw: true,
    goalLine,
    tips: [
      'Steady meals with protein and vegetables, and walking most days.',
      'This is general guidance, not a meal plan and not a judgement.',
    ],
    more: where,
  });
}

function rateWaist(id: string, value: number | null, ctx: MetricContext): MetricReading {
  if (value == null || value <= 0) return blank(id, NHS_WAIST, 'No waist measurement in this window.');
  if (ctx.basis === 'waist_ratio' || (id === 'body' && value < 2)) {
    const ratio = Math.round(value * 100) / 100;
    const label: MetricRatingLabel = ratio < 0.5 ? 'Good' : ratio < 0.6 ? 'Fair' : 'Poor';
    return made(id, NHS_WAIST, label, `Waist divided by height is ${ratio.toFixed(2)}. Under 0.5 is the healthy band on this screen. ${ctx.sex == null ? 'Sex is not set, so the NHS centimetre cut is not applied.' : ''}`, {
      tips: ['Walking most days and steady meals are the general advice. This is not a diagnosis.'],
      more: NHS_WAIST,
    });
  }
  const cm = Math.round(value * 10) / 10;
  if (ctx.sex == null) {
    return made(id, NHS_WAIST, 'Usual', `${cm} cm. Sex is not set, so the NHS cut (under 94 cm for men, under 80 cm for women) is not applied.${ctx.heightCm ? '' : ' Add a height if you want the waist-to-height band.'}`, { more: NHS_WAIST });
  }
  const cut = ctx.sex === 'male' ? 94 : 80;
  const label: MetricRatingLabel = cm < cut ? 'Good' : cm < cut + 8 ? 'Fair' : 'Poor';
  return made(id, NHS_WAIST, label, `${cm} cm. The NHS higher-risk cut used here is ${cut} cm for ${ctx.sex === 'male' ? 'men' : 'women'}.`, {
    tips: ['Walking most days is the general advice that goes with a higher waist. This is not a diagnosis.'],
    more: NHS_WAIST,
  });
}

function rateBloodPressure(id: string, value: number | null, ctx: MetricContext, kind: 'systolic' | 'diastolic'): MetricReading {
  const band = kind === 'systolic' ? { low: 90, high: 120 } : { low: 60, high: 80 };
  const name = kind === 'systolic' ? 'Systolic' : 'Diastolic';
  if (value == null || value <= 0) return blank(id, NHS_BP, `NHS ideal for ${name.toLowerCase()} is about ${band.low}–${band.high} mmHg. The other number stays on its own card. Outside that band, contact a GP or NHS 111. This is not a diagnosis.`, {
    band,
    draw: true,
    tips: [
      'A walk most days, less salt, and modest alcohol are the usual first steps.',
      'One home reading can be off. A GP or NHS 111 can check a run of readings.',
    ],
  });
  const reading = Math.round(value);
  const inside = reading >= band.low && reading <= band.high;
  const high = kind === 'systolic' ? reading >= 140 : reading >= 90;
  const low = reading < band.low;
  const label: MetricRatingLabel = inside ? 'Good' : high || low ? 'Poor' : 'Fair';
  const talk = high || low ? ` ${reading} mmHg sits outside the NHS ideal. Contact a GP or NHS 111 to have it checked. This is not a diagnosis.` : '';
  const where = `${name} ${reading} mmHg. The NHS ideal band on this card is ${band.low}–${band.high}. The other number is kept on its own card.${talk}`;
  return made(id, NHS_BP, label, where, {
    band,
    draw: false,
    tips: [
      'A walk most days, less salt, and modest alcohol are the usual first steps.',
      'One home reading can be off. A GP or NHS 111 can check a run of readings.',
    ],
    more: where,
  });
}

function rateSpo2(id: string, value: number | null, ctx: MetricContext): MetricReading {
  if (value == null || value <= 0) return blank(id, SPO2_SOURCE, 'Usual healthy readings are at or above about 96. The green band is 95–100. At 92 or below, contact a GP or NHS 111.', {
    band: { low: 95, high: 100 },
    draw: true,
    tips: ['If a low reading keeps appearing, or you feel unwell, contact a GP or NHS 111 rather than watching the watch.'],
  });
  const pct = Math.round(value);
  const label: MetricRatingLabel = pct >= 96 ? 'Good' : pct >= 93 ? 'Fair' : 'Poor';
  const talk = pct <= 92 ? ' At 92 or below, contact a GP or NHS 111. Call 999 if you are short of breath, in pain, or feel faint.' : '';
  const where = `${pct}%. Usual healthy readings on this card are at or above about 96. The chart band stays 95–100, which is the wider usual range.${usualClause(pct, ctx.ownUsual, '%')}${talk}`;
  return made(id, SPO2_SOURCE, label, where, {
    tips: ['If a low reading keeps appearing, or you feel unwell, contact a GP or NHS 111 rather than watching the watch.'],
    more: where,
  });
}

function rateBreath(id: string, value: number | null, ctx: MetricContext): MetricReading {
  const band = { low: 12, high: 20 };
  if (value == null || value <= 0) return blank(id, BREATH_SOURCE, 'A usual resting adult rate is about 12–20 breaths a minute. The green band is that range.', {
    band: { low: 12, high: 20 },
    draw: true,
    tips: ['Slow breathing for a few minutes, and a check of whether you were still when the watch measured it.'],
  });
  const rate = Math.round(value * 10) / 10;
  const label: MetricRatingLabel = rate >= 12 && rate <= 20 ? 'Good' : rate >= 10 && rate <= 24 ? 'Fair' : 'Poor';
  const talk = label === 'Poor' ? ' If a rate this far from 12–20 keeps happening, or you feel breathless, contact a GP or NHS 111.' : '';
  return made(id, BREATH_SOURCE, label, `${rate} breaths a minute. The usual resting adult range is 12–20.${usualClause(rate, ctx.ownUsual, 'breaths/min')}${talk}`, {
    band,
    draw: false,
    tips: ['Slow breathing for a few minutes, and a check of whether you were still when the watch measured it.'],
    more: BREATH_SOURCE,
  });
}

function rateStress(id: string, value: number | null, ctx: MetricContext): MetricReading {
  const band = { low: 0, high: 50 };
  if (value == null || value < 0) return blank(id, GARMIN_STRESS, 'Garmin’s bands are 0–25 rest, 26–50 low, 51–75 medium, and 76–100 high. The green band is rest and low. It is a body-signal estimate, not a measure of emotions.', {
    band: { low: 0, high: 50 },
    draw: true,
    tips: [
      'A few minutes of slow breathing, or a walk outside.',
      'Look at sleep, caffeine, and alcohol if the score stays medium or high.',
      'If a craving shows up with it, open Breathe or talk it through with someone.',
    ],
  });
  const score = Math.round(value);
  const label: MetricRatingLabel = score <= 25 ? 'Excellent' : score <= 50 ? 'Good' : score <= 75 ? 'Fair' : 'Poor';
  const where = `Stress ${score}. Garmin’s bands are 0–25 rest, 26–50 low, 51–75 medium, and 76–100 high. The green band is rest and low. It is a body-signal estimate, not a measure of emotions.${usualClause(score, ctx.ownUsual, 'score')}`;
  return made(id, GARMIN_STRESS, label, where, {
    band,
    draw: true,
    tips: [
      'A few minutes of slow breathing, or a walk outside.',
      'Look at sleep, caffeine, and alcohol if the score stays medium or high.',
      'If a craving shows up with it, open Breathe or talk it through with someone.',
      'If you feel unable to cope, contact a GP or NHS 111. Samaritans are on 116 123.',
    ],
    more: where,
  });
}

function rateOwn(
  id: string,
  source: string,
  value: number | null,
  ctx: MetricContext,
  unit: string,
  higherIsBetter: boolean,
  explain = 'There is no published healthy-person range, so this is compared with your own usual.',
): MetricReading {
  if (value == null || Number.isNaN(value)) return blank(id, source, explain, {
    tips: ['Compare a new reading with your own recent days. There is no population line to chase.'],
  });
  const usual = ctx.ownUsual;
  let label: MetricRatingLabel = 'Usual';
  if (usual != null && higherIsBetter && value >= usual) label = 'Good';
  if (usual != null && higherIsBetter && value < usual * 0.75) label = 'Fair';
  const where = `${Math.round(value * 10) / 10} ${unit}. ${explain}${usualClause(value, usual, unit)}`;
  return made(id, source, label, where, {
    tips: higherIsBetter ? ['Compare the chart with your own recent days. There is no population line to chase.'] : [],
    more: explain,
  });
}

function rateMood(id: string, value: number | null, ctx: MetricContext): MetricReading {
  if (ctx.scale === 'streak' || (value != null && value > 10)) {
    if (value == null || value <= 0) return blank(id, OWN_APP, 'No check-in streak yet. Mood scores stay off this card.');
    const days = Math.round(value);
    const label: MetricRatingLabel = days >= 7 ? 'Good' : 'Fair';
    return made(id, OWN_APP, label, `${days} check-in days in a row. This is the app’s own streak, not a mood score and not a population norm.`, {
      tips: ['A check-in tomorrow keeps the streak. The score itself stays private.'],
      more: OWN_APP,
    });
  }
  if (value == null || value <= 0) return blank(id, OWN_APP, 'No mood score in this window. The scale is 1 to 10 and there is no population norm.');
  const score = Math.round(value * 10) / 10;
  const label: MetricRatingLabel = score >= 8 ? 'Excellent' : score >= 6 ? 'Good' : score >= 4 ? 'Fair' : 'Poor';
  const help = label === 'Poor' ? ' If you feel unable to cope, contact a GP or NHS 111. Samaritans are on 116 123.' : '';
  return made(id, OWN_APP, label, `Mood ${score} out of 10. This is the app’s own scale, not a clinical score.${usualClause(score, ctx.ownUsual, 'out of 10')}${help}`, {
    tips: [
      'A short walk and another check-in tomorrow are enough for a low day.',
      'Tell someone how the day went if it would help.',
      'One low score is information, not a verdict on you.',
    ],
    more: 'Higher is the better end of this 1–10 check-in. It is not a diagnosis.',
  });
}

function rateCraving(id: string, value: number | null, ctx: MetricContext): MetricReading {
  if (value == null || value < 0) return blank(id, OWN_APP, 'No craving score in this window. The scale is 0 to 10 and lower is the quieter end.');
  const score = Math.round(value * 10) / 10;
  const label: MetricRatingLabel = score <= 3 ? 'Good' : score <= 6 ? 'Fair' : 'Poor';
  return made(id, OWN_APP, label, `Cravings ${score} out of 10. Lower is quieter. This is the app’s own scale, not a clinical score.${usualClause(score, ctx.ownUsual, 'out of 10')}`, {
    tips: [
      'A glass of water, a short walk, or Breathe.',
      'Tell a buddy if you want company with it.',
      'The number can fall within an hour. One high score is not a failure.',
    ],
    more: OWN_APP,
  });
}

function rateSober(id: string, value: number | null, ctx: MetricContext): MetricReading {
  if (value == null || value < 0) return blank(id, OWN_APP, 'No drink-free or sober count in this window.');
  const days = Math.round(value);
  const weekly = ctx.drinkFreeGoal;
  if (weekly != null && weekly > 0) {
    const aim = scaled(weekly, ctx);
    const label: MetricRatingLabel = days >= aim ? 'Good' : 'Fair';
    return made(id, OWN_APP, label, `${days} drink-free days against about ${aim} for this window, from your aim of ${weekly} a week. There is no medical norm for that aim.`, {
      goalLine: days >= aim ? 'You are on your own drink-free aim.' : `You are short of your drink-free aim by about ${Math.max(0, aim - days)} days in this window.`,
      tips: ['Pick the next drink-free day before the evening. One day still counts.'],
      more: OWN_APP,
    });
  }
  return made(id, OWN_APP, days > 0 ? 'Good' : 'Usual', days > 0 ? `${days} days kept. That is your own record, not a population score.` : 'No days counted yet.', { more: OWN_APP });
}

function rateTarget(
  id: string,
  source: string,
  value: number | null,
  target: number | null,
  unit: string,
  lowerIsBetter: boolean,
): MetricReading {
  if (value == null || value <= 0) return blank(id, source, `Nothing logged for ${unit} in this window. The comparison is your own target, not a population norm.`);
  if (target == null || target <= 0) {
    return made(id, source, 'Usual', `${Math.round(value)} ${unit}. No target is set yet, and there is no population norm on this card.`, { more: source });
  }
  const on = lowerIsBetter ? value <= target * 1.1 : value >= target * 0.85;
  const over = lowerIsBetter && value > target * 1.1;
  const short = !lowerIsBetter && value < target * 0.85;
  const label: MetricRatingLabel = on && !over ? 'Good' : 'Fair';
  const where = `${Math.round(value)} ${unit} against your target of ${Math.round(target)} ${unit}. ${over ? 'Above your target.' : short ? 'Short of your target.' : 'On your target.'} There is no population norm on this card.`;
  return made(id, source, label, where, {
    goalLine: on && !over ? 'You are on your own target.' : `You are ${over ? 'above' : 'short of'} your own target of ${Math.round(target)} ${unit}.`,
    tips: lowerIsBetter
      ? ['A later meal can still land inside the day. One day over is not a failure.']
      : ['Add a protein food at the next meal if you are short. There is no failing a day.'],
    more: source,
  });
}

function rateQuality(id: string, ctx: MetricContext): MetricReading {
  const processed = ctx.processedCount;
  const whole = ctx.wholeCount;
  if (processed == null && whole == null) return blank(id, OWN_APP, 'No food logged in this window. Quality here is this app’s own whole-food count, not a population score.');
  const count = processed ?? 0;
  const label: MetricRatingLabel = count === 0 ? 'Good' : count <= 2 ? 'Fair' : 'Poor';
  return made(id, OWN_APP, label, `${whole ?? 0} whole and ${count} highly processed. This is the app’s own split. There is no population score.`, {
    tips: [
      'Swap one processed item for something closer to the original food.',
      'The list under the card names the items. Nothing here is a diet rule.',
    ],
    more: OWN_APP,
  });
}

function rateWater(id: string, value: number | null): MetricReading {
  if (value == null || value <= 0) return blank(id, 'NHS Eatwell: about 6 to 8 drinks a day. This app treats 2,000 ml as a full day. That is not a medical target.', 'No water logged in this window.');
  const label: MetricRatingLabel = value >= 2000 ? 'Good' : 'Fair';
  return made(id, 'NHS Eatwell: about 6 to 8 drinks a day. This card uses 2,000 ml as a full day. Drinks differ in size, so this is not a precise prescription.', label, `${Math.round(value).toLocaleString('en-GB')} ml. Good on this card is about 2,000 ml. The NHS line is 6 to 8 drinks, which is not a fixed millilitre rule.`, {
    tips: ['A glass with each meal is an easy way to close the gap.'],
    more: 'There is no single published millilitre target. 2,000 ml is this app’s full-day mark.',
  });
}

function rateCheckIns(id: string, value: number | null, ctx: MetricContext): MetricReading {
  const aim = scaled(5, ctx);
  if (value == null || value <= 0) return blank(id, OWN_APP, `No check-ins in this window. This app’s own aim is about ${aim} in the window.`);
  const label: MetricRatingLabel = value >= aim ? 'Good' : 'Fair';
  return made(id, OWN_APP, label, `${Math.round(value)} check-ins. The app’s own aim for this window is about ${aim}. There is no population norm.`, {
    tips: ['One check-in a day is enough. A missed day does not wipe the others.'],
    more: OWN_APP,
  });
}

function rateGratitude(id: string, value: number | null, ctx: MetricContext): MetricReading {
  const aim = scaled(7, ctx);
  if (value == null || value <= 0) return blank(id, OWN_APP, 'No gratitude line in this window. The app’s own aim is about a line a day. There is no population norm.');
  const label: MetricRatingLabel = value >= aim ? 'Good' : 'Fair';
  return made(id, OWN_APP, label, `${Math.round(value)} lines against about ${aim} for this window. That aim is the app’s, not a published norm.`, {
    tips: ['One plain line is enough. It does not need to be long.'],
    more: OWN_APP,
  });
}

function rateWalking(id: string, value: number | null, ctx: MetricContext): MetricReading {
  if (value == null || value <= 0) return blank(id, TANAKA, 'No walking heart rate in this window.');
  const zones = intensityZones(ctx.age);
  if (!zones) return made(id, TANAKA, 'Usual', `${Math.round(value)} bpm. Age is not set, so the moderate-zone approximation is not drawn.${usualClause(value, ctx.ownUsual, 'bpm')}`, { more: TANAKA });
  const place = zonePlace(value, zones);
  const label: MetricRatingLabel = place === 'moderate' || place === 'between' ? 'Good' : 'Fair';
  const where = `${Math.round(value)} bpm. The approximate moderate zone is ${zones.moderateLow}–${zones.moderateHigh} bpm. Apple publishes no normal range for walking heart rate. A lower figure can be an easy walk or a fitter heart.`;
  return made(id, TANAKA, label, where, {
    band: { low: zones.moderateLow, high: zones.moderateHigh },
    draw: true,
    tips: ['If the walk felt hard and the number stays high, slow the pace and see whether it settles.'],
    more: where,
  });
}

function rateSession(id: string, value: number | null, ctx: MetricContext): MetricReading {
  if (value == null || value <= 0) return blank(id, TANAKA, 'No session heart rate in this window. There is no single healthy bpm, because it depends on the session.');
  const zones = intensityZones(ctx.age);
  if (!zones) return made(id, TANAKA, 'Usual', `${Math.round(value)} bpm. Age is not set, so this is not placed in a training zone.${usualClause(value, ctx.ownUsual, 'bpm')}`, { more: TANAKA });
  const place = zonePlace(value, zones);
  const label: MetricRatingLabel = place === 'over' ? 'Fair' : 'Good';
  return made(id, TANAKA, label, `${Math.round(value)} bpm during logged sessions. Moderate is about ${zones.moderateLow}–${zones.moderateHigh} bpm and vigorous from about ${zones.vigorousLow}. This is an effort zone, not a health grade.`, {
    tips: ['If a session was meant to be easy and the rate stayed high, leave the next one easier.'],
    more: TANAKA,
  });
}

function rateRecovery(id: string, value: number | null, ctx: MetricContext): MetricReading {
  if (value == null || value <= 0) return blank(id, COLE, 'No heart-rate recovery in this window.');
  const drop = Math.round(value);
  const label: MetricRatingLabel = drop > COLE_ABNORMAL_AT_OR_UNDER ? 'Good' : 'Fair';
  const where = `${drop} bpm in the first minute. Cole and colleagues called ${COLE_ABNORMAL_AT_OR_UNDER} bpm or less abnormal in a referred treadmill group. That was not a healthy population, and Apple’s measurement can differ.${usualClause(drop, ctx.ownUsual, 'bpm')}`;
  return made(id, COLE, label, where, {
    tips: ['An easy cool-down is part of how this drop is usually measured. One low drop is not a diagnosis.'],
    more: where,
  });
}

/** Male boxing VO2 bands already used for the sport comparison. Heavy and cruiser 56–62, other classes 59–65. */
function boxerVo2Band(goal: NutritionGoal | null, sex: NutritionSex | null): { low: number; high: number } | null {
  if (sex !== 'male' || !goal || !isAnyBoxer(goal)) return null;
  if (goal === 'elite_heavy_boxer' || goal === 'elite_light_heavy_boxer' || goal === 'elite_cruiser_boxer') return { low: 56, high: 62 };
  return { low: 59, high: 65 };
}

function fitnessPicture(ctx: MetricContext): {
  inputs: { name: string; detail: string }[];
  goalLine: string | null;
  quickest: { name: string; tip: string } | null;
} {
  const sport = sportName(ctx.goal);
  const cardio = publishedCardioBand(ctx.age, ctx.sex);
  const boxing = boxerVo2Band(ctx.goal, ctx.sex);
  const ranked: { name: string; gap: number; tip: string; gapText: string }[] = [];

  const vo2Range = boxing
    ? `Typical for this goal: ${boxing.low}–${boxing.high} ml/kg/min.`
    : cardio
      ? `Healthy for your age and sex: ${cardio.low}–${cardio.high} ml/kg/min (25th to 75th percentile).`
      : 'Set age and sex to see the healthy range.';
  let vo2Gap = 'Not stored yet.';
  if (ctx.vo2 != null) {
    if (boxing && ctx.vo2 < boxing.low) {
      vo2Gap = `${roundTenth(boxing.low - ctx.vo2)} below ${boxing.low}.`;
      ranked.push({ name: 'VO2 max', gap: (boxing.low - ctx.vo2) / boxing.low, tip: 'Four repeats of four hard minutes, with easy movement between, is one way to nudge VO2 max.', gapText: vo2Gap });
    } else if (!boxing && cardio && ctx.vo2 < cardio.high) {
      vo2Gap = `${roundTenth(cardio.high - ctx.vo2)} below the 75th percentile.`;
      ranked.push({ name: 'VO2 max', gap: (cardio.high - ctx.vo2) / cardio.high, tip: 'Four repeats of four hard minutes, with easy movement between, is one way to nudge VO2 max.', gapText: vo2Gap });
    } else vo2Gap = 'Inside the range.';
  }
  const vo2Value = ctx.vo2 != null ? `${ctx.vo2} ml/kg/min` : 'not stored yet';

  const hrTarget = sport ? 'about 40–60 bpm for trained people' : 'about 50–80 bpm, inside the NHS usual 60–100';
  let hrGap = 'Not stored yet.';
  if (ctx.restingHr != null && ctx.restingHr > 0) {
    const bpm = Math.round(ctx.restingHr);
    const ceiling = sport ? 60 : 80;
    if (bpm > ceiling) {
      hrGap = `${bpm - ceiling} bpm above ${ceiling}.`;
      ranked.push({ name: 'Resting heart rate', gap: (bpm - ceiling) / ceiling, tip: 'Easy aerobic sessions most weeks are what usually brings a high resting rate down.', gapText: hrGap });
    } else hrGap = 'Inside the range.';
  }
  const hrValue = ctx.restingHr != null && ctx.restingHr > 0 ? `${Math.round(ctx.restingHr)} bpm` : 'not stored yet';

  const fatHigh = ctx.sex === 'female' ? (sport ? 20 : 24) : (sport ? 13 : 17);
  const fatLow = ctx.sex === 'female' ? 14 : 6;
  const fatLabel = ctx.sex == null
    ? 'Set sex to see the ACE range.'
    : sport
      ? `Typical athlete body fat for ${ctx.sex === 'female' ? 'women' : 'men'}: ${fatLow}–${fatHigh}%.`
      : `ACE fitness range for ${ctx.sex === 'female' ? 'women' : 'men'}: ${fatLow}–${fatHigh}%.`;
  let bodyName = 'Body fat';
  let bodyValue = 'not stored yet';
  let bodyGap = 'Not stored yet.';
  if (ctx.bodyFat != null && ctx.sex != null) {
    const pct = roundTenth(ctx.bodyFat);
    bodyValue = `${pct}%`;
    if (pct > fatHigh) {
      bodyGap = `${roundTenth(pct - fatHigh)} points above ${fatHigh}%.`;
      ranked.push({ name: 'Body fat', gap: (pct - fatHigh) / fatHigh, tip: 'Steady meals and walks are the general body-fat advice. This is not a diet plan.', gapText: bodyGap });
    } else bodyGap = 'Inside the range.';
  } else if (ctx.bmi != null) {
    bodyName = 'BMI';
    bodyValue = String(ctx.bmi);
    if (ctx.bmi > NICE_BMI_HEALTHY_MAX) {
      bodyGap = `${roundTenth(ctx.bmi - NICE_BMI_HEALTHY_MAX)} above ${NICE_BMI_HEALTHY_MAX}.`;
      ranked.push({ name: 'BMI', gap: (ctx.bmi - NICE_BMI_HEALTHY_MAX) / NICE_BMI_HEALTHY_MAX, tip: 'Walking and steady meals are the general advice. Muscle can raise BMI without extra fat.', gapText: bodyGap });
    } else if (ctx.bmi < NICE_BMI_HEALTHY_MIN) {
      bodyGap = `${roundTenth(NICE_BMI_HEALTHY_MIN - ctx.bmi)} below ${NICE_BMI_HEALTHY_MIN}.`;
      ranked.push({ name: 'BMI', gap: (NICE_BMI_HEALTHY_MIN - ctx.bmi) / NICE_BMI_HEALTHY_MIN, tip: 'If this is new or you feel unwell, contact a GP or NHS 111.', gapText: bodyGap });
    } else bodyGap = 'Inside the NHS healthy-weight range.';
  }
  const bodyRange = ctx.bodyFat != null || ctx.sex != null
    ? fatLabel
    : `NHS healthy-weight BMI ${NICE_BMI_HEALTHY_MIN}–${NICE_BMI_HEALTHY_MAX} when body fat is missing.`;

  let vigorousGap = 'Not stored yet.';
  if (ctx.vigorousWeek != null && Number.isFinite(ctx.vigorousWeek)) {
    const minutes = Math.round(ctx.vigorousWeek);
    if (minutes < CMO_VIGOROUS_MINUTES_WEEK) {
      vigorousGap = `${CMO_VIGOROUS_MINUTES_WEEK - minutes} minutes short of ${CMO_VIGOROUS_MINUTES_WEEK}.`;
      ranked.push({ name: 'Vigorous intensity minutes', gap: (CMO_VIGOROUS_MINUTES_WEEK - minutes) / CMO_VIGOROUS_MINUTES_WEEK, tip: 'Aim for 75 or more vigorous minutes a week, for example two or three interval sessions.', gapText: vigorousGap });
    } else vigorousGap = 'On the 75-minute line.';
  }
  const vigorousValue = ctx.vigorousWeek != null && Number.isFinite(ctx.vigorousWeek) ? `${Math.round(ctx.vigorousWeek)} this week` : 'not stored yet';

  ranked.sort((left, right) => right.gap - left.gap);
  const quickest = ranked[0] ?? null;
  const inputs = [
    { name: 'VO2 max', detail: `${vo2Value}. ${vo2Range} ${vo2Gap}` },
    { name: 'Resting heart rate', detail: `${hrValue}. Healthy: ${hrTarget}. ${hrGap}` },
    { name: bodyName, detail: `${bodyValue}. ${bodyRange} ${bodyGap}` },
    { name: 'Vigorous intensity minutes', detail: `${vigorousValue}. Healthy guide: ${CMO_VIGOROUS_MINUTES_WEEK} or more a week. ${vigorousGap}` },
  ];
  const goalLine = sport
    ? `${sport}. Targets: VO2 max ${boxing ? `${boxing.low}–${boxing.high} ml/kg/min` : 'at or above the 75th percentile for your age and sex'}, resting heart rate about 40–60 bpm, body fat ${ctx.sex == null ? 'the ACE athlete range once sex is set' : `${fatLow}–${fatHigh}%`}, vigorous intensity minutes 75 or more a week. Quickest to work on: ${quickest ? `${quickest.name}, ${quickest.gapText}` : 'nothing stands out until a reading is stored'}.`
    : null;
  return { inputs, goalLine, quickest: quickest ? { name: quickest.name, tip: quickest.tip } : null };
}

function roundTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

function fitnessAgeReading(id: string, value: number | null, ctx: MetricContext): MetricReading {
  const real = ctx.realAge ?? ctx.age;
  const picture = fitnessPicture(ctx);
  const pending = value == null || value <= 0;
  const fitness = pending ? null : Math.round(value);
  const close = real != null && fitness != null && fitness <= real + 1;
  const label: MetricRatingLabel = pending || real == null || fitness == null
    ? 'Usual'
    : fitness <= real - 3
      ? 'Excellent'
      : close
        ? 'Good'
        : fitness <= real + 5
          ? 'Fair'
          : 'Poor';
  const where = pending
    ? `Garmin builds this from the four inputs below. ${real == null ? 'Age is not set, so it cannot be compared with a birthday yet.' : `It will be compared with age ${Math.round(real)}.`}`
    : real == null || fitness == null
      ? `Fitness age ${fitness}. Age is not set, so it is not compared with a birthday.`
      : fitness <= real
        ? `Fitness age ${fitness} is about the same as age ${Math.round(real)}, or a little under it.`
        : `Fitness age ${fitness} is ${fitness - Math.round(real)} years above age ${Math.round(real)}.`;
  return {
    id,
    label,
    where,
    source: GARMIN_FITNESS_AGE,
    caveat: METRIC_CAVEAT,
    band: null,
    draw: false,
    goalLine: picture.goalLine,
    tips: picture.quickest
      ? [picture.quickest.tip]
      : pending
        ? ['Aim for 75 or more vigorous minutes a week, for example two or three interval sessions.']
        : [],
    more: `${where} Garmin describes fitness age as an estimate, not your birthday and not a diagnosis.`,
    pending,
    inputs: picture.inputs,
    why: FITNESS_AGE_WHY,
  };
}

function rateBody(id: string, value: number | null, ctx: MetricContext): MetricReading {
  if (ctx.basis === 'body_fat') return { ...rateBodyFat(id, value, ctx), id };
  if (ctx.basis === 'waist_ratio') return { ...rateWaist(id, value, { ...ctx, basis: 'waist_ratio' }), id };
  if (ctx.basis === 'bmi') {
    if (value == null) return blank(id, NHS_BMI, 'No body figure in this window.');
    return rateBmiValue(id, value, ctx);
  }
  if (value == null) return blank(id, ACE_FAT, 'Add body fat or a waist measurement. Nothing is guessed.');
  if (value < 2) return rateWaist(id, value, { ...ctx, basis: 'waist_ratio' });
  if (value <= 70) return rateBodyFat(id, value, ctx);
  return rateBmiValue(id, value, ctx);
}

function define(
  id: string,
  unit: string,
  source: string,
  shownOn: string,
  before: string,
  now: string,
  rate: (id: string, value: number | null, ctx: MetricContext) => MetricReading,
): MetricDefinition {
  return {
    id,
    unit,
    source,
    shownOn,
    before,
    now,
    rate: (value, ctx) => rate(id, value, { ...EMPTY_METRIC_CONTEXT, ...(ctx ?? {}) }),
  };
}

const cardioNow = 'Shared card rating against the Kaminsky 2015 age and sex percentile, plus a sport line when the goal is a boxer, runner, or body builder.';

export const METRIC_REGISTRY: Record<string, MetricDefinition> = {
  steps: define('steps', 'steps', PALUCH, 'Health, Stats, Workouts, profile', 'Research band and a step chart. No Fair/Good line.', 'Paluch age band, label, tips when under the range, source once, caveat.', rateSteps),
  distance: define('distance', 'm', 'Garmin or Apple Health daily distance.', 'Stats, Health, Workouts charts', 'Own-average line and “no standard range”.', 'Same chart. Usual compared with your own days. Source once. Caveat.', (_id, value, ctx) => rateOwn('distance', 'Garmin or Apple Health daily distance.', value, ctx, 'm', true)),
  floors: define('floors', 'floors', 'Garmin daily floors climbed.', 'Stats, Health, Workouts charts', 'Own-average line and “no standard range”.', 'Same chart. Usual compared with your own days. Source once. Caveat.', (_id, value, ctx) => rateOwn('floors', 'Garmin daily floors climbed.', value, ctx, 'floors', true)),
  resting_heart_rate: define('resting_heart_rate', 'bpm', NHS_REST, 'Health tiles, movement charts, Your fitness', 'NHS 60–100 band and a fitness comment.', 'Label against about 50–80 inside that NHS range, trained 40–60 when a sport goal is set, tips when under Good or above that trained range.', rateResting),
  walking_heart_rate: define('walking_heart_rate', 'bpm', TANAKA, 'Health tiles', 'Approximate moderate zone when age is set.', 'Same zone, with a Good/Fair label. Age missing stays Usual and says so.', rateWalking),
  heart_rate_recovery: define('heart_rate_recovery', 'bpm', COLE, 'Health tiles', 'Cole 1999 referred-group note.', 'Good above 12 bpm, Fair at or under, with the study’s limit named as not a healthy-population cutoff.', rateRecovery),
  session_heart_rate: define('session_heart_rate', 'bpm', TANAKA, 'Health tiles', 'Training-zone sheet when age is set.', 'Good inside an effort zone. No single healthy bpm. Age missing says so.', rateSession),
  vo2_max: define('vo2_max', 'ml/kg/min', KAMINSKY, 'Health tiles, Your fitness', 'Percentile band and level words.', cardioNow, rateVo2),
  vo2: define('vo2', 'ml/kg/min', KAMINSKY, 'Garmin VO2 chart, Your fitness chart', 'Percentile band when age and sex exist, otherwise “no standard range”.', cardioNow, rateVo2),
  mix: define('mix', 'min', 'Workout minutes logged in this app.', 'Health tiles', 'No mix guideline, said on the card.', 'Usual against your own minutes. No invented national mix. Source once. Caveat.', (_id, value, ctx) => rateOwn('mix', 'Workout minutes logged in this app.', value, ctx, 'min', true, 'There is no published mix of strength, cardio, and other minutes, so this is compared with your own usual.')),
  sleep_hours: define('sleep_hours', 'h', NHS_SLEEP, 'Health tiles', 'NHS 7–9 hour status line.', 'Good inside 7–9 (7–8 from 65), tips when under Good, source once, caveat.', rateSleepHours),
  sleep_duration: define('sleep_duration', 'h', NHS_SLEEP, 'More Garmin Stats', '“No standard range” and no green band.', 'Green band 7–9 hours (7–8 from 65), NHS and National Sleep Foundation named once, tips when under Good.', rateSleepHours),
  sleep_score: define('sleep_score', 'score', GARMIN_SLEEP, 'More Garmin Stats', '“No standard range”, which was wrong.', 'Garmin Excellent/Good/Fair/Poor bands, green band 80–100, tips under Good, source once.', rateSleepScore),
  hrv_sdnn: define('hrv_sdnn', 'ms', NUNAN_SDNN, 'Health tiles and the Apple HRV chart', 'Nunan SDNN note. Stale readings had no chart.', 'Rough Good inside the study spread. Not merged with RMSSD. Source once. Caveat.', rateHrvSdnn),
  hrv: define('hrv', 'ms', NUNAN_RMSSD, 'Garmin overnight HRV chart', 'Own-average line. No rating.', 'Rough RMSSD note around 42 ms, compared with your usual. Not merged with SDNN.', rateHrvRmssd),
  weight_kg: define('weight_kg', 'kg', NHS_BMI, 'Health tiles, profile', 'BMI status when height exists.', 'Same BMI rating, muscular-build note, sport line, tips when outside Good.', rateWeight),
  weight: define('weight', 'kg', NHS_BMI, 'Stats and Health Plan', 'Direction versus an earlier reading.', 'BMI rating when height exists, otherwise your usual. Source once. Caveat.', rateWeight),
  body_fat: define('body_fat', '%', ACE_FAT, 'Health tiles and Garmin body composition', 'A wide in-app band, or no band on the Garmin chart.', 'ACE categories by sex. Athlete slice when the goal is a sport. Sex missing says so.', rateBodyFat),
  body: define('body', '% or ratio', ACE_FAT, 'Stats and Health Plan', 'Body-fat or waist-to-height status.', 'The same ACE or waist rating as the figure on the card. Source once. Caveat.', rateBody),
  waist: define('waist', 'cm', NHS_WAIST, 'Health tiles', 'Waist-to-height under 0.5 when height exists.', 'NHS centimetre cut when sex is set. Sex missing says so. Tips when over.', rateWaist),
  lean_mass: define('lean_mass', 'kg', 'Body readings you stored.', 'Health tiles', 'No kilogram guideline, said on the card.', 'Usual against your own readings. No invented kilogram norm.', (_id, value, ctx) => rateOwn('lean_mass', 'Body readings you stored.', value, ctx, 'kg', true)),
  lean: define('lean', 'kg', 'Body readings you stored.', 'Stats', 'Change versus an earlier reading.', 'Usual against your own readings. No invented kilogram norm.', (_id, value, ctx) => rateOwn('lean', 'Body readings you stored.', value, ctx, 'kg', true)),
  active_energy: define('active_energy', 'kcal', 'Apple Health active energy or Garmin active calories.', 'Health tiles and Workouts active calories', 'A number, no published band.', 'Usual against your own days. No invented kilocalorie norm. Source once. Caveat.', (_id, value, ctx) => rateOwn('active_energy', 'Apple Health active energy or Garmin active calories.', value, ctx, 'kcal', true)),
  workouts: define('workouts', 'min', CMO, 'Health tiles', 'Logged minutes, with the guideline living on active minutes.', 'Rated against the Chief Medical Officers’ minutes, scaled to the window. Tips when under.', (_id, value, ctx) => rateMinutes('workouts', value, ctx, CMO_MODERATE_MINUTES_WEEK, 'logged minutes')),
  workout_minutes: define('workout_minutes', 'min', CMO, 'Profile', 'A shared average, no rating.', 'Same minutes guide when the figure is a week. Source once. Caveat.', (_id, value, ctx) => rateMinutes('workout_minutes', value, ctx, CMO_MODERATE_MINUTES_WEEK, 'workout minutes')),
  weekly_active_minutes: define('weekly_active_minutes', 'min', CMO, 'Health tiles', '150-minute guide scaled to the period.', 'Good/Fair/Poor against that scaled guide, sport line, tips when under.', (_id, value, ctx) => rateMinutes('weekly_active_minutes', value, ctx, CMO_MODERATE_MINUTES_WEEK, 'active minutes')),
  intensity: define('intensity', 'min', CMO, 'Movement charts', 'Green band from the weekly minutes guide. No label.', 'Label against the same guide, sport line, tips when under, source once.', (_id, value, ctx) => rateMinutes('intensity', value, ctx, CMO_MODERATE_MINUTES_WEEK, 'intensity minutes')),
  exercise: define('exercise', 'min', CMO, 'Workouts', 'Same minutes guide. No label.', 'Label against the minutes guide, tips when under, source once.', (_id, value, ctx) => rateMinutes('exercise', value, ctx, CMO_MODERATE_MINUTES_WEEK, 'exercise minutes')),
  moderate: define('moderate', 'min', CMO, 'Movement charts and Workouts', 'Explanation only. No band on the single-type chart.', 'Label against 150 moderate minutes a week, scaled to the window.', (_id, value, ctx) => rateMinutes('moderate', value, ctx, CMO_MODERATE_MINUTES_WEEK, 'moderate minutes')),
  vigorous: define('vigorous', 'min', CMO, 'Movement charts and Workouts', 'Explanation only.', 'Label against 75 vigorous minutes a week, scaled to the window.', (_id, value, ctx) => rateMinutes('vigorous', value, ctx, CMO_VIGOROUS_MINUTES_WEEK, 'vigorous minutes')),
  stress: define('stress', 'score', GARMIN_STRESS, 'More Garmin Stats', 'Bands in the text. No green band. “No standard” was not the issue; there was no label.', 'Green band 0–50. Excellent/Good/Fair/Poor from Garmin’s bands. Tips when medium or high.', rateStress),
  stress_detail: define('stress_detail', 'score', GARMIN_STRESS, 'More Garmin Stats', 'A 0–25 band and a short note.', 'Same Garmin bands and tips as average stress.', rateStress),
  body_battery_charged: define('body_battery_charged', 'score', 'Garmin Body Battery.', 'More Garmin Stats', 'Explanation. No rating.', 'Usual against your own charged points. Source once. Caveat.', (_id, value, ctx) => rateOwn('body_battery_charged', 'Garmin Body Battery.', value, ctx, 'points', true, 'No population norm. Compare charged points with your own days.')),
  body_battery_drained: define('body_battery_drained', 'score', 'Garmin Body Battery.', 'More Garmin Stats', 'Explanation. No rating.', 'Usual against your own drained points. Source once. Caveat.', (_id, value, ctx) => rateOwn('body_battery_drained', 'Garmin Body Battery.', value, ctx, 'points', false, 'No population norm. A bigger drain is not bad by itself. Compare it with your own days.')),
  body_battery_highest: define('body_battery_highest', 'score', 'Garmin Body Battery.', 'More Garmin Stats', 'Explanation. No rating.', 'Usual against your own high for the day. Source once. Caveat.', (_id, value, ctx) => rateOwn('body_battery_highest', 'Garmin Body Battery.', value, ctx, 'score', true, 'No population norm for the daily high. Compare it with your own days.')),
  body_battery_lowest: define('body_battery_lowest', 'score', 'Garmin Body Battery.', 'More Garmin Stats', 'Explanation. No rating.', 'Usual against your own low for the day. Source once. Caveat.', (_id, value, ctx) => rateOwn('body_battery_lowest', 'Garmin Body Battery.', value, ctx, 'score', false, 'No population norm for the daily low. Compare it with your own days.')),
  respiration: define('respiration', 'breaths/min', BREATH_SOURCE, 'More Garmin Stats', '12–20 band and an outside note.', 'Good inside 12–20, Fair just outside, GP or NHS 111 only when far outside.', rateBreath),
  pulse_ox: define('pulse_ox', '%', SPO2_SOURCE, 'More Garmin Stats', '95–100 band and an outside note.', 'Good at or above about 96. At 92 or below: GP or NHS 111, not an alarm.', rateSpo2),
  fitness_age: define('fitness_age', 'years', GARMIN_FITNESS_AGE, 'More Garmin Stats', 'A bare years chart, easy to miss when it is close to real age.', 'Compared with real age. What moves it most ranks your own VO2, resting heart rate, body fat or BMI, and vigorous minutes. One practical tip when a lever is short.', fitnessAgeReading),
  skin_temp: define('skin_temp', '°C', 'Garmin overnight change from your usual skin temperature. The ±1 °C band is that change, not a disease cutoff.', 'More Garmin Stats', 'A ±1 °C band.', 'Usual inside that Garmin change band. No disease cutoff. Source once. Caveat.', (_id, value, ctx) => {
    if (value == null || Number.isNaN(value)) return blank('skin_temp', 'Garmin overnight change from your usual skin temperature. The ±1 °C band is that change, not a disease cutoff.', 'The green band is about 1 °C either side of your Garmin usual. It is not a fever line.', {
      band: { low: -1, high: 1 },
      draw: true,
      tips: ['If you feel unwell, contact a GP or NHS 111. The watch change is not a temperature diagnosis.'],
    });
    const label: MetricRatingLabel = Math.abs(value) <= 1 ? 'Good' : 'Fair';
    return made('skin_temp', 'Garmin overnight change from your usual skin temperature. The ±1 °C band is that change, not a disease cutoff.', label, `${Math.round(value * 10) / 10} °C from your Garmin usual. Inside ±1 °C is the watch’s own band, not a fever line.`, {
      band: { low: -1, high: 1 },
      draw: false,
      tips: ['If you feel unwell, contact a GP or NHS 111. The watch change is not a temperature diagnosis.'],
      more: 'Signed changes below zero are kept. They are not treated as missing.',
    });
  }),
  blood_pressure: define('blood_pressure', 'mmHg', NHS_BP, 'More Garmin Stats', 'A 90–120 systolic band.', 'Good inside NHS ideal. Outside: GP or NHS 111, not a diagnosis. Diastolic stays separate.', (_id, value, ctx) => rateBloodPressure('blood_pressure', value, ctx, 'systolic')),
  diastolic: define('diastolic', 'mmHg', NHS_BP, 'More Garmin Stats', 'A 60–80 band.', 'Good inside 60–80. Outside: GP or NHS 111. Not averaged with systolic.', (_id, value, ctx) => rateBloodPressure('diastolic', value, ctx, 'diastolic')),
  bmi: define('bmi', 'BMI', NHS_BMI, 'More Garmin Stats', '18.5–24.9 band.', 'NHS label, muscular-build note, sport line, tips when outside Good.', (_id, value, ctx) => {
    if (value == null || value <= 0) {
      const sport = sportName(ctx.goal);
      return blank('bmi', NHS_BMI, `The NHS healthy-weight range is ${NICE_BMI_HEALTHY_MIN}–${NICE_BMI_HEALTHY_MAX}. A muscular build can sit above it. ${ageNote(ctx)}`, {
        band: { low: NICE_BMI_HEALTHY_MIN, high: NICE_BMI_HEALTHY_MAX },
        draw: true,
        goalLine: sport ? `${sport}: a muscular build can sit above the NHS range. There is no BMI stored yet.` : null,
        tips: ['Steady meals and walks most days are the general advice. This is not a diet plan.'],
      });
    }
    return rateBmiValue('bmi', value, ctx);
  }),
  snapshot_heart: define('snapshot_heart', 'bpm', NHS_REST, 'More Garmin Stats', '60–100 band.', 'Same resting rating as the resting-heart card, for Garmin’s short check.', rateResting),
  epoch_minutes: define('epoch_minutes', 'min', GARMIN_EPOCH_SOURCE, 'More Garmin Stats and the main charts', 'A minutes total that repeated “no published range”.', 'Plain explanation of 15-minute blocks versus intensity minutes. Source is the Garmin Health API.', (_id, value, ctx) => rateOwn('epoch_minutes', GARMIN_EPOCH_SOURCE, value, ctx, 'min', true, 'Compared with your own usual. The explanation above says what these minutes include.')),
  move_iq: define('move_iq', 'min', 'Garmin Health API Move IQ summaries.', 'More Garmin Stats', 'Minutes Garmin noticed. No rating.', 'Usual against your own days.', (_id, value, ctx) => rateOwn('move_iq', 'Garmin Health API Move IQ summaries.', value, ctx, 'min', true, 'Move IQ is movement Garmin noticed without a started activity. There is no published healthy-person range, so this is compared with your own usual.')),
  activity_detail: define('activity_detail', 'min', 'Garmin Health API activity details.', 'More Garmin Stats', 'Recorded activity length. No rating.', 'Usual against your own activities. The sample trace is not kept.', (_id, value, ctx) => rateOwn('activity_detail', 'Garmin Health API activity details.', value, ctx, 'min', true, 'This is the length Garmin stored for a recorded activity. The sample trace is not kept. There is no published healthy-person range, so this is compared with your own usual.')),
  sober: define('sober', 'days', OWN_APP, 'Stats, Health Plan, profile', 'A day count or a drink-free ring.', 'Good when the streak or your drink-free aim is met. Tips only when short of your aim.', rateSober),
  'days-sober': define('days-sober', 'days', OWN_APP, 'Profile, when the sober date is missing', 'An empty line.', 'Same sober rating, or a plain empty line. Caveat.', rateSober),
  mood: define('mood', '1–10', OWN_APP, 'Stats, Health Plan', 'Latest score and a trend word.', 'Excellent/Good/Fair/Poor on the 1–10 scale. Tips when under Good. Not clinical.', rateMood),
  'mood-streak': define('mood-streak', 'days', OWN_APP, 'Profile', 'A streak. Scores stay private.', 'Streak versus a week of check-ins. Not a mood diagnosis.', (_id, value, ctx) => rateMood('mood-streak', value, { ...ctx, scale: 'streak' })),
  craving: define('craving', '1–10', OWN_APP, 'Stats', 'Quiet / worth a look / high.', 'Lower is better. Tips when above 3. Not clinical.', rateCraving),
  'check-ins': define('check-ins', 'days', OWN_APP, 'Stats', 'A count against five a week.', 'Good when that aim is met. Tips when short. No population norm.', rateCheckIns),
  calories: define('calories', 'kcal', 'Your own calorie target in this app. No population calorie band.', 'Stats, Health Plan, profile', 'Over, on track, or hidden.', 'Good near your target. Tips when clearly over or, if nothing is logged, no invented grade.', (_id, value, ctx) => ctx.scale === 'share' ? made('calories', 'Figures you chose to share. No population grade is added on the profile.', 'Usual', 'Shared food figures. No population calorie grade is added here.', { more: OWN_APP }) : rateTarget('calories', 'Your own calorie target in this app. No population calorie band.', value, ctx.calorieTarget ?? null, 'kcal', true)),
  protein: define('protein', 'g', 'Your own protein target in this app. No population protein band.', 'Stats, Health Plan', 'On track, on pace, or short.', 'Good near your target. A short day gets one practical tip, not a lecture.', (_id, value, ctx) => rateTarget('protein', 'Your own protein target in this app. No population protein band.', value, ctx.proteinTarget ?? null, 'g', false)),
  quality: define('quality', 'items', OWN_APP, 'Stats, profile', 'Whole versus highly processed count.', 'Good when nothing highly processed is logged. Tips name a swap, not a diet.', (_id, _value, ctx) => rateQuality('quality', ctx)),
  water: define('water', 'ml', 'NHS Eatwell, about 6 to 8 drinks a day. This app uses 2,000 ml as a full day.', 'Stats', 'A ring against 2,000 ml.', 'Good at about 2,000 ml. The NHS drink count is named. Not a prescription.', (_id, value) => rateWater('water', value)),
  gratitude: define('gratitude', 'lines', OWN_APP, 'Stats, profile', 'A line count against about one a day.', 'Good when that aim is met. No population norm.', rateGratitude),
  money: define('money', '£', OWN_APP, 'Profile', 'Pounds saved. No rating.', 'Your own record. No population norm and no medical grade.', (_id, value, ctx) => rateOwn('money', OWN_APP, value, ctx, 'pounds', true)),
  'money-saved': define('money-saved', '£', OWN_APP, 'Profile, when nothing is saved yet', 'An empty line.', 'Same own-record note.', (_id, value, ctx) => rateOwn('money-saved', OWN_APP, value, ctx, 'pounds', true)),
  units: define('units', 'units', OWN_APP, 'Profile', 'Units avoided. No rating.', 'Your own record. No population norm.', (_id, value, ctx) => rateOwn('units', OWN_APP, value, ctx, 'units', true)),
  'units-avoided': define('units-avoided', 'units', OWN_APP, 'Profile, when nothing is avoided yet', 'An empty line.', 'Same own-record note.', (_id, value, ctx) => rateOwn('units-avoided', OWN_APP, value, ctx, 'units', true)),
  meals: define('meals', 'meals', OWN_APP, 'Profile', 'A meal count.', 'Your own log. No population norm.', (_id, value, ctx) => rateOwn('meals', OWN_APP, value, ctx, 'meals', true)),
  progress: define('progress', 'days', OWN_APP, 'Profile', 'A meal streak.', 'Your own streak. No population norm.', (_id, value, ctx) => rateOwn('progress', OWN_APP, value, ctx, 'days', true)),
  'body-figures': define('body-figures', 'text', OWN_APP, 'Profile', 'A shared body line.', 'No extra grade on a shared line. Caveat stays.', () => made('body-figures', OWN_APP, 'Usual', 'Shared body figures. No population grade is added on the profile.', { more: OWN_APP })),
  goal: define('goal', 'text', OWN_APP, 'Profile', 'The nutrition goal name.', 'The goal is named. It is not graded.', () => made('goal', OWN_APP, 'Usual', 'This is the nutrition goal you chose to show. It is not a score.', { more: OWN_APP })),
  plan: define('plan', 'items', OWN_APP, 'Profile', 'Ticked plan items.', 'Your own plan. No population norm.', (_id, value, ctx) => rateOwn('plan', OWN_APP, value, ctx, 'ticked items', true)),
};

export function metricDefinition(id: string): MetricDefinition {
  const metric = METRIC_REGISTRY[id];
  if (!metric) throw new Error(`stat card ${id} is not in the metric registry`);
  return metric;
}
