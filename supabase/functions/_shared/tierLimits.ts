/**
 * Subscription tiers and AI caps. One place to change the numbers.
 * Worst case assumes Apple's 30% and a max-length model call.
 * Day and month boundaries are Europe/London.
 * A free trial uses the limits of the plan being tried.
 */

export const YEARLY_PRODUCT_ID = 'Sta';
export const MONTHLY_PRODUCT_ID = 'charioteer.monthly';
export const PRO_PRODUCT_ID = 'charioteer.pro.monthly';
export const UNLIMITED_PRODUCT_ID = 'charioteer.unlimited.monthly';

export const SUBSCRIPTION_PRODUCT_IDS = [
  YEARLY_PRODUCT_ID,
  MONTHLY_PRODUCT_ID,
  PRO_PRODUCT_ID,
  UNLIMITED_PRODUCT_ID,
] as const;

export type Tier = 'standard' | 'pro' | 'max';

export type UsageKind = 'coach' | 'meal' | 'plan';

export const PRODUCT_TIER: Record<(typeof SUBSCRIPTION_PRODUCT_IDS)[number], Tier> = {
  [YEARLY_PRODUCT_ID]: 'standard',
  [MONTHLY_PRODUCT_ID]: 'standard',
  [PRO_PRODUCT_ID]: 'pro',
  [UNLIMITED_PRODUCT_ID]: 'max',
};

export const TIER_LIMITS: Record<Tier, Record<UsageKind, { day: number; month: number }>> = {
  standard: { coach: { day: 20, month: 120 }, meal: { day: 6, month: 90 }, plan: { day: 1, month: 4 } },
  pro: { coach: { day: 40, month: 300 }, meal: { day: 10, month: 150 }, plan: { day: 2, month: 10 } },
  max: { coach: { day: 150, month: 1500 }, meal: { day: 30, month: 450 }, plan: { day: 5, month: 30 } },
};

/** Cap on every Grok chat completion, including low-reasoning calls. */
export const AI_MAX_TOKENS = 1500;

export const CRISIS_STATIC_REPLY = [
  'If you are thinking about suicide or self-harm, call the Samaritans free on 116 123, at any hour.',
  'Call 999 if you are in immediate danger.',
  'If you might be in alcohol withdrawal, contact your GP or call NHS 111, and call 999 in an emergency.',
  'This note is the helpline signpost. It is not a reply from the coach.',
].join(' ');

export function tierForProduct(productId: string | null | undefined): Tier | null {
  if (!productId) return null;
  return PRODUCT_TIER[productId as keyof typeof PRODUCT_TIER] ?? null;
}

export function isSubscriptionProduct(productId: string | null | undefined): productId is string {
  return tierForProduct(productId) != null;
}

/** Standard yearly, Standard monthly, Pro, Max. Unknown ids are left out. */
export function orderedPlanIds(ids: readonly string[]): string[] {
  const present = new Set(ids);
  return SUBSCRIPTION_PRODUCT_IDS.filter((id) => present.has(id));
}

export function defaultPlanId(ids: readonly string[]): string | null {
  return orderedPlanIds(ids)[0] ?? null;
}

export function tierIncludedLine(tier: Tier): string {
  const day = TIER_LIMITS[tier].coach.day;
  if (tier === 'pro') return `Up to ${day} a day`;
  return `Up to ${day} coach messages a day`;
}

export function tierDisplayName(tier: Tier): string {
  if (tier === 'pro') return 'Pro';
  if (tier === 'max') return 'Max';
  return 'Standard';
}

export function upgradeTier(tier: Tier): Tier | null {
  if (tier === 'standard') return 'pro';
  if (tier === 'pro') return 'max';
  return null;
}

export function londonDayKey(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function londonMonthStart(day: string): string {
  return `${day.slice(0, 7)}-01`;
}

/** First instant the London calendar day changes. */
export function nextLondonMidnight(now: Date): Date {
  return nextLondonChange(now, (instant) => londonDayKey(instant) !== londonDayKey(now));
}

/** First instant the London calendar month changes. */
export function nextLondonMonth(now: Date): Date {
  const month = londonDayKey(now).slice(0, 7);
  return nextLondonChange(now, (instant) => londonDayKey(instant).slice(0, 7) !== month, 32);
}

function nextLondonChange(now: Date, changed: (instant: Date) => boolean, horizonDays = 2): Date {
  let lo = now.getTime();
  let hi = now.getTime() + horizonDays * 24 * 60 * 60 * 1000;
  while (hi - lo > 1000) {
    const mid = Math.floor((lo + hi) / 2);
    if (changed(new Date(mid))) hi = mid;
    else lo = mid;
  }
  return new Date(hi);
}

export type AllowanceDecision =
  | { action: 'allow'; tier: Tier }
  | { action: 'skip' }
  | { action: 'crisis_static' }
  | { action: 'subscription_required' }
  | {
    action: 'limit_reached';
    tier: Tier;
    limit: number;
    used: number;
    window: 'day' | 'month';
    resetsAt: string;
  };

/**
 * Entitlement and cap decision before a model call.
 * Enforcement off skips the check. A crisis with no subscription or no remaining
 * allowance returns the static helplines and does not call the model.
 */
export function decideAllowance(input: {
  enforced: boolean;
  crisis: boolean;
  tier: Tier | null;
  dayCount: number;
  monthCount: number;
  kind: UsageKind;
  now: Date;
}): AllowanceDecision {
  if (!input.enforced) return { action: 'skip' };
  const limits = input.tier ? TIER_LIMITS[input.tier][input.kind] : null;
  const dayOver = limits != null && input.dayCount >= limits.day;
  const monthOver = limits != null && input.monthCount >= limits.month;
  if (input.crisis && (input.tier == null || dayOver || monthOver)) return { action: 'crisis_static' };
  if (input.tier == null || limits == null) return { action: 'subscription_required' };
  if (dayOver) {
    return {
      action: 'limit_reached',
      tier: input.tier,
      limit: limits.day,
      used: input.dayCount,
      window: 'day',
      resetsAt: nextLondonMidnight(input.now).toISOString(),
    };
  }
  if (monthOver) {
    return {
      action: 'limit_reached',
      tier: input.tier,
      limit: limits.month,
      used: input.monthCount,
      window: 'month',
      resetsAt: nextLondonMonth(input.now).toISOString(),
    };
  }
  return { action: 'allow', tier: input.tier };
}

export function entitlementEnforced(flag: string | undefined): boolean {
  return flag !== 'false';
}

export function voiceEnabled(flag: string | undefined): boolean {
  return flag === 'true';
}

export function usageNearlyFull(used: number, limit: number): boolean {
  if (!(limit > 0) || !(used > 0)) return false;
  return used / limit > 0.8;
}

export function limitReachedMessage(input: {
  tier: Tier;
  window: 'day' | 'month';
  resetsAt: string;
}): string {
  const name = tierDisplayName(input.tier);
  const next = upgradeTier(input.tier);
  const when = input.window === 'day' ? 'midnight' : 'the start of next month';
  const period = input.window === 'day' ? "today's limit" : "this month's limit";
  if (!next) return `You've reached ${period} on ${name}. It resets at ${when}.`;
  return `You've reached ${period} on ${name}. It resets at ${when}. Upgrade to ${tierDisplayName(next)} for more.`;
}

export function subscriptionRequiredMessage(): string {
  return 'A subscription is needed for the coach, meal estimates, and health plans. You can start a free trial.';
}
