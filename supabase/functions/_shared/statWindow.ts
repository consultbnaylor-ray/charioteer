import { londonDay, shiftDay } from './healthInsights.ts';

/** Day, seven days, or thirty days. Seven days is the shared default. */
export const STAT_PERIODS = ['day', '7', '30'] as const;
export type StatPeriod = (typeof STAT_PERIODS)[number];

export const STAT_PERIOD_LABEL: Record<StatPeriod, string> = {
  day: 'Day',
  '7': '7 days',
  '30': '30 days',
};

/**
 * A Day view before this hour in London has not had a fair chance.
 * 17 is 5pm, so a morning reading is not marked short.
 */
export const EARLY_DAY_HOUR = 17;

export function periodDayCount(period: StatPeriod): number {
  if (period === 'day') return 1;
  if (period === '30') return 30;
  return 7;
}

/** Rolling window ending on `today`. Seven days is today and the six days before it, not Monday to Sunday. */
export function rollingWindow(today: string, period: StatPeriod): {
  start: string;
  end: string;
  today: string;
  days: string[];
} {
  const count = periodDayCount(period);
  const start = shiftDay(today, -(count - 1));
  const days: string[] = [];
  for (let index = 0; index < count; index += 1) days.push(shiftDay(start, index));
  return { start, end: today, today, days };
}

/** A weekly target scaled to the period. Six sessions a week is 1 today, 6 in 7 days, and 26 in 30 days. */
export function scaledPeriodTarget(weekly: number, period: StatPeriod): number {
  return Math.round((weekly * periodDayCount(period)) / 7);
}

/** Ring unit for active minutes. */
export function minuteUnit(period: StatPeriod): string {
  if (period === 'day') return 'min today';
  if (period === '30') return 'min in last 30 days';
  return 'min in last 7 days';
}

/** "today", "the last 7 days", or "the last 30 days". */
export function periodPhrase(period: StatPeriod): string {
  if (period === 'day') return 'today';
  if (period === '30') return 'the last 30 days';
  return 'the last 7 days';
}

/** Opening of a progress sentence: "Today", "Last 7 days", or "Last 30 days". */
export function periodHeading(period: StatPeriod): string {
  if (period === 'day') return 'Today';
  if (period === '30') return 'Last 30 days';
  return 'Last 7 days';
}

export function londonHour(value: Date | string): number {
  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    hour: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0');
  return Number.isFinite(hour) ? hour : 0;
}

export function londonToday(now: Date | string = new Date()): string {
  return typeof now === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(now) ? now : londonDay(now);
}

/**
 * False on a Day view before 5pm London, and whenever the window has fewer than two logged days.
 * A Monday with one meal is not a short week.
 */
export function periodFairChance(input: {
  period: StatPeriod;
  loggedDays: number;
  now?: Date | string | null;
}): boolean {
  if (input.loggedDays < 2) return false;
  if (input.period === 'day') {
    if (input.now == null) return false;
    if (londonHour(input.now) < EARLY_DAY_HOUR) return false;
  }
  return true;
}

export type PaceWord = 'Early days' | 'On pace' | 'Watch' | 'Short' | 'On track' | 'Note';

export type PaceJudgement = {
  word: PaceWord;
  tone: 'good' | 'watch' | 'info';
  /** Early days and On pace are drawn in ink, with an icon and the word. */
  neutral: boolean;
};

/**
 * Watch and Short wait until the period has had a fair chance.
 * Meeting the mark early is On pace. Missing it early is Early days.
 */
export function paceJudgement(input: {
  period: StatPeriod;
  loggedDays: number;
  now?: Date | string | null;
  met: boolean;
  /** Used once the window is fair and the target is missed. */
  behind?: 'Watch' | 'Short';
}): PaceJudgement {
  const fair = periodFairChance(input);
  if (!fair) {
    if (input.met) return { word: 'On pace', tone: 'info', neutral: true };
    return { word: 'Early days', tone: 'info', neutral: true };
  }
  if (input.met) return { word: 'On track', tone: 'good', neutral: false };
  if (input.behind) return { word: input.behind, tone: 'watch', neutral: false };
  return { word: 'Note', tone: 'info', neutral: false };
}

/**
 * Protein follows the average, not a perfect run of days.
 * An average on the target is On pace. A short average with too little logging is Early days.
 */
export function proteinPace(input: {
  period: StatPeriod;
  loggedDays: number;
  now?: Date | string | null;
  average: number;
  target: number;
  hits: number;
}): PaceJudgement {
  const averageMeets = input.average >= input.target;
  const everyDay = input.hits === input.loggedDays && input.loggedDays > 0;
  const fair = periodFairChance(input);
  if (averageMeets && everyDay && fair) return { word: 'On track', tone: 'good', neutral: false };
  if (averageMeets) return { word: 'On pace', tone: 'info', neutral: true };
  if (!fair) return { word: 'Early days', tone: 'info', neutral: true };
  return { word: 'Watch', tone: 'watch', neutral: false };
}
