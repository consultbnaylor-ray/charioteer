import { limitReachedMessage, subscriptionRequiredMessage, type Tier, type UsageKind } from '@/domain/tierLimits';

export type AiGateCode = 'limit_reached' | 'subscription_required';

let current: AiGateNotice | null = null;
const listeners = new Set<() => void>();

export function publishAiGate(notice: AiGateNotice | null) {
  current = notice;
  for (const listener of listeners) listener();
}

export function subscribeAiGate(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function aiGateSnapshot(): AiGateNotice | null {
  return current;
}

export class AiGateNotice extends Error {
  readonly code: AiGateCode;
  readonly tier: Tier | null;
  readonly window: 'day' | 'month' | null;
  readonly kind: UsageKind | null;
  readonly resetsAt: string | null;

  constructor(input: {
    code: AiGateCode;
    message: string;
    tier?: Tier | null;
    window?: 'day' | 'month' | null;
    kind?: UsageKind | null;
    resetsAt?: string | null;
  }) {
    super(input.message);
    this.name = 'AiGateNotice';
    this.code = input.code;
    this.tier = input.tier ?? null;
    this.window = input.window ?? null;
    this.kind = input.kind ?? null;
    this.resetsAt = input.resetsAt ?? null;
  }
}

/** Shown when a limit reply arrives without its plan, so the reset day is unknown. */
export const CREDITS_USED_FALLBACK = "You've used all your AI credits for this period. Upgrade your plan for more.";

export function isAiGateNotice(error: unknown): error is AiGateNotice {
  return error instanceof AiGateNotice || (error instanceof Error && error.name === 'AiGateNotice');
}

/**
 * The person's own allowance, read from a 402 or 429 body.
 * A limit message is written here from the plan, the window, and the reset time,
 * so older servers get the same "used your credits, upgrade for more" wording.
 */
export function aiGateFromBody(data: unknown): AiGateNotice | null {
  if (!data || typeof data !== 'object') return null;
  const body = data as { code?: unknown; tier?: unknown; window?: unknown; message?: unknown; resets_at?: unknown; kind?: unknown };
  if (body.code !== 'limit_reached' && body.code !== 'subscription_required') return null;
  const tier = body.tier === 'standard' || body.tier === 'pro' || body.tier === 'max' ? body.tier : null;
  const window = body.window === 'day' || body.window === 'month' ? body.window : null;
  const kind = body.kind === 'coach' || body.kind === 'meal' || body.kind === 'plan' ? body.kind : null;
  const resetsAt = typeof body.resets_at === 'string' ? body.resets_at : null;
  const served = typeof body.message === 'string' && body.message.trim() ? body.message.trim() : '';
  const message = body.code === 'subscription_required'
    ? served || subscriptionRequiredMessage()
    : tier && window
      ? limitReachedMessage({ tier, window, resetsAt: resetsAt ?? '', kind: kind ?? undefined })
      : CREDITS_USED_FALLBACK;
  return new AiGateNotice({ code: body.code, message, tier, window, kind, resetsAt });
}
