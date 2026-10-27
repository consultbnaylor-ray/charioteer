/**
 * Plain-English notes from the person's own health readings.
 * Medical lines use NHS or Royal Papworth figures only. Nothing here is a diagnosis.
 */

export const HEALTH_KINDS = [
  'steps',
  'sleep_hours',
  'resting_heart_rate',
  'hrv_sdnn',
  'workout_minutes',
  'weight_kg',
] as const;

export type HealthInsightKind = (typeof HEALTH_KINDS)[number];

export type HealthChartShape = 'bar' | 'line';

export const HEALTH_METRICS: readonly { kind: HealthInsightKind; label: string; chart: HealthChartShape }[] = [
  { kind: 'steps', label: 'Steps', chart: 'bar' },
  { kind: 'sleep_hours', label: 'Sleep', chart: 'bar' },
  { kind: 'resting_heart_rate', label: 'Resting heart rate', chart: 'line' },
  { kind: 'hrv_sdnn', label: 'Heart rate variability', chart: 'line' },
  { kind: 'workout_minutes', label: 'Workouts', chart: 'bar' },
  { kind: 'weight_kg', label: 'Weight', chart: 'line' },
];

export type HealthPoint = {
  kind: string;
  value: number;
  recordedOn: string;
  source?: string;
};

export type HealthInsightInput = {
  /** Local calendar day, YYYY-MM-DD. */
  today: string;
  samples: HealthPoint[];
  /** Calendar day they stopped, when stage is stopped. */
  soberOn: string | null;
  stage?: string | null;
};

export type HealthFlagId = 'resting_high' | 'resting_rise' | 'short_sleep' | 'hrv_low' | 'weight_loss';

export type HealthFlag = {
  id: HealthFlagId;
  kind: HealthInsightKind;
  headline: string;
  detail: string;
  step: string;
  sourceName: string;
  sourceUrl: string;
};

export type HealthNoteRank = 'sobriety' | 'week' | 'streak' | 'best';

export type HealthKindReport = {
  kind: HealthInsightKind;
  lines: string[];
  flags: HealthFlag[];
  notes: { rank: HealthNoteRank; text: string }[];
};

export type HealthInsightReport = {
  headlines: string[];
  kinds: HealthKindReport[];
};

export type DayValue = { day: string; value: number };

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const SUBJECT: Record<HealthInsightKind, string> = {
  steps: 'Steps',
  sleep_hours: 'Sleep',
  resting_heart_rate: 'Resting heart rate',
  hrv_sdnn: 'Heart rate variability',
  workout_minutes: 'Workout minutes',
  weight_kg: 'Weight',
};

const EMERGENCY_STEP = 'Call 999 if you have chest pain, fainting, or breathlessness.';
const HEART_STEP = `Rest, have some water, and try a breathing exercise. If it stays up, contact your GP or NHS 111. ${EMERGENCY_STEP}`;
const SLEEP_STEP = `A regular bedtime and a breathing exercise can help. You can talk it through with Thumos. If short sleep carries on, contact your GP or NHS 111. ${EMERGENCY_STEP}`;
const HRV_STEP = `Sleep, drink some water, keep exercise steady, and take a rest day if you need one. A breathing exercise can help. If you feel unwell, contact your GP or NHS 111. ${EMERGENCY_STEP}`;
const WEIGHT_STEP = `If you did not mean to lose this weight, or it keeps falling, contact your GP or NHS 111. ${EMERGENCY_STEP}`;

const PAPWORTH_URL = 'https://www.royalpapworth.nhs.uk/our-services/cardiology/Heart-rhythm-disturbances';
const SLEEP_URL = 'https://www.nhs.uk/conditions/insomnia/';
const WEIGHT_URL = 'https://www.nhs.uk/conditions/malnutrition/';

const NOT_ADVICE = 'This is not a diagnosis and not medical advice.';

/**
 * A personal HRV trend needs several of the person's own days.
 * Fewer than this, and the card asks them to keep wearing the watch instead of judging a trend.
 */
export const HRV_MIN_READINGS = 5;

export const HRV_TOO_FEW =
  'Too few readings to judge a trend yet, so wear your watch overnight for a week';

/** A recent day counts as well below their own baseline when it is at least 20% under that earlier average. */
const HRV_WELL_BELOW = 0.8;
const HRV_LOW_DAYS = 3;

/**
 * Plain-English HRV note. The ranges are rough examples, not a target and not a diagnosis.
 * Apple Watch records SDNN, the standard deviation of inter-beat intervals, in milliseconds.
 * https://developer.apple.com/documentation/healthkit/hkquantitytypeidentifier/heartratevariabilitysdnn
 * Cleveland Clinic: HRV is the change in time between beats; a higher figure usually means the body adapts more easily.
 * https://my.clevelandclinic.org/health/symptoms/21773-heart-rate-variability-hrv
 * Nunan, Sandercock and Brodie, PACE 2010: short-term SDNN in healthy adults, cross-study mean 50 ms, study means 32 to 93 ms.
 * https://onlinelibrary.wiley.com/doi/10.1111/j.1540-8159.2010.02841.x
 * Sammito and Böckelmann, Heart Rhythm 2016: 24-hour SDNN falls with age. Those day-long recordings are not a watch sample.
 * https://pubmed.ncbi.nlm.nih.gov/26883166/
 * Pietilä and colleagues, JMIR Mental Health 2018: alcohol lowered heart-rate variability during the first hours of sleep.
 * https://pmc.ncbi.nlm.nih.gov/articles/PMC5878366/
 * Timothy, Sharma and Sharma, Indian Journal of Psychiatry 2025: in alcohol dependence, HRV rose within four weeks of detoxification and abstinence.
 * https://pmc.ncbi.nlm.nih.gov/articles/PMC12594097/
 */
export const APPLE_HRV_URL = 'https://developer.apple.com/documentation/healthkit/hkquantitytypeidentifier/heartratevariabilitysdnn';
export const CLEVELAND_HRV_URL = 'https://my.clevelandclinic.org/health/symptoms/21773-heart-rate-variability-hrv';
export const NUNAN_SDNN_URL = 'https://onlinelibrary.wiley.com/doi/10.1111/j.1540-8159.2010.02841.x';
export const SAMMITO_HRV_URL = 'https://pubmed.ncbi.nlm.nih.gov/26883166/';
export const PIETILA_ALCOHOL_HRV_URL = 'https://pmc.ncbi.nlm.nih.gov/articles/PMC5878366/';
export const TIMOTHY_ABSTINENCE_HRV_URL = 'https://pmc.ncbi.nlm.nih.gov/articles/PMC12594097/';

export type HrvExplainerLink = { name: string; url: string };

export const HRV_EXPLAINER_TITLE = 'What does HRV mean?';

export const HRV_EXPLAINER_PARAGRAPHS: readonly string[] = [
  'Heart rate variability is the variation in time between heartbeats. A higher figure usually means a more rested, recovered body.',
  'Apple Watch measures SDNN, the spread of the time between beats, in milliseconds. It records this on its own, mostly overnight, while you are still.',
  'There is no official UK target. These figures are general, rough examples, not a target. A review of short-term SDNN in healthy adults found study averages from about 32 to 93 ms, with an overall mean near 50 ms (Nunan, Sandercock and Brodie, 2010). Heart rate variability also falls with age on 24-hour recordings, which are not the same as a watch sample (Sammito and Böckelmann, 2016). As a rough picture, many healthy adults sit around 30 to 70 ms, and that tends to fall with age. Well-trained endurance athletes are often higher, about 70 to 100 ms or more. A reading well below your own usual level, often under about 20 to 30 ms, can show up with illness, poor sleep, stress, alcohol or overtraining.',
  'A single reading can jump about. The trend over days matters more than one night.',
  'Alcohol noticeably lowers heart rate variability, including during the first hours of sleep (Pietilä and colleagues, 2018). In people treated for alcohol dependence, it rose within four weeks of detoxification and continued abstinence (Timothy, Sharma and Sharma, 2025). Stopping drinking often raises it over the following weeks. That is a general finding, not a promise for you.',
];

export const HRV_EXPLAINER_TIPS =
  'Sleep, drink enough water, keep exercise steady, and take rest days. Breathing exercises can help.';

export const HRV_EXPLAINER_LINKS: readonly HrvExplainerLink[] = [
  { name: 'Cleveland Clinic: heart rate variability', url: CLEVELAND_HRV_URL },
  { name: 'Apple: heart rate variability (SDNN)', url: APPLE_HRV_URL },
  { name: 'Nunan, Sandercock and Brodie, 2010: short-term SDNN', url: NUNAN_SDNN_URL },
  { name: 'Sammito and Böckelmann, 2016: SDNN and age', url: SAMMITO_HRV_URL },
  { name: 'Pietilä and colleagues, 2018: alcohol and sleep HRV', url: PIETILA_ALCOHOL_HRV_URL },
  { name: 'Timothy, Sharma and Sharma, 2025: HRV after stopping', url: TIMOTHY_ABSTINENCE_HRV_URL },
];

/** Wording Thumos may quote. It is general guidance, not a reading of this person. */
export function hrvExplainerForCoach(): string {
  return [
    HRV_EXPLAINER_TITLE,
    ...HRV_EXPLAINER_PARAGRAPHS,
    HRV_EXPLAINER_TIPS,
    'This is general guidance, not a diagnosis. If they are worried, suggest they speak to their GP. Do not add other ranges or citations.',
  ].join('\n');
}

const FLAG_ORDER: HealthFlagId[] = ['resting_high', 'resting_rise', 'short_sleep', 'hrv_low', 'weight_loss'];

export function londonDay(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value ?? '1970';
  const month = parts.find((part) => part.type === 'month')?.value ?? '01';
  const day = parts.find((part) => part.type === 'day')?.value ?? '01';
  return `${year}-${month}-${day}`;
}

/** Monday is 0 and Sunday is 6. `iso` is a calendar date, so the clock zone does not move it. */
export function weekdayOffset(iso: string): number {
  const [year, month, day] = iso.split('-').map(Number);
  const index = new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1).getDay();
  return index === 0 ? 6 : index - 1;
}

/** Monday of the calendar week that contains `iso`. */
export function mondayOf(iso: string): string {
  return shiftDay(iso, -weekdayOffset(iso));
}

export type LondonWeek = {
  /** Monday, YYYY-MM-DD, at 00:00 Europe/London. */
  start: string;
  /** Sunday, YYYY-MM-DD, through 23:59 Europe/London. */
  end: string;
  /** The London calendar day of `value`. */
  today: string;
  /** Monday through today, inclusive. Sunday still includes Monday to Saturday. */
  days: string[];
};

/**
 * The week Ben trains and logs in: Monday 00:00 through Sunday 23:59, Europe/London.
 * BST and GMT both stay on that calendar. A Sunday still belongs to the week that began on Monday.
 */
export function londonWeek(value: Date | string = new Date()): LondonWeek {
  const today = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : londonDay(value);
  const offset = weekdayOffset(today);
  const start = shiftDay(today, -offset);
  const days: string[] = [];
  for (let index = 0; index <= offset; index += 1) days.push(shiftDay(start, index));
  return { start, end: shiftDay(start, 6), today, days };
}

export function asCalendarDay(value: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return match ? match[1] : londonDay(value);
}

export function shiftDay(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(year, (month ?? 1) - 1, (day ?? 1) + days);
  const nextMonth = String(date.getMonth() + 1).padStart(2, '0');
  const nextDay = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${nextMonth}-${nextDay}`;
}

export function weekdayShort(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  return WEEKDAYS[new Date(year, (month ?? 1) - 1, day ?? 1).getDay()] ?? '';
}

export function formatUkCompactDay(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(year, (month ?? 1) - 1, day ?? 1);
  const dayText = date.toLocaleDateString('en-GB', { day: 'numeric' });
  const monthText = date.toLocaleDateString('en-GB', { month: 'short' });
  const yearText = date.toLocaleDateString('en-GB', { year: 'numeric' });
  return `${dayText} ${monthText} ${yearText}`;
}

function ukNumber(value: number, digits = 0): string {
  return new Intl.NumberFormat('en-GB', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatSleepHours(hours: number): string {
  const total = Math.max(0, Math.round(hours * 60));
  const whole = Math.floor(total / 60);
  const minutes = total % 60;
  if (whole === 0) return `${minutes}m`;
  if (minutes === 0) return `${whole}h`;
  return `${whole}h ${minutes}m`;
}

const FITNESS_LABELS: Record<string, string> = {
  vo2_max: 'VO2 max',
  walking_heart_rate: 'Walking heart rate',
  heart_rate_recovery: 'Heart rate recovery',
  strength_minutes: 'Strength minutes',
  cardio_minutes: 'Cardio minutes',
  other_minutes: 'Other minutes',
  session_heart_rate: 'Session heart rate',
};

export function healthKindLabel(kind: string): string {
  return HEALTH_METRICS.find((metric) => metric.kind === kind)?.label ?? FITNESS_LABELS[kind] ?? kind;
}

export function formatHealthValue(kind: string, value: number): string {
  if (kind === 'steps') return `${ukNumber(Math.round(value))} steps`;
  if (kind === 'sleep_hours') return formatSleepHours(value);
  if (kind === 'resting_heart_rate' || kind === 'walking_heart_rate' || kind === 'session_heart_rate') return `${Math.round(value)} bpm`;
  if (kind === 'heart_rate_recovery') return `${Math.round(value)} bpm`;
  if (kind === 'hrv_sdnn') return `${Math.round(value)} ms`;
  if (kind === 'workout_minutes' || kind === 'strength_minutes' || kind === 'cardio_minutes' || kind === 'other_minutes') {
    return `${Math.round(value)} min`;
  }
  if (kind === 'vo2_max') return `${ukNumber(value, 1)}`;
  if (kind === 'weight_kg') return `${ukNumber(value, 1)} kg`;
  return ukNumber(value, Number.isInteger(value) ? 0 : 1);
}

export function formatReadingLine(kind: string, value: number, recordedOn: string, source?: string): string {
  const where = source === 'healthkit' ? 'Apple Health' : 'Logged here';
  return `${formatHealthValue(kind, value)} · ${formatUkCompactDay(asCalendarDay(recordedOn))} · ${where}`;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function daysBetween(earlier: string, later: string): number {
  const [ay, am, ad] = earlier.split('-').map(Number);
  const [by, bm, bd] = later.split('-').map(Number);
  const start = Date.UTC(ay, (am ?? 1) - 1, ad ?? 1);
  const end = Date.UTC(by, (bm ?? 1) - 1, bd ?? 1);
  return Math.round((end - start) / 86400000);
}

/** One value per calendar day. The newest sample for that day wins. */
export function dailyValues(samples: HealthPoint[], kind: string): DayValue[] {
  const indexed = samples
    .map((sample, index) => ({ sample, index }))
    .filter((item) => item.sample.kind === kind && Number.isFinite(item.sample.value));
  indexed.sort((left, right) => {
    const leftDay = asCalendarDay(left.sample.recordedOn);
    const rightDay = asCalendarDay(right.sample.recordedOn);
    if (leftDay !== rightDay) return leftDay < rightDay ? 1 : -1;
    return left.index - right.index;
  });
  const seen = new Set<string>();
  const points: DayValue[] = [];
  for (const item of indexed) {
    const day = asCalendarDay(item.sample.recordedOn);
    if (seen.has(day)) continue;
    seen.add(day);
    points.push({ day, value: item.sample.value });
  }
  points.sort((left, right) => (left.day < right.day ? -1 : left.day > right.day ? 1 : 0));
  return points;
}

export function seriesForWindow(samples: HealthPoint[], kind: string, today: string, windowDays: number): DayValue[] {
  const start = shiftDay(today, -(windowDays - 1));
  return dailyValues(samples, kind).filter((point) => point.day >= start && point.day <= today);
}

export function averageValue(points: DayValue[]): number | null {
  return mean(points.map((point) => point.value));
}

export function latestReading(samples: HealthPoint[], kind: string, today: string): DayValue | null {
  const points = dailyValues(samples, kind).filter((point) => point.day <= today);
  return points.find((point) => point.day === today) ?? points[points.length - 1] ?? null;
}

export function groupedReadings(samples: HealthPoint[]): { kind: HealthInsightKind; rows: HealthPoint[] }[] {
  return HEALTH_KINDS.map((kind) => ({
    kind,
    rows: samples
      .filter((sample) => sample.kind === kind && Number.isFinite(sample.value))
      .map((sample) => ({ ...sample, recordedOn: asCalendarDay(sample.recordedOn) }))
      .sort((left, right) => (left.recordedOn < right.recordedOn ? 1 : left.recordedOn > right.recordedOn ? -1 : 0)),
  })).filter((group) => group.rows.length > 0);
}

function inSpan(points: DayValue[], start: string, end: string): DayValue[] {
  return points.filter((point) => point.day >= start && point.day <= end);
}

/** How many days the personal change looks back, including today. */
export const PERSONAL_WINDOW_DAYS = 30;

/** Other days required in that window before a percent is shown. */
export const PERSONAL_BASELINE_MIN = 3;

/**
 * A smaller move than this is called "about the same".
 * The percent itself is still one rounding of (latest − baseline) / baseline × 100.
 */
export const PERSONAL_CHANGE_QUIET_PERCENT = 5;

const PERSONAL_CHANGE_KINDS = new Set([
  'hrv_sdnn',
  'resting_heart_rate',
  'sleep_hours',
  'weight_kg',
  'vo2_max',
]);

const CHANGE_NAME: Record<string, string> = {
  hrv_sdnn: 'HRV',
  resting_heart_rate: 'Resting HR',
  sleep_hours: 'Sleep',
  weight_kg: 'Weight',
  vo2_max: 'VO2',
};

export type PersonalChange = {
  latest: number;
  latestDay: string;
  baseline: number;
  baselineCount: number;
  windowDays: number;
  /** Rounded once. Positive means the latest reading is above the baseline. */
  percent: number;
};

/**
 * Percent change of one reading against a baseline.
 * Multiplies by 100 once. A ratio of 0.07 is 7, not 70.
 */
export function percentAgainstBaseline(value: number, baseline: number): number | null {
  if (!Number.isFinite(value) || !Number.isFinite(baseline) || baseline === 0) return null;
  return Math.round(((value - baseline) / baseline) * 100);
}

/**
 * Latest reading against the mean of the other days in the last 30 days.
 * The latest day is left out of the mean, so one reading is not compared with itself.
 */
export function personalChange(
  points: readonly DayValue[],
  today: string,
  options?: { windowDays?: number; minBaseline?: number },
): PersonalChange | null {
  const windowDays = options?.windowDays ?? PERSONAL_WINDOW_DAYS;
  const minBaseline = options?.minBaseline ?? PERSONAL_BASELINE_MIN;
  const start = shiftDay(today, -(windowDays - 1));
  const window = [...points]
    .filter((point) => point.day >= start && point.day <= today)
    .sort((left, right) => (left.day < right.day ? -1 : left.day > right.day ? 1 : 0));
  const latest = window[window.length - 1];
  if (!latest) return null;
  const earlier = window.filter((point) => point.day !== latest.day);
  if (earlier.length < minBaseline) return null;
  const baseline = mean(earlier.map((point) => point.value));
  if (baseline == null) return null;
  const percent = percentAgainstBaseline(latest.value, baseline);
  if (percent == null) return null;
  return {
    latest: latest.value,
    latestDay: latest.day,
    baseline,
    baselineCount: earlier.length,
    windowDays,
    percent,
  };
}

function changeValue(kind: string, value: number): string {
  if (kind === 'vo2_max') return `${formatHealthValue(kind, value)} ml/kg/min`;
  return formatHealthValue(kind, value);
}

/** One sentence: the reading, the percent, the period, and the baseline. */
export function formatPersonalChange(kind: string, change: PersonalChange): string {
  const name = CHANGE_NAME[kind] ?? healthKindLabel(kind);
  const value = changeValue(kind, change.latest);
  const baseline = `your ${change.windowDays}-day average`;
  if (Math.abs(change.percent) < PERSONAL_CHANGE_QUIET_PERCENT) {
    return `${name} ${value}, about the same as ${baseline}`;
  }
  const verb = change.percent > 0 ? 'up' : 'down';
  return `${name} ${value}, ${verb} ${Math.abs(change.percent)}% vs ${baseline}`;
}

/**
 * The shared change for HRV, resting heart rate, VO2, sleep, and weight.
 * HRV stays quiet until there are enough of the person's own days.
 */
export function healthChangeNote(kind: string, points: readonly DayValue[], today: string): string | null {
  if (!PERSONAL_CHANGE_KINDS.has(kind)) return null;
  if (kind === 'hrv_sdnn' && points.length < HRV_MIN_READINGS) return null;
  const change = personalChange(points, today);
  if (!change) return null;
  return formatPersonalChange(kind, change);
}

export function healthChangeNoteFromReadings(
  kind: string,
  readings: readonly { value: number; recordedOn: string }[],
  today: string,
): string | null {
  const points = dailyValues(
    readings.map((row) => ({ kind, value: row.value, recordedOn: row.recordedOn })),
    kind,
  );
  return healthChangeNote(kind, points, today);
}

function weekLine(kind: HealthInsightKind, points: DayValue[], today: string): string | null {
  const current = inSpan(points, shiftDay(today, -6), today);
  const previous = inSpan(points, shiftDay(today, -13), shiftDay(today, -7));
  if (current.length < 2 || previous.length < 2) return null;
  const currentMean = mean(current.map((point) => point.value));
  const previousMean = mean(previous.map((point) => point.value));
  if (currentMean == null || previousMean == null) return null;
  const percent = percentAgainstBaseline(currentMean, previousMean);
  if (percent == null) return null;
  const subject = SUBJECT[kind];
  const plural = kind === 'steps' || kind === 'workout_minutes';
  if (Math.abs(percent) < PERSONAL_CHANGE_QUIET_PERCENT) {
    return `${subject} ${plural ? 'are' : 'is'} about the same as last week`;
  }
  const verb = percent > 0 ? 'up' : 'down';
  return `${subject} ${verb} ${Math.abs(percent)}% on last week`;
}

function streakLine(kind: HealthInsightKind, points: DayValue[], today: string): string | null {
  if (kind === 'weight_kg') return null;
  const higherIsBetter = kind !== 'resting_heart_rate';
  const baselinePoints = inSpan(points, shiftDay(today, -29), today);
  if (baselinePoints.length < 3) return null;
  const baseline = mean(baselinePoints.map((point) => point.value));
  if (baseline == null) return null;
  const byDay = new Map(points.map((point) => [point.day, point.value]));
  const latest = baselinePoints[baselinePoints.length - 1];
  if (!latest) return null;
  let count = 0;
  let cursor = latest.day;
  while (byDay.has(cursor)) {
    const value = byDay.get(cursor) ?? 0;
    const kept = higherIsBetter ? value >= baseline : value <= baseline;
    if (!kept) break;
    count += 1;
    cursor = shiftDay(cursor, -1);
  }
  if (count < 3) return null;
  const plural = kind === 'steps' || kind === 'workout_minutes';
  const place = higherIsBetter ? 'at or above' : 'at or below';
  return `${SUBJECT[kind]} ${plural ? 'have' : 'has'} been ${place} your own recent average for ${count} days.`;
}

function bestLine(kind: HealthInsightKind, points: DayValue[], today: string): string | null {
  if (kind === 'weight_kg') return null;
  const window = inSpan(points, shiftDay(today, -29), today);
  if (window.length === 0) return null;
  const lower = kind === 'resting_heart_rate';
  const best = window.reduce((pick, point) => {
    if (lower ? point.value < pick.value : point.value > pick.value) return point;
    if (point.value === pick.value && point.day > pick.day) return point;
    return pick;
  });
  const when = formatUkCompactDay(best.day);
  if (kind === 'steps') return `Your highest step count was ${ukNumber(Math.round(best.value))} on ${when}.`;
  if (kind === 'sleep_hours') return `Your longest sleep was ${formatSleepHours(best.value)} on ${when}.`;
  if (kind === 'workout_minutes') return `Your most active day was ${Math.round(best.value)} min on ${when}.`;
  if (kind === 'hrv_sdnn') return `Your highest heart rate variability was ${Math.round(best.value)} ms on ${when}.`;
  return `Your lowest resting heart rate was ${Math.round(best.value)} bpm on ${when}.`;
}

function amountPhrase(kind: HealthInsightKind, value: number): string {
  if (kind === 'steps') return ukNumber(Math.round(value));
  if (kind === 'sleep_hours') return formatSleepHours(value);
  if (kind === 'resting_heart_rate') return String(Math.round(value));
  if (kind === 'hrv_sdnn') return String(Math.round(value));
  if (kind === 'workout_minutes') return String(Math.round(value));
  return ukNumber(value, 1);
}

function unitTail(kind: HealthInsightKind): string {
  if (kind === 'steps') return ' steps';
  if (kind === 'resting_heart_rate') return ' bpm';
  if (kind === 'hrv_sdnn') return ' ms';
  if (kind === 'workout_minutes') return ' min';
  if (kind === 'weight_kg') return ' kg';
  return '';
}

function sobrietyLine(kind: HealthInsightKind, points: DayValue[], soberOn: string | null, stopped: boolean): string | null {
  if (!stopped || !soberOn) return null;
  const before = points.filter((point) => point.day < soberOn);
  const after = points.filter((point) => point.day >= soberOn);
  if (before.length < 2 || after.length < 2) return null;
  const beforeMean = mean(before.map((point) => point.value));
  const afterMean = mean(after.map((point) => point.value));
  if (beforeMean == null || afterMean == null) return null;
  const subject = kind === 'resting_heart_rate' ? 'your resting heart rate' : `your ${SUBJECT[kind].toLowerCase()}`;
  const from = amountPhrase(kind, beforeMean);
  const to = amountPhrase(kind, afterMean);
  const tail = unitTail(kind);
  const change = percentAgainstBaseline(afterMean, beforeMean);
  if (change == null) return null;
  if (Math.abs(change) < PERSONAL_CHANGE_QUIET_PERCENT) {
    return `Since you stopped drinking, ${subject} is about the same, averaging ${to}${tail}.`;
  }
  if (kind === 'resting_heart_rate') {
    const verb = afterMean < beforeMean ? 'dropped' : 'risen';
    return `Since you stopped drinking, your resting heart rate has ${verb} from ${from} to ${to} bpm.`;
  }
  return `Since you stopped drinking, ${subject} has gone from ${from} to ${to}${tail}.`;
}

function firstSoberMonthLine(points: DayValue[], today: string, soberOn: string | null, stopped: boolean): string | null {
  if (!stopped || !soberOn) return null;
  const firstEnd = shiftDay(soberOn, 29);
  const recentStart = shiftDay(today, -29);
  if (recentStart <= firstEnd) return null;
  const first = inSpan(points, soberOn, firstEnd);
  const recent = inSpan(points, recentStart, today);
  if (first.length < 2 || recent.length < 2) return null;
  const firstMean = mean(first.map((point) => point.value));
  const recentMean = mean(recent.map((point) => point.value));
  if (firstMean == null || recentMean == null) return null;
  const minutes = Math.round((recentMean - firstMean) * 60);
  const recentText = formatSleepHours(recentMean);
  if (Math.abs(minutes) < 10) {
    return `Sleep is averaging ${recentText}, about the same as your first sober month.`;
  }
  const word = Math.abs(minutes) === 1 ? 'minute' : 'minutes';
  const direction = minutes > 0 ? 'more' : 'less';
  return `Sleep is averaging ${recentText}, ${Math.abs(minutes)} ${word} ${direction} than your first sober month.`;
}

function restingFlags(points: DayValue[], today: string): HealthFlag[] {
  const flags: HealthFlag[] = [];
  const recent = inSpan(points, shiftDay(today, -6), today);
  const high = recent.filter((point) => point.value > 100);
  if (high.length >= 3) {
    flags.push({
      id: 'resting_high',
      kind: 'resting_heart_rate',
      headline: `Resting heart rate has been above 100 bpm on ${high.length} of the last 7 days.`,
      detail: `Your resting heart rate has been above 100 bpm on ${high.length} of the last 7 days. A usual adult resting rate is about 60 to 100 bpm, and a faster resting rate is called tachycardia (Royal Papworth NHS). ${NOT_ADVICE}`,
      step: HEART_STEP,
      sourceName: 'Royal Papworth NHS',
      sourceUrl: PAPWORTH_URL,
    });
  }
  const previous = inSpan(points, shiftDay(today, -13), shiftDay(today, -7));
  const recentMean = mean(recent.map((point) => point.value));
  const previousMean = mean(previous.map((point) => point.value));
  if (recent.length >= 2 && previous.length >= 2 && recentMean != null && previousMean != null) {
    const rise = recentMean - previousMean;
    if (rise >= 10) {
      const shown = Math.round(rise);
      flags.push({
        id: 'resting_rise',
        kind: 'resting_heart_rate',
        headline: `Resting heart rate is ${shown} bpm higher than last week.`,
        detail: `Your resting heart rate is averaging ${shown} bpm higher than last week. That compares your own readings, not a published cutoff. A usual adult resting rate is about 60 to 100 bpm (Royal Papworth NHS). ${NOT_ADVICE}`,
        step: HEART_STEP,
        sourceName: 'Royal Papworth NHS',
        sourceUrl: PAPWORTH_URL,
      });
    }
  }
  return flags;
}

function sleepFlag(points: DayValue[], today: string): HealthFlag | null {
  const recent = inSpan(points, shiftDay(today, -6), today);
  const short = recent.filter((point) => point.value < 6);
  if (short.length < 3) return null;
  return {
    id: 'short_sleep',
    kind: 'sleep_hours',
    headline: `Sleep has been under 6 hours on ${short.length} of the last 7 nights.`,
    detail: `Sleep has been under 6 hours on ${short.length} of the last 7 nights. That is below the 7 to 9 hours the NHS says adults need. ${NOT_ADVICE}`,
    step: SLEEP_STEP,
    sourceName: 'NHS',
    sourceUrl: SLEEP_URL,
  };
}

function hrvFlag(points: DayValue[], today: string): HealthFlag | null {
  if (points.length < HRV_MIN_READINGS) return null;
  const recent = inSpan(points, shiftDay(today, -6), today);
  const baselinePoints = inSpan(points, shiftDay(today, -36), shiftDay(today, -7));
  if (baselinePoints.length < 3) return null;
  const baseline = mean(baselinePoints.map((point) => point.value));
  if (baseline == null || baseline <= 0) return null;
  const lowDays = recent.filter((point) => point.value <= baseline * HRV_WELL_BELOW);
  if (lowDays.length < HRV_LOW_DAYS) return null;
  return {
    id: 'hrv_low',
    kind: 'hrv_sdnn',
    headline: 'Heart rate variability has been below your usual level for a few days.',
    detail: `On ${lowDays.length} of the last 7 days, heart rate variability was well below your own usual level. A short run like this can follow poor sleep, stress, alcohol, illness or a hard spell of training. The trend matters more than one night. ${NOT_ADVICE}`,
    step: HRV_STEP,
    sourceName: 'Your own readings',
    sourceUrl: '',
  };
}

function weightFlag(points: DayValue[]): HealthFlag | null {
  if (points.length < 2) return null;
  const latest = points[points.length - 1];
  if (!latest || latest.value <= 0) return null;
  const cutoff = shiftDay(latest.day, -90);
  const older = points.filter((point) => point.day <= cutoff);
  if (older.length === 0) return null;
  const reference = older.reduce((pick, point) => (point.day > pick.day ? point : pick));
  if (reference.value <= 0) return null;
  const loss = (reference.value - latest.value) / reference.value;
  if (loss < 0.05) return null;
  const percent = Math.round(loss * 100);
  const days = daysBetween(reference.day, latest.day);
  return {
    id: 'weight_loss',
    kind: 'weight_kg',
    headline: `Weight is about ${percent}% lower than a reading from around 3 months ago.`,
    detail: `Your weight is ${percent}% lower than ${formatUkCompactDay(reference.day)}, ${days} days earlier. The NHS says losing 5% to 10% or more of your weight over 3 to 6 months, when you did not mean to, is a reason to see a GP. ${NOT_ADVICE}`,
    step: WEIGHT_STEP,
    sourceName: 'NHS',
    sourceUrl: WEIGHT_URL,
  };
}

function flagsFor(kind: HealthInsightKind, points: DayValue[], today: string): HealthFlag[] {
  if (kind === 'resting_heart_rate') return restingFlags(points, today);
  if (kind === 'sleep_hours') {
    const flag = sleepFlag(points, today);
    return flag ? [flag] : [];
  }
  if (kind === 'hrv_sdnn') {
    const flag = hrvFlag(points, today);
    return flag ? [flag] : [];
  }
  if (kind === 'weight_kg') {
    const flag = weightFlag(points);
    return flag ? [flag] : [];
  }
  return [];
}

function stoppedStage(input: HealthInsightInput): boolean {
  if (input.stage === 'stopped') return true;
  if (input.stage == null && input.soberOn) return true;
  return false;
}

function reportFor(kind: HealthInsightKind, input: HealthInsightInput): HealthKindReport {
  const points = dailyValues(input.samples, kind).filter((point) => point.day <= input.today);
  const stopped = stoppedStage(input);
  const notes: { rank: HealthNoteRank; text: string }[] = [];
  const tooFewHrv = kind === 'hrv_sdnn' && points.length < HRV_MIN_READINGS;
  const week = PERSONAL_CHANGE_KINDS.has(kind)
    ? healthChangeNote(kind, points, input.today)
    : weekLine(kind, points, input.today);
  if (week) notes.push({ rank: 'week', text: week });
  const streak = tooFewHrv ? null : streakLine(kind, points, input.today);
  if (streak) notes.push({ rank: 'streak', text: streak });
  const best = bestLine(kind, points, input.today);
  if (best) notes.push({ rank: 'best', text: best });
  const sober = sobrietyLine(kind, points, input.soberOn, stopped);
  if (sober) notes.push({ rank: 'sobriety', text: sober });
  if (kind === 'sleep_hours') {
    const month = firstSoberMonthLine(points, input.today, input.soberOn, stopped);
    if (month) notes.push({ rank: 'sobriety', text: month });
  }
  const flags = flagsFor(kind, points, input.today);
  const lines = [
    ...notes.filter((note) => note.rank === 'week').map((note) => note.text),
    ...notes.filter((note) => note.rank === 'streak').map((note) => note.text),
    ...notes.filter((note) => note.rank === 'best').map((note) => note.text),
    ...notes.filter((note) => note.rank === 'sobriety').map((note) => note.text),
  ];
  return { kind, lines, flags, notes };
}

export function buildHealthInsights(input: HealthInsightInput): HealthInsightReport {
  const kinds = HEALTH_KINDS.map((kind) => reportFor(kind, input));
  const flags = FLAG_ORDER.flatMap((id) => kinds.flatMap((kind) => kind.flags.filter((flag) => flag.id === id)));
  const ranked = (rank: HealthNoteRank) => kinds.flatMap((kind) =>
    kind.notes.filter((note) => note.rank === rank && !note.text.includes('about the same')).map((note) => note.text),
  );
  const headlines = [
    ...flags.map((flag) => flag.headline),
    ...ranked('sobriety'),
    ...ranked('week'),
    ...ranked('streak'),
    ...ranked('best'),
  ].slice(0, 3);
  return { headlines, kinds };
}
