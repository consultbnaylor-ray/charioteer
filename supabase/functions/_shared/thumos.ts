import { factsBlock, type CitedFact, ALCOHOL_FACTS } from './facts.ts';
import { formatGratitudeContext, GRATITUDE_PROMPT_LINE, type GratitudeEntry } from './gratitude.ts';
import { formatVisionContext, VISION_PROMPT_LINE, type VisionContext } from './visionBoard.ts';
import { earnedMilestones } from './milestones.ts';
import { savingsFromTypicalWeek } from './savings.ts';
import { formatSoberElapsed, soberElapsed } from './sober.ts';
import { hrvExplainerForCoach } from './healthInsights.ts';
import { NUTRITION_PROMPT_LINE } from './nutrition.ts';
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

export type ThumosStage = 'stopped' | 'trying_to_stop' | 'cutting_down' | 'exploring';

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
  stage?: ThumosStage;
  plannedQuitAt?: string | null;
  weeklyUnitsGoal?: number | null;
  drinkFreeDaysGoal?: number | null;
  drinkFreeThisWeek?: number | null;
  /** Included only when the person has agreed to the coach. Never community data. */
  gratitude?: GratitudeEntry[];
  /** Summary lines from the person's own readings. Only when health consent is on. */
  healthInsights?: string[];
  /** Statement and captions only. Photos are never included. Only when coach consent is on. */
  vision?: VisionContext;
  /** Labels the person chose, such as Gym or Hiking. Used to personalise a plan. */
  interests?: string[];
  /** Their pinned line, when coach consent is already on. Withheld on a self-harm turn. Plato is Platonic, not Stoic. */
  pinnedQuote?: { text: string; author: string; source: string; school?: 'Stoic' | 'Platonic' } | null;
  /** Their own food log. Withheld on a self-harm turn. Omit kcal when calories are hidden. */
  nutritionLines?: string[];
};

function pinnedQuoteSchool(quote: { author: string; school?: string }): 'Stoic' | 'Platonic' {
  if (quote.school === 'Platonic' || quote.author === 'Plato') return 'Platonic';
  return 'Stoic';
}

function pinnedQuoteContext(quote: { text: string; author: string; source: string; school?: 'Stoic' | 'Platonic' }): string {
  const school = pinnedQuoteSchool(quote);
  const note = school === 'Platonic' ? ' Plato is Platonic, not a Stoic.' : '';
  return `Pinned ${school} quote, for motivation when it fits: "${quote.text}" — ${quote.author}, ${quote.source}.${note}`;
}

const STAGE_LABEL: Record<ThumosStage, string> = {
  stopped: 'stopped',
  trying_to_stop: 'trying to stop',
  cutting_down: 'trying to cut down',
  exploring: 'still drinking, just exploring',
};

export function stageGuidance(stage: ThumosStage): string {
  if (stage === 'stopped') {
    return 'They have stopped. Help them stay sober. Do not talk as if they are still drinking unless they say so.';
  }
  if (stage === 'trying_to_stop') {
    return 'They are trying to stop and have not stopped yet. Help them plan. Do not say they are already sober, and do not count sober days or savings. If they have been drinking heavily every day, stopping suddenly can be dangerous. Speak to a GP, or call NHS 111, before you stop. Do not give a taper, doses, or medication advice.';
  }
  if (stage === 'cutting_down') {
    return 'They are trying to cut down, not saying they have stopped. Be curious and non-judgemental. Reflect what they want. Do not congratulate them on sober days or savings. You may talk about a units goal or drink-free days when CONTEXT includes them.';
  }
  return 'They are still drinking and just exploring. Be curious and non-judgemental. Do not push them to stop, do not invent sober time, and do not treat a hope as already met.';
}

function resolvedStage(input: ThumosContextInput): ThumosStage {
  if (input.stage) return input.stage;
  return input.sobrietyStartedAt ? 'stopped' : 'exploring';
}

const APOSTROPHE = "['’]";

/** A drink they want now, or a thought that gives them permission to have one. */
const ACUTE_TEXT = new RegExp(
  [
    String.raw`\bcrav\w*`,
    String.raw`\burge\b`,
    String.raw`\b(?:really )?(?:want|need|fancy) (?:a |another |to )?drink\b`,
    String.raw`\boff[-\s]?licence\b`,
    String.raw`\bdeserve (?:a |that )?drink\b`,
    String.raw`\bjust one\b`,
    String.raw`\bone won${APOSTROPHE}t hurt\b`,
    String.raw`\bone will not hurt\b`,
    String.raw`\ba few won${APOSTROPHE}t matter\b`,
    String.raw`\ba few will not matter\b`,
    String.raw`\bwon${APOSTROPHE}t hurt to (?:have|drink)\b`,
  ].join('|'),
  'i',
);

/**
 * A situation still ahead: a meal, a party, a wedding, work, a date, the pub,
 * family, a holiday, or a stressful meeting. Not the same as a craving now.
 */
const PLANNING_TEXT = new RegExp(
  [
    String.raw`\bpub\b`,
    String.raw`\bbar\b`,
    String.raw`\bparty\b`,
    String.raw`\bwedding\b`,
    String.raw`\bstag\b`,
    String.raw`\bhen (?:do|party|night)\b`,
    String.raw`\bbirthday\b`,
    String.raw`\bcelebration meal\b`,
    String.raw`\bwork do\b`,
    String.raw`\bwork drinks\b`,
    String.raw`\bfamily gathering\b`,
    String.raw`\bfamily (?:meal|dinner|lunch|do)\b`,
    String.raw`\bholiday\b`,
    String.raw`\b(?:stressful|difficult|tricky|tough) meeting\b`,
    String.raw`\b(?:on a |a )date\b`,
    String.raw`\b(?:can${APOSTROPHE}t|cannot|cant) handle\b`,
    String.raw`\bif i can handle\b`,
    String.raw`\bnot sure (?:if |that )?i can handle\b`,
    String.raw`\b(?:mates|friends) drinking\b`,
    String.raw`\bdrinking with (?:my )?(?:mates|friends)\b`,
    String.raw`\b(?:mates|friends) (?:are |were )?(?:all )?(?:going|out)\b`,
  ].join('|'),
  'i',
);

/** Labels from a profile_interests embed. A failed or empty read is no interests. */
export function interestLabelsFromRows(rows: unknown): string[] {
  if (!Array.isArray(rows)) return [];
  const labels: string[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const embedded = (row as { interests?: { label?: unknown } | { label?: unknown }[] | null }).interests;
    const list = Array.isArray(embedded) ? embedded : embedded ? [embedded] : [];
    for (const item of list) {
      const label = typeof item?.label === 'string' ? item.label.trim() : '';
      if (label && !labels.includes(label)) labels.push(label);
    }
  }
  return labels.slice(0, 12);
}

export type SupportShape = 'acute' | 'planning';

export type CommittedAction = 'breathe' | 'walk' | 'timer';

const FUTURE_COMMITMENT = new RegExp(
  [
    String.raw`\bi${APOSTROPHE}ll\b`,
    String.raw`\bi will\b`,
    String.raw`\bi${APOSTROPHE}m going to\b`,
    String.raw`\bi am going to\b`,
    String.raw`\blet me\b`,
  ].join('|'),
  'i',
);

const HEADING_OUT = /\b(?:going|off|heading) (?:for|on|out for) (?:a |the )?(?:walk|jog|run)\b/i;

/**
 * They have picked the breathing exercise, the timer, or a walk and are about
 * to do it. A past report ("I went for a walk") is not a commitment.
 */
export function detectCommittedAction(userText: string | undefined | null): CommittedAction | null {
  const text = (userText ?? '').trim();
  if (!text) return null;
  const headingOut = HEADING_OUT.test(text);
  if (!FUTURE_COMMITMENT.test(text) && !headingOut) return null;
  const marks: { index: number; action: CommittedAction }[] = [];
  const breatheAt = text.search(/\bbreath/i);
  const timerAt = text.search(/\b(?:timer|ten minutes|10 minutes)\b/i);
  const walkAt = text.search(/\b(?:walk|jog|run)\b/i);
  if (breatheAt >= 0) marks.push({ index: breatheAt, action: 'breathe' });
  if (timerAt >= 0) marks.push({ index: timerAt, action: 'timer' });
  if (walkAt >= 0) marks.push({ index: walkAt, action: 'walk' });
  marks.sort((left, right) => left.index - right.index);
  return marks[0]?.action ?? null;
}

const DAY_COUNT = new RegExp(
  String.raw`\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[-\s](?:one|two|three|four|five|six|seven|eight|nine))? days?\b`,
  'i',
);

const REASON_STOP = new Set([
  'want', 'have', 'with', 'that', 'this', 'they', 'them', 'your', 'from', 'been',
  'keep', 'more', 'when', 'what', 'just', 'about', 'their', 'there', 'into',
  'because', 'would', 'could', 'should', 'really', 'going', 'stop', 'stay',
]);

function reasonMentioned(content: string, reason: string): boolean {
  const tokens = reason.toLowerCase().match(/[a-z][a-z']{3,}/g) ?? [];
  const distinctive = tokens.filter((token) => !REASON_STOP.has(token));
  if (!distinctive.length) return content.toLowerCase().includes(reason.trim().toLowerCase());
  return distinctive.some((token) => new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(content));
}

/** What earlier replies already spent, so this turn can leave it alone. */
export function conversationCues(input: {
  history: { role: string; content: string }[];
  reasons: string[];
}): { soberTimeAlreadySaid: boolean; reasonsAlreadyUsed: string[] } {
  const replies = input.history.filter((row) => row.role === 'assistant' || row.role === 'offline');
  const soberTimeAlreadySaid = replies.some((row) => DAY_COUNT.test(row.content) && /\b(?:sober|sobriety|hours?)\b/i.test(row.content));
  const recent = replies.slice(-2);
  const reasonsAlreadyUsed = input.reasons.filter((reason) => recent.some((row) => reasonMentioned(row.content, reason)));
  return { soberTimeAlreadySaid, reasonsAlreadyUsed };
}

/** Phrases that make a reply sound like a template. Never send these. */
export const BANNED_THUMOS_PHRASES = [
  'tied to that figure',
  'keeps the focus on',
  'maintaining momentum',
] as const;

export const THUMOS_RETRY_NOTE = [
  'The previous draft was rejected.',
  'It repeated a sentence or a closing line from the last three replies, or it recapped earlier context, or it mentioned a check-in or a health figure that was already used, or it offered to set a reminder, an alarm, a calendar entry, or to contact someone.',
  'Write a fresh reply. Usually 2 to 4 sentences. Answer only what they just said.',
  'Do not recap. Do not repeat any earlier sentence or closing line. Often no question. Do not offer to do something you cannot do.',
].join(' ');

const SENTENCE_BREAK = /(?<=[.!?])\s+/;

const RECAP_PATTERNS = [
  /you(?:['’]ve| have) followed\b/i,
  /\byour recent check-?in\b/i,
];

/** A check-in or a health figure, not an ordinary mention of time. */
const HEALTH_OR_CHECKIN = /\b(?:check-ins?|hours of sleep|slept\s+\d|sleep(?:ing)?\s+\d|\d+(?:\.\d+)?\s*hours?\s+of\s+sleep|recorded\s+\d+(?:\.\d+)?\s*hours|\d[\d,]*(?:\s+|\s*)steps|\d+\s*bpm|resting heart(?:\s+rate)?|heart rate)\b/i;

export type ThumosReplyFault = 'repeat' | 'recap' | 'banned' | 'health' | 'undoable';

/** Thumos claiming it will set a reminder, an alarm, a calendar entry, or contact someone. */
const UNDOABLE_OFFER = [
  /\b(?:I(?:['’]ll| will| can| could|['’]m going to| am going to)|let me) (?:set|add|create|make|put|schedule)\b[^.]{0,60}\b(?:reminder|alarm|calendar)\b/i,
  /\b(?:I(?:['’]ll| will| can| could)|let me) (?:contact|call|text|message|email|ring)\b/i,
];

export function offersUndoableAction(text: string): boolean {
  return UNDOABLE_OFFER.some((pattern) => pattern.test(text));
}

export function replySentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .split(SENTENCE_BREAK)
    .map((part) => part.trim())
    .filter(Boolean);
}

function canonicalSentence(sentence: string): string {
  return sentence
    .toLowerCase()
    .replace(/[‘’']/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sharesWordRun(left: string, right: string, size = 8): boolean {
  const a = canonicalSentence(left).split(' ').filter(Boolean);
  const b = canonicalSentence(right).split(' ').filter(Boolean);
  if (a.length < size || b.length < size) return false;
  const grams = new Set<string>();
  for (let index = 0; index <= a.length - size; index += 1) grams.add(a.slice(index, index + size).join(' '));
  for (let index = 0; index <= b.length - size; index += 1) {
    if (grams.has(b.slice(index, index + size).join(' '))) return true;
  }
  return false;
}

export function mentionsCheckInOrHealth(text: string): boolean {
  return HEALTH_OR_CHECKIN.test(text);
}

export function replyRecaps(text: string): boolean {
  return RECAP_PATTERNS.some((pattern) => pattern.test(text));
}

export function usesBannedThumosPhrase(text: string): boolean {
  const hay = text.toLowerCase();
  return BANNED_THUMOS_PHRASES.some((phrase) => hay.includes(phrase));
}

/**
 * True when this reply repeats a sentence, or a closing line, from the last
 * three assistant replies. Matching ignores case and punctuation.
 */
export function replyRepeatsRecent(reply: string, recentAssistant: readonly string[]): boolean {
  const prior = recentAssistant.map((item) => item.trim()).filter(Boolean).slice(-3);
  const priorSentences = prior.flatMap((item) => replySentences(item));
  const priorClosings = prior.map((item) => replySentences(item).at(-1) ?? '').filter(Boolean);
  const nextSentences = replySentences(reply);
  const same = (left: string, right: string) => {
    const a = canonicalSentence(left);
    const b = canonicalSentence(right);
    if (a.length < 20 || b.length < 20) return false;
    return a === b || sharesWordRun(left, right);
  };
  if (nextSentences.some((sentence) => priorSentences.some((earlier) => same(sentence, earlier)))) return true;
  const closing = nextSentences.at(-1) ?? '';
  return priorClosings.some((earlier) => same(closing, earlier));
}

/** Post-check for one reply against earlier assistant replies, oldest first. */
export function thumosReplyFaults(reply: string, earlierAssistant: readonly string[]): ThumosReplyFault[] {
  const faults: ThumosReplyFault[] = [];
  if (replyRepeatsRecent(reply, earlierAssistant)) faults.push('repeat');
  if (replyRecaps(reply)) faults.push('recap');
  if (usesBannedThumosPhrase(reply)) faults.push('banned');
  if (mentionsCheckInOrHealth(reply) && earlierAssistant.some((item) => mentionsCheckInOrHealth(item))) faults.push('health');
  if (offersUndoableAction(reply)) faults.push('undoable');
  return faults;
}

/** A short line that passes the post-check, used when a second draft still fails. */
export function freshThumosFallback(earlierAssistant: readonly string[]): string {
  const options = [
    'I am with you on that. We can stay with what you just said.',
    'All right. We can leave it there for a moment.',
    'Noted. Say the next bit in your own words if you want.',
    'I am here. No need to cover old ground.',
  ];
  return options.find((option) => thumosReplyFaults(option, earlierAssistant).length === 0) ?? 'I am here.';
}

/** Acute wins when the same message is both a craving now and a plan ahead. */
export function detectRisk(userText: string | undefined | null): 'acute' | 'planning' | 'none' {
  const text = userText ?? '';
  if (!text.trim()) return 'none';
  if (ACUTE_TEXT.test(text)) return 'acute';
  if (PLANNING_TEXT.test(text)) return 'planning';
  return 'none';
}

export function inferThumosMode(input: {
  sos: boolean;
  latestCraving?: number | null;
  latestMood?: number | null;
  userText?: string;
  hasHistory: boolean;
}): ThumosMode {
  if (input.sos) return 'support';
  if (detectRisk(input.userText) !== 'none') return 'support';
  if ((input.latestCraving ?? 0) >= 6) return 'support';
  if (!input.hasHistory && !input.userText) return 'opening';
  // 8 is the old Bright (4) once a 1-5 score has been doubled onto 1-10.
  if ((input.latestMood ?? 0) >= 8 && (input.latestCraving ?? 0) <= 3) return 'growth';
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

export type HistoryRow = { role: string; content: string; createdAt?: string };

/** True once the person has already spoken. A guide line alone is not a follow-up. */
export function isThumosFollowUp(rows: { role: string }[]): boolean {
  return rows.some((row) => row.role === 'user');
}

/**
 * Recent turns for the model, oldest first. Rows may arrive newest-first from
 * the database; createdAt puts them back in order. Guide and offline lines
 * are assistant turns, which is what the chat API accepts.
 */
export function historyTurnsForModel(rows: HistoryRow[]): ChatTurn[] {
  const ordered = [...rows].sort((a, b) => {
    if (!a.createdAt || !b.createdAt || a.createdAt === b.createdAt) return 0;
    return a.createdAt < b.createdAt ? -1 : 1;
  });
  return ordered
    .filter((row) => row.content.trim())
    .slice(-THUMOS_CHAT.historyLimit)
    .map((row) => ({
      role: row.role === 'user' ? 'user' : 'assistant',
      content: row.content,
    }));
}

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
  const prior = input.history.slice(-THUMOS_CHAT.historyLimit);
  const last = prior[prior.length - 1];
  const history = last && last.role === 'user' && last.content.trim() === input.user.trim() ? prior.slice(0, -1) : prior;
  return {
    model,
    reasoning_effort,
    stream: input.stream,
    ...(reasoning_effort === 'none' ? { max_tokens: THUMOS_CHAT.maxTokens } : {}),
    messages: [
      { role: 'system', content: input.system },
      ...history,
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

/** Shown on the Thumos screen. It is not stored as a chat message. */
export const THUMOS_INTRO =
  'Thumos is your Sober Coach. Thumos will do his best to help you through cravings and/or help you reason with yourself. He will help you find reasons to stop (or not start) drinking. He can also help motivate you to stay healthy and keep strong, however you may feel.';

/** Retired guide line. Older rows may still be stored. Do not show or speak it. */
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

const ACUTE_SUPPORT = [
  'This is the first support turn. They are in a craving, or they are talking themselves into a drink, right now.',
  'Weave the aims below into natural speech. There is no set order. Do not number them, do not give each aim its own line, and do not produce a template.',
  'Aims, use the ones that fit this message:',
  '- Acknowledge the specific thing they just said, in fresh words.',
  '- When it helps, remind them a craving rises, peaks, and passes, often within about 20 to 30 minutes. That is coaching guidance, not a cited statistic.',
  '- Ask what they think will happen if they drink, and whether that is worth it.',
  '- Mention sober time from CONTEXT only if no earlier reply in this conversation has already said it. Use at most one personal reason, the one that best fits, and do not use a reason already used in the last couple of turns. If none are written, do not invent one.',
  '- Name the breathing exercise, the 10-minute urge timer, and a walk, jog, or run. Those are the options on screen. Mention all three, briefly.',
  '- A single CURATED FACT, with its source, is optional.',
  'If they are giving themselves permission for just one, or saying one won\'t hurt, or that they deserve a drink, or that a few won\'t matter, challenge that gently: the craving usually wants more than one. Use their own history and reasons.',
].join('\n');

const PLANNING_SUPPORT = [
  'This turn is event preparation. They are looking at a situation ahead. They may not be craving this minute.',
  'Follow EVENT PREPARATION below. Do not use the acute craving script, and do not offer only one tool.',
].join('\n');

const EVENT_PREPARATION = [
  'EVENT PREPARATION',
  'When they mention an upcoming situation (a birthday meal, party, wedding, work do, date, pub, family gathering, holiday, or stressful meeting), help them prepare with a short practical plan, not just one tool.',
  'Give 3 to 5 concise, personalised suggestions. Use what CONTEXT records: their stage, interests (such as gym or hiking), personal reasons, and recent sleep or check-in. Do not invent those details. Often end with no question. A short, specific follow-up is fine. If a reminder would help, suggest they set it themselves. You can offer to come back afterwards in this chat.',
  'Cover what is relevant, briefly:',
  'Before. Suggest some exercise beforehand (a brisk walk, a run, a gym session, or a quick workout) to release endorphins and lift mood. Frame that as general wellbeing advice, not medical advice. If exercise does not suit them (time, an injury, or their mood), offer alternatives: a cold shower, a breathing exercise in the app, a short walk outside, music, eating a proper meal, hydrating, a nap, calling a supportive friend, rereading their reasons, the gratitude diary, or the vision board.',
  'Plan. Decide the drink order in advance, including alcohol-free options. Have a ready line for when they are offered a drink, such as "I\'m driving", "I\'m on a health kick", or "Not tonight". Include an exit plan and transport, an ally who knows, and a time to leave.',
  'During. If it gets too much: a breather or a short walk, the urge timer, and a check-in with Thumos.',
  'After. A reward, and a quick reflection in the Gratitude Diary.',
  'You may mention sober time only if no earlier reply has already said it. Use at most one personal reason, and not one used in the last couple of turns. Do not invent one.',
  'The safety rules still apply. Do not give a taper, doses, or medication advice.',
].join('\n');

const FOLLOW_UP_SUPPORT = [
  'This is a follow-up. The earlier turns are in the messages after this system prompt. Read them.',
  'Do not repeat an earlier reply. Do not ask the same question again. Do not run back through the support aims.',
  'Respond to their latest thought and move the conversation forward.',
  'If they say just one, one won\'t hurt, they deserve a drink, or a few won\'t matter, challenge that gently and say that the craving usually wants more than one. Do not repeat sober time if an earlier reply already said it. Use at most one reason, and not one used in the last couple of turns. Then give one concrete thing to do now: the breathing exercise, the 10-minute urge timer, or a short walk.',
  'If they are still preparing for an upcoming event, stay on that plan and take the next practical step. Do not restart the whole plan from the top.',
].join('\n');

const CONVERSATION_SHAPE = [
  'Reply in the moment. Do not recap what they already said or did. Do not open with a summary of earlier turns, such as "You have followed the dog walk and gym" or "Your recent check-in recorded 7 hours".',
  'Mention a check-in or a health reading only when their latest message makes that figure newly relevant. Do it at most once in the whole conversation, and never in two replies in a row. If an earlier reply already used a check-in or a health figure, leave it out.',
  'Usually write 2 to 4 sentences. Answer what they just said, directly.',
  'Often end with no question at all. When a question helps, ask one short follow-up about the specific thing they just said. Vary the ending from turn to turn. Do not reuse a closing line. Do not end by offering a menu of sleep, exercise, nutrition, connection, or purpose.',
  'Never write these phrases: "tied to that figure", "keeps the focus on", "maintaining momentum".',
  'If they name a plan, such as getting to bed at 10pm, affirm that plan and give one concrete tip. Do not widen it into other topics.',
].join('\n');

const OTHER_GUIDANCE: Record<Exclude<ThumosMode, 'support'>, string> = {
  opening:
    'This is the start of the conversation, or the person has not yet said how they feel. Ask how they are feeling. Do not launch into advice.',
  steady:
    'Stay with what they actually said. Be warm and specific. Do not recap earlier turns. Do not answer in a single generic line.',
  growth:
    'They seem to be doing all right. Acknowledge the specific thing they just said, without gushing, and do not reply with only "That is good" or "Keep going". Give one concrete next step that follows from their latest message. Do not cite a check-in or a health figure unless they just brought that subject up, and do not invent one. Do not lecture.',
};

const CRISIS_SUPPORT = [
  'They have said something about suicide or self-harm. Keep the focus solely on the person and getting help now.',
  'Be warm and brief. Encourage them to contact the Samaritans on 116 123, to call 999 if they are in immediate danger, or to reach someone they trust.',
  'Do not mention sober time, day counts, personal reasons, savings, milestones, check-ins, health readings, health insights, the gratitude diary, or the vision board. Do not debate whether they should live. Do not describe methods.',
  'A fixed safety notice is added after your reply. Say the invitation to get help in your own words as well.',
].join('\n');

function committedGuidance(action: CommittedAction): string {
  const where = action === 'breathe'
    ? 'Point them to the breathing exercise on this screen.'
    : action === 'timer'
      ? 'Point them to the 10-minute urge timer on this screen.'
      : 'Affirm the walk, jog, or run. Do not send them to a different tool.';
  return [
    'They have committed to an action. Let them go and do it.',
    'Write 1 or 2 sentences. Affirm the choice.',
    where,
    'Say you will be here after.',
    'Do not ask a question. Do not invite another activity. Do not add another suggestion, a reason, or their sober time.',
  ].join(' ');
}

export type PromptTurn = {
  followUp?: boolean;
  supportShape?: SupportShape;
  committedAction?: CommittedAction | null;
  selfHarm?: boolean;
  soberTimeAlreadySaid?: boolean;
  reasonsAlreadyUsed?: string[];
  /** An earlier assistant reply already used a check-in or a health figure. */
  healthAlreadySaid?: boolean;
  stage?: ThumosStage;
};

function eventPreparationSection(turn: PromptTurn): string {
  if (turn.selfHarm || turn.committedAction || turn.followUp) return '';
  return EVENT_PREPARATION;
}

function modeGuidance(mode: ThumosMode, turn: PromptTurn): string {
  if (turn.selfHarm) return CRISIS_SUPPORT;
  if (turn.committedAction) return committedGuidance(turn.committedAction);
  if (mode !== 'support') return OTHER_GUIDANCE[mode];
  if (turn.followUp) return FOLLOW_UP_SUPPORT;
  if (turn.supportShape === 'planning') return PLANNING_SUPPORT;
  return ACUTE_SUPPORT;
}

function styleLine(turn: PromptTurn): string {
  const voice = 'Use UK English. Be calm, plain, and adult. Never punitive about a lapse. No emoji unless the person uses them first. When you mention someone they talk about, use they, unless the user has already used a pronoun for that person. Do not guess he or she.';
  if (turn.selfHarm) return `${voice} Be warm and brief: 2 to 4 sentences.`;
  if (turn.committedAction) return `${voice} Write 1 or 2 sentences. Do not ask a question.`;
  if (turn.supportShape === 'planning' && !turn.followUp) {
    return `${voice} Give 3 to 5 concise suggestions. Often end with no question. A short, specific follow-up is fine.`;
  }
  return `${voice} Usually 2 to 4 sentences. Answer what they just said. Often end with no question. Vary the ending. Do not answer in a single generic line, and do not put each point on its own line.`;
}

function conversationShape(turn: PromptTurn): string {
  if (turn.selfHarm || turn.committedAction) return '';
  const lines = [CONVERSATION_SHAPE];
  if (turn.healthAlreadySaid) {
    lines.push('A check-in or a health figure was already mentioned in this conversation. Do not mention one in this reply.');
  }
  return lines.join('\n');
}

function repetitionLine(turn: PromptTurn): string {
  if (turn.selfHarm || turn.committedAction) return '';
  const lines = [
    'Mention sober time at most once in the whole conversation, unless they ask or the count itself is the new point. Use at most one personal reason in a reply. Do not repeat a reason already used in the last couple of turns.',
    'A personal reason is a hope they wrote, not a result already achieved. Do not say the hope is already happening, for example that anxiety is already down, unless their message or a check-in says so. Do not say a drink would undo their progress, or any claim like that. Stay with what they said and what CONTEXT records.',
  ];
  if (turn.soberTimeAlreadySaid) lines.push('This conversation already stated the sober time. Do not state it in this reply.');
  if (turn.reasonsAlreadyUsed?.length) {
    lines.push(`Do not use these reasons in this reply; a recent reply already used them: ${turn.reasonsAlreadyUsed.join('; ')}.`);
  }
  return lines.join('\n');
}

export function buildThumosContext(input: ThumosContextInput): string {
  const stage = resolvedStage(input);
  const sober = stage === 'stopped';
  const started = sober && input.sobrietyStartedAt ? new Date(input.sobrietyStartedAt) : null;
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
      return `- ${item.createdAt}: mood ${item.mood}/10, sleep ${item.sleepHours}h, craving ${item.craving}/10${note ? `. Note: ${note}` : ''}`;
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

  const insightLines = (input.healthInsights ?? []).map((line) => line.trim()).filter(Boolean).slice(0, 3);
  const nutritionLines = (input.nutritionLines ?? []).map((line) => line.trim()).filter(Boolean).slice(0, 16);

  if (input.safety.selfHarm) {
    return [
      `Name: ${input.displayName || 'Friend'}`,
      'Sober time, personal reasons, savings, milestones, check-ins, health readings, health insights, the gratitude diary, the vision board, the nutrition log, and the pinned Stoic quote or pinned Platonic quote are withheld on this turn. Do not mention them or invent them. Do not call Plato a Stoic.',
      `Mode: ${input.mode}`,
      `Safety flags: self-harm YES, withdrawal ${input.safety.withdrawal ? 'YES' : 'no'}`,
    ].join('\n');
  }

  const stageLines = [
    `Stage: ${STAGE_LABEL[stage]}`,
    stage === 'trying_to_stop'
      ? `Planned quit date: ${input.plannedQuitAt ?? 'not sure yet'}`
      : '',
    stage === 'cutting_down' && input.weeklyUnitsGoal != null ? `Units goal: ${input.weeklyUnitsGoal} a week` : '',
    stage === 'cutting_down' && input.drinkFreeDaysGoal != null
      ? `Drink-free days this week: ${input.drinkFreeThisWeek ?? 0} of ${input.drinkFreeDaysGoal}`
      : '',
    sober ? '' : 'Do not invent sober time, savings, or milestones.',
  ].filter(Boolean);

  return [
    `Name: ${input.displayName || 'Friend'}`,
    ...stageLines,
    elapsed ? `Sober time: ${formatSoberElapsed(elapsed)} (since ${input.sobrietyStartedAt})` : sober ? 'Sober time: not set' : '',
    sober ? (saved ? `From their own typical week: about ${saved.moneyGbp} GBP and ${saved.units} units not consumed.` : 'Savings inputs: not set') : '',
    sober ? `Milestones reached: ${milestones.length ? milestones.join(', ') : 'none yet'}` : '',
    `Personal reasons:\n${input.reasons.length ? input.reasons.map((reason) => `- ${reason}`).join('\n') : '- none written yet'}`,
    `Interests: ${(input.interests ?? []).map((label) => label.trim()).filter(Boolean).slice(0, 12).join(', ') || 'none chosen'}`,
    input.pinnedQuote?.text
      ? pinnedQuoteContext(input.pinnedQuote)
      : '',
    `Recent check-ins (newest first):\n${checkIns || '- none yet'}`,
    `Health readings:\n${health || '- none shared'}`,
    insightLines.length ? `Health insights, not medical advice:\n${insightLines.map((line) => `- ${line}`).join('\n')}` : '',
    `HRV explainer, general guidance and not a diagnosis. Use this if they ask what heart rate variability means. Do not turn it into a diagnosis or a personal target:\n${hrvExplainerForCoach()}`,
    formatGratitudeContext(input.gratitude ?? []),
    formatVisionContext(input.vision),
    nutritionLines.length ? `Nutrition, their own log. Estimates are estimates:\n${nutritionLines.map((line) => `- ${line}`).join('\n')}` : '',
    `Mode: ${input.mode}`,
    `Safety flags: self-harm ${input.safety.selfHarm ? 'YES' : 'no'}, withdrawal ${input.safety.withdrawal ? 'YES' : 'no'}`,
  ].filter(Boolean).join('\n');
}

export function buildSystemPrompt(
  context: string,
  mode: ThumosMode,
  facts: readonly CitedFact[] = ALCOHOL_FACTS,
  turn: PromptTurn = {},
): string {
  const factText = facts === ALCOHOL_FACTS ? factsBlock() : facts.map((fact) => `- [${fact.id}] ${fact.text} (${fact.source})`).join('\n');
  return [
    'You are Thumos, the spirited companion in Charioteer.',
    'Charioteer is named for Plato\'s charioteer of the soul. You are the spirited horse: courage, heart, and forward motion.',
    turn.selfHarm
      ? 'On this turn your only job is to stay with this person and help them reach help now.'
      : (turn.stage && turn.stage !== 'stopped')
        ? stageGuidance(turn.stage)
        : 'Your job is to help this person stay sober and get healthier.',
    'You are not a doctor, therapist, or emergency service. Say so when the conversation touches physical health, withdrawal, or mental health.',
    'You cannot act outside this chat. Never offer to set a reminder, an alarm, or a calendar entry, and never offer to contact someone. If a reminder, alarm, or calendar entry would help, suggest they set it themselves. Do not say "I can set a reminder".',
    styleLine(turn),
    'The messages after this system prompt are the conversation so far, oldest first, then their latest line. Use that history. Never repeat a sentence you have already sent. Vary your wording from turn to turn.',
    turn.selfHarm
      ? 'Do not mention sober time, day counts, personal reasons, savings, health readings, health insights, the gratitude diary, the vision board, the nutrition log, or a pinned Stoic quote or a pinned Platonic quote on this turn. Do not call Plato a Stoic.'
      : 'When you mention sober time, a personal reason, a check-in, a health reading, a health insight, a gratitude line, a vision caption, or a pinned Stoic quote or a pinned Platonic quote, take it from CONTEXT. Do not invent those details. A health insight is a note from their own readings, not a diagnosis. If CONTEXT includes an HRV explainer, you may use that wording when they ask what heart rate variability means. Do not add ranges or citations that are not written there, and do not diagnose. If CONTEXT includes a pinned Stoic quote or a pinned Platonic quote, you may use it once for motivation. Quote it faithfully. Plato is Platonic, not a Stoic. Do not call Plato a Stoic.',
    turn.selfHarm ? '' : GRATITUDE_PROMPT_LINE,
    turn.selfHarm ? '' : VISION_PROMPT_LINE,
    turn.selfHarm ? '' : NUTRITION_PROMPT_LINE,
    'Do not invent statistics, study names, or citations. If you share a number about alcohol harm, use only CURATED FACTS, quote it faithfully, and name the source. If you do not have a verified figure, say so.',
    repetitionLine(turn),
    conversationShape(turn),
    modeGuidance(mode, turn),
    eventPreparationSection(turn),
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
