/**
 * How a recent average sits against published guidance.
 * Every number below is copied from the source named in the comment.
 * Nothing here is a diagnosis.
 */

import { NUNAN_LINK, NUNAN_SDNN_HIGH, NUNAN_SDNN_LOW, NUNAN_SDNN_MEAN, REFERENCE_NOT_A_TARGET } from './healthBands';
import { formatSleepHours, formatUkCompactDay, healthChangeNote, HRV_MIN_READINGS, HRV_TOO_FEW, percentAgainstBaseline, shiftDay, type DayValue } from './healthInsights';
import type { HealthInsightKind } from './healthInsights';
import { BMI_ONLY_NOTE, assessWeight, type BodyBuild, type NutritionSex } from './nutrition';
import {
  CMO_GUIDELINES_URL,
  UK_HIGHER_RISK_MEN_UNITS,
  UK_HIGHER_RISK_WOMEN_UNITS,
  UK_LOW_RISK_WEEKLY_UNITS,
  WITHDRAWAL_NOTE,
} from './units';

export const GUIDANCE_CAVEAT =
  'General guidance, not a diagnosis. Everyone is different; age, fitness, medication and health conditions all matter. Speak to your GP if you’re worried.';

const EMERGENCY_STEP = 'Call 999 if you have chest pain, fainting, or breathlessness.';
const GP_STEP = `Contact your GP or NHS 111. ${EMERGENCY_STEP}`;

/** NHS: adults need 7 to 9 hours. https://www.nhs.uk/conditions/insomnia/ */
export const NHS_SLEEP_URL = 'https://www.nhs.uk/conditions/insomnia/';
export const NHS_ADULT_SLEEP_MIN_HOURS = 7;
export const NHS_ADULT_SLEEP_MAX_HOURS = 9;

/**
 * A repeated short night is well below that NHS range. Six hours is not itself an NHS cutoff.
 * The warning starts when sleep is under 6 hours on at least 3 of the last 7 nights.
 */
export const SHORT_SLEEP_HOURS = 6;
export const SHORT_SLEEP_NIGHTS = 3;

/**
 * British Heart Foundation: a normal resting heart rate is usually 60 to 100 bpm.
 * Below 60 can be normal for athletes who are very fit.
 * A resting rate above 100 bpm is too fast for most people.
 * https://www.bhf.org.uk/informationsupport/how-a-healthy-heart-works/your-heart-rate
 */
export const BHF_HEART_RATE_URL = 'https://www.bhf.org.uk/informationsupport/how-a-healthy-heart-works/your-heart-rate';
export const BHF_RESTING_MIN_BPM = 60;
export const BHF_RESTING_MAX_BPM = 100;

/** One high day is named. The warning waits for at least 3 of the last 7 days, so a single reading does not shout. */
export const RESTING_HIGH_DAYS = 3;

/**
 * UK Chief Medical Officers, as set out by the NHS: at least 150 minutes of moderate activity a week,
 * or 75 minutes of vigorous activity.
 * https://www.nhs.uk/live-well/exercise/physical-activity-guidelines-for-adults-aged-19-to-64/
 * https://www.gov.uk/government/publications/physical-activity-guidelines-uk-chief-medical-officers-report
 */
export const NHS_ACTIVITY_URL = 'https://www.nhs.uk/live-well/exercise/physical-activity-guidelines-for-adults-aged-19-to-64/';
export const CMO_ACTIVITY_URL = 'https://www.gov.uk/government/publications/physical-activity-guidelines-uk-chief-medical-officers-report';
export const CMO_MODERATE_MINUTES_WEEK = 150;
export const CMO_VIGOROUS_MINUTES_WEEK = 75;

/**
 * The NHS and the UK Chief Medical Officers do not set a daily step target.
 * Ding and colleagues, The Lancet Public Health, 23 July 2025: about 7,000 steps a day was associated
 * with clinically meaningful improvements compared with 2,000, and 10,000 can still suit people who are more active.
 * That is research, not a UK guideline, so steps are not given a band.
 * https://www.thelancet.com/journals/lanpub/article/PIIS2468-2667(25)00164-1/fulltext
 */
export const LANCET_STEPS_URL = 'https://www.thelancet.com/journals/lanpub/article/PIIS2468-2667(25)00164-1/fulltext';
export const LANCET_STEPS_MEANINGFUL = 7000;
export const LANCET_STEPS_MORE_ACTIVE = 10000;

/**
 * NICE NG246, for most adults: healthy weight BMI 18.5 to 24.9, overweight 25 to 29.9,
 * obesity from 30 (class 1 is 30 to 34.9, class 3 is 40 or more).
 * NHS: 25 to 29.9 is overweight and 30 or more is obese. Some family backgrounds have a higher risk
 * from 23 to 27.4 (overweight) and 27.5 or higher (obese).
 * NHS calculator: weight in kilograms divided by height in metres squared. For adults. Not for under 18s,
 * pregnancy, an eating disorder, or a condition that affects height.
 * https://www.nice.org.uk/guidance/ng246
 * https://www.nhs.uk/conditions/overweight-and-obesity/
 * https://www.nhs.uk/health-assessment-tools/calculate-your-body-mass-index/calculate-bmi-for-adults
 */
export const NICE_BMI_URL = 'https://www.nice.org.uk/guidance/ng246';
export const NHS_OBESITY_URL = 'https://www.nhs.uk/conditions/overweight-and-obesity/';
export const NHS_BMI_URL = 'https://www.nhs.uk/health-assessment-tools/calculate-your-body-mass-index/calculate-bmi-for-adults';
export const NICE_BMI_HEALTHY_MIN = 18.5;
export const NICE_BMI_HEALTHY_MAX = 24.9;
export const NHS_BMI_OVERWEIGHT_MAX = 29.9;
export const NHS_BMI_OBESE_MIN = 30;
export const NHS_BMI_ETHNICITY_OVERWEIGHT_MIN = 23;
export const NHS_BMI_ETHNICITY_OBESE_MIN = 27.5;

/** Input check so a typo cannot produce a BMI. Not a health range. */
export const HEIGHT_CM_MIN = 50;
export const HEIGHT_CM_MAX = 250;

/** UK Chief Medical Officers: men and women are advised not to regularly drink more than 14 units a week. */
export const NHS_UNITS_GUIDE_URL = 'https://www.nhs.uk/live-well/alcohol-advice/calculating-alcohol-units/';

export type GuidanceSource = { name: string; url: string };

export type GuidanceTick = { position: number; label: string };

export type GuidanceView = {
  /** Null when there is no published band, or not enough to place one. */
  label: string | null;
  plain: string;
  marker: { position: number; warning: boolean } | null;
  ticks: GuidanceTick[];
  sources: GuidanceSource[];
  warning: { detail: string; step: string } | null;
  caveat: string;
};

const SLEEP_SOURCE: GuidanceSource = { name: 'NHS: insomnia', url: NHS_SLEEP_URL };
const HEART_SOURCE: GuidanceSource = { name: 'British Heart Foundation: your heart rate', url: BHF_HEART_RATE_URL };
const ACTIVITY_SOURCES: GuidanceSource[] = [
  { name: 'NHS: physical activity for adults', url: NHS_ACTIVITY_URL },
  { name: 'UK Chief Medical Officers’ activity guidelines', url: CMO_ACTIVITY_URL },
];
const STEP_SOURCES: GuidanceSource[] = [
  ...ACTIVITY_SOURCES,
  { name: 'The Lancet Public Health: daily steps', url: LANCET_STEPS_URL },
];
const BMI_SOURCES: GuidanceSource[] = [
  { name: 'NICE NG246: overweight and obesity', url: NICE_BMI_URL },
  { name: 'NHS: overweight and obesity', url: NHS_OBESITY_URL },
  { name: 'NHS: BMI calculator', url: NHS_BMI_URL },
];
const UNIT_SOURCES: GuidanceSource[] = [
  { name: 'NHS: calculating alcohol units', url: NHS_UNITS_GUIDE_URL },
  { name: 'UK Chief Medical Officers’ guidelines', url: CMO_GUIDELINES_URL },
];

const STEPS_RESEARCH =
  `There is no NHS or UK Chief Medical Officer daily step target. A 2025 review in The Lancet Public Health found that about ${uk(LANCET_STEPS_MEANINGFUL)} steps a day was linked with better health outcomes than 2,000, and that ${uk(LANCET_STEPS_MORE_ACTIVE)} can still suit people who are more active. That research is not a UK guideline.`;

const HRV_HONEST =
  `There is no official UK target for heart rate variability. Nunan, Sandercock, and Brodie, 2010, found short-term SDNN study averages from ${NUNAN_SDNN_LOW} to ${NUNAN_SDNN_HIGH} ms, with an overall mean of ${NUNAN_SDNN_MEAN} ms. That spread is not a personal target and is not split by age or sex. A watch sample is also compared with your own readings. ${REFERENCE_NOT_A_TARGET}`;

const ACTIVITY_LINE =
  `The UK Chief Medical Officers recommend at least ${CMO_MODERATE_MINUTES_WEEK} minutes of moderate activity a week, or ${CMO_VIGOROUS_MINUTES_WEEK} minutes of vigorous activity. Logged workouts may not include walking, and this app cannot tell how hard the minutes were.`;

const ATHLETE_NOTE =
  'The British Heart Foundation says a usual adult resting rate is 60 to 100 bpm. Below 60 can be normal for athletes and for people who are very fit, and it can also come from medication.';

const BMI_LIMITS =
  'These ranges are for most adults. The NHS uses a lower figure for some family backgrounds: 23 to 27.4 is overweight, and 27.5 or higher is obese. The NHS calculator is not for under 18s, pregnancy, an eating disorder, or a condition that affects height. It cannot tell muscle from fat.';

function uk(value: number): string {
  return new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 }).format(value);
}

function oneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

function place(value: number, min: number, max: number): number {
  if (max <= min) return 0;
  return Math.min(1, Math.max(0, (value - min) / (max - min)));
}

function tick(value: number, min: number, max: number, label: string): GuidanceTick {
  return { position: place(value, min, max), label };
}

function view(partial: Omit<GuidanceView, 'caveat'> & { caveat?: string }): GuidanceView {
  return { caveat: GUIDANCE_CAVEAT, ...partial };
}

function span(points: DayValue[], today: string, startOffset: number, endOffset: number): DayValue[] {
  const start = shiftDay(today, startOffset);
  const end = shiftDay(today, endOffset);
  return points.filter((point) => point.day >= start && point.day <= end && point.day <= today);
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentAgainst(recent: number, baseline: number): string {
  const change = percentAgainstBaseline(recent, baseline);
  if (change == null) return 'compared with your own earlier average';
  if (Math.abs(change) < 1) return 'about the same as your own earlier average';
  return `${Math.abs(change)}% ${change > 0 ? 'above' : 'below'} your own earlier average`;
}

function ownBaseline(points: DayValue[], today: string, recent: DayValue[], unit: string): string {
  const earlier = span(points, today, -36, -7);
  const baseline = mean(earlier.map((point) => point.value));
  const recentMean = mean(recent.map((point) => point.value));
  if (earlier.length < 3 || baseline == null || recentMean == null) {
    return 'There are not enough earlier readings yet to compare with your own baseline.';
  }
  return `That is ${percentAgainst(recentMean, baseline)} of ${uk(Math.round(baseline))} ${unit}.`;
}

export function parseHeightCm(value: string): { ok: true; value: number | null } | { ok: false; error: string } {
  const trimmed = value.trim();
  if (!trimmed) return { ok: true, value: null };
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < HEIGHT_CM_MIN || parsed > HEIGHT_CM_MAX) {
    return { ok: false, error: 'Enter your height in centimetres, from 50 to 250, such as 178.' };
  }
  return { ok: true, value: oneDecimal(parsed) };
}

export function bmiFrom(weightKg: number, heightCm: number): number | null {
  if (heightCm < HEIGHT_CM_MIN || heightCm > HEIGHT_CM_MAX || weightKg <= 0) return null;
  const metres = heightCm / 100;
  return weightKg / (metres * metres);
}

function sleepGuidance(points: DayValue[], today: string): GuidanceView {
  const recent = span(points, today, -6, 0);
  const average = mean(recent.map((point) => point.value));
  const scaleMin = 0;
  const scaleMax = 12;
  const ticks = [
    tick(NHS_ADULT_SLEEP_MIN_HOURS, scaleMin, scaleMax, '7h'),
    tick(NHS_ADULT_SLEEP_MAX_HOURS, scaleMin, scaleMax, '9h'),
  ];
  const intro = 'The NHS says most adults need 7 to 9 hours a night.';
  if (average == null) {
    return view({
      label: null,
      plain: `${intro} Log a few nights and this can place your average on that range.`,
      marker: null,
      ticks,
      sources: [SLEEP_SOURCE],
      warning: null,
    });
  }
  const minutes = Math.round(average * 60);
  const shown = formatSleepHours(average);
  const opening = recent.length === 1
    ? `The one night logged in the last 7 days was ${shown}.`
    : `Your recent average is ${shown} a night, from ${recent.length} nights in the last 7 days.`;
  const short = recent.filter((point) => point.value < SHORT_SLEEP_HOURS);
  const warning = short.length >= SHORT_SLEEP_NIGHTS
    ? {
        detail: `Sleep has been under ${SHORT_SLEEP_HOURS} hours on ${short.length} of the last 7 nights. That is below the 7 to 9 hours the NHS says adults need.`,
        step: `A regular bedtime can help, and you can talk it through with Thumos. If short sleep carries on, ${GP_STEP.charAt(0).toLowerCase()}${GP_STEP.slice(1)}`,
      }
    : null;
  let label: string;
  if (minutes < NHS_ADULT_SLEEP_MIN_HOURS * 60) label = 'Below typical';
  else if (minutes <= NHS_ADULT_SLEEP_MAX_HOURS * 60) label = 'In the healthy range';
  else label = 'Above the usual range';
  const extra = label === 'Above the usual range'
    ? ' More than 9 hours is not a warning on its own. Some people need more sleep.'
    : '';
  return view({
    label,
    plain: `${opening} ${intro}${extra}`,
    marker: { position: place(average, scaleMin, scaleMax), warning: warning != null },
    ticks,
    sources: [SLEEP_SOURCE],
    warning,
  });
}

function restingGuidance(points: DayValue[], today: string): GuidanceView {
  const recent = span(points, today, -6, 0);
  const average = mean(recent.map((point) => point.value));
  const scaleMin = 40;
  const scaleMax = 120;
  const ticks = [
    tick(BHF_RESTING_MIN_BPM, scaleMin, scaleMax, '60'),
    tick(BHF_RESTING_MAX_BPM, scaleMin, scaleMax, '100'),
  ];
  if (average == null) {
    return view({
      label: null,
      plain: `${ATHLETE_NOTE} Log a few resting readings and this can place your average on that range.`,
      marker: null,
      ticks,
      sources: [HEART_SOURCE],
      warning: null,
    });
  }
  const bpm = Math.round(average);
  const opening = recent.length === 1
    ? `The one resting reading in the last 7 days was ${bpm} bpm.`
    : `Your recent average resting heart rate is ${bpm} bpm, from ${recent.length} days in the last 7 days.`;
  const high = recent.filter((point) => point.value > BHF_RESTING_MAX_BPM);
  const warning = high.length >= RESTING_HIGH_DAYS
    ? {
        detail: `Your resting heart rate has been above ${BHF_RESTING_MAX_BPM} bpm on ${high.length} of the last 7 days. The British Heart Foundation says a resting rate above 100 bpm is too fast for most people.`,
        step: `Rest, have some water, and try a breathing exercise. If it stays up, ${GP_STEP.charAt(0).toLowerCase()}${GP_STEP.slice(1)}`,
      }
    : null;
  let label: string;
  if (bpm < BHF_RESTING_MIN_BPM) label = 'Below the usual range';
  else if (bpm <= BHF_RESTING_MAX_BPM) label = 'In the healthy range';
  else label = 'Above the usual range';
  return view({
    label,
    plain: `${opening} ${ATHLETE_NOTE}`,
    marker: { position: place(average, scaleMin, scaleMax), warning: warning != null },
    ticks,
    sources: [HEART_SOURCE],
    warning,
  });
}

function workoutGuidance(points: DayValue[], today: string): GuidanceView {
  const recent = span(points, today, -6, 0);
  const total = recent.reduce((sum, point) => sum + point.value, 0);
  const scaleMin = 0;
  const scaleMax = CMO_MODERATE_MINUTES_WEEK * 2;
  const ticks = [tick(CMO_MODERATE_MINUTES_WEEK, scaleMin, scaleMax, '150')];
  if (recent.length === 0) {
    return view({
      label: null,
      plain: `No workout minutes logged in the last 7 days. ${ACTIVITY_LINE}`,
      marker: null,
      ticks,
      sources: ACTIVITY_SOURCES,
      warning: null,
    });
  }
  const minutes = Math.round(total);
  const meeting = minutes >= CMO_MODERATE_MINUTES_WEEK;
  const incomplete = recent.length < 7
    ? ' Days you have not logged are not included, so this can be less than you actually did.'
    : '';
  return view({
    label: meeting ? 'Meeting the guideline' : 'Below recommended',
    plain: `You logged ${uk(minutes)} minutes of workouts over ${recent.length} ${recent.length === 1 ? 'day' : 'days'} in the last 7 days.${incomplete} ${ACTIVITY_LINE}`,
    marker: { position: place(total, scaleMin, scaleMax), warning: false },
    ticks,
    sources: ACTIVITY_SOURCES,
    warning: null,
  });
}

function stepsGuidance(points: DayValue[], today: string): GuidanceView {
  const recent = span(points, today, -6, 0);
  const average = mean(recent.map((point) => point.value));
  if (average == null) {
    return view({
      label: null,
      plain: `${STEPS_RESEARCH} Log a few days and this can compare you with your own earlier average.`,
      marker: null,
      ticks: [],
      sources: STEP_SOURCES,
      warning: null,
    });
  }
  const shown = uk(Math.round(average));
  const opening = recent.length === 1
    ? `The one day logged in the last 7 days was ${shown} steps.`
    : `Your recent average is ${shown} steps a day, from ${recent.length} days in the last 7 days.`;
  return view({
    label: null,
    plain: `${opening} ${ownBaseline(points, today, recent, 'steps')} ${STEPS_RESEARCH}`,
    marker: null,
    ticks: [],
    sources: STEP_SOURCES,
    warning: null,
  });
}

function hrvOpening(recent: DayValue[], average: number | null): string {
  if (average == null) return '';
  const shown = uk(Math.round(average));
  if (recent.length === 1) return `The one reading in the last 7 days was ${shown} ms.`;
  return `Your recent average is ${shown} ms, from ${recent.length} days in the last 7 days.`;
}

function hrvGuidance(points: DayValue[], today: string): GuidanceView {
  const recent = span(points, today, -6, 0);
  const average = mean(recent.map((point) => point.value));
  const opening = hrvOpening(recent, average);
  if (points.length < HRV_MIN_READINGS) {
    return view({
      label: null,
      plain: [opening, `${HRV_TOO_FEW}.`, HRV_HONEST].filter(Boolean).join(' '),
      marker: null,
      ticks: [],
      sources: [NUNAN_LINK],
      warning: null,
    });
  }
  if (average == null) {
    return view({
      label: null,
      plain: `${HRV_HONEST} Log a few days and this can compare you with your own earlier average.`,
      marker: null,
      ticks: [],
      sources: [NUNAN_LINK],
      warning: null,
    });
  }
  const note = healthChangeNote('hrv_sdnn', points, today);
  const comparison = note ?? 'There are not enough readings in the last 30 days to compare with your 30-day average.';
  return view({
    label: null,
    plain: `${opening} ${comparison}. ${HRV_HONEST}`,
    marker: null,
    ticks: [],
    sources: [NUNAN_LINK],
    warning: null,
  });
}

function weightGuidance(
  points: DayValue[],
  today: string,
  heightCm: number | null,
  adult: boolean,
  composition?: { bodyFatPct?: number | null; waistCm?: number | null; build?: BodyBuild | null; sex?: NutritionSex | null },
): GuidanceView {
  const recent = span(points, today, -6, 0);
  const recentMean = mean(recent.map((point) => point.value));
  const latest = points.length ? points[points.length - 1] : null;
  const weight = recentMean ?? latest?.value ?? null;
  const when = recentMean == null && latest && latest.day < shiftDay(today, -6)
    ? ` Using your latest weight, from ${formatUkCompactDay(latest.day)}.`
    : '';
  if (!adult) {
    return view({
      label: null,
      plain: `BMI ranges on this card are for adults. They stay hidden until you have confirmed you are 18 or over.${when}`,
      marker: null,
      ticks: [],
      sources: BMI_SOURCES,
      warning: null,
    });
  }
  const assessed = assessWeight({
    bodyFatPct: composition?.bodyFatPct ?? null,
    waistCm: composition?.waistCm ?? null,
    weightKg: weight,
    heightCm,
    build: composition?.build ?? null,
    sex: composition?.sex ?? null,
  });
  if (assessed.basis === 'body_fat' || assessed.basis === 'waist') {
    return view({
      label: assessed.label,
      plain: assessed.plain,
      marker: null,
      ticks: [],
      sources: [],
      warning: null,
    });
  }
  if (weight == null) {
    return view({
      label: null,
      plain: 'Log a weight, and your height, to see BMI against the NHS and NICE ranges.',
      marker: null,
      ticks: [],
      sources: BMI_SOURCES,
      warning: null,
    });
  }
  if (heightCm == null) {
    return view({
      label: null,
      plain: `BMI needs your height as well as your weight. Add your height in centimetres and this can use the NHS and NICE ranges. Your weight stays on the chart either way.${when}`,
      marker: null,
      ticks: [],
      sources: BMI_SOURCES,
      warning: null,
    });
  }
  const raw = bmiFrom(weight, heightCm);
  if (raw == null) {
    return view({
      label: null,
      plain: 'Enter a height in centimetres to work out BMI.',
      marker: null,
      ticks: [],
      sources: BMI_SOURCES,
      warning: null,
    });
  }
  const bmi = oneDecimal(raw);
  if (assessed.hideBmiCategory && !assessed.underweight) {
    return view({
      label: null,
      plain: assessed.plain,
      marker: null,
      ticks: [],
      sources: [],
      warning: null,
    });
  }
  const scaleMin = 15;
  const scaleMax = 40;
  const ticks = [
    tick(NICE_BMI_HEALTHY_MIN, scaleMin, scaleMax, '18.5'),
    tick(25, scaleMin, scaleMax, '25'),
    tick(NHS_BMI_OBESE_MIN, scaleMin, scaleMax, '30'),
  ];
  const weightText = recent.length > 1
    ? `From an average weight of ${oneDecimal(weight).toFixed(1)} kg over ${recent.length} days in the last 7 days, `
    : `From a weight of ${oneDecimal(weight).toFixed(1)} kg, `;
  let label: string;
  let named: string;
  let warning: GuidanceView['warning'] = null;
  if (bmi < NICE_BMI_HEALTHY_MIN) {
    label = 'Below the healthy range';
    named = `a BMI of ${bmi.toFixed(1)} is below 18.5, under the healthy range NICE uses for most adults. The NHS calculator calls this underweight.`;
    warning = {
      detail: `A BMI of ${bmi.toFixed(1)} is below 18.5. That is under the healthy range NICE uses for most adults, and the NHS calculator calls it underweight.`,
      step: `If this was not your aim, ${GP_STEP.charAt(0).toLowerCase()}${GP_STEP.slice(1)}`,
    };
  } else if (bmi <= NICE_BMI_HEALTHY_MAX) {
    label = 'In the healthy range';
    named = `a BMI of ${bmi.toFixed(1)} is in the NICE healthy range for most adults, 18.5 to 24.9.`;
  } else if (bmi <= NHS_BMI_OVERWEIGHT_MAX) {
    label = 'Above the healthy range';
    named = `a BMI of ${bmi.toFixed(1)} is in the NHS overweight range for most adults, 25 to 29.9. That is above the healthy range. It is not a warning on its own.`;
  } else {
    label = 'Above the healthy range';
    named = `a BMI of ${bmi.toFixed(1)} is ${NHS_BMI_OBESE_MIN} or more, which the NHS calls obese for most adults.`;
    warning = {
      detail: `A BMI of ${bmi.toFixed(1)} is ${NHS_BMI_OBESE_MIN} or more. The NHS calls that obese for most adults.`,
      step: `If you want help with your weight, a GP or NHS 111 can talk it through. This is not an emergency on its own. ${EMERGENCY_STEP}`,
    };
  }
  return view({
    label,
    plain: `${weightText}${named} ${BMI_LIMITS}${when} ${BMI_ONLY_NOTE}`,
    marker: { position: place(bmi, scaleMin, scaleMax), warning: warning != null },
    ticks,
    sources: BMI_SOURCES,
    warning,
  });
}

export function buildMetricGuidance(input: {
  kind: HealthInsightKind;
  today: string;
  points: DayValue[];
  heightCm?: number | null;
  adult?: boolean;
  bodyFatPct?: number | null;
  waistCm?: number | null;
  build?: BodyBuild | null;
  sex?: NutritionSex | null;
}): GuidanceView {
  const points = [...input.points].filter((point) => point.day <= input.today).sort((left, right) => (left.day < right.day ? -1 : 1));
  if (input.kind === 'sleep_hours') return sleepGuidance(points, input.today);
  if (input.kind === 'resting_heart_rate') return restingGuidance(points, input.today);
  if (input.kind === 'workout_minutes') return workoutGuidance(points, input.today);
  if (input.kind === 'steps') return stepsGuidance(points, input.today);
  if (input.kind === 'hrv_sdnn') return hrvGuidance(points, input.today);
  return weightGuidance(points, input.today, input.heightCm ?? null, input.adult !== false, {
    bodyFatPct: input.bodyFatPct,
    waistCm: input.waistCm,
    build: input.build,
    sex: input.sex,
  });
}

export function weeklyUnitsGuidance(units: number, stage?: string | null): GuidanceView {
  const scaleMin = 0;
  const scaleMax = UK_HIGHER_RISK_MEN_UNITS;
  const ticks = [
    tick(UK_LOW_RISK_WEEKLY_UNITS, scaleMin, scaleMax, '14'),
    tick(UK_HIGHER_RISK_WOMEN_UNITS, scaleMin, scaleMax, '35'),
    tick(UK_HIGHER_RISK_MEN_UNITS, scaleMin, scaleMax, '50'),
  ];
  const shown = oneDecimal(units);
  const shownText = Number.isInteger(shown) ? String(shown) : shown.toFixed(1);
  const stopped = stage === 'stopped'
    ? 'This is the usual week you entered, for comparison. It is not a target to drink. '
    : '';
  const within = units <= UK_LOW_RISK_WEEKLY_UNITS;
  const higherForBoth = units >= UK_HIGHER_RISK_MEN_UNITS;
  const higherForWomenOnly = units >= UK_HIGHER_RISK_WOMEN_UNITS && !higherForBoth;
  const warning = higherForBoth
    ? {
        detail: `${shownText} units a week is at the higher-risk line of 50 or more for men, and it is also above 35 or more for women. Sex is not recorded here.`,
        step: WITHDRAWAL_NOTE,
      }
    : null;
  const spread = units > 0
    ? ' The Chief Medical Officers also advise spreading the week over 3 or more days, with several drink-free days.'
    : '';
  let plain: string;
  if (within) {
    plain = `${stopped}A usual week of ${shownText} units is within the UK low-risk guideline of no more than 14 units a week.${spread}`;
  } else if (higherForWomenOnly) {
    plain = `${stopped}A usual week of ${shownText} units is above the UK low-risk guideline of 14. 35 or more a week is higher risk for women, and 50 or more is higher risk for men. Sex is not recorded here, so both are shown.${spread}`;
  } else if (higherForBoth) {
    plain = `${stopped}A usual week of ${shownText} units is above the UK low-risk guideline of 14, and it is at or above the higher-risk lines (35 or more for women, 50 or more for men).${spread}`;
  } else {
    plain = `${stopped}A usual week of ${shownText} units is above the UK low-risk guideline of no more than 14 units a week. It is under the higher-risk lines of 35 for women and 50 for men.${spread}`;
  }
  return view({
    label: within ? 'Within the low-risk guideline' : 'Above recommended',
    plain,
    marker: { position: place(units, scaleMin, scaleMax), warning: warning != null },
    ticks,
    sources: UNIT_SOURCES,
    warning,
  });
}
