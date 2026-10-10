import { factsBlock, type CitedFact, ALCOHOL_FACTS } from './facts.ts';
import { earnedMilestones } from './milestones.ts';
import { savingsFromTypicalWeek } from './savings.ts';
import { formatSoberElapsed, soberElapsed } from './sober.ts';
import { detectSafety, type SafetyHit } from './safety.ts';

export type ThumosMode = 'opening' | 'steady' | 'growth' | 'support';

export type CheckInSummary = {
  createdAt: string;
  mood: number;
  sleepHours: number;
  craving: number;
  note: string;
};

export type HealthTrend = {
  kind: string;
  latest: number | null;
  previous: number | null;
  unit: string;
};

export type ThumosContextInput = {
  now: Date;
  displayName: string;
  sobrietyStartedAt: string | null;
  reasons: string[];
  weeklySpendGbp: number | null;
  weeklyUnits: number | null;
  checkIns: CheckInSummary[];
  health: HealthTrend[];
  mode: ThumosMode;
  safety: SafetyHit;
};

const CRAVING_TEXT = /\b(crav\w*|urge|want a drink|need a drink|off[-\s]?licence|really want (?:a |to )?drink)\b/i;

export function inferThumosMode(input: {
  sos: boolean;
  latestCraving?: number | null;
  latestMood?: number | null;
  userText?: string;
  hasHistory: boolean;
}): ThumosMode {
  if (input.sos) return 'support';
  if (input.userText && CRAVING_TEXT.test(input.userText)) return 'support';
  if ((input.latestCraving ?? 0) >= 6) return 'support';
  if (!input.hasHistory && !input.userText) return 'opening';
  if ((input.latestMood ?? 0) >= 4 && (input.latestCraving ?? 0) <= 3) return 'growth';
  return 'steady';
}

const CLIENT_MODES: readonly ThumosMode[] = ['support', 'growth', 'opening', 'steady'];

/**
 * The edge function decides the prompt. A client `mode` flag is a hint.
 * Craving language in the message, and any safety flag, force support even
 * when the client asked for steady or growth. A client support flag is kept
 * when the text itself is ordinary, so SOS still opens the support prompt.
 */
export function resolveThumosMode(input: {
  requested?: string | null;
  userText?: string;
  safety: { selfHarm: boolean; withdrawal: boolean };
}): ThumosMode {
  if (input.safety.selfHarm || input.safety.withdrawal) return 'support';
  const fromText = inferThumosMode({ sos: false, hasHistory: true, userText: input.userText });
  if (fromText === 'support') return 'support';
  if (input.requested && (CLIENT_MODES as readonly string[]).includes(input.requested)) {
    return input.requested as ThumosMode;
  }
  return 'steady';
}

/**
 * Text model for Thumos. Checked against xAI public docs on 10 October 2026.
 *
 * grok-4.7, grok-4.6, and grok-4.5 default reasoning_effort to "high", and
 * reasoning cannot be turned off (docs.x.ai/developers/model-capabilities/text/reasoning).
 * That thinking pass is the 40–50 second wait. Those models stay on "low".
 *
 * grok-4.3 supports none, low, medium, high, and xhigh. The documented default
 * is low: some reasoning tokens, still the fast setting.
 * https://docs.x.ai/developers/models/grok-4.3
 * "none" is no reasoning at all. A live pass with none was quick (about 1–1.4s
 * to the first token) and the replies collapsed to one generic line, so the
 * default here is low. Low was not timed in this environment. Do not set
 * max_tokens when effort is low: reasoning tokens share that budget and can
 * starve the answer.
 *
 * Chat Completions takes reasoning_effort as a top-level field. The Responses
 * API uses reasoning.effort. This app stays on chat completions.
 * Streaming is stream: true
 * (docs.x.ai/developers/model-capabilities/text/streaming).
 */
export const THUMOS_CHAT = {
  completionsUrl: 'https://api.x.ai/v1/chat/completions',
  model: 'grok-4.3',
  historyLimit: 8,
  checkInLimit: 4,
  noteLimit: 160,
  maxTokens: 450,
} as const;

export function thumosReasoningEffort(model: string): 'none' | 'low' {
  if (
    model === 'grok-4.3' ||
    model === 'grok-4.3-latest' ||
    model === 'grok-4.7' ||
    model === 'grok-4.6' ||
    model === 'grok-4.5'
  ) {
    return 'low';
  }
  return 'none';
}

export type ChatTurn = { role: 'user' | 'assistant'; content: string };

export function buildChatCompletionBody(input: {
  model?: string;
  system: string;
  history: ChatTurn[];
  user: string;
  stream: boolean;
}): {
  model: string;
  reasoning_effort: 'none' | 'low';
  stream: boolean;
  max_tokens?: number;
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
} {
  const model = input.model || THUMOS_CHAT.model;
  const reasoning_effort = thumosReasoningEffort(model);
  return {
    model,
    reasoning_effort,
    stream: input.stream,
    ...(reasoning_effort === 'none' ? { max_tokens: THUMOS_CHAT.maxTokens } : {}),
    messages: [
      { role: 'system', content: input.system },
      ...input.history.slice(-THUMOS_CHAT.historyLimit),
      { role: 'user', content: input.user },
    ],
  };
}

/** Answer text from one chat-completions stream chunk. Reasoning traces are ignored. */
export function completionDeltaText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const choices = (payload as { choices?: { delta?: { content?: unknown; reasoning_content?: unknown } }[] }).choices;
  const content = choices?.[0]?.delta?.content;
  return typeof content === 'string' ? content : '';
}

export const OPENING_LINE = 'How are you feeling?';

export const CRAVING_LINE =
  'You are in craving support. I am with you. What is happening, in your own words?';

export const OFFLINE_COACH_MESSAGE = [
  'Thumos cannot reach the coach just now.',
  'The xAI key is not set on the server, so this is not a reply from the model.',
  'You can still use the breathing exercise, the ten-minute urge timer, and your own reasons, which are on this screen when craving support is open.',
  'If you might be in alcohol withdrawal, contact your GP or call NHS 111, and call 999 in an emergency.',
  'If you are thinking about suicide or self-harm, call the Samaritans free on 116 123, or 999 if you are in immediate danger.',
  'Thumos is not a medical professional.',
].join(' ');

const MODE_GUIDANCE: Record<ThumosMode, string> = {
  opening:
    'This is the start of the conversation, or the person has not yet said how they feel. Ask how they are feeling. Do not launch into advice.',
  steady:
    'Stay with what they actually said. Write 3 to 6 sentences. Be warm and specific. End with one question. Do not answer in a single generic line.',
  growth:
    'They seem to be doing all right. Write 3 to 6 sentences. Acknowledge the specific thing they said, without gushing, and do not reply with only "That is good" or "Keep going". Then offer one or two next steps among exercise, sleep, nutrition, connection, and purpose, tied to their recent check-ins or health readings when CONTEXT has them. End with one question about what they want to try. Do not lecture.',
  support:
    'They are craving, or they opened SOS. Write 3 to 6 sentences, in this order, and do not collapse it into one generic line. (1) Acknowledge the urge in their own words. (2) Remind them a craving rises, peaks, and passes, often within 20 to 30 minutes. Present that as coaching guidance, not as a cited statistic. (3) Ask what they think will happen if they drink, and whether that is worth it. (4) Bring in their sober time and one of their personal reasons from CONTEXT, in their words. If CONTEXT says those are not set, say so rather than inventing them. (5) Offer the in-app breathing exercise, the 10-minute urge timer, and a walk, jog, or run if they are able. You may add one fact from CURATED FACTS, quoted faithfully with its source, or leave it out. End with one question.',
};

const SHAPE_EXAMPLES = [
  'EXAMPLES OF SHAPE ONLY. Do not copy a day count, a reason, or a fact from an example unless CONTEXT has that same detail.',
  'Example, craving. Person: "The urge is loud tonight. I keep thinking about the off-licence." Reply: "That pull towards the off-licence is real, and it is loud right now. A craving like this rises, peaks, and usually eases within 20 to 30 minutes. What do you think happens if you drink tonight, and is that worth the morning you are trying to keep? You have been sober for the stretch shown in CONTEXT, and the reason you wrote there still stands. The breathing exercise or the 10-minute urge timer is on this screen, and a short walk would use the same half hour. What will you do for the next ten minutes?"',
  'Example, a good day. Person: "I slept properly and went for a walk. I feel all right." Reply: "Sleeping properly and getting out for a walk is a solid day, and it shows in how you feel. A next step that fits is keeping that walk, or protecting the bedtime that gave you the sleep. Where CONTEXT has a recent check-in or a step reading, use that rather than a general pep talk. What do you want tomorrow to include?"',
].join('\n');

export function buildThumosContext(input: ThumosContextInput): string {
  const started = input.sobrietyStartedAt ? new Date(input.sobrietyStartedAt) : null;
  const elapsed = started ? soberElapsed(started, input.now) : null;
  const milestones = started ? earnedMilestones(started, input.now).map((item) => item.badge) : [];
  const saved =
    elapsed && input.weeklySpendGbp != null && input.weeklyUnits != null
      ? savingsFromTypicalWeek(input.weeklySpendGbp, input.weeklyUnits, elapsed.totalMs)
      : null;

  const checkIns = input.checkIns
    .slice(0, THUMOS_CHAT.checkInLimit)
    .map((item) => {
      const note = item.note.trim().slice(0, THUMOS_CHAT.noteLimit);
      return `- ${item.createdAt}: mood ${item.mood}/5, sleep ${item.sleepHours}h, craving ${item.craving}/10${note ? `. Note: ${note}` : ''}`;
    })
    .join('\n');

  const health = input.health
    .map((item) => {
      if (item.latest == null) return `- ${item.kind}: no recent reading`;
      const trend =
        item.previous == null
          ? 'no earlier reading to compare'
          : item.latest === item.previous
            ? 'same as the previous reading'
            : item.latest > item.previous
              ? 'higher than the previous reading'
              : 'lower than the previous reading';
      return `- ${item.kind}: ${item.latest} ${item.unit} (${trend})`;
    })
    .join('\n');

  return [
    `Name: ${input.displayName || 'Friend'}`,
    elapsed ? `Sober time: ${formatSoberElapsed(elapsed)} (since ${input.sobrietyStartedAt})` : 'Sober time: not set',
    saved ? `From their own typical week: about ${saved.moneyGbp} GBP and ${saved.units} units not consumed.` : 'Savings inputs: not set',
    `Milestones reached: ${milestones.length ? milestones.join(', ') : 'none yet'}`,
    `Personal reasons:\n${input.reasons.length ? input.reasons.map((reason) => `- ${reason}`).join('\n') : '- none written yet'}`,
    `Recent check-ins (newest first):\n${checkIns || '- none yet'}`,
    `Health readings:\n${health || '- none shared'}`,
    `Mode: ${input.mode}`,
    `Safety flags: self-harm ${input.safety.selfHarm ? 'YES' : 'no'}, withdrawal ${input.safety.withdrawal ? 'YES' : 'no'}`,
  ].join('\n');
}

export function buildSystemPrompt(context: string, mode: ThumosMode, facts: readonly CitedFact[] = ALCOHOL_FACTS): string {
  const factText = facts === ALCOHOL_FACTS ? factsBlock() : facts.map((fact) => `- [${fact.id}] ${fact.text} (${fact.source})`).join('\n');
  return [
    'You are Thumos, the spirited companion in Charioteer.',
    'Charioteer is named for Plato\'s charioteer of the soul. You are the spirited horse: courage, heart, and forward motion.',
    'Your job is to help this person stay sober and get healthier.',
    'You are not a doctor, therapist, or emergency service. Say so when the conversation touches physical health, withdrawal, or mental health.',
    'Use UK English. Be calm, plain, and adult. Never punitive about a lapse. Write 3 to 6 sentences and end with one question. Do not answer in a single generic line. No emoji unless the person uses them first.',
    'When you mention sober time, a personal reason, a check-in, or a health reading, take it from CONTEXT. Do not invent those details.',
    'Do not invent statistics, study names, or citations. If you share a number about alcohol harm, use only CURATED FACTS, quote it faithfully, and name the source. If you do not have a verified figure, say so.',
    MODE_GUIDANCE[mode],
    SHAPE_EXAMPLES,
    'Safety rules, follow exactly:',
    '- If they describe heavy daily drinking and wanting to stop abruptly, or withdrawal symptoms (shakes, sweating, hallucinations, confusion, seizures, or feeling very unwell when not drinking): tell them alcohol withdrawal can be dangerous and they should not detox alone. Advise their GP, NHS 111, or 999 in an emergency. Do not give a taper schedule, doses, or medication advice.',
    '- If they express suicidal thoughts or self-harm: take it seriously. Encourage the Samaritans on 116 123 (free, 24 hours) and 999 if they are in immediate danger. Stay supportive. Do not debate whether they should live. Do not describe methods.',
    '',
    'CONTEXT',
    context,
    '',
    'CURATED FACTS',
    factText,
  ].join('\n');
}

export function safetyFromText(text: string): SafetyHit {
  return detectSafety(text);
}
