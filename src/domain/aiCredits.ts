import { formatUkCompactDay } from '@/domain/healthInsights';
import {
  TIER_LIMITS,
  londonDayKey,
  nextLondonMonth,
  tierDisplayName,
  type Tier,
  type UsageKind,
} from '@/domain/tierLimits';

export type AiUsageCounts = Record<UsageKind, number>;

export const EMPTY_AI_USAGE: AiUsageCounts = { coach: 0, meal: 0, plan: 0 };

function left(used: number, limit: number): number {
  return Math.max(0, limit - used);
}

/** One line for the plan totals and what is left this London month. */
export function aiCreditSummary(tier: Tier | null, usage: AiUsageCounts, now = new Date()): string {
  const resets = formatUkCompactDay(londonDayKey(nextLondonMonth(now))).replace(/ \d{4}$/, '');
  if (!tier) {
    return `AI credits follow the plan. No plan is active on this account. A new month starts ${resets}.`;
  }
  const limits = TIER_LIMITS[tier];
  const coach = left(usage.coach, limits.coach.month);
  const meals = left(usage.meal, limits.meal.month);
  const plan = left(usage.plan, limits.plan.month);
  return `AI credits: coach ${coach} of ${limits.coach.month} left, meals ${meals} of ${limits.meal.month}, plan ${plan} of ${limits.plan.month}. Resets ${resets}. ${tierDisplayName(tier)}.`;
}

/** The bucket next to one credit-using button. */
export function aiCreditKindLine(tier: Tier | null, usage: AiUsageCounts, kind: UsageKind, now = new Date()): string {
  const resets = formatUkCompactDay(londonDayKey(nextLondonMonth(now))).replace(/ \d{4}$/, '');
  if (!tier) return `AI credits: a plan sets this. Resets ${resets}.`;
  const limit = TIER_LIMITS[tier][kind].month;
  const name = kind === 'coach' ? 'coach' : kind === 'meal' ? 'meal reads' : 'plan refreshes';
  return `AI credits: ${left(usage[kind], limit)} of ${limit} ${name} left, resets ${resets}.`;
}
