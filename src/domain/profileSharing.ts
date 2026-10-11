import { isoDay, parseIsoDay } from './dates';
import { averageValue, formatHealthValue, HEALTH_KINDS, HEALTH_METRICS, seriesForWindow } from './healthInsights';
import { MILESTONES, milestoneReached } from './milestones';
import { savingsFromTypicalWeek } from './savings';
import { soberElapsed } from './sober';
import { STAGE_LABELS, isStage } from './stage';

/** Shown under every Share on profile switch while Community is on. */
export const SHARE_HINT = 'Visible to other community members';

/** Shown under the switches while Community is off. */
export const PROFILE_HIDDEN_SHARE = 'Your profile is hidden from others. Nothing here is visible until Community is on.';

/**
 * First share of sobriety or health information. Explicit consent for special
 * category data. Quantica Labs Ltd is the controller.
 */
export const SENSITIVE_SHARE_BODY =
  'This can show health information. Days sober, your stage, reasons, money and unit totals, a mood streak, and health headlines are special category data under UK GDPR. Other adults in the Charioteer community can see what you switch on. They cannot see raw readings, check-in notes, flags, or Thumos chats. Quantica Labs Ltd is the controller. Share this only if you want them to see it.';

export const NEVER_SHARED =
  'Always hidden: check-in details, raw health readings, health flags, height, Thumos chats, and any photo you have not switched on.';

export type ProfileSharing = {
  town: boolean;
  stage: boolean;
  sober: boolean;
  reasonBodies: string[];
  savings: boolean;
  moodStreak: boolean;
  healthKinds: string[];
  gratitudeIds: string[];
  gratitudePhotoIds: string[];
  visionIds: string[];
  /** Set the first time a sobriety or health item is shared. */
  sensitiveConsentAt: string | null;
};

export function defaultProfileSharing(): ProfileSharing {
  return {
    town: false,
    stage: false,
    sober: false,
    reasonBodies: [],
    savings: false,
    moodStreak: false,
    healthKinds: [],
    gratitudeIds: [],
    gratitudePhotoIds: [],
    visionIds: [],
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

export function normalizeProfileSharing(value: unknown): ProfileSharing {
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const kinds = stringList(raw.healthKinds).filter((kind) => (HEALTH_KINDS as readonly string[]).includes(kind));
  const consent = typeof raw.sensitiveConsentAt === 'string' && raw.sensitiveConsentAt.trim() ? raw.sensitiveConsentAt : null;
  return {
    town: flag(raw.town),
    stage: flag(raw.stage),
    sober: flag(raw.sober),
    reasonBodies: stringList(raw.reasonBodies),
    savings: flag(raw.savings),
    moodStreak: flag(raw.moodStreak),
    healthKinds: kinds,
    gratitudeIds: stringList(raw.gratitudeIds),
    gratitudePhotoIds: stringList(raw.gratitudePhotoIds),
    visionIds: stringList(raw.visionIds),
    sensitiveConsentAt: consent,
  };
}

const SENSITIVE_FLAGS = ['stage', 'sober', 'savings', 'moodStreak'] as const;

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
  town: string | null;
  stage: string;
  sobrietyStartedAt: string | null;
  weeklySpendGbp: number | null;
  weeklyUnits: number | null;
  interestLabels: string[];
  reasons: { body: string; sortOrder: number }[];
  checkIns: { createdAt: string }[];
  health: { kind: string; value: number; recordedOn: string }[];
  gratitude: { id: string; body: string; entryDate: string; photoIds: string[] }[];
  vision: { id: string; caption: string; area: string | null }[];
  progressPhotos: { id: string; note: string; takenOn: string; monthIndex: number; visibility: 'private' | 'community' }[];
};

export type PublicProfileView = {
  displayName: string;
  interests: string[];
  town: string | null;
  stage: string | null;
  sober: { days: number; milestones: string[] } | null;
  reasons: string[];
  savings: { moneyGbp: number; units: number } | null;
  moodStreak: number | null;
  health: string[];
  progressPhotos: { id: string; note: string; takenOn: string; monthIndex: number }[];
  gratitude: { id: string; body: string; entryDate: string }[];
  gratitudePhotos: { id: string }[];
  vision: { id: string; caption: string; area: string | null }[];
  sharedLabels: string[];
  hiddenLabels: string[];
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

function soberShare(source: ShareSource): { days: number; milestones: string[] } | null {
  if (!source.sobrietyStartedAt) return null;
  const started = new Date(source.sobrietyStartedAt);
  if (Number.isNaN(started.getTime())) return null;
  const elapsed = soberElapsed(started, source.now);
  const milestones = MILESTONES.filter((milestone) => milestoneReached(milestone.key, started, source.now)).map((milestone) => milestone.badge);
  return { days: elapsed.days, milestones };
}

/**
 * What another community member is allowed to see. Unshared fields are omitted.
 * Name and interests stay on. Everything else starts off.
 */
export function projectPublicProfile(source: ShareSource, sharing: ProfileSharing): PublicProfileView {
  const settings = normalizeProfileSharing(sharing);
  const town = settings.town && source.town?.trim() ? source.town.trim() : null;
  const stage = settings.stage && isStage(source.stage) ? STAGE_LABELS[source.stage] : null;
  const sober = settings.sober ? soberShare(source) : null;
  const wantedReasons = new Set(settings.reasonBodies);
  const reasons = source.reasons
    .filter((reason) => wantedReasons.has(reason.body.trim()))
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((reason) => reason.body.trim());
  let savings: PublicProfileView['savings'] = null;
  if (settings.savings && source.sobrietyStartedAt && source.weeklySpendGbp != null && source.weeklyUnits != null) {
    const started = new Date(source.sobrietyStartedAt);
    if (!Number.isNaN(started.getTime())) {
      const totals = savingsFromTypicalWeek(source.weeklySpendGbp, source.weeklyUnits, Math.max(0, source.now.getTime() - started.getTime()));
      savings = { moneyGbp: totals.moneyGbp, units: totals.units };
    }
  }
  const moodStreak = settings.moodStreak ? moodStreakCount(source.checkIns, source.today) : null;
  const health = healthHeadlines(source, settings.healthKinds);
  const progressPhotos = source.progressPhotos
    .filter((photo) => photo.visibility === 'community')
    .map((photo) => ({ id: photo.id, note: photo.note, takenOn: photo.takenOn, monthIndex: photo.monthIndex }));
  const gratitudeIds = new Set(settings.gratitudeIds);
  const gratitude = source.gratitude
    .filter((entry) => gratitudeIds.has(entry.id))
    .map((entry) => ({ id: entry.id, body: entry.body, entryDate: entry.entryDate }));
  const photoIds = new Set(settings.gratitudePhotoIds);
  const gratitudePhotos = source.gratitude.flatMap((entry) => entry.photoIds.filter((id) => photoIds.has(id)).map((id) => ({ id })));
  const visionIds = new Set(settings.visionIds);
  const vision = source.vision
    .filter((item) => visionIds.has(item.id))
    .map((item) => ({ id: item.id, caption: item.caption, area: item.area }));

  const sharedLabels = ['Name', 'Interests'];
  const hiddenLabels: string[] = [];
  if (town) sharedLabels.push('Town');
  else hiddenLabels.push('Town');
  if (stage) sharedLabels.push('Stage');
  else hiddenLabels.push('Stage');
  if (sober) sharedLabels.push('Days sober and milestones');
  else hiddenLabels.push('Days sober and milestones');
  if (reasons.length) sharedLabels.push('Reasons');
  else hiddenLabels.push('Reasons');
  if (savings) sharedLabels.push('Money saved and units avoided');
  else hiddenLabels.push('Money saved and units avoided');
  if (moodStreak != null) sharedLabels.push('Mood streak');
  else hiddenLabels.push('Mood streak');
  if (health.length) sharedLabels.push('Health headlines');
  else hiddenLabels.push('Health headlines');
  if (progressPhotos.length) sharedLabels.push('Progress photos');
  else hiddenLabels.push('Progress photos');
  if (gratitude.length) sharedLabels.push('Gratitude lines');
  else hiddenLabels.push('Gratitude lines');
  if (gratitudePhotos.length) sharedLabels.push('Gratitude photos');
  else hiddenLabels.push('Gratitude photos');
  if (vision.length) sharedLabels.push('Vision items');
  else hiddenLabels.push('Vision items');

  return {
    displayName: source.displayName,
    interests: source.interestLabels,
    town,
    stage,
    sober,
    reasons,
    savings,
    moodStreak,
    health,
    progressPhotos,
    gratitude,
    gratitudePhotos,
    vision,
    sharedLabels,
    hiddenLabels,
  };
}

function textList(value: unknown): string[] {
  return stringList(value);
}

/** Reads the public_profile payload and keeps only the shared fields. */
export function parsePublicProfile(value: unknown): PublicProfileView | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const soberRaw = raw.sober && typeof raw.sober === 'object' ? (raw.sober as Record<string, unknown>) : null;
  const savingsRaw = raw.savings && typeof raw.savings === 'object' ? (raw.savings as Record<string, unknown>) : null;
  const photos = Array.isArray(raw.progressPhotos) ? raw.progressPhotos : [];
  const gratitude = Array.isArray(raw.gratitude) ? raw.gratitude : [];
  const gratitudePhotos = Array.isArray(raw.gratitudePhotos) ? raw.gratitudePhotos : [];
  const vision = Array.isArray(raw.vision) ? raw.vision : [];
  return {
    displayName: typeof raw.displayName === 'string' ? raw.displayName : '',
    interests: textList(raw.interests),
    town: typeof raw.town === 'string' && raw.town.trim() ? raw.town : null,
    stage: typeof raw.stage === 'string' && raw.stage.trim() ? raw.stage : null,
    sober: soberRaw && typeof soberRaw.days === 'number'
      ? { days: soberRaw.days, milestones: textList(soberRaw.milestones) }
      : null,
    reasons: textList(raw.reasons),
    savings: savingsRaw && typeof savingsRaw.moneyGbp === 'number' && typeof savingsRaw.units === 'number'
      ? { moneyGbp: savingsRaw.moneyGbp, units: savingsRaw.units }
      : null,
    moodStreak: typeof raw.moodStreak === 'number' ? raw.moodStreak : null,
    health: textList(raw.health),
    progressPhotos: photos.flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const photo = item as Record<string, unknown>;
      if (typeof photo.id !== 'string') return [];
      return [{
        id: photo.id,
        note: typeof photo.note === 'string' ? photo.note : '',
        takenOn: typeof photo.takenOn === 'string' ? photo.takenOn : '',
        monthIndex: typeof photo.monthIndex === 'number' ? photo.monthIndex : 0,
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
      return typeof photo.id === 'string' ? [{ id: photo.id }] : [];
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
    sharedLabels: textList(raw.sharedLabels),
    hiddenLabels: textList(raw.hiddenLabels),
  };
}

export type SharedReportItem = { label: string; summary: string };

/** One report target for each thing this profile is actually showing. */
export function sharedReportItems(view: PublicProfileView): SharedReportItem[] {
  const items: SharedReportItem[] = [];
  if (view.town) items.push({ label: 'Town', summary: view.town });
  if (view.stage) items.push({ label: 'Stage', summary: view.stage });
  if (view.sober) items.push({ label: 'Days sober', summary: `${view.sober.days} days` });
  for (const reason of view.reasons) items.push({ label: 'Reason', summary: reason });
  if (view.savings) items.push({ label: 'Savings', summary: `${view.savings.moneyGbp} saved, ${view.savings.units} units avoided` });
  if (view.moodStreak != null) items.push({ label: 'Mood streak', summary: `${view.moodStreak} days` });
  for (const line of view.health) items.push({ label: 'Health headline', summary: line });
  for (const photo of view.progressPhotos) items.push({ label: 'Progress photo', summary: photo.note || photo.id });
  for (const entry of view.gratitude) items.push({ label: 'Gratitude line', summary: entry.body });
  for (const photo of view.gratitudePhotos) items.push({ label: 'Gratitude photo', summary: photo.id });
  for (const item of view.vision) items.push({ label: 'Vision item', summary: item.caption || item.id });
  return items;
}
