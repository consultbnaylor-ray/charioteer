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
};

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
 * A situation still ahead: the pub, a party, other people drinking, or doubt
 * they can get through it. Not the same as a craving that is happening now.
 */
const PLANNING_TEXT = new RegExp(
  [
    String.raw`\bpub\b`,
    String.raw`\bbar\b`,
    String.raw`\bparty\b`,
    String.raw`\bwedding\b`,
    String.raw`\bstag\b`,
    String.raw`\bhen (?:do|party|night)\b`,
    String.raw`\b(?:can${APOSTROPHE}t|cannot|cant) handle\b`,
    String.raw`\bif i can handle\b`,
    String.raw`\bnot sure (?:if |that )?i can handle\b`,
    String.raw`\b(?:mates|friends) drinking\b`,
    String.raw`\bdrinking with (?:my )?(?:mates|friends)\b`,
    String.raw`\b(?:mates|friends) (?:are |were )?(?:all )?(?:going|out)\b`,
  ].join('|'),
  'i',
);

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
  'This is the first support turn. They are looking at a situation ahead, such as a pub, a bar, a party, a wedding, or other people drinking. They may not be craving this minute.',
  'Help them make a plan, in natural speech, with no set order and no stack of one-line paragraphs.',
  'Draw on whichever of these fits: a way to leave, a soft drink they can order without a debate, one friend who knows they are not drinking, arriving later or leaving earlier, and a short reply ready for someone who says go on, have one.',
  'You may mention sober time only if no earlier reply has already said it. Use at most one personal reason, and not one used in the last couple of turns. Do not invent one.',
  'Do not mention the breathing exercise or the 10-minute urge timer unless they say they are craving now.',
].join('\n');

const FOLLOW_UP_SUPPORT = [
  'This is a follow-up. The earlier turns are in the messages after this system prompt. Read them.',
  'Do not repeat an earlier reply. Do not ask the same question again. Do not run back through the support aims.',
  'Respond to their latest thought and move the conversation forward.',
  'If they say just one, one won\'t hurt, they deserve a drink, or a few won\'t matter, challenge that gently and say that the craving usually wants more than one. Do not repeat sober time if an earlier reply already said it. Use at most one reason, and not one used in the last couple of turns. Then give one concrete thing to do now: the breathing exercise, the 10-minute urge timer, or a short walk.',
  'If they are still facing a pub, a bar, or another plan, stay on that plan and take the next practical step. Do not restart the plan from the top.',
].join('\n');

const OTHER_GUIDANCE: Record<Exclude<ThumosMode, 'support'>, string> = {
  opening:
    'This is the start of the conversation, or the person has not yet said how they feel. Ask how they are feeling. Do not launch into advice.',
  steady:
    'Stay with what they actually said. Be warm and specific. End with one question. Do not answer in a single generic line.',
  growth:
    'They seem to be doing all right. Acknowledge the specific thing they said, without gushing, and do not reply with only "That is good" or "Keep going". Cite one real figure from Health readings or Recent check-ins in CONTEXT, with its unit, such as a step count or hours of sleep. If CONTEXT has no figure, do not invent one. Then suggest one specific next step tied to that figure, among exercise, sleep, nutrition, connection, and purpose. End with one question about what they want to try. Do not lecture.',
};

const CRISIS_SUPPORT = [
  'They have said something about suicide or self-harm. Keep the focus solely on the person and getting help now.',
  'Be warm and brief. Encourage them to contact the Samaritans on 116 123, to call 999 if they are in immediate danger, or to reach someone they trust.',
  'Do not mention sober time, day counts, personal reasons, savings, milestones, check-ins, or health readings. Do not debate whether they should live. Do not describe methods.',
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
  stage?: ThumosStage;
};

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
  return `${voice} Write 3 to 6 sentences of connected prose and end with one question. Do not answer in a single generic line, and do not put each point on its own line.`;
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

  if (input.safety.selfHarm) {
    return [
      `Name: ${input.displayName || 'Friend'}`,
      'Sober time, personal reasons, savings, milestones, check-ins, and health readings are withheld on this turn. Do not mention them or invent them.',
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
    `Recent check-ins (newest first):\n${checkIns || '- none yet'}`,
    `Health readings:\n${health || '- none shared'}`,
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
    styleLine(turn),
    'The messages after this system prompt are the conversation so far, oldest first, then their latest line. Use that history. Never repeat a sentence you have already sent. Vary your wording from turn to turn.',
    turn.selfHarm
      ? 'Do not mention sober time, day counts, personal reasons, savings, or health readings on this turn.'
      : 'When you mention sober time, a personal reason, a check-in, or a health reading, take it from CONTEXT. Do not invent those details.',
    'Do not invent statistics, study names, or citations. If you share a number about alcohol harm, use only CURATED FACTS, quote it faithfully, and name the source. If you do not have a verified figure, say so.',
    repetitionLine(turn),
    modeGuidance(mode, turn),
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
