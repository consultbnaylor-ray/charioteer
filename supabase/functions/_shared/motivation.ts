/**
 * Motivation turns for Thumos. Sobriety and crisis handling stay in thumos.ts.
 * This file only notices "I can't be bothered" and picks a fresh tactic.
 * It does not invent the person's reasons, vision, mood, streak, or workouts.
 */

export const MOTIVATION_MEMORY = 10;

export const MOVEMENT_REMINDER_TITLE = 'Charioteer';

/** Local notification copy. No streak, mood, food, weight, or other health detail. */
export const MOVEMENT_REMINDER_BODY =
  'A few quiet minutes to move, if you want them. Nothing here is medical advice.';

export type MotivationActivity = 'run' | 'gym' | 'walk' | 'cook' | 'sleep' | 'move';

export type MotivationWhen = 'morning' | 'afternoon' | 'evening' | 'night';

export type MotivationTacticId =
  | 'tiny_step'
  | 'own_words'
  | 'fact_endorphins'
  | 'fact_dopamine'
  | 'fact_endocannabinoids'
  | 'fact_mood'
  | 'fact_sleep'
  | 'fact_cravings'
  | 'future_self'
  | 'stoic'
  | 'playful'
  | 'treat'
  | 'different_activity'
  | 'rest'
  | 'rest_quiet'
  | 'rest_allow';

export type MotivationInput = {
  text: string;
  recentIds?: readonly string[];
  now?: Date;
  reasons?: readonly string[];
  visionStatement?: string | null;
  visionCaptions?: readonly string[];
  soberLabel?: string | null;
  nutritionGoal?: string | null;
  interests?: readonly string[];
  hadWorkout?: boolean;
  overworked?: boolean;
  mood?: number | null;
  sleepHours?: number | null;
  /** Their pinned Stoic line only. A Platonic line must not be passed in. */
  stoicQuote?: string | null;
};

export type MotivationPlan = {
  id: MotivationTacticId;
  activity: MotivationActivity;
  reply: string;
  recentIds: string[];
};

const WHEN_WORD: Record<MotivationWhen, string> = {
  morning: 'This morning',
  afternoon: 'This afternoon',
  evening: 'This evening',
  night: 'Tonight',
};

const STRONG_BOTHERED =
  /\b(?:can(?:not|[’']?t)|cant) be (?:bothered|arsed)\b|\bcba\b|\b(?:do not|don[’']t|dont) feel like\b|\bno motivation\b/i;

const SOFT_BOTHERED =
  /\b(?:can(?:not|[’']?t)|cant) face\b|\bnot bothered\b|\b(?:do not|don[’']t|dont) fancy\b/i;

const ACTIVITY_PATTERNS: { id: MotivationActivity; pattern: RegExp }[] = [
  { id: 'run', pattern: /\b(?:runs?|running|jogs?|jogging)\b/i },
  { id: 'gym', pattern: /\b(?:gym|workouts?|lifting|weights?)\b/i },
  { id: 'walk', pattern: /\b(?:walks?|walking)\b/i },
  { id: 'cook', pattern: /\b(?:cook(?:ing)?(?:\s+healthy)?|healthy (?:meal|food|eating)|eat(?:ing)? healthy)\b/i },
  { id: 'sleep', pattern: /\b(?:sleep(?:ing)?|bedtime|get to bed)\b/i },
];

const UNWELL =
  /\b(?:ill|illness|sick|flu|fever|injured|injury|hurt|hurts|pain|sore|overtrain\w*|pulled|strain(?:ed)?|unwell)\b/i;

const TIRED = /\b(?:tired|exhausted|knackered|shattered|worn out|no energy|wiped)\b/i;

const ROTATION: MotivationTacticId[] = [
  'tiny_step',
  'own_words',
  'fact_endorphins',
  'fact_dopamine',
  'fact_endocannabinoids',
  'fact_mood',
  'fact_sleep',
  'fact_cravings',
  'future_self',
  'stoic',
  'playful',
  'treat',
  'different_activity',
];

const REST_IDS: MotivationTacticId[] = ['rest', 'rest_quiet', 'rest_allow'];

type Person = {
  activity: MotivationActivity;
  when: MotivationWhen;
  reason: string | null;
  caption: string | null;
  statement: string | null;
  soberLabel: string | null;
  nutritionGoal: string | null;
  interest: string | null;
  hadWorkout: boolean;
  stoicQuote: string | null;
  unwell: boolean;
  overworked: boolean;
  moodLow: boolean;
  tired: boolean;
};

export function timeOfDayInLondon(now: Date): MotivationWhen {
  const hour = Number(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    hour: 'numeric',
    hourCycle: 'h23',
  }).format(now));
  if (hour < 5 || hour >= 21) return 'night';
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

export function parseReminderClock(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

export function formatReminderClock(minute: number): string {
  const safe = Math.min(23 * 60 + 59, Math.max(0, Math.floor(minute)));
  const hour = Math.floor(safe / 60);
  const rest = safe % 60;
  return `${String(hour).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

/** The activity they cannot face, or null when this is not a motivation ask. */
export function detectMotivationActivity(text: string): MotivationActivity | null {
  const strong = STRONG_BOTHERED.test(text);
  const soft = SOFT_BOTHERED.test(text);
  if (!strong && !soft) return null;
  let found: { id: MotivationActivity; at: number } | null = null;
  for (const item of ACTIVITY_PATTERNS) {
    const at = text.search(item.pattern);
    if (at >= 0 && (found == null || at < found.at)) found = { id: item.id, at };
  }
  if (found) return found.id;
  return strong ? 'move' : null;
}

export function planMotivation(input: MotivationInput): MotivationPlan | null {
  const activity = detectMotivationActivity(input.text);
  if (!activity) return null;
  const now = input.now ?? new Date();
  const person = personFrom(input, activity, timeOfDayInLondon(now));
  const recent = (input.recentIds ?? []).map(String).filter(Boolean).slice(-MOTIVATION_MEMORY);
  const candidates = candidateIds(person);
  const id = pickTactic(candidates, recent);
  const reply = composeReply(id, person);
  return {
    id,
    activity,
    reply,
    recentIds: [...recent, id].slice(-MOTIVATION_MEMORY),
  };
}

export function motivationGuidance(plan: Pick<MotivationPlan, 'id' | 'activity' | 'reply'>): string {
  return [
    'MOTIVATION TURN',
    'Sobriety and safety still come first. This turn is about getting started, and it replaces a general steady reply.',
    `They cannot be bothered to start: ${plan.activity}.`,
    `Use this approach and no other: ${plan.id}. Do not switch to a tactic you used recently.`,
    'Land this idea in fresh words. Usually 2 to 4 sentences. Do not recap, and do not reuse a stock ending:',
    plan.reply,
    'Personalise only with details already in CONTEXT: their reasons, vision board, why they quit, goals, recent mood, sober time, nutrition goal, past workouts, interests, and the time of day. Do not invent any of those.',
    'If this approach mentions the body, keep the science in plain words (endorphins, dopamine, endocannabinoids, a mood lift after moving, sleep, or a craving easing). No study names and no citations.',
    'This is not medical advice. Respect an injury, an illness, and signs of overtraining. Give permission to rest when those signs are present. Do not push through pain.',
    'Do not offer to set a reminder, an alarm, or a calendar entry.',
  ].join('\n');
}

function personFrom(input: MotivationInput, activity: MotivationActivity, when: MotivationWhen): Person {
  const reason = firstText(input.reasons);
  const statement = clean(input.visionStatement);
  const caption = firstText(input.visionCaptions);
  const unwell = UNWELL.test(input.text);
  const tired = TIRED.test(input.text) || (typeof input.sleepHours === 'number' && input.sleepHours > 0 && input.sleepHours < 5);
  const moodLow = typeof input.mood === 'number' && input.mood > 0 && input.mood <= 4;
  return {
    activity,
    when,
    reason,
    caption,
    statement,
    soberLabel: clean(input.soberLabel),
    nutritionGoal: clean(input.nutritionGoal),
    interest: firstText(input.interests),
    hadWorkout: input.hadWorkout === true,
    stoicQuote: clean(input.stoicQuote),
    unwell,
    overworked: input.overworked === true || /\bovertrain/i.test(input.text),
    moodLow,
    tired,
  };
}

function candidateIds(person: Person): MotivationTacticId[] {
  if (person.unwell || person.overworked) return [...REST_IDS];
  const ordinary = ROTATION.filter((id) => {
    if (id === 'own_words') return Boolean(person.reason || person.caption || person.statement);
    if (id === 'different_activity') return person.tired;
    return true;
  });
  if (!person.moodLow) return ordinary;
  return [...REST_IDS, ...ordinary];
}

function pickTactic(candidates: readonly MotivationTacticId[], recent: readonly string[]): MotivationTacticId {
  const fresh = candidates.find((id) => !recent.includes(id));
  if (fresh) return fresh;
  const oldest = recent.find((id): id is MotivationTacticId => candidates.includes(id as MotivationTacticId));
  return oldest ?? candidates[0];
}

function composeReply(id: MotivationTacticId, person: Person): string {
  if (id === 'rest' || id === 'rest_quiet' || id === 'rest_allow') return restReply(id, person);
  if (id === 'tiny_step') return tinyReply(person);
  if (id === 'own_words') return ownWordsReply(person);
  if (id === 'future_self') return futureReply(person);
  if (id === 'stoic') return stoicReply(person);
  if (id === 'playful') return playfulReply(person);
  if (id === 'treat') return treatReply(person);
  if (id === 'different_activity') return differentReply(person);
  return factReply(id, person);
}

function tinyReply(person: Person): string {
  const stamp = WHEN_WORD[person.when];
  if (person.activity === 'cook') {
    return `${stamp}, leave the perfect menu alone. Fill a glass of water and set one pan on the hob. A plain plate still counts as cooking.`;
  }
  if (person.activity === 'sleep') {
    return `${stamp}, do not bargain with the whole night. Get into bed and put the phone face down in another room. Darkness can do the rest.`;
  }
  const after = person.activity === 'gym'
    ? 'The gym can wait until that is done.'
    : person.activity === 'walk'
      ? 'A walk can begin exactly there.'
      : person.activity === 'move'
        ? 'That is the whole task.'
        : 'You can turn around once it is done.';
  return `${stamp}, skip the debate: just put your trainers on and step outside for 5 minutes. ${after}`;
}

function ownWordsReply(person: Person): string {
  const noun = nounFor(person.activity);
  if (person.reason) {
    return `You wrote "${clip(person.reason)}". Let that be why the ${noun} starts, and keep the effort small enough to finish.`;
  }
  if (person.caption) {
    return `Your board shows "${clip(person.caption)}". Starting the ${noun} is one step toward that picture, not the whole board.`;
  }
  return `Your own line was "${clip(person.statement ?? '')}". The ${noun} can honour it without becoming a performance.`;
}

function futureReply(person: Person): string {
  const noun = nounFor(person.activity);
  const ownWordsTookStatement = !person.reason && !person.caption && Boolean(person.statement);
  if (person.statement && !ownWordsTookStatement) {
    return `The person who wrote "${clip(person.statement)}" does not need you keen. They need the ${noun} to begin.`;
  }
  if (person.soberLabel) {
    return `You have kept ${clip(person.soberLabel)}. The ${noun} does not have to add a trophy to that. It only has to start.`;
  }
  return `Picture the you who already began the ${noun}. They were not fizzing with drive. They only let it start.`;
}

function stoicReply(person: Person): string {
  const noun = nounFor(person.activity);
  if (person.stoicQuote) {
    return `You saved this line: "${clip(person.stoicQuote)}". Take it as a Stoic nudge toward the first step of the ${noun}, and let the feeling follow if it will.`;
  }
  return `A Stoic angle, with no set speech: the part that is yours is the first step of the ${noun}, not the mood you brought to it. Take that step.`;
}

function playfulReply(person: Person): string {
  const noun = nounFor(person.activity);
  const like = person.interest ? ` You already like ${clip(person.interest)}, so the bar can stay that human.` : '';
  return `I will accept a laughably small go at the ${noun}.${like} Five minutes, then you may call the idea ridiculous.`;
}

function treatReply(person: Person): string {
  const noun = nounFor(person.activity);
  const aim = person.nutritionGoal ? ` Your food aim is ${clip(person.nutritionGoal)}, and this can serve it without being grim.` : '';
  const prior = !person.nutritionGoal && person.hadWorkout ? ' You have logged a workout before, so the doorway is already familiar.' : '';
  return `Call the ${noun} a treat you are giving the rest of the day, not a bill that has come due.${aim}${prior} Begin, then the day can have you back.`;
}

function differentReply(person: Person): string {
  if (person.activity === 'sleep') {
    return 'If sleep will not start, drop the perfect night. Dim the room, or read a few paper pages. That different activity is enough.';
  }
  if (person.activity === 'cook') {
    return 'If a proper meal feels like too much, fruit and yoghurt are a different plate and still a kind one. The full recipe can wait.';
  }
  return `Leave the hard version. A slow lap, or stretching where you are, is a different activity and still counts as starting the ${nounFor(person.activity)}.`;
}

function factReply(id: MotivationTacticId, person: Person): string {
  const name = nounFor(person.activity);
  if (person.activity === 'sleep') return sleepFact(id);
  if (person.activity === 'cook') return cookFact(id, name);
  switch (id) {
    case 'fact_endorphins':
      return `A short spell of the ${name} can lift endorphins, the body's own brighter feeling, which is why starting often feels kinder than the half hour you spent refusing it. Give it a few minutes, then judge.`;
    case 'fact_dopamine':
      return `The awkward part is the start. A little of the ${name} is an ordinary way to earn a dab of dopamine, that "worth doing" feeling, and it is not a prescription. Kit on, opinion afterwards.`;
    case 'fact_endocannabinoids':
      return `Easy work on the ${name} can nudge endocannabinoids, a plain account of why a gentle pace sometimes feels calmer once it is underway. Keep it easy, and stop if anything complains.`;
    case 'fact_mood':
      return `Mood tends to lift after the ${name} has begun, not in the chair beforehand. You do not need to feel ready. You need the first corner.`;
    case 'fact_sleep':
      return `Daytime movement, including the ${name}, often makes the night come more easily. Keep it short enough that you still want the pillow later.`;
    default:
      return `A few minutes of the ${name} is one ordinary way to take the edge off a craving while it is loud. It sits beside the urge timer. It does not replace that timer.`;
  }
}

function sleepFact(id: MotivationTacticId): string {
  switch (id) {
    case 'fact_endorphins':
      return 'Getting into bed can still bring a small endorphin ease once the day is actually put down. The win is lying down, not a workout in disguise.';
    case 'fact_dopamine':
      return 'A phone in another room is a small dopamine bargain: the scroll can wait, and sleep gets the first claim. That is a habit, not a medicine.';
    case 'fact_endocannabinoids':
      return 'A calm wind-down is the gentle cousin of movement: it gives the body a chance to settle its own endocannabinoids. Dim light and a still room are enough.';
    case 'fact_mood':
      return 'Sleep is allowed to improve the mood tomorrow even when tonight feels pointless. The task is to start the night, not to feel sleepy first.';
    case 'fact_sleep':
      return 'The science in plain words: a regular night is what makes the next day easier to face. Start that night by getting into bed.';
    default:
      return 'A proper night is one of the quieter ways a craving loses its volume. Bed first. The argument can wait until morning.';
  }
}

function cookFact(id: MotivationTacticId, name: string): string {
  switch (id) {
    case 'fact_endorphins':
      return `Feeding yourself can lift endorphins in a quieter way than a session does. Start the ${name} with one pan, not a feast.`;
    case 'fact_dopamine':
      return `A finished plate is a small dopamine receipt: you did the thing. Begin the ${name} with whatever is already in the kitchen.`;
    case 'fact_endocannabinoids':
      return `A calm meal is a plain way to let endocannabinoids settle you, which is one reason eating properly can feel steadier than skipping it. One honest plate is enough.`;
    case 'fact_mood':
      return `Hunger makes a low mood louder. The ${name} does not have to be impressive to take that edge off.`;
    case 'fact_sleep':
      return `A proper ${name} earlier in the evening often makes sleep less of a fight. Cook the simple version and leave the day there.`;
    default:
      return `A solid ${name} is one ordinary way to turn down a craving. Protein and something filling beat a debate with the cupboard.`;
  }
}

function restReply(id: MotivationTacticId, person: Person): string {
  if (person.unwell || person.overworked) {
    if (id === 'rest_quiet') {
      return 'You can miss this and still be someone who looks after their health. Food, a quiet evening, and sleep are allowed. Speak to a GP or NHS 111 if you are worried.';
    }
    if (id === 'rest_allow') {
      return 'Permission stands: do not push through illness, injury, or signs of overtraining. A day of rest belongs in a strong week, and this is not a diagnosis.';
    }
    return 'Rest is the strong choice when you are ill, injured, or wrung out from training. Thumos is not a doctor. Pain or a body that will not settle is a stop sign.';
  }
  if (id === 'rest_quiet') {
    return 'A low mood can shrink the plan to nothing, and that is allowed. Keep the evening gentle. If you feel unsafe, use the help on this screen before any session.';
  }
  if (id === 'rest_allow') {
    return 'You have permission to leave it today. Low mood is not a character flaw, and rest will not erase the work you have already done.';
  }
  return 'Low mood is a reason to make the first step tiny, or to skip it. Rest is allowed. The session can wait without you having failed it.';
}

function nounFor(activity: MotivationActivity): string {
  if (activity === 'run') return 'run';
  if (activity === 'gym') return 'gym session';
  if (activity === 'walk') return 'walk';
  if (activity === 'cook') return 'healthy meal';
  if (activity === 'sleep') return 'night of sleep';
  return 'bit of movement';
}

function firstText(values: readonly string[] | undefined): string | null {
  for (const value of values ?? []) {
    const next = clean(value);
    if (next) return next;
  }
  return null;
}

function clean(value: string | null | undefined): string | null {
  if (!value) return null;
  const next = value.replace(/\s+/g, ' ').trim();
  return next || null;
}

function clip(value: string): string {
  const next = value.replace(/["“”]/g, '').replace(/\s+/g, ' ').trim();
  if (next.length <= 90) return next;
  return `${next.slice(0, 89).trim()}...`;
}
