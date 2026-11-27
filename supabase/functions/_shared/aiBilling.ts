/**
 * Our xAI account itself refusing work: no balance left, or the team's spending limit reached.
 * That is not the person's fault and must not cost them a credit.
 * Bodies are read only to classify. They are never logged, and nor is the key.
 */

/** Grep marker for the edge logs. One line per refused call, no secrets. */
export const AI_BILLING_MARKER = 'AI_BILLING';

const BILLING_WORDS = /\b(credits?|spending limit|billing|balance|insufficient funds|payment required)\b/i;

/** 402 always. 403 or 429 only when xAI's body says it is about credit or spend, not a rate limit. */
export function xaiBillingRefusal(status: number | string | null | undefined, bodyText?: string | null): boolean {
  if (status === 402) return true;
  if ((status === 403 || status === 429) && typeof bodyText === 'string' && BILLING_WORDS.test(bodyText)) return true;
  return false;
}

/** Reads at most a few KB of an error body for xaiBillingRefusal. Never throws. */
export async function xaiErrorText(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text.slice(0, 4000);
  } catch {
    return '';
  }
}

export function logAiBilling(fn: string, status: number | string): void {
  console.error(`${AI_BILLING_MARKER} ${fn} xAI HTTP ${status}: provider balance or spending limit. No user credit counted.`);
}

export type AiBillingFeature = 'coach' | 'meal' | 'reflect' | 'plan' | 'analysis' | 'voice';

/** What the person sees when our provider account refused. It never blames them. */
export const AI_BILLING_MESSAGES: Record<AiBillingFeature, string> = {
  coach: "The coach is temporarily unavailable. This isn't your fault and no credit was used. Please try again later.",
  meal: "Meal reading is temporarily unavailable. This isn't your fault and no credit was used. Please try again later, or type the meal in yourself.",
  reflect: "Thumos's reflection is temporarily unavailable, so this is a simple built-in one. This isn't your fault and no credit was used. Please try again later.",
  plan: "Thumos's plan writer is temporarily unavailable, so this plan was drafted on your figures without the AI. This isn't your fault and no credit was used. Please try again later.",
  analysis: "Thumos's analysis is temporarily unavailable, so this is the built-in summary. This isn't your fault and no credit was used. Please try again later.",
  voice: "Voice is temporarily unavailable. This isn't your fault and no credit was used. Please try again later.",
};

/** The response code the phone reads to show AI_BILLING_MESSAGES instead of a retry prompt. */
export const AI_BILLING_CODE = 'provider_billing';

/**
 * Thumos's line for a billing refusal. The helpline line from the scripted reply stays,
 * so the safety signpost is never lost.
 */
export const COACH_BILLING_UNAVAILABLE = [
  AI_BILLING_MESSAGES.coach,
  'If you are in danger, call 999. For withdrawal, call NHS 111 or your GP. For suicidal thoughts, call the Samaritans on 116 123.',
].join(' ');
