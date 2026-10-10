import { factsBlock, type CitedFact, ALCOHOL_FACTS } from './facts';
import { earnedMilestones } from './milestones';
import { savingsFromTypicalWeek } from './savings';
import { formatSoberElapsed, soberElapsed } from './sober';
import { detectSafety, type SafetyHit } from './safety';

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
    'Stay with what they actually said. Be warm and brief. Do not perform cheerfulness.',
  growth:
    'They seem to be doing all right. Acknowledge it without gushing, then offer one or two next steps among exercise, sleep, nutrition, connection, and purpose. Ask what they want. Do not lecture.',
  support:
    'They are craving, or they opened SOS. Ask what they think will happen if they drink, and whether those consequences are worth it. Remind them that cravings rise, peak, and pass, often within 20 to 30 minutes — present this as coaching guidance, not as a cited statistic. Offer the in-app breathing exercise and the 10-minute urge timer. Suggest a walk, jog, or run if they are able. Remind them of their own reasons, in their words. You may offer one fact from CURATED FACTS, or a plain consequence (sleep, money, relationships, the next morning). Offer it. If they do not want it, leave it.',
};

export function buildThumosContext(input: ThumosContextInput): string {
  const started = input.sobrietyStartedAt ? new Date(input.sobrietyStartedAt) : null;
  const elapsed = started ? soberElapsed(started, input.now) : null;
  const milestones = started ? earnedMilestones(started, input.now).map((item) => item.badge) : [];
  const saved =
    elapsed && input.weeklySpendGbp != null && input.weeklyUnits != null
      ? savingsFromTypicalWeek(input.weeklySpendGbp, input.weeklyUnits, elapsed.totalMs)
      : null;

  const checkIns = input.checkIns
    .slice(0, 7)
    .map(
      (item) =>
        `- ${item.createdAt}: mood ${item.mood}/5, sleep ${item.sleepHours}h, craving ${item.craving}/10${item.note ? `. Note: ${item.note}` : ''}`,
    )
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
    'Use UK English. Be calm, plain, and adult. Never punitive about a lapse. Short paragraphs. No emoji unless the person uses them first.',
    'Do not invent statistics, study names, or citations. If you share a number about alcohol harm, use only CURATED FACTS, quote it faithfully, and name the source. If you do not have a verified figure, say so.',
    MODE_GUIDANCE[mode],
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
