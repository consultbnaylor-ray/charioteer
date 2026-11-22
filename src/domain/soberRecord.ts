import { earnedMilestones, MILESTONES, milestoneReached, milestoneReachedOn, type Milestone, type MilestoneKey } from './milestones';
import { DAY_MS, soberElapsed } from './sober';

/**
 * Day counts used only to decide whether a finished stretch earned a badge.
 * The live streak still uses milestoneReached, which counts months and years
 * on the calendar. A slip stores daysKept, not a second start clock.
 */
const STRETCH_DAYS: Record<MilestoneKey, number> = {
  '24h': 1,
  '7d': 7,
  '30d': 30,
  '90d': 90,
  '6m': 183,
  '1y': 365,
};

export type KeptStretch = {
  daysKept: number;
  occurredAt?: string | null;
  previousStartedAt?: string | null;
};

export type SoberRecord = {
  streakDays: number;
  streakHours: number;
  /** Longest single stretch, including the one underway. */
  longestDays: number;
  /** Current streak plus every stretch a slip already kept. */
  totalDays: number;
  /** Badges from this stretch and from earlier ones. A slip does not clear them. */
  earned: ReadonlySet<MilestoneKey>;
  /** Next badge on the current streak. Null once a year is reached. */
  next: Milestone | null;
  /** 0 to 1 along the way to `next`. */
  nextFill: number;
  daysToNext: number | null;
};

/**
 * The current streak is the clock since the last start.
 * Total days and badges also count stretches that a slip already closed.
 */
export function soberRecord(startedAt: Date | null, stretches: readonly KeptStretch[], now: Date): SoberRecord {
  const elapsed = startedAt ? soberElapsed(startedAt, now) : null;
  const streakDays = elapsed?.days ?? 0;
  const pastDays = stretches.reduce((sum, stretch) => sum + Math.max(0, stretch.daysKept), 0);
  const longestDays = Math.max(streakDays, 0, ...stretches.map((stretch) => Math.max(0, stretch.daysKept)));
  const earned = new Set<MilestoneKey>();
  if (startedAt) {
    for (const milestone of earnedMilestones(startedAt, now)) earned.add(milestone.key);
  }
  for (const stretch of stretches) {
    for (const milestone of MILESTONES) {
      if (stretch.daysKept >= STRETCH_DAYS[milestone.key]) earned.add(milestone.key);
    }
  }
  const next = startedAt
    ? MILESTONES.find((milestone) => !milestoneReached(milestone.key, startedAt, now)) ?? null
    : MILESTONES[0] ?? null;
  const daysToNext = startedAt && next ? Math.max(0, Math.ceil((milestoneReachedOn(next.key, startedAt).getTime() - now.getTime()) / DAY_MS)) : null;
  const nextFill = fillToward(startedAt, next, now);
  return {
    streakDays,
    streakHours: elapsed?.hours ?? 0,
    longestDays,
    totalDays: streakDays + pastDays,
    earned,
    next,
    nextFill,
    daysToNext,
  };
}

function fillToward(startedAt: Date | null, next: Milestone | null, now: Date): number {
  if (!startedAt || !next) return 0;
  const target = milestoneReachedOn(next.key, startedAt).getTime();
  const span = target - startedAt.getTime();
  if (span <= 0) return 1;
  return Math.max(0, Math.min(1, (now.getTime() - startedAt.getTime()) / span));
}

/** Whole days of one stretch that sit inside a calendar month. */
export function stretchDaysInMonth(start: Date, end: Date, month: Date): number {
  const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);
  const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 1);
  const from = Math.max(start.getTime(), monthStart.getTime());
  const to = Math.min(end.getTime(), monthEnd.getTime());
  if (to <= from) return 0;
  return Math.floor((to - from) / DAY_MS);
}

export type MonthSoberDays = {
  days: number;
  resets: { on: string; daysKept: number }[];
};

/**
 * Sober days in the calendar month of `now`.
 * The open stretch counts up to today. A slip this month adds the days it
 * kept that also fell in the month, and is listed so the total is not a guess.
 */
export function soberDaysThisMonth(startedAt: Date | null, stretches: readonly KeptStretch[], now: Date): MonthSoberDays {
  const resets: { on: string; daysKept: number }[] = [];
  let days = startedAt ? stretchDaysInMonth(startedAt, now, now) : 0;
  for (const stretch of stretches) {
    if (!stretch.occurredAt || !stretch.previousStartedAt) continue;
    const occurred = new Date(stretch.occurredAt);
    const previous = new Date(stretch.previousStartedAt);
    if (Number.isNaN(occurred.getTime()) || Number.isNaN(previous.getTime())) continue;
    const inMonth = stretchDaysInMonth(previous, occurred, now);
    if (inMonth <= 0) continue;
    days += inMonth;
    resets.push({ on: stretch.occurredAt, daysKept: stretch.daysKept });
  }
  return { days, resets };
}
