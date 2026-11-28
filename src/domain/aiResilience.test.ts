import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  AI_UNAVAILABLE_CODE,
  classifyXaiFailure,
  unavailableNotice,
  xaiFailureFromError,
} from '../../supabase/functions/_shared/aiUnavailable.ts';
import {
  dueSpendAlert,
  estimateCostUsd,
  parseBudgetUsd,
  parseXaiUsage,
  recordAiSpend,
  spendAlertText,
  spendRow,
  utcMonthStart,
  utcNextMonthStart,
  xaiUsageRequest,
  xaiUsageTotalUsd,
} from '../../supabase/functions/_shared/aiSpend.ts';
import { ALCOHOL_FACTS } from '../../supabase/functions/_shared/facts.ts';
import {
  buildChatCompletionBody,
  buildThumosSystemParts,
  XAI_PROMPT_CACHE_KEYS,
} from '../../supabase/functions/_shared/thumos.ts';
import { mealProviderResult } from '../../supabase/functions/_shared/mealProvider.ts';

const source = (path: string) => readFileSync(path, 'utf8');
const AI_FUNCTIONS = ['thumos-chat', 'gratitude-reflect', 'health-plan', 'estimate-meal', 'thumos-voice-token'] as const;

describe('every way xAI can fail gives one calm code', () => {
  it('maps 402, 429, 5xx, timeouts and drops to a reason, and leaves a bad request alone', () => {
    expect(classifyXaiFailure(402)).toBe('billing');
    expect(classifyXaiFailure(429, '{"error":"Rate limit exceeded"}')).toBe('rate_limit');
    expect(classifyXaiFailure(429, 'Your team has used all available credits')).toBe('billing');
    expect(classifyXaiFailure(403, 'monthly spending limit reached')).toBe('billing');
    expect(classifyXaiFailure(403, 'forbidden')).toBe('key');
    expect(classifyXaiFailure(401)).toBe('key');
    expect(classifyXaiFailure(500)).toBe('server');
    expect(classifyXaiFailure(503)).toBe('server');
    expect(classifyXaiFailure(599)).toBe('server');
    expect(classifyXaiFailure(408)).toBe('timeout');
    expect(classifyXaiFailure(504)).toBe('timeout');
    expect(classifyXaiFailure('timeout')).toBe('timeout');
    expect(classifyXaiFailure('network')).toBe('network');
    expect(classifyXaiFailure(400)).toBeNull();
    expect(classifyXaiFailure(422)).toBeNull();
    expect(classifyXaiFailure(200)).toBeNull();
    expect(classifyXaiFailure(null)).toBeNull();
  });

  it('reads a thrown fetch error as a timeout or a drop', () => {
    const timeout = new Error('slow');
    timeout.name = 'TimeoutError';
    const aborted = new Error('stop');
    aborted.name = 'AbortError';
    expect(xaiFailureFromError(timeout)).toBe('timeout');
    expect(xaiFailureFromError(aborted)).toBe('timeout');
    expect(xaiFailureFromError(new TypeError('fetch failed'))).toBe('network');
    expect(xaiFailureFromError('boom')).toBe('network');
  });

  it('adds the code, the reason and the calm line to a reply that is otherwise normal', () => {
    expect(unavailableNotice('plan', 'server')).toEqual({
      code: 'ai_unavailable',
      reason: 'server',
      notice: 'The plan writer is resting right now, so this plan uses your figures without the AI. Try again a bit later.',
    });
  });

  it('answers a photo with ai_unavailable for every outage, never as an unreadable photo', () => {
    for (const fault of [
      { kind: 'http', status: 402 },
      { kind: 'http', status: 429 },
      { kind: 'http', status: 502 },
      { kind: 'timeout' },
      { kind: 'network' },
      { kind: 'missing_key' },
    ] as const) {
      expect(mealProviderResult(true, fault)).toEqual({ outcome: 'unavailable', status: 503, code: AI_UNAVAILABLE_CODE });
    }
  });

  it('every AI edge function classifies the failure, times out, and keeps the key out of the logs', () => {
    for (const name of AI_FUNCTIONS) {
      const text = source(`supabase/functions/${name}/index.ts`);
      expect(text, name).toContain('classifyXaiFailure(');
      expect(text, name).toContain('AbortSignal.timeout(');
      expect(text, name).toMatch(/AI_UNAVAILABLE_CODE|unavailableNotice\(|COACH_AI_UNAVAILABLE/);
      const logged = text.split('\n').filter((line) => /console\.(log|warn|error)/.test(line));
      expect(logged.join('\n'), name).not.toMatch(/apiKey|Bearer|response\.(text|json)/);
    }
  });

  it('never counts a credit on a failed call: each count comes after the unavailable return', () => {
    for (const name of AI_FUNCTIONS) {
      const text = source(`supabase/functions/${name}/index.ts`);
      const counts = [...text.matchAll(/countAiUse\(/g)].map((match) => match.index ?? -1);
      expect(counts.length, name).toBeGreaterThan(0);
      for (const at of counts) {
        const before = text.slice(0, at);
        // A failure is classified, logged and answered before the credit is counted.
        expect(before.lastIndexOf('classifyXaiFailure('), name).toBeGreaterThan(-1);
        expect(before.lastIndexOf('logAiUnavailable('), name).toBeGreaterThan(-1);
        expect(before.lastIndexOf('logAiUnavailable('), name).toBeGreaterThan(before.lastIndexOf('gateAiUse('));
      }
      expect(text, name).toContain("countWhen: 'after'");
    }
    const chat = source('supabase/functions/thumos-chat/index.ts');
    expect(chat).toContain('if (modelAnswered && gate.ok)');
  });

  it('thumos replies with the resting line and the code when no model answered', () => {
    const chat = source('supabase/functions/thumos-chat/index.ts');
    expect(chat).toContain('resting ? COACH_AI_UNAVAILABLE : COACH_REPLY_FAILED');
    expect(chat).toContain('unavailableCode = AI_UNAVAILABLE_CODE');
    expect(chat).toMatch(/send\(\{ type: 'done'[^\n]*unavailableCode/);
    expect(source('supabase/functions/_shared/sse.ts')).toContain('code?: string');
  });

  it('the phone shows the notice for the new code and the old one', () => {
    const repo = source('src/data/supabase-repository.ts');
    expect(repo).toContain("body.code !== 'ai_unavailable' && body.code !== 'provider_billing'");
    expect(repo).toContain("data?.code === 'ai_unavailable' || data?.code === 'provider_billing'");
  });
});

describe('what each call costs', () => {
  it('reads the exact charge xAI reports, in ticks of 1e-10 USD', () => {
    const usage = parseXaiUsage({
      usage: { prompt_tokens: 196, completion_tokens: 2, total_tokens: 319, completion_tokens_details: { reasoning_tokens: 121 }, cost_in_usd_ticks: 3_509_000 },
    });
    expect(usage).toEqual({ inputTokens: 196, outputTokens: 123, cachedTokens: 0, costUsd: 0.0003509 });
  });

  it('counts reasoning tokens as output whether or not completion_tokens already includes them', () => {
    expect(parseXaiUsage({ usage: { prompt_tokens: 100, completion_tokens: 40, total_tokens: 140 } })?.outputTokens).toBe(40);
    expect(parseXaiUsage({ usage: { prompt_tokens: 100, completion_tokens: 10, total_tokens: 190 } })?.outputTokens).toBe(90);
    expect(parseXaiUsage({ usage: { input_tokens: 199, output_tokens: 1, total_tokens: 200 } })).toEqual({ inputTokens: 199, outputTokens: 1, cachedTokens: 0, costUsd: null });
    expect(parseXaiUsage({
      usage: {
        prompt_tokens: 5300,
        completion_tokens: 500,
        total_tokens: 5800,
        prompt_tokens_details: { text_tokens: 5300, cached_tokens: 4000 },
      },
    })).toEqual({ inputTokens: 5300, outputTokens: 500, cachedTokens: 4000, costUsd: null });
    expect(parseXaiUsage({
      usage: {
        input_tokens: 125,
        output_tokens: 48,
        total_tokens: 173,
        input_tokens_details: { cached_tokens: 98 },
      },
    })?.cachedTokens).toBe(98);
  });

  it('has no usage to read from an empty or odd response', () => {
    expect(parseXaiUsage(null)).toBeNull();
    expect(parseXaiUsage({})).toBeNull();
    expect(parseXaiUsage({ usage: null })).toBeNull();
    expect(parseXaiUsage({ usage: { prompt_tokens: 'x' } })).toBeNull();
  });

  it('works out a cost from the rate card when xAI sent none, and prices an unknown model high', () => {
    expect(estimateCostUsd('grok-4.3', 1_000_000, 1_000_000)).toBeCloseTo(3.75, 6);
    expect(estimateCostUsd('grok-4.7', 1_000_000, 1_000_000)).toBeCloseTo(8, 6);
    expect(estimateCostUsd('grok-mystery', 1_000_000, 1_000_000)).toBeCloseTo(8, 6);
    // 800k of the 1M input tokens were cached: (200k * 1.25 + 800k * 0.20 + 1M * 2.50) / 1M
    expect(estimateCostUsd('grok-4.3', 1_000_000, 1_000_000, 800_000)).toBeCloseTo(2.91, 6);
  });

  it('stores function, tier, model, tokens and cost only', () => {
    const row = spendRow({ fn: 'thumos-chat', tier: 'pro', model: 'grok-4.3', usage: { inputTokens: 5300, outputTokens: 500, cachedTokens: 0, costUsd: null } });
    expect(row).toEqual({
      fn: 'thumos-chat',
      tier: 'pro',
      model: 'grok-4.3',
      input_tokens: 5300,
      output_tokens: 500,
      cached_tokens: 0,
      cost_usd: 0.007875,
      cost_source: 'estimated',
    });
    expect(Object.keys(row ?? {}).sort()).toEqual(['cached_tokens', 'cost_source', 'cost_usd', 'fn', 'input_tokens', 'model', 'output_tokens', 'tier']);
    expect(spendRow({ fn: 'estimate-meal', tier: null, model: 'grok-4.3', usage: { inputTokens: 1, outputTokens: 1, cachedTokens: 0, costUsd: 0.5 } })).toMatchObject({ tier: null, cost_usd: 0.5, cost_source: 'xai' });
    expect(spendRow({ fn: 'estimate-meal', tier: null, model: 'grok-4.3', usage: null })).toBeNull();
  });

  it('writes the row, and never throws when the table is missing or the database fails', async () => {
    const inserted: Record<string, unknown>[] = [];
    await recordAiSpend({ from: () => ({ insert: async (row) => { inserted.push(row); return { error: null }; } }) }, {
      fn: 'gratitude-reflect', tier: 'standard', model: 'grok-4.3', usage: { inputTokens: 300, outputTokens: 400, cachedTokens: 0, costUsd: 0.0012 },
    });
    expect(inserted).toHaveLength(1);
    await expect(recordAiSpend({ from: () => ({ insert: async () => ({ error: { message: 'relation "ai_spend_log" does not exist' } }) }) }, {
      fn: 'gratitude-reflect', tier: null, model: 'grok-4.3', usage: { inputTokens: 1, outputTokens: 1, cachedTokens: 0, costUsd: 0.1 },
    })).resolves.toBeUndefined();
    await expect(recordAiSpend({ from: () => { throw new Error('down'); } }, {
      fn: 'gratitude-reflect', tier: null, model: 'grok-4.3', usage: { inputTokens: 1, outputTokens: 1, cachedTokens: 0, costUsd: 0.1 },
    })).resolves.toBeUndefined();
  });

  it('asks xAI for the usage in a stream, and logs spend from every function that answers', () => {
    const body = buildChatCompletionBody({ system: 's', history: [], user: 'u', stream: true });
    expect(body.stream_options).toEqual({ include_usage: true });
    expect(body.prompt_cache_key).toBeUndefined();
    expect(buildChatCompletionBody({ system: 's', history: [], user: 'u', stream: false }).stream_options).toBeUndefined();
    for (const name of ['thumos-chat', 'gratitude-reflect', 'health-plan', 'estimate-meal'] as const) {
      const text = source(`supabase/functions/${name}/index.ts`);
      expect(text, name).toContain('recordAiSpend(');
      expect(text, name).toContain('parseXaiUsage(');
    }
  });
});

describe('the monthly budget warning', () => {
  it('sends at 70% and again at 90%, once each', () => {
    expect(dueSpendAlert(13.9, 20, [])).toEqual({ send: null, mark: [] });
    expect(dueSpendAlert(14, 20, [])).toEqual({ send: 70, mark: [70] });
    expect(dueSpendAlert(15, 20, [70])).toEqual({ send: null, mark: [] });
    expect(dueSpendAlert(18, 20, [70])).toEqual({ send: 90, mark: [90] });
    expect(dueSpendAlert(19, 20, [70, 90])).toEqual({ send: null, mark: [] });
  });

  it('a jump past both sends one push and marks both', () => {
    expect(dueSpendAlert(19, 20, [])).toEqual({ send: 90, mark: [70, 90] });
  });

  it('does nothing without a usable budget', () => {
    expect(dueSpendAlert(50, 0, [])).toEqual({ send: null, mark: [] });
    expect(dueSpendAlert(50, -1, [])).toEqual({ send: null, mark: [] });
    expect(parseBudgetUsd(undefined)).toBeNull();
    expect(parseBudgetUsd('abc')).toBeNull();
    expect(parseBudgetUsd('0')).toBeNull();
    expect(parseBudgetUsd('25')).toBe(25);
  });

  it('writes a short alert with amounts only', () => {
    expect(spendAlertText(70, 14.2, 20)).toEqual({
      title: 'Charioteer AI budget',
      body: "AI spend has passed 70% of this month's budget: $14.20 of $20.00.",
    });
  });

  it('reads month-to-date cost from the Management API response', () => {
    expect(xaiUsageTotalUsd({
      timeSeries: [
        { group: ['Chat grok-4.3'], dataPoints: [{ timestamp: '2026-11-01T00:00:00Z', values: [1.5] }, { timestamp: '2026-11-02T00:00:00Z', values: ['0.25'] }] },
        { group: ['x'], dataPoints: [{ timestamp: '2026-11-01T00:00:00Z', values: [2] }] },
      ],
      limitReached: false,
    })).toBeCloseTo(3.75, 6);
    expect(xaiUsageTotalUsd({ timeSeries: [], limitReached: false })).toBe(0);
    expect(xaiUsageTotalUsd({ timeSeries: [], limitReached: true })).toBeNull();
    expect(xaiUsageTotalUsd({})).toBeNull();
    expect(xaiUsageTotalUsd(null)).toBeNull();
  });

  it('asks for this UTC month, with the end exclusive', () => {
    const now = new Date('2026-11-28T09:00:00Z');
    expect(utcMonthStart(now)).toBe('2026-11-01');
    expect(utcNextMonthStart(now)).toBe('2026-12-01');
    expect(utcNextMonthStart(new Date('2026-12-31T23:59:00Z'))).toBe('2027-01-01');
    expect(xaiUsageRequest(now)).toEqual({
      analyticsRequest: {
        timeRange: { startTime: '2026-11-01 00:00:00', endTime: '2026-12-01 00:00:00', timezone: 'Etc/GMT' },
        timeUnit: 'TIME_UNIT_DAY',
        values: [{ name: 'usd', aggregation: 'AGGREGATION_SUM' }],
        groupBy: ['description'],
        filters: [],
      },
    });
  });

  it('the checker needs a secret, a budget and a user, pushes without personal data, and claims each alert once', () => {
    const fn = source('supabase/functions/ai-spend-check/index.ts');
    expect(fn).toContain("req.headers.get('x-ai-spend-secret') !== secret");
    expect(fn).toContain('AI_MONTHLY_BUDGET_USD');
    expect(fn).toContain('AI_SPEND_ALERT_USER_ID');
    expect(fn).toContain("from('device_tokens')");
    expect(fn).toContain("from('ai_spend_alerts')");
    expect(fn).toContain('dueSpendAlert(');
    expect(fn).not.toMatch(/console\.\w+\([^)]*(key|Bearer|token)/i);
    expect(source('supabase/config.toml')).toMatch(/\[functions\.ai-spend-check\]\s+verify_jwt = false/);
  });
});

describe('the spend migration', () => {
  const sql = source('supabase/migrations/20261128090000_ai_spend_log.sql');

  it('has row level security on, no policy, and no grant to the phone', () => {
    expect(sql).toContain('alter table public.ai_spend_log enable row level security');
    expect(sql).toContain('alter table public.ai_spend_alerts enable row level security');
    expect(sql).not.toMatch(/create policy/i);
    expect(sql).toContain('revoke all on table public.ai_spend_log from public, anon, authenticated');
    expect(sql).toContain('revoke all on table public.ai_spend_alerts from public, anon, authenticated');
    expect(sql).toContain('revoke all on function public.ai_spend_month(date) from public, anon, authenticated');
    expect(sql).not.toMatch(/to (anon|authenticated)/i);
  });

  it('stores no user id and no content', () => {
    const table = sql.slice(sql.indexOf('create table public.ai_spend_log'), sql.indexOf(');', sql.indexOf('create table public.ai_spend_log')));
    expect(table).not.toMatch(/user_id|profiles|prompt|reply|content|body|photo|email/i);
    for (const column of ['fn', 'tier', 'model', 'input_tokens', 'output_tokens', 'cached_tokens', 'cost_usd']) expect(table).toContain(column);
  });

  it('matches the row the functions write', () => {
    const row = spendRow({ fn: 'thumos-chat', tier: 'max', model: 'grok-4.3', usage: { inputTokens: 1, outputTokens: 1, cachedTokens: 0, costUsd: 0.1 } });
    const table = sql.slice(sql.indexOf('create table public.ai_spend_log'), sql.indexOf(');', sql.indexOf('create table public.ai_spend_log')));
    for (const column of Object.keys(row ?? {})) expect(table, column).toContain(column);
  });
});

describe('xAI prompt caching', () => {
  it('keeps the static coach instructions identical, with no name, date or stats in them', () => {
    const first = buildThumosSystemParts('Name: Alex\nSober time: 47 days', 'support', ALCOHOL_FACTS, { supportShape: 'acute' });
    const second = buildThumosSystemParts('Name: Sam\nSober time: 2 days', 'growth', ALCOHOL_FACTS, { selfHarm: true });
    expect(first.staticInstructions).toBe(second.staticInstructions);
    expect(first.staticInstructions).toContain('You are Thumos');
    expect(first.staticInstructions).toContain('CURATED FACTS');
    expect(first.staticInstructions).toContain('116 123');
    expect(first.staticInstructions).not.toMatch(/Name:|Sober time:|Personal reasons:|mood \d/);
    expect(first.staticInstructions).not.toMatch(/\nCONTEXT\n/);
    expect(first.staticInstructions).not.toContain('Alex');
    expect(first.staticInstructions).not.toContain('47 days');
    expect(first.turnAndContext).toContain('CONTEXT');
    expect(first.turnAndContext).toContain('Name: Alex');
    expect(first.turnAndContext).toContain('47 days');
    expect(second.turnAndContext).toContain('help them reach help now');
    expect(first.staticInstructions.startsWith('You are Thumos')).toBe(true);
  });

  it('sends the static prefix first, then the turn, and sets prompt_cache_key', () => {
    const parts = buildThumosSystemParts('Name: Alex', 'steady');
    const body = buildChatCompletionBody({
      system: parts.staticInstructions,
      systemAfter: parts.turnAndContext,
      history: [{ role: 'user', content: 'Earlier' }, { role: 'assistant', content: 'A reply' }],
      user: 'How am I doing?',
      stream: true,
      cacheKey: XAI_PROMPT_CACHE_KEYS.thumosChat,
    });
    expect(body.prompt_cache_key).toBe('charioteer:thumos-chat');
    expect(body.messages[0]).toEqual({ role: 'system', content: parts.staticInstructions });
    expect(body.messages[1]).toEqual({ role: 'system', content: parts.turnAndContext });
    expect(body.messages[0].content).not.toContain('Name: Alex');
    expect(body.messages[1].content).toContain('Name: Alex');
    expect(body.messages.map((message) => message.role)).toEqual(['system', 'system', 'user', 'assistant', 'user']);
  });

  it('a retry note goes in the turn-specific message, so the cached prefix does not change', () => {
    const parts = buildThumosSystemParts('Name: Alex', 'steady');
    const first = buildChatCompletionBody({
      system: parts.staticInstructions,
      systemAfter: parts.turnAndContext,
      history: [],
      user: 'Hi',
      stream: true,
      cacheKey: XAI_PROMPT_CACHE_KEYS.thumosChat,
    });
    const retry = buildChatCompletionBody({
      system: parts.staticInstructions,
      systemAfter: `${parts.turnAndContext}\n\nPlease try again, more carefully.`,
      history: [],
      user: 'Hi',
      stream: true,
      cacheKey: XAI_PROMPT_CACHE_KEYS.thumosChat,
    });
    expect(retry.messages[0].content).toBe(first.messages[0].content);
    expect(retry.messages[1].content).toContain('more carefully');
    expect(retry.prompt_cache_key).toBe(first.prompt_cache_key);
  });

  it('every AI function that calls the model sets a stable feature cache key, with the static prompt first', () => {
    const chat = source('supabase/functions/thumos-chat/index.ts');
    expect(chat).toContain('cacheKey: XAI_PROMPT_CACHE_KEYS.thumosChat');
    expect(chat).toContain('system: promptParts.staticInstructions');
    expect(chat).toContain('systemAfter: promptParts.turnAndContext');
    expect(chat).toContain('systemAfter: `${promptParts.turnAndContext}\\n\\n${THUMOS_RETRY_NOTE}`');
    const meal = source('supabase/functions/estimate-meal/index.ts');
    expect(meal).toContain('cacheKey: XAI_PROMPT_CACHE_KEYS.estimateMeal');
    expect(meal).toContain('prompt_cache_key: XAI_PROMPT_CACHE_KEYS.estimateMeal');
    expect(meal).toContain('const mealSystem =');
    expect(meal).toContain('MEAL_ESTIMATE_PROMPT');
    expect(meal).not.toContain('`${MEAL_ESTIMATE_PROMPT}\\n\\nMeal:');
    const plan = source('supabase/functions/health-plan/index.ts');
    expect(plan).toContain('cacheKey: XAI_PROMPT_CACHE_KEYS.healthPlan');
    expect(plan).toContain('cacheKey: XAI_PROMPT_CACHE_KEYS.healthPlanAnalyse');
    const reflect = source('supabase/functions/gratitude-reflect/index.ts');
    expect(reflect).toContain('cacheKey: XAI_PROMPT_CACHE_KEYS.gratitudeReflect');
  });

  it('prices cached prompt tokens at the cached rate when xAI did not send a charge', () => {
    const row = spendRow({
      fn: 'thumos-chat',
      tier: 'standard',
      model: 'grok-4.3',
      usage: { inputTokens: 5300, outputTokens: 500, cachedTokens: 4000, costUsd: null },
    });
    // 1300 * 1.25 + 4000 * 0.20 + 500 * 2.50 = 1625 + 800 + 1250 = 3675 / 1e6
    expect(row?.cached_tokens).toBe(4000);
    expect(row?.cost_usd).toBeCloseTo(0.003675, 6);
    expect(row?.cost_source).toBe('estimated');
  });
});
