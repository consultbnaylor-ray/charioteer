import { formatUkDate, isoDay } from '@/domain/dates';
import { parseSharedHealthPlan, presentSharedHealthPlan, type HealthPlan, type SharedHealthPlan } from '@/domain/healthPlan';
import {
  averageValue,
  buildHealthInsights,
  formatHealthValue,
  HEALTH_METRICS,
  latestReading,
  seriesForWindow,
} from '@/domain/healthInsights';
import {
  defaultNutritionSettings,
  presentSharedNutrition,
  type FoodLog,
  type NutritionSettings,
} from '@/domain/nutrition';
import { omitSharedLocation } from '@/domain/sharedPayload';

/** How long an invite link can be used. */
export const BUDDY_LINK_DAYS = 7;

export const BUDDY_INVITE_DAILY_LIMIT = 20;
export const BUDDY_LINK_DAILY_LIMIT = 8;

export const BUDDY_CANNOT_INVITE = 'You cannot invite this person.';
export const BUDDY_ALREADY = 'You already share with this person.';
export const BUDDY_ADULT = 'Confirm you are 18 or over first.';
export const BUDDY_INVITE_LIMIT = 'Too many invites today.';
export const BUDDY_LINK_LIMIT = 'Too many links today.';
export const BUDDY_UNAVAILABLE = 'That invite is not available.';
export const BUDDY_CHOOSE = 'Choose at least one thing to share.';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const BUDDY_SCOPE_KEYS = [
  'meals',
  'calories',
  'quality',
  'goal',
  'progress',
  'checkIns',
  'gratitude',
  'vision',
  'healthPlan',
  'healthData',
] as const;

export type BuddyScopeKey = (typeof BUDDY_SCOPE_KEYS)[number];

/** What this person has chosen to show one buddy. Health data starts off. */
export type BuddyScope = Record<BuddyScopeKey, boolean>;

export type BuddyPresetId = 'light' | 'food' | 'picture';

const SUMMARY: Record<BuddyScopeKey, string> = {
  meals: "Today's meal names",
  calories: 'Calories and macros',
  quality: 'Food quality',
  goal: 'Nutrition goal and progress',
  progress: 'Progress and streaks',
  checkIns: 'Check-ins and mood',
  gratitude: 'Gratitude lines',
  vision: 'Vision board words',
  healthPlan: 'Health Plan headline, focus, and ticks',
  healthData: 'Weight, body composition, Apple Health readings, and health flags',
};

const PRESET_SCOPES: Record<BuddyPresetId, BuddyScope> = {
  light: {
    meals: false,
    calories: false,
    quality: false,
    goal: false,
    progress: false,
    checkIns: true,
    gratitude: false,
    vision: false,
    healthPlan: true,
    healthData: false,
  },
  food: {
    meals: true,
    calories: true,
    quality: true,
    goal: true,
    progress: true,
    checkIns: false,
    gratitude: false,
    vision: false,
    healthPlan: false,
    healthData: false,
  },
  picture: {
    meals: true,
    calories: true,
    quality: true,
    goal: true,
    progress: true,
    checkIns: true,
    gratitude: true,
    vision: true,
    healthPlan: true,
    healthData: false,
  },
};

export const BUDDY_PRESETS: readonly { id: BuddyPresetId; label: string }[] = [
  { id: 'light', label: 'A light check' },
  { id: 'food', label: 'Food' },
  { id: 'picture', label: 'The whole picture' },
];

export function emptyBuddyScope(): BuddyScope {
  return {
    meals: false,
    calories: false,
    quality: false,
    goal: false,
    progress: false,
    checkIns: false,
    gratitude: false,
    vision: false,
    healthPlan: false,
    healthData: false,
  };
}

/** Unknown keys are dropped. A missing health data switch stays off. */
export function normalizeBuddyScope(value: unknown): BuddyScope {
  const row = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const scope = emptyBuddyScope();
  for (const key of BUDDY_SCOPE_KEYS) {
    scope[key] = row[key] === true;
  }
  return scope;
}

/**
 * A preset sets the section switches. Health data is kept as it already stands,
 * so a preset cannot turn that switch on.
 */
export function scopeFromPreset(id: BuddyPresetId, healthData = false): BuddyScope {
  return { ...PRESET_SCOPES[id], healthData: healthData === true };
}

export function scopeHasShare(scope: BuddyScope): boolean {
  return BUDDY_SCOPE_KEYS.some((key) => scope[key]);
}

/** The list shown before an invite is sent, and again before it is accepted. */
export function scopeSummary(scope: BuddyScope): string[] {
  const lines = BUDDY_SCOPE_KEYS
    .filter((key) => key !== 'healthData' && scope[key])
    .map((key) => SUMMARY[key]);
  lines.push(scope.healthData ? SUMMARY.healthData : 'Health data stays off.');
  return lines;
}

export type BuddyStatus = 'pending' | 'accepted' | 'declined' | 'revoked';

export type BuddyInvite = {
  id: string;
  ownerId: string;
  buddyId: string;
  status: BuddyStatus;
  scope: BuddyScope;
  createdAt: string;
  name: string;
};

export type BuddyLinkListing = {
  id: string;
  expiresAt: string;
  scope: BuddyScope;
  createdAt: string;
};

export type BuddyList = {
  sharing: BuddyInvite[];
  watching: BuddyInvite[];
  links: BuddyLinkListing[];
};

export type BuddyLinkPass = {
  id: string;
  /** Long secret, shown once inside the link. */
  token: string;
  /** Short secret, shown once so it can be typed. */
  code: string;
  expiresAt: string;
  url: string;
};

const CODE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/;
const TOKEN = /^[0-9a-f]{32}$/i;

export function buddyLinkUrl(token: string): string {
  return `charioteer://buddy?token=${token}`;
}

export function makeBuddyCode(bytes: ArrayLike<number>): string {
  let code = '';
  for (let index = 0; index < 8; index += 1) {
    const byte = bytes[index] ?? 0;
    code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  }
  return code;
}

export function makeBuddyToken(bytes: ArrayLike<number>): string {
  return Array.from({ length: 16 }, (_, index) => (bytes[index] ?? 0).toString(16).padStart(2, '0')).join('');
}

/** The link, the code to type, and the App Store search when the app is not installed. */
export function buddyShareMessage(input: { code: string; url: string; expiresAt: string }): string {
  return [
    'I would like you as an accountability buddy on Charioteer.',
    `Open this link on your phone: ${input.url}`,
    `Or type this code in People, then Buddies: ${input.code}`,
    `The code works once and expires on ${formatUkDate(input.expiresAt)}.`,
    'The app is uk.co.quanticalabs.charioteer.',
    'If Charioteer is not installed, get Charioteer Sober/Health Coach from the App Store, sign in, and type the code.',
    'https://apps.apple.com/gb/search?term=Charioteer%20Sober%20Health%20Coach',
  ].join('\n');
}

/** A code or token carried on a deep link. Anything else is ignored. */
export function buddySecretFromUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    const code = parsed.searchParams.get('code');
    const token = parsed.searchParams.get('token');
    if (code && CODE.test(code.toUpperCase())) return code.toUpperCase();
    if (token && TOKEN.test(token)) return token.toLowerCase();
    const path = parsed.pathname.replace(/\/+$/, '');
    const last = path.split('/').pop() ?? '';
    if (CODE.test(last.toUpperCase())) return last.toUpperCase();
    if (TOKEN.test(last)) return last.toLowerCase();
  } catch {
    const loose = trimmed.match(/(?:code|token)=([A-Za-z0-9]+)/);
    const value = loose?.[1] ?? '';
    if (CODE.test(value.toUpperCase())) return value.toUpperCase();
    if (TOKEN.test(value)) return value.toLowerCase();
  }
  return null;
}

let heldBuddySecret: string | null = null;

export function holdBuddySecret(secret: string | null): void {
  heldBuddySecret = secret;
}

export function peekBuddySecret(): string | null {
  return heldBuddySecret;
}

export function consumeBuddySecret(): string | null {
  const secret = heldBuddySecret;
  heldBuddySecret = null;
  return secret;
}

export type BuddyShareSource = {
  ownerId: string;
  displayName: string;
  today: string;
  nutrition: NutritionSettings;
  foodLogs: readonly FoodLog[];
  checkIns: readonly { mood: number; createdAt: string; note?: string; sleepHours?: number; craving?: number }[];
  gratitude: readonly { body: string }[];
  visionStatement: string | null;
  visionCaptions: readonly string[];
  healthPlan: HealthPlan | null;
  health: readonly { kind: string; value: number; recordedOn: string }[];
  bodyFatPct: number | null;
  leanMassKg: number | null;
  waistCm: number | null;
  /** Present so a test can prove it is never copied. */
  heightCm?: number | null;
};

export type BuddyShareView = {
  ownerId: string;
  displayName: string;
  summary: string[];
  meals: { meal: string; detail: string }[] | null;
  calories: string | null;
  quality: string | null;
  goal: string | null;
  progress: string | null;
  checkIns: string | null;
  gratitude: string[] | null;
  vision: string[] | null;
  healthPlan: SharedHealthPlan | null;
  healthData: string[] | null;
};

function moodStreak(checkIns: readonly { createdAt: string }[], today: string): number {
  const days = new Set(checkIns.map((item) => isoDay(new Date(item.createdAt))));
  let cursor = today;
  if (!days.has(cursor)) {
    const previous = new Date(`${today}T12:00:00`);
    previous.setDate(previous.getDate() - 1);
    cursor = isoDay(previous);
    if (!days.has(cursor)) return 0;
  }
  let count = 0;
  while (days.has(cursor) && count < 366) {
    count += 1;
    const previous = new Date(`${cursor}T12:00:00`);
    previous.setDate(previous.getDate() - 1);
    cursor = isoDay(previous);
  }
  return count;
}

/** Headlines only. Flag detail, steps, and source links stay off the share. */
export function presentBuddyHealth(input: {
  today: string;
  samples: readonly { kind: string; value: number; recordedOn: string }[];
  bodyFatPct: number | null;
  leanMassKg: number | null;
  waistCm: number | null;
}): string[] {
  const samples = input.samples.map((sample) => ({
    kind: sample.kind,
    value: sample.value,
    recordedOn: sample.recordedOn,
  }));
  const lines: string[] = [];
  const weight = latestReading(samples, 'weight_kg', input.today);
  if (weight) lines.push(`Weight ${formatHealthValue('weight_kg', weight.value)}`);
  if (input.bodyFatPct != null) lines.push(`Body fat ${input.bodyFatPct}%`);
  if (input.leanMassKg != null) lines.push(`Lean mass ${input.leanMassKg} kg`);
  if (input.waistCm != null) lines.push(`Waist ${input.waistCm} cm`);
  for (const metric of HEALTH_METRICS) {
    if (metric.kind === 'weight_kg') continue;
    const average = averageValue(seriesForWindow(samples, metric.kind, input.today, 7));
    if (average == null) continue;
    lines.push(`${metric.label} average ${formatHealthValue(metric.kind, average)}`);
  }
  const report = buildHealthInsights({ today: input.today, samples, soberOn: null });
  for (const flag of report.kinds.flatMap((kind) => kind.flags)) {
    if (!lines.includes(flag.headline)) lines.push(flag.headline);
  }
  return lines.slice(0, 12);
}

/**
 * The sections this buddy is allowed to see.
 * Community, public profile switches, Thumos, photo notes, meal photos,
 * check-in notes, and height are not inputs to the result.
 */
export function projectBuddyShare(source: BuddyShareSource, scope: BuddyScope): BuddyShareView {
  const settings: NutritionSettings = {
    ...defaultNutritionSettings(),
    ...source.nutrition,
    shareFoodDiary: scope.meals,
    shareCalories: scope.calories,
    shareQuality: scope.quality,
    shareProgress: scope.progress,
    shareGoal: scope.goal,
    wagonOn: false,
    wagonVisible: false,
    wagonNote: '',
  };
  const nutrition = presentSharedNutrition(settings, source.foodLogs, source.today);
  const plan = presentSharedHealthPlan(source.healthPlan, scope.healthPlan, source.nutrition.goal);
  const latest = [...source.checkIns].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const streak = moodStreak(source.checkIns, source.today);
  const checkIns = scope.checkIns
    ? latest
      ? `Mood ${latest.mood}. Checked in ${streak} ${streak === 1 ? 'day' : 'days'} in a row.`
      : 'No check-in yet.'
    : null;
  return omitSharedLocation({
    ownerId: source.ownerId,
    displayName: source.displayName,
    summary: scopeSummary(scope),
    meals: nutrition.meals,
    calories: nutrition.calories,
    quality: nutrition.quality?.line ?? null,
    goal: nutrition.goal ? `${nutrition.goal.label}. ${nutrition.goal.line}` : null,
    progress: nutrition.progress,
    checkIns,
    gratitude: scope.gratitude ? source.gratitude.map((entry) => entry.body.trim()).filter(Boolean).slice(0, 12) : null,
    vision: scope.vision
      ? [source.visionStatement?.trim() ?? '', ...source.visionCaptions.map((caption) => caption.trim())].filter(Boolean).slice(0, 12)
      : null,
    healthPlan: plan,
    healthData: scope.healthData
      ? presentBuddyHealth({
        today: source.today,
        samples: source.health,
        bodyFatPct: source.bodyFatPct,
        leanMassKg: source.leanMassKg,
        waistCm: source.waistCm,
      })
      : null,
  });
}

function textOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function stringList(value: unknown): string[] | null {
  if (value == null) return null;
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => (typeof item === 'string' && item.trim() ? [item.trim()] : []));
}

function mealList(value: unknown): { meal: string; detail: string }[] | null {
  if (value == null) return null;
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const row = item as Record<string, unknown>;
    const meal = typeof row.meal === 'string' ? row.meal : 'Meal';
    const detail = typeof row.detail === 'string' ? row.detail : '';
    return [{ meal, detail }];
  });
}

function healthFromPayload(value: unknown, today: string): string[] | null {
  if (value == null) return null;
  if (Array.isArray(value)) return value.flatMap((item) => (typeof item === 'string' ? [item] : []));
  if (!value || typeof value !== 'object') return [];
  const row = value as Record<string, unknown>;
  const samples = Array.isArray(row.samples)
    ? row.samples.flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const sample = item as Record<string, unknown>;
      if (typeof sample.kind !== 'string' || typeof sample.value !== 'number' || typeof sample.recordedOn !== 'string') return [];
      return [{ kind: sample.kind, value: sample.value, recordedOn: sample.recordedOn }];
    })
    : [];
  return presentBuddyHealth({
    today,
    samples,
    bodyFatPct: typeof row.bodyFatPct === 'number' ? row.bodyFatPct : null,
    leanMassKg: typeof row.leanMassKg === 'number' ? row.leanMassKg : null,
    waistCm: typeof row.waistCm === 'number' ? row.waistCm : null,
  });
}

/** Reads shared_buddy_data. Null means there is no accepted share. */
export function parseBuddyShare(value: unknown, today = isoDay(new Date())): BuddyShareView | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (typeof row.ownerId !== 'string') return null;
  const scope = normalizeBuddyScope(row.scope);
  const healthPlan = parseSharedHealthPlan(row.healthPlan);
  return omitSharedLocation({
    ownerId: row.ownerId,
    displayName: typeof row.displayName === 'string' ? row.displayName : 'Member',
    summary: scopeSummary(scope),
    meals: mealList(row.meals),
    calories: textOrNull(row.calories),
    quality: textOrNull(row.quality),
    goal: textOrNull(row.goal),
    progress: textOrNull(row.progress),
    checkIns: textOrNull(row.checkIns),
    gratitude: stringList(row.gratitude),
    vision: stringList(row.vision),
    healthPlan,
    healthData: healthFromPayload(row.healthData, today),
  });
}

function inviteRow(value: unknown): BuddyInvite | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const status = row.status;
  if (status !== 'pending' && status !== 'accepted' && status !== 'declined' && status !== 'revoked') return null;
  if (typeof row.id !== 'string' || typeof row.ownerId !== 'string' || typeof row.buddyId !== 'string') return null;
  return {
    id: row.id,
    ownerId: row.ownerId,
    buddyId: row.buddyId,
    status,
    scope: normalizeBuddyScope(row.scope),
    createdAt: typeof row.createdAt === 'string' ? row.createdAt : '',
    name: typeof row.name === 'string' && row.name.trim() ? row.name.trim() : 'Member',
  };
}

export function parseBuddyList(value: unknown): BuddyList {
  const row = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const invites = (list: unknown) => (Array.isArray(list) ? list.flatMap((item) => {
    const invite = inviteRow(item);
    return invite ? [invite] : [];
  }) : []);
  const links = Array.isArray(row.links) ? row.links.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const link = item as Record<string, unknown>;
    if (typeof link.id !== 'string' || typeof link.expiresAt !== 'string') return [];
    return [{
      id: link.id,
      expiresAt: link.expiresAt,
      scope: normalizeBuddyScope(link.scope),
      createdAt: typeof link.createdAt === 'string' ? link.createdAt : '',
    }];
  }) : [];
  return { sharing: invites(row.sharing), watching: invites(row.watching), links };
}

export function parseBuddyPreview(value: unknown): { name: string; scope: BuddyScope } | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  return {
    name: typeof row.name === 'string' && row.name.trim() ? row.name.trim() : 'Member',
    scope: normalizeBuddyScope(row.scope),
  };
}

export function parseBuddyLinkPass(value: unknown): BuddyLinkPass | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== 'string' || typeof row.token !== 'string' || typeof row.code !== 'string' || typeof row.expiresAt !== 'string') return null;
  const url = typeof row.url === 'string' ? row.url : buddyLinkUrl(row.token);
  return { id: row.id, token: row.token, code: row.code, expiresAt: row.expiresAt, url };
}
