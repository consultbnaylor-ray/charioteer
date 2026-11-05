import { formatUkCompactDay } from '@/domain/healthInsights';
import {
  TIER_LIMITS,
  londonDayKey,
  nextLondonMonth,
  tierDisplayName,
  upgradeTier,
  type Tier,
  type UsageKind,
} from '@/domain/tierLimits';

export type AiUsageCounts = Record<UsageKind, number>;

export const EMPTY_AI_USAGE: AiUsageCounts = { coach: 0, meal: 0, plan: 0 };

/** A nudge starts when this many or fewer remain in the month. */
export const LOW_CREDIT_LEFT = 5;

const CREDIT_KINDS: readonly UsageKind[] = ['coach', 'meal', 'plan'];

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

export function creditsLeft(tier: Tier | null, usage: AiUsageCounts, kind: UsageKind): number | null {
  if (!tier) return null;
  return left(usage[kind], TIER_LIMITS[tier][kind].month);
}

function kindName(kind: UsageKind, count: number): string {
  if (kind === 'coach') return count === 1 ? '1 coach message' : `${count} coach messages`;
  if (kind === 'meal') return count === 1 ? '1 meal read' : `${count} meal reads`;
  return count === 1 ? '1 plan refresh' : `${count} plan refreshes`;
}

/** Next plan up. No plan offers the paywall. Max has no higher tier. */
export function creditUpgradeLabel(tier: Tier | null): string | null {
  if (!tier) return 'See plans';
  const next = upgradeTier(tier);
  if (!next) return null;
  return `Upgrade to ${tierDisplayName(next)}`;
}

/** True when this feature's monthly allowance is used up. A missing plan is not a used-up allowance. */
export function creditsExhausted(tier: Tier | null, usage: AiUsageCounts, kind?: UsageKind): boolean {
  if (!tier) return false;
  const kinds = kind ? [kind] : CREDIT_KINDS;
  return kinds.some((item) => creditsLeft(tier, usage, item) === 0);
}

/** Quiet line when 1 to 5 remain. Zero is the upgrade, not this nudge. */
export function creditNudge(tier: Tier | null, usage: AiUsageCounts, kind?: UsageKind): string | null {
  if (!tier) return null;
  const kinds = kind ? [kind] : CREDIT_KINDS;
  const low = kinds.flatMap((item) => {
    const remaining = creditsLeft(tier, usage, item);
    if (remaining == null || remaining <= 0 || remaining > LOW_CREDIT_LEFT) return [];
    return [kindName(item, remaining)];
  });
  if (!low.length) return null;
  return `Running low: ${low.join(', ')} left this month.`;
}

/** The bucket next to one credit-using button. */
export function aiCreditKindLine(tier: Tier | null, usage: AiUsageCounts, kind: UsageKind, now = new Date()): string {
  const resets = formatUkCompactDay(londonDayKey(nextLondonMonth(now))).replace(/ \d{4}$/, '');
  if (!tier) return `AI credits: a plan sets this. Resets ${resets}.`;
  const limit = TIER_LIMITS[tier][kind].month;
  const name = kind === 'coach' ? 'coach' : kind === 'meal' ? 'meal reads' : 'plan refreshes';
  return `AI credits: ${left(usage[kind], limit)} of ${limit} ${name} left, resets ${resets}.`;
}
