/**
 * Our xAI account itself refusing work: no balance left, or the team's spending limit reached.
 * That is not the person's fault and must not cost them a credit.
 * What the person sees, and the other ways a call can fail, are in aiUnavailable.ts.
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
