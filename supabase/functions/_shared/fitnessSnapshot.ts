/**
 * A short fitness summary from daily readings already stored.
 * Cardio fitness bands are the 25th and 75th percentiles from Kaminsky, Arena,
 * and Myers, Mayo Clinic Proceedings, 2015 (FRIEND treadmill standards, ages 20–79).
 * Below the 25th is Developing, from the 25th up to the 75th is Steady, and the
 * 75th and above is Strong. This is an estimate, not Apple's classification and
 * not a medical assessment.
 */
import { shiftDay } from './healthInsights.ts';
import type { NutritionGoal, NutritionSex } from './nutrition.ts';

export type FitnessLevel = 'Developing' | 'Steady' | 'Strong';

export type FitnessTone = 'good' | 'watch' | 'info';

export type FitnessSample = { kind: string; value: number; recordedOn: string };

export type FitnessSnapshotInput = {
  today: string;
  goal: NutritionGoal | null;
  goalAge: number | null;
  goalSex: NutritionSex | null;
  /** Minutes in the week they stated on You. Null when they have not set one. */
  scheduleWeekMinutes: number | null;
  health: readonly FitnessSample[];
  /** Check-in sleep, used only when sleep is not already in health. */
  sleep?: readonly { day: string; hours: number }[];
  permission: 'denied' | 'unknown';
};

export type FitnessRing = {
  centre: string;
  unit: string;
  fill: number;
  status: string;
  tone: FitnessTone;
  words: string;
};

export type FitnessTrend = {
  label: string;
  words: string;
  tone: FitnessTone;
  points: number[];
};

export type FitnessWeekMix = {
  label: string;
  strength: number;
  cardio: number;
  other: number;
};

export type FitnessRecommendation = {
  id: string;
  text: string;
  /** Worth copying into this week's focus. A plain "hold" line stays on the card. */
  forFocus: boolean;
};

export type FitnessSnapshot = {
  level: FitnessLevel | null;
  levelWords: string;
  estimate: string;
  missing: string | null;
  cardio: (FitnessRing & { trend: number[] }) | null;
  resting: FitnessTrend | null;
  minutes: FitnessRing | null;
  mix: { weeks: FitnessWeekMix[]; words: string } | null;
  recovery: { words: string; tone: FitnessTone; status: string } | null;
  recommendations: FitnessRecommendation[];
  /** One line for Thumos and the plan. Null when there is nothing to say. */
  contextLine: string | null;
};

const ESTIMATE = 'An estimate, not a medical assessment. Check with a doctor before big changes.';

const MEN = [
  { maxAge: 29, p25: 40.1, p75: 55.2 },
  { maxAge: 39, p25: 35.9, p75: 49.2 },
  { maxAge: 49, p25: 31.9, p75: 45.0 },
  { maxAge: 59, p25: 27.1, p75: 39.7 },
  { maxAge: 69, p25: 23.7, p75: 34.5 },
  { maxAge: 79, p25: 20.4, p75: 30.4 },
] as const;

const WOMEN = [
  { maxAge: 29, p25: 30.5, p75: 44.7 },
  { maxAge: 39, p25: 25.3, p75: 36.1 },
  { maxAge: 49, p25: 22.1, p75: 32.4 },
  { maxAge: 59, p25: 19.9, p75: 27.6 },
  { maxAge: 69, p25: 17.2, p75: 23.8 },
  { maxAge: 79, p25: 15.6, p75: 20.8 },
] as const;

const STRENGTH_TYPES = new Set([20, 50, 59]);
const CARDIO_TYPES = new Set([
  8, 11, 13, 16, 24, 28, 30, 35, 37, 44, 46, 52, 53, 60, 63, 64, 65, 68, 69, 73, 74, 77, 82,
]);

/** Strength, cardio, or other. Combat sports count as conditioning, not as a third plan. */
export function workoutBucket(activityType: number): 'strength' | 'cardio' | 'other' {
  if (STRENGTH_TYPES.has(activityType)) return 'strength';
  if (CARDIO_TYPES.has(activityType)) return 'cardio';
  return 'other';
}

function avg(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function dayValue(samples: readonly FitnessSample[], kind: string, today: string, days: number): { day: string; value: number }[] {
  const start = shiftDay(today, -(days - 1));
  const map = new Map<string, number>();
  for (const sample of samples) {
    if (sample.kind !== kind) continue;
    if (sample.recordedOn < start || sample.recordedOn > today) continue;
    if (!Number.isFinite(sample.value) || sample.value <= 0) continue;
    map.set(sample.recordedOn, sample.value);
  }
  return [...map.entries()]
    .sort((left, right) => (left[0] < right[0] ? -1 : 1))
    .map(([day, value]) => ({ day, value }));
}

function sumKind(samples: readonly FitnessSample[], kind: string, start: string, today: string): number {
  let total = 0;
  for (const sample of samples) {
    if (sample.kind !== kind || sample.recordedOn < start || sample.recordedOn > today) continue;
    if (!Number.isFinite(sample.value) || sample.value <= 0) continue;
    total += sample.value;
  }
  return total;
}

function halves(points: { value: number }[]): { earlier: number | null; recent: number | null } {
  if (points.length < 2) return { earlier: null, recent: points[0]?.value ?? null };
  const mid = Math.max(1, Math.floor(points.length / 2));
  return { earlier: avg(points.slice(0, mid).map((point) => point.value)), recent: avg(points.slice(mid).map((point) => point.value)) };
}

function bandFor(age: number | null, sex: NutritionSex | null): { p25: number; p75: number } | null {
  if (age == null || sex == null || age < 20 || age > 79) return null;
  const rows = sex === 'female' ? WOMEN : MEN;
  return rows.find((row) => age <= row.maxAge) ?? null;
}

function rateVo2(value: number, band: { p25: number; p75: number }): FitnessLevel {
  if (value < band.p25) return 'Developing';
  if (value < band.p75) return 'Steady';
  return 'Strong';
}

function decade(age: number): string {
  return `${Math.floor(age / 10) * 10}s`;
}

function sexWord(sex: NutritionSex): string {
  return sex === 'female' ? 'women' : 'men';
}

function levelTone(level: FitnessLevel): FitnessTone {
  return level === 'Developing' ? 'watch' : 'good';
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function buildFitnessSnapshot(input: FitnessSnapshotInput): FitnessSnapshot {
  const today = input.today;
  const vo2 = dayValue(input.health, 'vo2_max', today, 56);
  const resting = dayValue(input.health, 'resting_heart_rate', today, 56);
  const hrv = dayValue(input.health, 'hrv_sdnn', today, 56);
  const healthSleep = dayValue(input.health, 'sleep_hours', today, 56);
  const sleep = healthSleep.length
    ? healthSleep
    : (input.sleep ?? [])
      .filter((row) => row.day <= today && row.day >= shiftDay(today, -55) && row.hours > 0)
      .map((row) => ({ day: row.day, value: row.hours }));
  const walking = dayValue(input.health, 'walking_heart_rate', today, 56);
  const recoveryDrop = dayValue(input.health, 'heart_rate_recovery', today, 56);
  const weekStart = shiftDay(today, -6);
  const workoutMinutes = sumKind(input.health, 'workout_minutes', weekStart, today);
  const mixWeek = sumKind(input.health, 'strength_minutes', weekStart, today)
    + sumKind(input.health, 'cardio_minutes', weekStart, today)
    + sumKind(input.health, 'other_minutes', weekStart, today);
  const minutes = workoutMinutes > 0 ? workoutMinutes : mixWeek;
  const monthStart = shiftDay(today, -27);
  const strength = sumKind(input.health, 'strength_minutes', monthStart, today);
  const cardioMin = sumKind(input.health, 'cardio_minutes', monthStart, today);
  const other = sumKind(input.health, 'other_minutes', monthStart, today);
  const mixTotal = strength + cardioMin + other;
  const restingSplit = halves(resting);
  const sleepSplit = halves(sleep);
  const hrvSplit = halves(hrv);
  const rhrUp = restingSplit.earlier != null && restingSplit.recent != null && restingSplit.recent - restingSplit.earlier >= 5;
  const sleepDown = sleepSplit.earlier != null && sleepSplit.recent != null && sleepSplit.earlier - sleepSplit.recent >= 0.5;
  const easier = rhrUp && sleepDown;

  const latestVo2 = vo2.length ? vo2[vo2.length - 1]?.value ?? null : null;
  const band = latestVo2 != null ? bandFor(input.goalAge, input.goalSex) : null;
  const vo2Level = latestVo2 != null && band ? rateVo2(latestVo2, band) : null;
  const fallback = vo2Level ? null : fallbackLevel(minutes, input.scheduleWeekMinutes, restingSplit);
  const level = vo2Level ?? fallback;

  const levelWords = levelWordsFor({
    level,
    vo2: latestVo2,
    band: Boolean(band),
    age: input.goalAge,
    sex: input.goalSex,
    minutes,
    schedule: input.scheduleWeekMinutes,
    rhrUp,
    walking: walking.length ? walking[walking.length - 1]?.value ?? null : null,
  });

  const cardio = latestVo2 == null ? null : {
    centre: String(round1(latestVo2)),
    unit: 'ml',
    fill: band ? Math.max(0.08, Math.min(1, (latestVo2 - band.p25) / (band.p75 - band.p25))) : 0.5,
    status: vo2Level ?? 'No age or sex',
    tone: vo2Level ? levelTone(vo2Level) : 'info' as const,
    words: levelWords,
    trend: vo2.slice(-8).map((point) => round1(point.value)),
  };

  const restingTrend = resting.length >= 2 ? {
    label: 'Resting heart rate',
    words: restingWords(restingSplit),
    tone: rhrUp ? 'watch' as const : 'good' as const,
    points: resting.slice(-8).map((point) => Math.round(point.value)),
  } : null;

  const aim = input.scheduleWeekMinutes && input.scheduleWeekMinutes > 0 ? input.scheduleWeekMinutes : 150;
  const minutesRing = minutes > 0 || input.scheduleWeekMinutes ? {
    centre: String(Math.round(minutes)),
    unit: 'min',
    fill: Math.max(0, Math.min(1, minutes / aim)),
    status: minutes >= aim * 0.9 ? 'On track' : 'Short',
    tone: minutes >= aim * 0.9 ? 'good' as const : 'watch' as const,
    words: minutesWords(minutes, input.scheduleWeekMinutes),
  } : null;

  const weeks = mixWeeks(input.health, today);
  const mix = weeks.some((week) => week.strength + week.cardio + week.other > 0)
    ? { weeks, words: mixWords(strength, cardioMin, other) }
    : null;

  const recovery = recoveryView({
    restingSplit,
    sleepSplit,
    hrvSplit,
    rhrUp,
    sleepDown,
    drop: recoveryDrop.length ? recoveryDrop[recoveryDrop.length - 1]?.value ?? null : null,
    hasResting: resting.length >= 2,
    hasSleep: sleep.length >= 2,
    hasHrv: hrv.length >= 2,
  });

  const recommendations = recommend({
    goal: input.goal,
    easier,
    strength,
    cardio: cardioMin,
    total: mixTotal,
    minutes,
    schedule: input.scheduleWeekMinutes,
    hasWork: minutes > 0 || mixTotal > 0,
  });

  const missing = missingLine({
    permission: input.permission,
    hasVo2: latestVo2 != null,
    hasAgeSex: input.goalAge != null && input.goalSex != null,
    hasMix: mix != null,
    hasWork: minutes > 0 || mixTotal > 0,
    hasLevel: level != null,
  });

  const contextLine = contextFrom({
    level,
    vo2: latestVo2,
    minutes,
    mixWords: mix?.words ?? null,
    recovery: recovery?.words ?? null,
    recommendation: recommendations.find((item) => item.forFocus)?.text ?? recommendations[0]?.text ?? null,
  });

  return {
    level,
    levelWords,
    estimate: ESTIMATE,
    missing,
    cardio,
    resting: restingTrend,
    minutes: minutesRing,
    mix,
    recovery,
    recommendations,
    contextLine,
  };
}

/** Lines the Health Plan may copy into this week's focus. Never a shorter week. */
export function fitnessFocusLines(input: FitnessSnapshotInput): string[] {
  return buildFitnessSnapshot(input).recommendations.filter((item) => item.forFocus).map((item) => item.text).slice(0, 2);
}

function fallbackLevel(
  minutes: number,
  schedule: number | null,
  resting: { earlier: number | null; recent: number | null },
): FitnessLevel | null {
  const delta = resting.earlier != null && resting.recent != null ? resting.recent - resting.earlier : null;
  if (minutes <= 0 && delta == null) return null;
  const rhrUp = delta != null && delta >= 5;
  const rhrOk = delta == null || delta < 3;
  const underGuideline = minutes < 75;
  const underSchedule = schedule != null && minutes < schedule * 0.6;
  const meeting = minutes >= 150 && (schedule == null || minutes >= schedule * 0.9);
  if (meeting && rhrOk && delta != null) return 'Strong';
  if (rhrUp || (underGuideline && (schedule == null || underSchedule))) return 'Developing';
  return 'Steady';
}

function levelWordsFor(input: {
  level: FitnessLevel | null;
  vo2: number | null;
  band: boolean;
  age: number | null;
  sex: NutritionSex | null;
  minutes: number;
  schedule: number | null;
  rhrUp: boolean;
  walking: number | null;
}): string {
  if (input.vo2 != null && input.band && input.level && input.age != null && input.sex) {
    const place = input.level === 'Developing'
      ? 'below the middle of a published range'
      : input.level === 'Strong'
        ? 'above the middle of a published range'
        : 'in the middle of a published range';
    return `Cardio fitness is about ${round1(input.vo2)}. For ${sexWord(input.sex)} in their ${decade(input.age)}, that sits ${place}.`;
  }
  if (input.vo2 != null && !input.band) {
    return `Cardio fitness is about ${round1(input.vo2)}. Add age and sex on Nutrition for a level.`;
  }
  if (!input.level) return 'Not enough readings yet for a level.';
  const minutesBit = input.minutes > 0 ? `${Math.round(input.minutes)} active minutes this week` : 'no active minutes logged this week';
  const heartBit = input.rhrUp ? 'Resting heart rate is up on your earlier readings.' : 'Resting heart rate is not up on your earlier readings.';
  const scheduleBit = input.schedule ? ` Your schedule is about ${Math.round(input.schedule)} min.` : '';
  const walkingBit = input.walking != null ? ` Walking heart rate lately is about ${Math.round(input.walking)} bpm.` : '';
  return `${input.level}. This uses resting heart rate and ${minutesBit}.${scheduleBit} ${heartBit}${walkingBit}`.replace(/\s+/g, ' ').trim();
}

function restingWords(split: { earlier: number | null; recent: number | null }): string {
  if (split.earlier == null || split.recent == null) return 'Resting heart rate is logged.';
  const delta = split.recent - split.earlier;
  if (delta >= 5) return 'Resting heart rate is above your earlier readings.';
  if (delta <= -3) return 'Resting heart rate is lower than your earlier readings.';
  return 'Resting heart rate is close to your earlier readings.';
}

function minutesWords(minutes: number, schedule: number | null): string {
  const guideline = 'The activity guideline is 150 min a week.';
  if (schedule && schedule > 0) {
    return `${Math.round(minutes)} min this week. Your schedule is about ${Math.round(schedule)} min. ${guideline}`;
  }
  return `${Math.round(minutes)} min this week. ${guideline}`;
}

function mixWeeks(samples: readonly FitnessSample[], today: string): FitnessWeekMix[] {
  const weeks: FitnessWeekMix[] = [];
  for (let index = 7; index >= 0; index -= 1) {
    const end = shiftDay(today, -index * 7);
    const start = shiftDay(end, -6);
    weeks.push({
      label: index === 0 ? 'Now' : `${index}w`,
      strength: Math.round(sumKind(samples, 'strength_minutes', start, end)),
      cardio: Math.round(sumKind(samples, 'cardio_minutes', start, end)),
      other: Math.round(sumKind(samples, 'other_minutes', start, end)),
    });
  }
  const first = weeks.findIndex((week) => week.strength + week.cardio + week.other > 0);
  return first <= 0 ? weeks : weeks.slice(first);
}

function mixWords(strength: number, cardio: number, other: number): string {
  const total = strength + cardio + other;
  if (total <= 0) return 'No split of strength and cardio yet.';
  const share = (part: number) => Math.round((part / total) * 100);
  const leader = strength >= cardio && strength >= other ? 'strength' : cardio >= other ? 'cardio' : 'other';
  return `Recent weeks are mostly ${leader}. Strength ${share(strength)}%, cardio ${share(cardio)}%, other ${share(other)}%.`;
}

function recoveryView(input: {
  restingSplit: { earlier: number | null; recent: number | null };
  sleepSplit: { earlier: number | null; recent: number | null };
  hrvSplit: { earlier: number | null; recent: number | null };
  rhrUp: boolean;
  sleepDown: boolean;
  drop: number | null;
  hasResting: boolean;
  hasSleep: boolean;
  hasHrv: boolean;
}): FitnessSnapshot['recovery'] {
  if (!input.hasResting && !input.hasSleep && !input.hasHrv && input.drop == null) return null;
  const hrvDown = input.hrvSplit.earlier != null && input.hrvSplit.recent != null && input.hrvSplit.earlier - input.hrvSplit.recent >= 5;
  const dropBit = input.drop != null ? ` After a session, heart rate fell about ${Math.round(input.drop)} bpm in a minute.` : '';
  if (input.rhrUp && input.sleepDown) {
    return {
      status: 'Watch',
      tone: 'watch',
      words: `Recovery looks lighter than your usual. Resting heart rate is up and sleep is down.${dropBit}`,
    };
  }
  if (input.rhrUp) {
    return { status: 'Watch', tone: 'watch', words: `Resting heart rate is above your usual.${dropBit}` };
  }
  if (hrvDown && input.hasHrv) {
    return { status: 'Watch', tone: 'watch', words: `Heart rate variability is below your usual.${dropBit}` };
  }
  if (input.sleepDown) {
    return { status: 'Watch', tone: 'watch', words: `Sleep is below your earlier readings.${dropBit}` };
  }
  if (input.hasResting || input.hasSleep || input.hasHrv) {
    return { status: 'On track', tone: 'good', words: `Recovery looks usual for you.${dropBit}` };
  }
  return { status: 'Note', tone: 'info', words: `Heart rate recovery is about ${Math.round(input.drop ?? 0)} bpm.${dropBit}`.replace(/\s+/g, ' ') };
}

function recommend(input: {
  goal: NutritionGoal | null;
  easier: boolean;
  strength: number;
  cardio: number;
  total: number;
  minutes: number;
  schedule: number | null;
  hasWork: boolean;
}): FitnessRecommendation[] {
  const lines: FitnessRecommendation[] = [];
  const add = (text: string, forFocus: boolean) => {
    if (lines.length >= 3) return;
    if (/runna|mileage|\b5k\b|\b10k\b|progressive distance|fewer session|drop a session|crash/i.test(text)) return;
    if (lines.some((item) => item.text === text)) return;
    lines.push({ id: `fit-${lines.length + 1}`, text, forFocus });
  };
  if (input.easier && input.hasWork) {
    add('Keep the sessions you already do, and make this an easier week.', true);
    return lines;
  }
  const cardioShare = input.total > 0 ? input.cardio / input.total : null;
  const strengthShare = input.total > 0 ? input.strength / input.total : null;
  const goal = input.goal;
  if (goal === 'lose_fat_build_muscle' && cardioShare != null && cardioShare < 0.2 && input.strength > input.cardio && input.total >= 30) {
    add('Add one easy cardio session beside the strength work you already do.', true);
  } else if (goal === 'lose_fat_build_muscle' && strengthShare != null && strengthShare < 0.2 && input.cardio > input.strength && input.total >= 30) {
    add('Add one strength session beside the work you already do.', true);
  } else if ((goal === 'increase' || goal === 'body_builder') && strengthShare != null && strengthShare < 0.25 && input.total >= 30) {
    add('Add one strength session beside the work you already do.', true);
  } else if ((goal === 'elite_heavy_boxer' || goal === 'elite_middle_boxer') && cardioShare != null && cardioShare < 0.2 && input.total >= 30) {
    add('Add one short conditioning session beside the boxing you already do.', true);
  } else if (goal === 'lose_weight' && input.minutes > 0 && input.minutes < 150 && (input.schedule == null || input.minutes < input.schedule)) {
    add('Add one session you already know, and keep every session you already do.', true);
  } else if (goal === 'elite_runner' && input.hasWork) {
    add('Hold the sessions you already do, and keep one of them easy.', true);
  }
  if (!lines.length && input.hasWork) add('Hold the sessions you already do.', false);
  return lines;
}

function missingLine(input: {
  permission: 'denied' | 'unknown';
  hasVo2: boolean;
  hasAgeSex: boolean;
  hasMix: boolean;
  hasWork: boolean;
  hasLevel: boolean;
}): string | null {
  if (input.permission === 'denied' && !input.hasLevel && !input.hasWork) {
    return 'Apple Health access is off. Turn on Workouts, Heart, and Cardio Fitness in Settings > Health > Data Access & Devices > Charioteer.';
  }
  const parts: string[] = [];
  if (input.permission === 'denied') {
    parts.push('Apple Health access is off, so new readings will not arrive.');
  }
  if (!input.hasVo2) parts.push('Cardio fitness appears when the watch has a VO2 max reading.');
  if (input.hasVo2 && !input.hasAgeSex) parts.push('Age and sex on Nutrition turn that reading into a level.');
  if (!input.hasMix && input.hasWork) parts.push('A sync on iPhone keeps strength and cardio apart.');
  if (!input.hasWork && !input.hasLevel && input.permission !== 'denied') {
    parts.push('Connect Apple Health on iPhone, or log resting heart rate and workouts.');
  }
  if (!parts.length) return null;
  return parts.slice(0, 2).join(' ');
}

function contextFrom(input: {
  level: FitnessLevel | null;
  vo2: number | null;
  minutes: number;
  mixWords: string | null;
  recovery: string | null;
  recommendation: string | null;
}): string | null {
  if (!input.level && input.minutes <= 0 && !input.mixWords && !input.recovery) return null;
  const bits = ['Fitness snapshot, an estimate, not a medical assessment.'];
  if (input.level) bits.push(`Level ${input.level}${input.vo2 != null ? `, cardio fitness about ${round1(input.vo2)}` : ''}.`);
  if (input.minutes > 0) bits.push(`${Math.round(input.minutes)} active minutes this week.`);
  if (input.mixWords) bits.push(input.mixWords);
  if (input.recovery) bits.push(input.recovery.replace(/\s+/g, ' '));
  if (input.recommendation) bits.push(input.recommendation);
  bits.push('Check with a doctor before big changes.');
  return bits.join(' ').replace(/\s+/g, ' ').trim().slice(0, 500);
}
