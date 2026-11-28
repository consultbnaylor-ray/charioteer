/**
 * One answer for every way our xAI account can fail to give a reply:
 * no balance or a spending limit (402), our own rate limit (429), the provider
 * being down (5xx), a key that is not accepted (401, 403), or a call that
 * timed out or dropped.
 *
 * None of these is the person's fault, so none of them costs a credit.
 * The edge functions return the code below with a short, calm message.
 * Response bodies are read only to classify. They are never logged, and nor is the key.
 */
import { logAiBilling, xaiBillingRefusal } from './aiBilling.ts';

/** The response code the phone reads to show a calm message instead of a failure. */
export const AI_UNAVAILABLE_CODE = 'ai_unavailable';

/** Older phones read this code for a billing refusal. The phone still accepts it. */
export const LEGACY_AI_BILLING_CODE = 'provider_billing';

export type AiUnavailableReason = 'billing' | 'rate_limit' | 'server' | 'timeout' | 'network' | 'key';

export type XaiFailure = number | 'timeout' | 'network' | null | undefined;

/**
 * Why a call gave no usable answer, or null when it is not our provider's problem
 * (a 400 or 422 means the request itself was wrong, and stays a normal failure).
 */
export function classifyXaiFailure(status: XaiFailure, bodyText?: string | null): AiUnavailableReason | null {
  if (status === 'timeout') return 'timeout';
  if (status === 'network') return 'network';
  if (typeof status !== 'number') return null;
  if (xaiBillingRefusal(status, bodyText)) return 'billing';
  if (status === 429) return 'rate_limit';
  if (status === 408 || status === 504) return 'timeout';
  if (status >= 500) return 'server';
  if (status === 401 || status === 403) return 'key';
  return null;
}

/** Maps a thrown fetch error to a failure the classifier understands. */
export function xaiFailureFromError(error: unknown): 'timeout' | 'network' {
  const name = error instanceof Error ? error.name : '';
  return name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'network';
}

/** Grep marker for the edge logs. One line per failed call, no secrets. */
export const AI_UNAVAILABLE_MARKER = 'AI_UNAVAILABLE';

export function logAiUnavailable(fn: string, reason: AiUnavailableReason, status: XaiFailure): void {
  console.error(`${AI_UNAVAILABLE_MARKER} ${fn} reason=${reason} status=${status ?? 'none'}. No user credit counted.`);
  // The older marker stays for a billing refusal, so an existing log search keeps working.
  if (reason === 'billing' && typeof status === 'number') logAiBilling(fn, status);
}

export type AiUnavailableFeature = 'coach' | 'meal' | 'reflect' | 'plan' | 'analysis' | 'voice';

/** What the person sees. Short, plain, and it never blames them. */
export const AI_UNAVAILABLE_MESSAGES: Record<AiUnavailableFeature, string> = {
  coach: 'Thumos is resting right now. Try again a bit later.',
  meal: 'Meal reading is resting right now. Logging by hand still works. Try again a bit later.',
  reflect: 'Thumos is resting right now, so this is a simple built-in note. Try again a bit later.',
  plan: 'The plan writer is resting right now, so this plan uses your figures without the AI. Try again a bit later.',
  analysis: 'Thumos is resting right now, so this is the built-in summary. Try again a bit later.',
  voice: 'Voice is resting right now. Text chat still works. Try again a bit later.',
};

/**
 * Thumos's line when no model answered. The helpline line from the scripted reply stays,
 * so the safety signpost is never lost.
 */
export const COACH_AI_UNAVAILABLE = [
  AI_UNAVAILABLE_MESSAGES.coach,
  'If you are in danger, call 999. For withdrawal, call NHS 111 or your GP. For suicidal thoughts, call the Samaritans on 116 123.',
].join(' ');

/** Fields added to a JSON reply that is otherwise normal, for a phone to show as a gentle note. */
export function unavailableNotice(feature: AiUnavailableFeature, reason: AiUnavailableReason): {
  code: typeof AI_UNAVAILABLE_CODE;
  reason: AiUnavailableReason;
  notice: string;
} {
  return { code: AI_UNAVAILABLE_CODE, reason, notice: AI_UNAVAILABLE_MESSAGES[feature] };
}
