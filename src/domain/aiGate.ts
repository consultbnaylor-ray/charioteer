import { limitReachedMessage, subscriptionRequiredMessage, type Tier } from '@/domain/tierLimits';

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

  constructor(input: { code: AiGateCode; message: string; tier?: Tier | null; window?: 'day' | 'month' | null }) {
    super(input.message);
    this.name = 'AiGateNotice';
    this.code = input.code;
    this.tier = input.tier ?? null;
    this.window = input.window ?? null;
  }
}

export function aiGateFromBody(data: unknown): AiGateNotice | null {
  if (!data || typeof data !== 'object') return null;
  const body = data as { code?: unknown; tier?: unknown; window?: unknown; message?: unknown; resets_at?: unknown };
  if (body.code !== 'limit_reached' && body.code !== 'subscription_required') return null;
  const tier = body.tier === 'standard' || body.tier === 'pro' || body.tier === 'unlimited' ? body.tier : null;
  const window = body.window === 'day' || body.window === 'month' ? body.window : null;
  const message = typeof body.message === 'string' && body.message.trim()
    ? body.message
    : body.code === 'subscription_required'
      ? subscriptionRequiredMessage()
      : tier
        ? limitReachedMessage({ tier, window: window ?? 'day', resetsAt: typeof body.resets_at === 'string' ? body.resets_at : '' })
        : "You've reached today's limit. It resets at midnight.";
  return new AiGateNotice({ code: body.code, message, tier, window });
}
