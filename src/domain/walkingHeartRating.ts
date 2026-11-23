/**
 * Walking heart rate rating.
 * The age zones stay the Tanaka and ACSM maths. A figure under the moderate
 * zone is read with the other fitness figures already on the phone. A high
 * figure keeps the zone label. Session heart rate, resting heart rate, and
 * heart-rate recovery keep their own ratings.
 */

import { currentRestingHeartRate } from '@/domain/currentResting';
import { currentVo2Max } from '@/domain/currentVo2';
import { publishedCardioBand } from '@/domain/fitnessSnapshot';
import { CMO_MODERATE_MINUTES_WEEK, CMO_VIGOROUS_MINUTES_WEEK } from '@/domain/guidance';
import {
  NUNAN_SDNN_LOW,
  NUNAN_SDNN_MEAN,
  intensityZones,
  walkingHeartReading,
  zonePlace,
} from '@/domain/healthBands';
import type { NutritionSex } from '@/domain/nutrition';
import { STEP_60_LOW, STEP_AGE_UNKNOWN_LOW, STEP_UNDER_60_LOW } from '@/domain/trainingGuidance';

/** Same fair floor the steps card uses before its research range. */
const STEP_FAIR_FLOOR = 5000;
const HRV_FRESH_DAYS = 60;
const RMSSD_STRONG = 42;
const RMSSD_GOOD = 35;

const HIGH_TIP = 'If the walk felt hard and the number stays high, slow the pace and see whether it settles.';

const WORKOUT_KINDS = new Set([
  'workout_minutes',
  'strength_minutes',
  'cardio_minutes',
  'conditioning_minutes',
  'other_minutes',
]);

export type WalkingMarkerTone = 'strong' | 'good' | 'poor' | 'missing';

export type WalkingHeartInput = {
  age: number | null;
  sex: NutritionSex | null;
  vo2?: number | null;
  restingHr?: number | null;
  /** Garmin overnight RMSSD. Used ahead of Apple SDNN when a recent night exists. */
  hrvRmssd?: number | null;
  /** Apple SDNN. Used only when overnight RMSSD is absent. */
  hrvSdnn?: number | null;
  stepsPerDay?: number | null;
  /** Workout days in the selected period. Null when workouts are not stored. */
  workoutDays?: number | null;
  /** Vigorous minutes in the selected period. Null when that source is absent. */
  vigorousMinutes?: number | null;
  /** Active minutes in the selected period. Null when that source is absent. */
  activeMinutes?: number | null;
  windowDays?: number | null;
};

export type WalkingHeartVerdict = {
  label: 'Excellent' | 'Good' | 'Fair' | 'Poor' | 'Usual';
  where: string;
  band: { low: number; high: number } | null;
  tips: readonly string[];
  /** Marker names the sentence actually cites. */
  factors: readonly string[];
};

type Marker = {
  name: string;
  tone: WalkingMarkerTone;
  poor: string;
};

export function rateWalkingHeart(bpm: number, input: WalkingHeartInput): WalkingHeartVerdict {
  const rounded = Math.round(bpm);
  if (!(rounded > 0)) {
    return {
      label: 'Usual',
      where: 'No walking heart rate yet.',
      band: null,
      tips: [],
      factors: [],
    };
  }
  const zones = intensityZones(input.age);
  if (!zones) {
    return {
      label: 'Usual',
      where: `${rounded} bpm. Age is not set, so the moderate-zone approximation is not drawn.`,
      band: null,
      tips: [],
      factors: [],
    };
  }
  const place = zonePlace(rounded, zones);
  const zoneStatus = walkingHeartReading(rounded, input.age, null)?.status
    ?? `The approximate moderate zone is ${zones.moderateLow} to ${zones.moderateHigh} bpm. This is an approximation.`;
  const band = { low: zones.moderateLow, high: zones.moderateHigh };
  if (place !== 'under') {
    const label = place === 'moderate' || place === 'between' ? 'Good' : 'Fair';
    return {
      label,
      where: finishWhere(`Rated ${label} from the latest reading, ${rounded} bpm.`, zoneStatus),
      band,
      tips: label === 'Fair' ? [HIGH_TIP] : [],
      factors: [],
    };
  }
  const markers = fitnessMarkers(input);
  const supportive = markers.filter((marker) => marker.tone === 'strong' || marker.tone === 'good');
  const poor = markers.filter((marker) => marker.tone === 'poor');
  const strongCount = markers.filter((marker) => marker.tone === 'strong').length;
  const vo2Strong = markers.some((marker) => marker.name === 'VO2 max' && marker.tone === 'strong');
  const restingStrong = markers.some((marker) => marker.name === 'resting heart rate' && marker.tone === 'strong');
  const excellent = vo2Strong && restingStrong && strongCount >= 3 && poor.length === 0;
  const label = poor.length === 0 && supportive.length > 0
    ? excellent ? 'Excellent' : 'Good'
    : 'Fair';
  const factors = [...supportive, ...poor].map((marker) => marker.name);
  return {
    label,
    where: finishWhere(lowRatingLine(label, rounded, supportive, poor), zoneStatus),
    band,
    tips: [],
    factors,
  };
}

export type WalkingSignalInput = {
  today: string;
  windowStart: string;
  windowDays: number;
  age: number | null;
  sex: NutritionSex | null;
  samples: readonly { id?: string | null; kind?: string; value: number; recordedOn: string }[];
  userMetrics?: readonly { calendarDate: string; vo2Max: number | null }[];
  garminHrv?: readonly { calendarDate: string; lastNightAvgMs: number | null }[];
  garminResting?: readonly { calendarDate: string; restingHeartRateBpm: number | null }[];
  garminActivity?: readonly { day: string; vigorousMinutes: number | null }[];
  activeMinutes?: readonly { day: string; value: number }[];
};

/** The same VO2 and resting picks the analysis uses, plus HRV, steps, and workouts. */
export function collectWalkingContext(input: WalkingSignalInput): WalkingHeartInput {
  const vo2 = currentVo2Max({
    today: input.today,
    garmin: (input.userMetrics ?? []).map((row) => ({ day: row.calendarDate, value: row.vo2Max })),
    samples: input.samples,
  })?.value ?? null;
  const resting = currentRestingHeartRate({
    today: input.today,
    garmin: (input.garminResting ?? []).map((row) => ({ day: row.calendarDate, value: row.restingHeartRateBpm })),
    samples: input.samples,
  })?.value ?? null;
  const hrvRmssd = latestGarminHrv(input.garminHrv ?? [], input.today);
  const hrvSdnn = hrvRmssd == null ? latestKind(input.samples, 'hrv_sdnn', input.today) : null;
  return {
    age: input.age,
    sex: input.sex,
    vo2,
    restingHr: resting,
    hrvRmssd,
    hrvSdnn,
    stepsPerDay: stepsPerDay(input),
    workoutDays: workoutDays(input),
    vigorousMinutes: sumInWindow(input.garminActivity ?? [], input.windowStart, input.today, (row) => row.vigorousMinutes),
    activeMinutes: sumInWindow(input.activeMinutes ?? [], input.windowStart, input.today, (row) => row.value),
    windowDays: input.windowDays,
  };
}

function finishWhere(ratingLine: string, zoneStatus: string): string {
  return `${ratingLine} ${zoneStatus} Apple publishes no normal range for walking heart rate. Not medical advice.`;
}

function lowRatingLine(
  label: 'Excellent' | 'Good' | 'Fair',
  bpm: number,
  supportive: readonly Marker[],
  poor: readonly Marker[],
): string {
  const latest = `Rated ${label} from the latest reading, ${bpm} bpm`;
  if (label === 'Good' || label === 'Excellent') {
    return `${latest}, because ${supportivePhrase(supportive)}. A low walking heart rate usually means an efficient heart.`;
  }
  if (supportive.length === 0 && poor.length === 0) {
    return `${latest}. No other fitness data was available, so this stays a cautious rating. A low walking heart rate can be an easy walk or a fitter heart.`;
  }
  if (supportive.length === 0) {
    return `${latest}, because ${poorPhrase(poor)}. This stays a cautious rating.`;
  }
  return `${latest}. ${capital(supportivePhrase(supportive))}, and ${poorPhrase(poor)}, so this stays a cautious rating.`;
}

function supportivePhrase(markers: readonly Marker[]): string {
  const strong = markers.filter((marker) => marker.tone === 'strong').map((marker) => marker.name);
  const good = markers.filter((marker) => marker.tone === 'good').map((marker) => marker.name);
  const parts = [
    strong.length ? arePhrase(strong, 'strong') : null,
    good.length ? arePhrase(good, 'in a healthy range') : null,
  ].filter((part): part is string => part != null);
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return parts[0] ?? '';
}

function poorPhrase(markers: readonly Marker[]): string {
  return listPhrase(markers.map((marker) => marker.poor));
}

function fitnessMarkers(input: WalkingHeartInput): Marker[] {
  const markers: Marker[] = [];
  const resting = restingMarker(input.restingHr);
  const vo2 = vo2Marker(input.vo2, input.age, input.sex);
  const hrv = hrvMarker(input.hrvRmssd, input.hrvSdnn);
  const activity = activityMarker(input);
  if (resting) markers.push(resting);
  if (vo2) markers.push(vo2);
  if (hrv) markers.push(hrv);
  if (activity) markers.push(activity);
  return markers;
}

function restingMarker(bpm: number | null | undefined): Marker | null {
  if (bpm == null || !(bpm > 0)) return null;
  const rounded = Math.round(bpm);
  const tone: WalkingMarkerTone = rounded >= 40 && rounded <= 60
    ? 'strong'
    : rounded <= 80
      ? 'good'
      : 'poor';
  return { name: 'resting heart rate', tone, poor: 'your resting heart rate is outside the fit range' };
}

function vo2Marker(value: number | null | undefined, age: number | null, sex: NutritionSex | null): Marker | null {
  if (value == null || !(value > 0)) return null;
  const band = publishedCardioBand(age, sex);
  if (!band) return null;
  const tone: WalkingMarkerTone = value >= band.high ? 'strong' : value >= band.low ? 'good' : 'poor';
  return { name: 'VO2 max', tone, poor: 'your VO2 max is below the usual range for your age and sex' };
}

function hrvMarker(rmssd: number | null | undefined, sdnn: number | null | undefined): Marker | null {
  if (rmssd != null && rmssd > 0) {
    const tone: WalkingMarkerTone = rmssd >= RMSSD_STRONG ? 'strong' : rmssd >= RMSSD_GOOD ? 'good' : 'poor';
    return { name: 'heart rate variability', tone, poor: 'your heart rate variability is low' };
  }
  if (sdnn == null || !(sdnn > 0)) return null;
  const tone: WalkingMarkerTone = sdnn >= NUNAN_SDNN_MEAN ? 'strong' : sdnn >= NUNAN_SDNN_LOW ? 'good' : 'poor';
  return { name: 'heart rate variability', tone, poor: 'your heart rate variability is low' };
}

function activityMarker(input: WalkingHeartInput): Marker | null {
  const windowDays = input.windowDays != null && input.windowDays > 0 ? input.windowDays : 7;
  const signals: { name: string; tone: WalkingMarkerTone }[] = [];
  if (input.stepsPerDay != null && input.stepsPerDay > 0) {
    const floor = stepStrongFloor(input.age);
    const tone: WalkingMarkerTone = input.stepsPerDay >= floor
      ? 'strong'
      : input.stepsPerDay >= STEP_FAIR_FLOOR
        ? 'good'
        : 'poor';
    signals.push({ name: 'recent steps', tone });
  }
  if (input.workoutDays != null && input.workoutDays >= 0) {
    const perWeek = windowDays >= 7 ? (input.workoutDays / windowDays) * 7 : input.workoutDays;
    const tone: WalkingMarkerTone = windowDays < 7
      ? input.workoutDays >= 3 ? 'strong' : input.workoutDays >= 1 ? 'good' : 'poor'
      : perWeek >= 3 ? 'strong' : perWeek >= 2 ? 'good' : 'poor';
    signals.push({ name: 'recent workouts', tone });
  }
  const vigorous = supportiveMinutes(input.vigorousMinutes, CMO_VIGOROUS_MINUTES_WEEK, windowDays);
  if (vigorous) signals.push({ name: 'recent vigorous minutes', tone: vigorous });
  const active = supportiveMinutes(input.activeMinutes, CMO_MODERATE_MINUTES_WEEK, windowDays);
  if (active) signals.push({ name: 'recent active minutes', tone: active });
  if (signals.length === 0) return null;
  const tone: WalkingMarkerTone = signals.some((signal) => signal.tone === 'strong')
    ? 'strong'
    : signals.some((signal) => signal.tone === 'good')
      ? 'good'
      : 'poor';
  const named = signals.filter((signal) => signal.tone === tone);
  const name = named.length === 1 ? named[0]?.name ?? 'recent activity' : 'recent activity';
  const verb = pluralName(name) ? 'are' : 'is';
  return { name, tone, poor: `your ${name} ${verb} low` };
}

/** A short or empty minute total is left out. It does not count as a poor marker. */
function supportiveMinutes(minutes: number | null | undefined, weekly: number, windowDays: number): WalkingMarkerTone | null {
  if (minutes == null || !Number.isFinite(minutes) || minutes <= 0) return null;
  const target = weekly * (Math.max(windowDays, 1) / 7);
  if (minutes >= target) return 'strong';
  if (minutes >= target * 0.5) return 'good';
  return null;
}

function stepStrongFloor(age: number | null): number {
  if (age != null && age >= 60) return STEP_60_LOW;
  if (age != null && age < 60) return STEP_UNDER_60_LOW;
  return STEP_AGE_UNKNOWN_LOW;
}

function stepsPerDay(input: WalkingSignalInput): number | null {
  const byDay = new Map<string, number>();
  for (const sample of input.samples) {
    if (sample.kind !== 'steps' || !(sample.value > 0)) continue;
    const day = sample.recordedOn.slice(0, 10);
    if (day < input.windowStart || day > input.today) continue;
    byDay.set(day, Math.max(byDay.get(day) ?? 0, sample.value));
  }
  if (byDay.size === 0) return null;
  let total = 0;
  for (const value of byDay.values()) total += value;
  return total / byDay.size;
}

function workoutDays(input: WalkingSignalInput): number | null {
  let seen = false;
  const days = new Set<string>();
  for (const sample of input.samples) {
    if (!sample.kind || !WORKOUT_KINDS.has(sample.kind) || !(sample.value > 0)) continue;
    const day = sample.recordedOn.slice(0, 10);
    if (day > input.today) continue;
    seen = true;
    if (day >= input.windowStart) days.add(day);
  }
  return seen ? days.size : null;
}

function sumInWindow<T extends { day: string }>(
  rows: readonly T[],
  start: string,
  today: string,
  pick: (row: T) => number | null,
): number | null {
  const inside = rows.filter((row) => row.day >= start && row.day <= today && pick(row) != null);
  if (inside.length === 0) return null;
  return inside.reduce((sum, row) => sum + Math.max(0, pick(row) ?? 0), 0);
}

function latestGarminHrv(
  rows: readonly { calendarDate: string; lastNightAvgMs: number | null }[],
  today: string,
): number | null {
  let best: { day: string; value: number } | null = null;
  for (const row of rows) {
    if (row.lastNightAvgMs == null || !(row.lastNightAvgMs > 0)) continue;
    const day = row.calendarDate.slice(0, 10);
    if (day > today || daysBefore(today, day) > HRV_FRESH_DAYS) continue;
    if (!best || day >= best.day) best = { day, value: row.lastNightAvgMs };
  }
  return best?.value ?? null;
}

function latestKind(
  samples: readonly { kind?: string; value: number; recordedOn: string }[],
  kind: string,
  today: string,
): number | null {
  let best: { day: string; value: number } | null = null;
  for (const sample of samples) {
    if (sample.kind !== kind || !(sample.value > 0)) continue;
    const day = sample.recordedOn.slice(0, 10);
    if (day > today || daysBefore(today, day) > HRV_FRESH_DAYS) continue;
    if (!best || day >= best.day) best = { day, value: sample.value };
  }
  return best?.value ?? null;
}

function daysBefore(today: string, day: string): number {
  const start = Date.parse(`${day}T00:00:00Z`);
  const end = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return 9999;
  return Math.round((end - start) / 86_400_000);
}

function arePhrase(names: readonly string[], tail: string): string {
  const verb = names.length === 1 && !pluralName(names[0] ?? '') ? 'is' : 'are';
  return `your ${listPhrase(names)} ${verb} ${tail}`;
}

function pluralName(name: string): boolean {
  return /steps|workouts|minutes$/.test(name);
}

function listPhrase(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

function capital(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}
