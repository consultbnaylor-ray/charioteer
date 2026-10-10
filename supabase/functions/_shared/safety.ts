/**
 * Recall-leaning detectors for two situations Thumos must not improvise through:
 * dangerous alcohol withdrawal, and suicidal thoughts or self-harm.
 * The copy below is fixed product language, not model output.
 */

export const WITHDRAWAL_NOTICE = [
  'Alcohol withdrawal can be physically dangerous, and Thumos is not a doctor.',
  'If you are dependent on alcohol, do not stop suddenly on your own.',
  'Contact your GP, or call NHS 111.',
  'Call 999 or go to A&E now if there is a seizure, confusion, collapse, severe shaking, or you feel unsafe.',
  'The NHS describes withdrawal symptoms that include sweating, shaking, hallucinations, confusion, and seizures, and says to get medical help before trying to stop if those symptoms appear.',
].join(' ');

export const SELF_HARM_NOTICE = [
  'I am glad you said it. You deserve support from a person, right now, and I am not a crisis service.',
  'If you are in immediate danger, call 999.',
  'You can call the Samaritans free, at any hour, on 116 123.',
  'I will stay with you here as well.',
].join(' ');

const SELF_HARM_PATTERNS: RegExp[] = [
  /\bsuicid(?:e|al)\b/i,
  /\bkill myself\b/i,
  /\bend my life\b/i,
  /\btake my own life\b/i,
  /\bwant to die\b/i,
  /\bbetter off dead\b/i,
  /\bnot worth living\b/i,
  /\bself[-\s]?harm\b/i,
  /\bhurt myself\b/i,
  /\bdon'?t want to (?:be here|live|be alive)\b/i,
  /\bdo not want to (?:be here|live|be alive)\b/i,
];

const SYMPTOM =
  /\b(shakes?|shaking|tremor|trembling|sweats?|sweating|hallucin\w*|seeing things|hearing things|seizures?|delirium|dts|had a fit|having fits)\b/i;
const ALCOHOL = /\b(drink(?:ing|s)?|drank|alcohol|sober|withdraw\w*|detox|booze|wine|vodka|whisky|whiskey|cider|lager|beer|spirits?|units?)\b/i;
const ABRUPT = /\b(cold turkey|stop(?:ping)? (?:tonight|today|now|abruptly|suddenly|completely|overnight)|quit suddenly|come off (?:it )?tonight)\b/i;
const HEAVY = /\b(every day|each day|daily|a day|per day|dependent|dependence|bottle|litre|liter|can(?:not|'t) function|morning drink|hair of the dog|physically dependent)\b/i;

export type SafetyHit = {
  selfHarm: boolean;
  withdrawal: boolean;
  reasons: string[];
};

export function detectSafety(text: string): SafetyHit {
  const reasons: string[] = [];
  const selfHarm = SELF_HARM_PATTERNS.some((pattern) => pattern.test(text));
  if (selfHarm) reasons.push('self-harm or suicidal language');

  const withdrawalSymptom = SYMPTOM.test(text) && ALCOHOL.test(text);
  const abruptHeavyStop = ABRUPT.test(text) && HEAVY.test(text) && ALCOHOL.test(text);
  const withdrawal = withdrawalSymptom || abruptHeavyStop;
  if (withdrawalSymptom) reasons.push('possible withdrawal symptoms');
  if (abruptHeavyStop) reasons.push('heavy drinking with an abrupt stop');

  return { selfHarm, withdrawal, reasons };
}

/** Fixed notices for a hit. The model reply is irrelevant: the card always uses this list. */
export function pinnedSafetyNotices(hit: SafetyHit): string[] {
  const notices: string[] = [];
  if (hit.selfHarm) notices.push(SELF_HARM_NOTICE);
  if (hit.withdrawal) notices.push(WITHDRAWAL_NOTICE);
  return notices;
}

export function firstSafetyHit(texts: string[]): SafetyHit {
  for (const text of texts) {
    const hit = detectSafety(text);
    if (hit.selfHarm || hit.withdrawal) return hit;
  }
  return { selfHarm: false, withdrawal: false, reasons: [] };
}

export function ensureSafetyNotices(reply: string, hit: SafetyHit): string {
  let next = reply.trim();
  for (const notice of pinnedSafetyNotices(hit)) {
    if (!next.includes(notice)) next = `${next}\n\n${notice}`.trim();
  }
  return next.trim();
}
