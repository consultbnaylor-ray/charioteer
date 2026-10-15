import { formatUkDate, isoDay, parseIsoDay } from './dates';
import { PROFILE_PHOTO_WORDING } from './profilePhotos';
import { averageValue, formatHealthValue, HEALTH_KINDS, HEALTH_METRICS, seriesForWindow } from './healthInsights';
import { MILESTONES, milestoneReached } from './milestones';
import { savingsFromTypicalWeek } from './savings';
import { soberElapsed } from './sober';
import { quoteById, type QuoteSchool } from './stoicQuotes';
import { parseSharedHealthPlan, presentSharedHealthPlan, type HealthPlan, type SharedHealthPlan } from './healthPlan';
import { presentSharedNutrition, type FoodLog, type NutritionSettings, type SharedGoal, type SharedQuality } from './nutrition';
import { STAGE_LABELS, isStage } from './stage';

/** Helper under a Share on profile switch while Community is on. */
export const SHARE_HINT = 'Profile is visible to other community members';

/** Shown under the switches while Community is off. */
export const PROFILE_HIDDEN_SHARE = 'Your profile is hidden from others. Nothing here is visible until Community is on.';

/** Community is on only when the person has switched it on and confirmed they are 18. */
export function communitySharingOn(
  profile: { communityVisible: boolean; ageConfirmed18: boolean } | null | undefined,
): boolean {
  return profile?.communityVisible === true && profile.ageConfirmed18 === true;
}

/**
 * Shown once, the first time a health or sobriety item is switched on.
 * Names that item only. The switch itself is the confirmation.
 */
export function sensitiveShareConfirm(item: string): string {
  return `${item} is health data under UK GDPR. Other members will see it. Share?`;
}

export const NEVER_SHARED =
  `Always hidden: check-in details, raw health readings, health flags, height, Thumos chats, private photo notes, meal photos, and any photo you have not switched on. ${PROFILE_PHOTO_WORDING}`;

/** Written for the public profile. About 300 characters. */
export const BIO_LIMIT = 300;

/** Grey example in the empty bio field. */
export const BIO_EXAMPLE = 'Dad of two, gym most mornings, 90 days sober and counting.';

/** What other people see under a shared photo. Distinct from a private note. */
export const PHOTO_CAPTION_LIMIT = 140;

/** Shown when public_profile fails. A hidden profile uses a different line. */
export const PROFILE_LOAD_ERROR = "Couldn't load profile – Try again";

/** Opt-in beside Share Whole Section. New lines stay private until this is on. */
export const SHARE_NEW_GRATITUDE = 'Share lines I add later';

/** Under the opt-in. The master only covers lines and photos that already exist. */
export const SHARE_NEW_GRATITUDE_HINT = 'New lines and photos stay private until this is on.';

/** Trims a profile line and refuses anything over the limit. Newlines in a bio stay. */
export function planProfileText(value: string, limit: number): { ok: true; text: string } | { ok: false; message: string } {
  const text = value.replace(/\r\n/g, '\n').trim();
  if (text.length > limit) return { ok: false, message: `Keep that to ${limit} characters.` };
  return { ok: true, text };
}

export type ProfileSharing = {
  /** Starts on. A bio is written for the profile, and a missing key stays shared. */
  bio: boolean;
  town: boolean;
  stage: boolean;
  /** Days sober and the since date. Not milestones. */
  soberDays: boolean;
  milestones: boolean;
  reasonBodies: string[];
  moneySaved: boolean;
  unitsAvoided: boolean;
  moodStreak: boolean;
  healthKinds: string[];
  gratitudeIds: string[];
  gratitudePhotoIds: string[];
  visionIds: string[];
  /** The pinned line, Stoic or Platonic. Public-domain text, not special category data. */
  pinnedQuote: boolean;
  /**
   * When on, a line or photo added after this stays shared.
   * Share Whole Section does not turn this on. Missing means off.
   */
  shareNewGratitude: boolean;
  /**
   * Headline, this week's focus, and how many focus items are ticked.
   * Weight, body figures, and the rest of the plan stay off. Missing means off.
   */
  healthPlan: boolean;
  /** Set the first time a sobriety or health item is shared. */
  sensitiveConsentAt: string | null;
};

export function defaultProfileSharing(): ProfileSharing {
  return {
    bio: true,
    town: false,
    stage: false,
    soberDays: false,
    milestones: false,
    reasonBodies: [],
    moneySaved: false,
    unitsAvoided: false,
    moodStreak: false,
    healthKinds: [],
    gratitudeIds: [],
    gratitudePhotoIds: [],
    visionIds: [],
    pinnedQuote: false,
    shareNewGratitude: false,
    healthPlan: false,
    sensitiveConsentAt: null,
  };
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const clean = item.trim();
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
  }
  return out;
}

function flag(value: unknown): boolean {
  return value === true;
}

/**
 * A new per-box key wins when it is present, including an explicit off.
 * Otherwise an old section that was on turns each of its items on.
 */
function chosen(raw: Record<string, unknown>, key: string, legacy: string): boolean {
  if (Object.prototype.hasOwnProperty.call(raw, key)) return flag(raw[key]);
  return flag(raw[legacy]);
}

export function normalizeProfileSharing(value: unknown): ProfileSharing {
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const kinds = stringList(raw.healthKinds).filter((kind) => (HEALTH_KINDS as readonly string[]).includes(kind));
  const consent = typeof raw.sensitiveConsentAt === 'string' && raw.sensitiveConsentAt.trim() ? raw.sensitiveConsentAt : null;
  return {
    bio: raw.bio === false ? false : true,
    town: flag(raw.town),
    stage: flag(raw.stage),
    soberDays: chosen(raw, 'soberDays', 'sober'),
    milestones: chosen(raw, 'milestones', 'sober'),
    reasonBodies: stringList(raw.reasonBodies),
    moneySaved: chosen(raw, 'moneySaved', 'savings'),
    unitsAvoided: chosen(raw, 'unitsAvoided', 'savings'),
    moodStreak: flag(raw.moodStreak),
    healthKinds: kinds,
    gratitudeIds: stringList(raw.gratitudeIds),
    gratitudePhotoIds: stringList(raw.gratitudePhotoIds),
    visionIds: stringList(raw.visionIds),
    pinnedQuote: flag(raw.pinnedQuote),
    shareNewGratitude: flag(raw.shareNewGratitude),
    healthPlan: flag(raw.healthPlan),
    sensitiveConsentAt: consent,
  };
}

/**
 * Shares a line or photo that was just added, when the person opted in.
 * Returns null when the lists should stay as they are.
 */
export function shareFreshGratitude(
  sharing: ProfileSharing,
  added: { entryId?: string; photoId?: string },
): ProfileSharing | null {
  if (!sharing.shareNewGratitude) return null;
  let gratitudeIds = sharing.gratitudeIds;
  let gratitudePhotoIds = sharing.gratitudePhotoIds;
  if (added.entryId && !gratitudeIds.includes(added.entryId)) gratitudeIds = [...gratitudeIds, added.entryId];
  if (added.photoId && !gratitudePhotoIds.includes(added.photoId)) gratitudePhotoIds = [...gratitudePhotoIds, added.photoId];
  if (gratitudeIds === sharing.gratitudeIds && gratitudePhotoIds === sharing.gratitudePhotoIds) return null;
  return { ...sharing, gratitudeIds, gratitudePhotoIds };
}

const SENSITIVE_FLAGS = ['stage', 'soberDays', 'milestones', 'moneySaved', 'unitsAvoided', 'moodStreak', 'healthPlan'] as const;

/** True when this change newly shares sobriety or health information. */
export function sensitiveTurnedOn(before: ProfileSharing, after: ProfileSharing): boolean {
  for (const key of SENSITIVE_FLAGS) {
    if (!before[key] && after[key]) return true;
  }
  if (after.reasonBodies.some((body) => !before.reasonBodies.includes(body))) return true;
  if (after.healthKinds.some((kind) => !before.healthKinds.includes(kind))) return true;
  return false;
}

export function toggleShareId(sharing: ProfileSharing, key: 'reasonBodies' | 'gratitudeIds' | 'gratitudePhotoIds' | 'visionIds', id: string, on: boolean): ProfileSharing {
  const current = sharing[key];
  const next = on ? (current.includes(id) ? current : [...current, id]) : current.filter((item) => item !== id);
  return { ...sharing, [key]: next };
}

/** "Steps" is shown as "Share steps average". */
export function healthShareLabel(metricLabel: string): string {
  return `Share ${metricLabel.toLowerCase()} average`;
}

export function toggleHealthKind(sharing: ProfileSharing, kind: string, on: boolean): ProfileSharing {
  const next = on
    ? sharing.healthKinds.includes(kind) ? sharing.healthKinds : [...sharing.healthKinds, kind]
    : sharing.healthKinds.filter((item) => item !== kind);
  return { ...sharing, healthKinds: next };
}

export type ShareSource = {
  now: Date;
  today: string;
  displayName: string;
  bio: string;
  town: string | null;
  stage: string;
  sobrietyStartedAt: string | null;
  weeklySpendGbp: number | null;
  weeklyUnits: number | null;
  interestLabels: string[];
  reasons: { body: string; sortOrder: number }[];
  checkIns: { createdAt: string }[];
  health: { kind: string; value: number; recordedOn: string }[];
  gratitude: { id: string; body: string; entryDate: string; photos: { id: string; caption: string }[] }[];
  vision: { id: string; caption: string; area: string | null }[];
  /** `note` is private. `caption` is the only line copied onto a shared photo. */
  progressPhotos: { id: string; note: string; caption: string; takenOn: string; monthIndex: number; visibility: 'private' | 'community' }[];
  /** Profile picture and gallery. Shown whenever Community is on. No storage path. */
  profilePhotos?: { id: string; role: 'avatar' | 'gallery'; caption: string; position: number }[];
  pinnedQuoteId: string | null;
  /** Today's nutrition shares. Absent means nothing from the food log is shared. */
  nutrition?: {
    logs: FoodLog[];
    settings: NutritionSettings;
    heightCm?: number | null;
    weights?: { day: string; kg: number }[];
  };
  /** The owner's plan. Only the headline and focus ticks are copied when the switch is on. */
  healthPlan?: HealthPlan | null;
};

export type PublicProfileView = {
  displayName: string;
  /** Shown under the name. Null when the bio is blank or sharing is off. */
  bio: string | null;
  interests: string[];
  town: string | null;
  stage: string | null;
  /** Days and the since date. Milestones are a separate key. */
  sober: { days: number; since: string } | null;
  milestones: string[];
  reasons: string[];
  moneySaved: number | null;
  unitsAvoided: number | null;
  moodStreak: number | null;
  health: string[];
  progressPhotos: { id: string; caption: string; takenOn: string; monthIndex: number }[];
  /** Avatar and gallery. Empty when this person has not added any. */
  profilePhotos: { id: string; role: 'avatar' | 'gallery'; caption: string; position: number }[];
  gratitude: { id: string; body: string; entryDate: string }[];
  gratitudePhotos: { id: string; caption: string }[];
  vision: { id: string; caption: string; area: string | null }[];
  /** Resolved from the bundled catalogue. Unknown ids are dropped. School keeps Plato Platonic. */
  pinnedQuote: { id: string; text: string; author: string; school: QuoteSchool; source: string } | null;
  sharedLabels: string[];
  hiddenLabels: string[];
  /** Today's meal names. Null when that switch is off. An empty list means today is blank. */
  foodDiary: { meal: string; detail: string }[] | null;
  /** kcal and macros. Null when that switch is off. */
  calories: string | null;
  /** Unsaturated fat against saturated and trans fat. */
  quality: SharedQuality | null;
  /** Consecutive days with a meal logged. */
  progress: string | null;
  /** A gentle line, when they have chosen to show a hard moment. */
  wagon: { note: string } | null;
  /** Goal name and a qualitative progress line. Null when that switch is off. */
  goal: SharedGoal | null;
  /** Headline, focus lines, and tick counts. Null when that switch is off or there is no plan. */
  healthPlan: SharedHealthPlan | null;
};

/** Consecutive check-in days. The number only. Mood, craving, sleep, and notes stay off. */
export function moodStreakCount(checkIns: { createdAt: string }[], today: string): number {
  const days = new Set(checkIns.map((item) => isoDay(new Date(item.createdAt))));
  let cursor = today;
  if (!days.has(cursor)) {
    cursor = isoDay(new Date(parseIsoDay(today).getTime() - 86_400_000));
    if (!days.has(cursor)) return 0;
  }
  let count = 0;
  while (days.has(cursor)) {
    count += 1;
    cursor = isoDay(new Date(parseIsoDay(cursor).getTime() - 86_400_000));
  }
  return count;
}

function healthHeadlines(source: ShareSource, kinds: string[]): string[] {
  return kinds.flatMap((kind) => {
    const points = seriesForWindow(source.health, kind, source.today, 7);
    const average = averageValue(points);
    if (average == null) return [];
    const label = HEALTH_METRICS.find((metric) => metric.kind === kind)?.label ?? kind;
    return [`${label} average ${formatHealthValue(kind, average)}`];
  });
}

function soberStart(source: ShareSource): Date | null {
  if (!source.sobrietyStartedAt) return null;
  const started = new Date(source.sobrietyStartedAt);
  return Number.isNaN(started.getTime()) ? null : started;
}

function soberDaysShare(source: ShareSource): { days: number; since: string } | null {
  const started = soberStart(source);
  if (!started) return null;
  return { days: soberElapsed(started, source.now).days, since: isoDay(started) };
}

function milestoneShare(source: ShareSource): string[] {
  const started = soberStart(source);
  if (!started) return [];
  return MILESTONES.filter((milestone) => milestoneReached(milestone.key, started, source.now)).map((milestone) => milestone.badge);
}

/** "90 days sober · since 13 July 2026". The since date is omitted when it was not shared. */
export function formatSoberShare(sober: { days: number; since: string }): string {
  const count = `${sober.days} ${sober.days === 1 ? 'day' : 'days'} sober`;
  return sober.since ? `${count} · since ${formatUkDate(sober.since)}` : count;
}

/**
 * What another community member is allowed to see. Unshared fields are omitted.
 * Name and interests stay on. Bio starts on, because it is written for the profile.
 * Everything else starts off. A private photo note is never copied.
 */
export function projectPublicProfile(source: ShareSource, sharing: ProfileSharing): PublicProfileView {
  const settings = normalizeProfileSharing(sharing);
  const bioText = typeof source.bio === 'string' ? source.bio.trim() : '';
  const bio = settings.bio && bioText ? bioText : null;
  const town = settings.town && source.town?.trim() ? source.town.trim() : null;
  const stage = settings.stage && isStage(source.stage) ? STAGE_LABELS[source.stage] : null;
  const sober = settings.soberDays ? soberDaysShare(source) : null;
  const milestones = settings.milestones ? milestoneShare(source) : [];
  const wantedReasons = new Set(settings.reasonBodies);
  const reasons = source.reasons
    .filter((reason) => wantedReasons.has(reason.body.trim()))
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((reason) => reason.body.trim());
  const started = soberStart(source);
  let moneySaved: number | null = null;
  let unitsAvoided: number | null = null;
  if (started && (settings.moneySaved || settings.unitsAvoided)) {
    const totals = savingsFromTypicalWeek(
      settings.moneySaved ? source.weeklySpendGbp ?? 0 : 0,
      settings.unitsAvoided ? source.weeklyUnits ?? 0 : 0,
      Math.max(0, source.now.getTime() - started.getTime()),
    );
    if (settings.moneySaved && source.weeklySpendGbp != null) moneySaved = totals.moneyGbp;
    if (settings.unitsAvoided && source.weeklyUnits != null) unitsAvoided = totals.units;
  }
  const moodStreak = settings.moodStreak ? moodStreakCount(source.checkIns, source.today) : null;
  const health = healthHeadlines(source, settings.healthKinds);
  const progressPhotos = source.progressPhotos
    .filter((photo) => photo.visibility === 'community')
    .map((photo) => ({ id: photo.id, caption: typeof photo.caption === 'string' ? photo.caption : '', takenOn: photo.takenOn, monthIndex: photo.monthIndex }));
  const profilePhotos = [...(source.profilePhotos ?? [])]
    .flatMap((photo) => {
      if (!photo || (photo.role !== 'avatar' && photo.role !== 'gallery') || typeof photo.id !== 'string') return [];
      return [{
        id: photo.id,
        role: photo.role,
        caption: typeof photo.caption === 'string' ? photo.caption : '',
        position: typeof photo.position === 'number' ? photo.position : 0,
      }];
    })
    .sort((a, b) => (a.role === 'avatar' ? 0 : 1) - (b.role === 'avatar' ? 0 : 1) || a.position - b.position);
  const gratitudeIds = new Set(settings.gratitudeIds);
  const gratitude = source.gratitude
    .filter((entry) => gratitudeIds.has(entry.id))
    .map((entry) => ({ id: entry.id, body: entry.body, entryDate: entry.entryDate }));
  const photoIds = new Set(settings.gratitudePhotoIds);
  const gratitudePhotos = source.gratitude.flatMap((entry) => {
    if (!gratitudeIds.has(entry.id)) return [];
    return (entry.photos ?? [])
      .filter((photo) => photoIds.has(photo.id))
      .map((photo) => ({ id: photo.id, caption: typeof photo.caption === 'string' ? photo.caption : '' }));
  });
  const visionIds = new Set(settings.visionIds);
  const vision = source.vision
    .filter((item) => visionIds.has(item.id))
    .map((item) => ({ id: item.id, caption: item.caption, area: item.area }));

  const sharedLabels = ['Name', 'Interests'];
  const hiddenLabels: string[] = [];
  if (bio) sharedLabels.push('Bio');
  else hiddenLabels.push('Bio');
  if (town) sharedLabels.push('Town');
  else hiddenLabels.push('Town');
  if (stage) sharedLabels.push('Stage');
  else hiddenLabels.push('Stage');
  if (sober) sharedLabels.push('Days sober');
  else hiddenLabels.push('Days sober');
  if (milestones.length) sharedLabels.push('Milestones');
  else hiddenLabels.push('Milestones');
  if (reasons.length) sharedLabels.push('Reasons');
  else hiddenLabels.push('Reasons');
  if (moneySaved != null) sharedLabels.push('Money saved');
  else hiddenLabels.push('Money saved');
  if (unitsAvoided != null) sharedLabels.push('Units avoided');
  else hiddenLabels.push('Units avoided');
  if (moodStreak != null) sharedLabels.push('Mood streak');
  else hiddenLabels.push('Mood streak');
  if (health.length) sharedLabels.push('Health headlines');
  else hiddenLabels.push('Health headlines');
  if (progressPhotos.length) sharedLabels.push('Progress photos');
  else hiddenLabels.push('Progress photos');
  if (profilePhotos.length) sharedLabels.push('Profile photos');
  else hiddenLabels.push('Profile photos');
  if (gratitude.length) sharedLabels.push('Gratitude lines');
  else hiddenLabels.push('Gratitude lines');
  if (gratitudePhotos.length) sharedLabels.push('Gratitude photos');
  else hiddenLabels.push('Gratitude photos');
  if (vision.length) sharedLabels.push('Vision items');
  else hiddenLabels.push('Vision items');
  const pinned = settings.pinnedQuote ? quoteById(source.pinnedQuoteId) : null;
  const pinnedQuote = shownPinnedQuote(pinned);
  if (pinnedQuote) sharedLabels.push('Pinned quote');
  else hiddenLabels.push('Pinned quote');
  const sharedFood = source.nutrition
    ? presentSharedNutrition(source.nutrition.settings, source.nutrition.logs, source.today, {
      heightCm: source.nutrition.heightCm,
      weights: source.nutrition.weights,
    })
    : { meals: null, calories: null, quality: null, progress: null, wagon: null, goal: null };
  const foodDiary = sharedFood.meals;
  const calories = sharedFood.calories;
  const quality = sharedFood.quality;
  const progress = sharedFood.progress;
  const wagon = sharedFood.wagon;
  const goal = sharedFood.goal;
  if (foodDiary) sharedLabels.push("Today's meals");
  else hiddenLabels.push("Today's meals");
  if (calories) sharedLabels.push('Calories and macros');
  else hiddenLabels.push('Calories and macros');
  if (quality) sharedLabels.push('Food quality');
  else hiddenLabels.push('Food quality');
  if (progress) sharedLabels.push('Progress and streaks');
  else hiddenLabels.push('Progress and streaks');
  if (wagon) sharedLabels.push('A hard moment');
  else hiddenLabels.push('A hard moment');
  if (goal) sharedLabels.push('Nutrition goal');
  else hiddenLabels.push('Nutrition goal');
  const healthPlan = presentSharedHealthPlan(source.healthPlan, settings.healthPlan, source.nutrition?.settings.goal ?? null);
  if (healthPlan) sharedLabels.push('Health Plan');
  else hiddenLabels.push('Health Plan');

  return {
    displayName: source.displayName,
    bio,
    interests: source.interestLabels,
    town,
    stage,
    sober,
    milestones,
    reasons,
    moneySaved,
    unitsAvoided,
    moodStreak,
    health,
    progressPhotos,
    profilePhotos,
    gratitude,
    gratitudePhotos,
    vision,
    pinnedQuote,
    sharedLabels,
    hiddenLabels,
    foodDiary,
    calories,
    quality,
    progress,
    wagon,
    goal,
    healthPlan,
  };
}

function textList(value: unknown): string[] {
  return stringList(value);
}

function shownPinnedQuote(pinned: ReturnType<typeof quoteById>) {
  return pinned
    ? { id: pinned.id, text: pinned.text, author: pinned.author, school: pinned.school, source: pinned.source }
    : null;
}

/** Reads the public_profile payload and keeps only the shared fields. */
export function parsePublicProfile(value: unknown): PublicProfileView | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const soberRaw = raw.sober && typeof raw.sober === 'object' ? (raw.sober as Record<string, unknown>) : null;
  const savingsRaw = raw.savings && typeof raw.savings === 'object' ? (raw.savings as Record<string, unknown>) : null;
  const moneySaved = typeof raw.moneySaved === 'number'
    ? raw.moneySaved
    : savingsRaw && typeof savingsRaw.moneyGbp === 'number' ? savingsRaw.moneyGbp : null;
  const unitsAvoided = typeof raw.unitsAvoided === 'number'
    ? raw.unitsAvoided
    : savingsRaw && typeof savingsRaw.units === 'number' ? savingsRaw.units : null;
  const photos = Array.isArray(raw.progressPhotos) ? raw.progressPhotos : [];
  const profilePhotos = Array.isArray(raw.profilePhotos) ? raw.profilePhotos : [];
  const gratitude = Array.isArray(raw.gratitude) ? raw.gratitude : [];
  const gratitudePhotos = Array.isArray(raw.gratitudePhotos) ? raw.gratitudePhotos : [];
  const vision = Array.isArray(raw.vision) ? raw.vision : [];
  const pinned = quoteById(typeof raw.pinnedQuoteId === 'string' ? raw.pinnedQuoteId : null);
  return {
    displayName: typeof raw.displayName === 'string' ? raw.displayName : '',
    bio: typeof raw.bio === 'string' && raw.bio.trim() ? raw.bio.trim() : null,
    interests: textList(raw.interests),
    town: typeof raw.town === 'string' && raw.town.trim() ? raw.town : null,
    stage: typeof raw.stage === 'string' && raw.stage.trim() ? raw.stage : null,
    sober: soberRaw && typeof soberRaw.days === 'number'
      ? { days: soberRaw.days, since: typeof soberRaw.since === 'string' ? soberRaw.since : '' }
      : null,
    milestones: Array.isArray(raw.milestones) ? textList(raw.milestones) : textList(soberRaw?.milestones),
    reasons: textList(raw.reasons),
    moneySaved,
    unitsAvoided,
    moodStreak: typeof raw.moodStreak === 'number' ? raw.moodStreak : null,
    health: textList(raw.health),
    progressPhotos: photos.flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const photo = item as Record<string, unknown>;
      if (typeof photo.id !== 'string') return [];
      return [{
        id: photo.id,
        caption: typeof photo.caption === 'string' ? photo.caption : '',
        takenOn: typeof photo.takenOn === 'string' ? photo.takenOn : '',
        monthIndex: typeof photo.monthIndex === 'number' ? photo.monthIndex : 0,
      }];
    }),
    profilePhotos: profilePhotos.flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const photo = item as Record<string, unknown>;
      if (typeof photo.id !== 'string') return [];
      if (photo.role !== 'avatar' && photo.role !== 'gallery') return [];
      return [{
        id: photo.id,
        role: photo.role,
        caption: typeof photo.caption === 'string' ? photo.caption : '',
        position: typeof photo.position === 'number' ? photo.position : 0,
      }];
    }),
    gratitude: gratitude.flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const entry = item as Record<string, unknown>;
      if (typeof entry.id !== 'string' || typeof entry.body !== 'string') return [];
      return [{ id: entry.id, body: entry.body, entryDate: typeof entry.entryDate === 'string' ? entry.entryDate : '' }];
    }),
    gratitudePhotos: gratitudePhotos.flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const photo = item as Record<string, unknown>;
      return typeof photo.id === 'string'
        ? [{ id: photo.id, caption: typeof photo.caption === 'string' ? photo.caption : '' }]
        : [];
    }),
    vision: vision.flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const entry = item as Record<string, unknown>;
      if (typeof entry.id !== 'string') return [];
      return [{
        id: entry.id,
        caption: typeof entry.caption === 'string' ? entry.caption : '',
        area: typeof entry.area === 'string' ? entry.area : null,
      }];
    }),
    pinnedQuote: shownPinnedQuote(pinned),
    sharedLabels: textList(raw.sharedLabels),
    hiddenLabels: textList(raw.hiddenLabels),
    foodDiary: mealLines(raw.foodDiary),
    calories: typeof raw.calories === 'string' && raw.calories.trim() ? raw.calories : null,
    quality: qualityShare(raw.quality),
    progress: typeof raw.progress === 'string' && raw.progress.trim() ? raw.progress : null,
    wagon: wagonLine(raw.wagon),
    goal: goalFrom(raw.goal),
    healthPlan: parseSharedHealthPlan(raw.healthPlan),
  };
}

function mealLines(value: unknown): { meal: string; detail: string }[] | null {
  if (!Array.isArray(value)) return null;
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const row = item as Record<string, unknown>;
    const meal = typeof row.meal === 'string' ? row.meal : '';
    const detail = typeof row.detail === 'string' ? row.detail : '';
    if (!meal && !detail) return [];
    return [{ meal, detail }];
  });
}

function qualityShare(value: unknown): SharedQuality | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const unsaturated = typeof row.unsaturated === 'number' ? row.unsaturated : 0;
  const other = typeof row.other === 'number' ? row.other : 0;
  const line = typeof row.line === 'string' ? row.line : '';
  if (!line && unsaturated + other <= 0) return null;
  return { unsaturated, other, line };
}

function goalFrom(value: unknown): SharedGoal | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const label = typeof row.label === 'string' ? row.label.trim() : '';
  const line = typeof row.line === 'string' ? row.line.trim() : '';
  if (!label && !line) return null;
  return { label, line };
}

function wagonLine(value: unknown): { note: string } | null {
  if (!value || typeof value !== 'object') return null;
  const note = (value as { note?: unknown }).note;
  return { note: typeof note === 'string' ? note : '' };
}

export type SharedReportItem = { label: string; summary: string };

/** An array from a public profile. A missing or null section is an empty list, not a crash. */
export function shownList<T>(value: readonly T[] | null | undefined): readonly T[] {
  return Array.isArray(value) ? value : [];
}

/** One report target for each thing this profile is actually showing. */
export function sharedReportItems(view: PublicProfileView): SharedReportItem[] {
  const items: SharedReportItem[] = [];
  if (view.bio) items.push({ label: 'Bio', summary: view.bio });
  if (view.town) items.push({ label: 'Town', summary: view.town });
  if (view.stage) items.push({ label: 'Stage', summary: view.stage });
  if (view.sober && typeof view.sober.days === 'number') {
    items.push({ label: 'Days sober', summary: formatSoberShare({ days: view.sober.days, since: typeof view.sober.since === 'string' ? view.sober.since : '' }) });
  }
  for (const badge of shownList(view.milestones)) items.push({ label: 'Milestone', summary: badge });
  for (const reason of shownList(view.reasons)) items.push({ label: 'Reason', summary: reason });
  if (view.moneySaved != null) items.push({ label: 'Money saved', summary: `${view.moneySaved} saved` });
  if (view.unitsAvoided != null) items.push({ label: 'Units avoided', summary: `${view.unitsAvoided} units avoided` });
  if (view.moodStreak != null) items.push({ label: 'Mood streak', summary: `${view.moodStreak} days` });
  for (const line of shownList(view.health)) items.push({ label: 'Health headline', summary: line });
  for (const photo of shownList(view.progressPhotos)) items.push({ label: 'Progress photo', summary: photo.caption || photo.id });
  for (const photo of shownList(view.profilePhotos)) items.push({ label: 'Profile photo', summary: photo.caption || photo.id });
  for (const entry of shownList(view.gratitude)) items.push({ label: 'Gratitude line', summary: entry.body });
  for (const photo of shownList(view.gratitudePhotos)) items.push({ label: 'Gratitude photo', summary: photo.caption || photo.id });
  for (const item of shownList(view.vision)) items.push({ label: 'Vision item', summary: item.caption || item.id });
  if (view.pinnedQuote && typeof view.pinnedQuote.text === 'string') items.push({ label: 'Pinned quote', summary: view.pinnedQuote.text });
  if (Array.isArray(view.foodDiary)) {
    if (view.foodDiary.length === 0) items.push({ label: "Today's meals", summary: 'Nothing logged today.' });
    for (const meal of view.foodDiary) items.push({ label: "Today's meals", summary: `${meal?.meal ?? ''}: ${meal?.detail ?? ''}` });
  }
  if (typeof view.calories === 'string' && view.calories) items.push({ label: 'Calories and macros', summary: view.calories });
  if (view.quality && typeof view.quality.line === 'string') items.push({ label: 'Food quality', summary: view.quality.line });
  if (typeof view.progress === 'string' && view.progress) items.push({ label: 'Progress and streaks', summary: view.progress });
  if (view.wagon) items.push({ label: 'A hard moment', summary: typeof view.wagon.note === 'string' && view.wagon.note ? view.wagon.note : 'Having a hard moment.' });
  if (view.goal && typeof view.goal.line === 'string') items.push({ label: 'Nutrition goal', summary: view.goal.line });
  if (view.healthPlan) {
    items.push({
      label: 'Health plan',
      summary: `${view.healthPlan.headline}. ${view.healthPlan.ticked} of ${view.healthPlan.total} ticked`,
    });
  }
  return items;
}
