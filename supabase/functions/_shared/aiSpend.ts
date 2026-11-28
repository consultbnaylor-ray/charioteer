/**
 * What each xAI call costs us, and when to warn Ben.
 *
 * xAI returns the exact charge for every request as usage.cost_in_usd_ticks
 * (1 USD = 10,000,000,000 ticks), https://docs.x.ai/developers/cost-tracking .
 * When that is missing the cost is worked out from the token counts and the
 * rate card, https://docs.x.ai/docs/models , and an unknown model is priced high rather than low.
 *
 * The log holds the function, the plan tier, the model, token counts and the cost.
 * It never holds a user id, a prompt, a reply, a photo, or a key.
 */

export type AiSpendFunction =
  | 'thumos-chat'
  | 'gratitude-reflect'
  | 'health-plan'
  | 'health-plan-analyse'
  | 'estimate-meal';

export type XaiUsage = {
  inputTokens: number;
  outputTokens: number;
  /** The charge xAI reports, in USD. Null when the response did not carry one. */
  costUsd: number | null;
};

const TICKS_PER_USD = 10_000_000_000;

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}

/**
 * Reads the usage object of a chat completion, or of the last stream chunk.
 * Reasoning tokens are billed as output. Some responses fold them into completion_tokens
 * and some report them beside it, so output is the larger of completion_tokens and total minus prompt.
 */
export function parseXaiUsage(payload: unknown): XaiUsage | null {
  if (!payload || typeof payload !== 'object') return null;
  const usage = (payload as { usage?: unknown }).usage;
  if (!usage || typeof usage !== 'object') return null;
  const raw = usage as Record<string, unknown>;
  const input = count(raw.prompt_tokens ?? raw.input_tokens);
  const completion = count(raw.completion_tokens ?? raw.output_tokens);
  const total = count(raw.total_tokens);
  const output = Math.max(completion, total > input ? total - input : 0);
  const ticks = typeof raw.cost_in_usd_ticks === 'number' && raw.cost_in_usd_ticks >= 0 ? raw.cost_in_usd_ticks : null;
  if (input === 0 && output === 0 && ticks == null) return null;
  return { inputTokens: input, outputTokens: output, costUsd: ticks == null ? null : ticks / TICKS_PER_USD };
}

/** USD per million tokens, from https://docs.x.ai/docs/models (under 200k prompt tokens). */
export const XAI_RATE_CARD: Record<string, { input: number; output: number }> = {
  'grok-4.3': { input: 1.25, output: 2.5 },
  'grok-4.3-latest': { input: 1.25, output: 2.5 },
  'grok-4.20-0309-reasoning': { input: 1.25, output: 2.5 },
  'grok-4.20-0309-non-reasoning': { input: 1.25, output: 2.5 },
  'grok-4.5': { input: 2, output: 6 },
  'grok-4.6': { input: 2, output: 6 },
  'grok-4.7': { input: 2, output: 6 },
};

/** A model that is not on the card is priced like the dearest listed one, so spend is never understated. */
const UNKNOWN_MODEL_RATE = { input: 2, output: 6 };

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const rate = XAI_RATE_CARD[model] ?? UNKNOWN_MODEL_RATE;
  return (inputTokens * rate.input + outputTokens * rate.output) / 1_000_000;
}

export type AiSpendRow = {
  fn: AiSpendFunction;
  tier: 'standard' | 'pro' | 'max' | null;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  cost_source: 'xai' | 'estimated';
};

/** The row to store for one answered call. Null when there is no usage to record. */
export function spendRow(input: {
  fn: AiSpendFunction;
  tier: 'standard' | 'pro' | 'max' | null | undefined;
  model: string;
  usage: XaiUsage | null;
}): AiSpendRow | null {
  if (!input.usage) return null;
  const { inputTokens, outputTokens, costUsd } = input.usage;
  return {
    fn: input.fn,
    tier: input.tier ?? null,
    model: input.model.slice(0, 80),
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cost_usd: Number((costUsd ?? estimateCostUsd(input.model, inputTokens, outputTokens)).toFixed(6)),
    cost_source: costUsd == null ? 'estimated' : 'xai',
  };
}

type SpendInserter = {
  from(table: string): { insert(row: Record<string, unknown>): PromiseLike<{ error: { message?: string } | null }> };
};

/**
 * Stores one row. It never throws and is never waited on for the reply:
 * a missing table or a database blip must not turn an answer into a failure.
 */
export async function recordAiSpend(admin: SpendInserter, input: Parameters<typeof spendRow>[0]): Promise<void> {
  try {
    const row = spendRow(input);
    if (!row) return;
    const saved = await admin.from('ai_spend_log').insert(row);
    if (saved.error) console.error('ai spend log', saved.error.message ?? 'insert failed');
  } catch {
    console.error('ai spend log failed');
  }
}

/** Percent of the monthly budget that sends an alert. */
export const SPEND_ALERT_THRESHOLDS = [70, 90] as const;

/**
 * Which alert is due. Only the highest threshold crossed and not yet sent goes out,
 * and every lower one crossed is marked as handled, so a jump from 60% to 95% sends one push, not two.
 */
export function dueSpendAlert(
  spendUsd: number,
  budgetUsd: number,
  alreadySent: readonly number[],
): { send: number | null; mark: number[] } {
  if (!(budgetUsd > 0) || !(spendUsd >= 0)) return { send: null, mark: [] };
  const percent = (spendUsd / budgetUsd) * 100;
  const crossed = SPEND_ALERT_THRESHOLDS.filter((threshold) => percent >= threshold && !alreadySent.includes(threshold));
  if (crossed.length === 0) return { send: null, mark: [] };
  return { send: crossed[crossed.length - 1], mark: [...crossed] };
}

export function spendAlertText(threshold: number, spendUsd: number, budgetUsd: number): { title: string; body: string } {
  return {
    title: 'Charioteer AI budget',
    body: `AI spend has passed ${threshold}% of this month's budget: $${spendUsd.toFixed(2)} of $${budgetUsd.toFixed(2)}.`,
  };
}

/** The monthly budget in USD from the secret, or null when it is missing or not a positive number. */
export function parseBudgetUsd(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/** First day of the month as YYYY-MM-DD, in UTC, which is how xAI bills. */
export function utcMonthStart(now: Date): string {
  return `${now.toISOString().slice(0, 7)}-01`;
}

export function utcNextMonthStart(now: Date): string {
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return next.toISOString().slice(0, 10);
}

/**
 * The request for month-to-date cost from the xAI Management API,
 * https://docs.x.ai/developers/rest-api-reference/management/billing (Daily token usage).
 * endTime is exclusive, so the first of next month covers every day so far.
 */
export function xaiUsageRequest(now: Date): { analyticsRequest: Record<string, unknown> } {
  return {
    analyticsRequest: {
      timeRange: {
        startTime: `${utcMonthStart(now)} 00:00:00`,
        endTime: `${utcNextMonthStart(now)} 00:00:00`,
        timezone: 'Etc/GMT',
      },
      timeUnit: 'TIME_UNIT_DAY',
      values: [{ name: 'usd', aggregation: 'AGGREGATION_SUM' }],
      groupBy: ['description'],
      filters: [],
    },
  };
}

/** Month-to-date USD from the Management API usage response. Null when the shape is not recognised or the rows were cut off. */
export function xaiUsageTotalUsd(payload: unknown): number | null {
  if (!payload || typeof payload !== 'object') return null;
  const body = payload as { timeSeries?: unknown; limitReached?: unknown };
  if (body.limitReached === true || !Array.isArray(body.timeSeries)) return null;
  let total = 0;
  for (const series of body.timeSeries) {
    const points = (series as { dataPoints?: unknown } | null)?.dataPoints;
    if (!Array.isArray(points)) return null;
    for (const point of points) {
      const value = (point as { values?: unknown } | null)?.values;
      const first = Array.isArray(value) ? value[0] : undefined;
      if (typeof first === 'number' && Number.isFinite(first)) total += first;
      else if (typeof first === 'string' && Number.isFinite(Number(first))) total += Number(first);
    }
  }
  return total;
}
