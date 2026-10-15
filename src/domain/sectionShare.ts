import { HEALTH_KINDS, HEALTH_METRICS } from './healthInsights';
import type { NutritionSettings } from './nutrition';
import { progressPhotoLabel } from './progressPhotos';
import type { ProfileSharing } from './profileSharing';

/** Master switch copy. The same words sit at the top of each section. */
export const SECTION_SHARE_LABEL = 'Share Whole Section';

/** Shown beside the master when only some boxes in the section are on. */
export const SECTION_SHARE_SOME = 'Some shared';

/** Shown when the section has no boxes yet. The master stays off. */
export const SECTION_SHARE_EMPTY = 'Nothing in this section to share yet.';

export type ShareBox = {
  id: string;
  label: string;
  on: boolean;
  sensitive: boolean;
};

export type SectionShareState = 'off' | 'on' | 'mixed';

/**
 * Derived from the boxes. There is no stored master flag.
 * Empty and all-off are both off, so a new section starts off.
 */
export function sectionShareState(boxes: { on: boolean }[]): SectionShareState {
  if (boxes.length === 0) return 'off';
  const on = boxes.filter((box) => box.on).length;
  if (on === 0) return 'off';
  if (on === boxes.length) return 'on';
  return 'mixed';
}

/** The boxes a master-on would newly reveal. Already-shared boxes are left out. */
export function boxesBecomingVisible<T extends { on: boolean }>(boxes: T[]): T[] {
  return boxes.filter((box) => !box.on);
}

/**
 * Short confirm. The first sentence names exactly the items that will show.
 * The UK GDPR line is added only for sensitive items that have not been consented yet.
 */
export function sectionShareConfirm(becoming: { label: string; sensitive: boolean }[], consented: boolean): string {
  const labels = becoming.map((box) => box.label);
  const head = labels.length === 1
    ? `${labels[0]} will show on your profile.`
    : `These will show on your profile: ${labels.join(', ')}.`;
  const sensitive = consented ? [] : becoming.filter((box) => box.sensitive);
  if (sensitive.length === 0) return `${head} Share this section?`;
  const pronoun = sensitive.length === 1 ? 'it' : 'them';
  if (sensitive.length === becoming.length) {
    const these = becoming.length === 1 ? 'This is' : 'These are';
    return `${head} ${these} health data under UK GDPR. Other members will see ${pronoun}. Share this section?`;
  }
  const named = sensitive.map((box) => box.label).join(', ');
  const verb = sensitive.length === 1 ? 'is' : 'are';
  return `${head} ${named} ${verb} health data under UK GDPR. Other members will see ${pronoun}. Share this section?`;
}

export function sectionNeedsConsent(becoming: { sensitive: boolean }[], consented: boolean): boolean {
  return !consented && becoming.some((box) => box.sensitive);
}

export function stampSectionConsent(sharing: ProfileSharing, needed: boolean, at: string): ProfileSharing {
  if (!needed || sharing.sensitiveConsentAt) return sharing;
  return { ...sharing, sensitiveConsentAt: at };
}

/**
 * Runs each write, then undoes the ones that succeeded if a later write throws.
 * Each repository method already restores itself when its own write fails.
 */
export async function runSectionSave(steps: { write: () => Promise<void>; undo: () => Promise<void> }[]): Promise<void> {
  const done: Array<() => Promise<void>> = [];
  try {
    for (const step of steps) {
      await step.write();
      done.push(step.undo);
    }
  } catch (error) {
    for (const undo of done.reverse()) {
      try {
        await undo();
      } catch {
        // The failed write already put its own lane back.
      }
    }
    throw error;
  }
}

/** Optional keys are the flags this section owns. `true` means the key is included, not the saved value. */
export type ProfileSectionPatch = {
  bio?: boolean;
  town?: boolean;
  stage?: boolean;
  soberDays?: boolean;
  milestones?: boolean;
  moneySaved?: boolean;
  unitsAvoided?: boolean;
  moodStreak?: boolean;
  pinnedQuote?: boolean;
  healthPlan?: boolean;
  reasonBodies?: readonly string[];
  healthKinds?: readonly string[];
  gratitudeIds?: readonly string[];
  gratitudePhotoIds?: readonly string[];
  visionIds?: readonly string[];
};

const FLAG_KEYS = ['bio', 'town', 'stage', 'soberDays', 'milestones', 'moneySaved', 'unitsAvoided', 'moodStreak', 'pinnedQuote', 'healthPlan'] as const;

function withIds(current: string[], ids: readonly string[] | undefined, on: boolean): string[] {
  if (!ids) return current;
  if (on) {
    const next = [...current];
    for (const id of ids) {
      if (id && !next.includes(id)) next.push(id);
    }
    return next;
  }
  const drop = new Set(ids);
  return current.filter((id) => !drop.has(id));
}

/** Turns this section's profile flags on or off and leaves every other flag as it was. */
export function applyProfileSection(sharing: ProfileSharing, patch: ProfileSectionPatch, on: boolean): ProfileSharing {
  const next: ProfileSharing = { ...sharing };
  for (const key of FLAG_KEYS) {
    if (patch[key] !== undefined) next[key] = on;
  }
  if (patch.reasonBodies) next.reasonBodies = withIds(sharing.reasonBodies, patch.reasonBodies, on);
  if (patch.healthKinds) next.healthKinds = withIds(sharing.healthKinds, patch.healthKinds, on);
  if (patch.gratitudeIds) next.gratitudeIds = withIds(sharing.gratitudeIds, patch.gratitudeIds, on);
  if (patch.gratitudePhotoIds) next.gratitudePhotoIds = withIds(sharing.gratitudePhotoIds, patch.gratitudePhotoIds, on);
  if (patch.visionIds) next.visionIds = withIds(sharing.visionIds, patch.visionIds, on);
  return next;
}

const NUTRITION_SHARE_BOXES: { key: 'shareFoodDiary' | 'shareCalories' | 'shareQuality' | 'shareProgress' | 'shareGoal' | 'wagonVisible'; label: string }[] = [
  { key: 'shareFoodDiary', label: "Today's meals" },
  { key: 'shareCalories', label: 'Daily calories and macros' },
  { key: 'shareQuality', label: 'Food quality' },
  { key: 'shareProgress', label: 'Progress and streaks' },
  { key: 'shareGoal', label: 'The goal and progress' },
  { key: 'wagonVisible', label: 'The wagon flag' },
];

/**
 * The six nutrition share switches, plus the Health Plan headline switch.
 * `planShared` lives on profile sharing, not on the nutrition settings.
 */
export function nutritionSectionBoxes(
  settings: Pick<NutritionSettings, 'shareFoodDiary' | 'shareCalories' | 'shareQuality' | 'shareProgress' | 'shareGoal' | 'wagonVisible'>,
  planShared = false,
): ShareBox[] {
  return [
    ...NUTRITION_SHARE_BOXES.map((box) => ({
      id: box.key,
      label: box.label,
      on: settings[box.key],
      sensitive: true,
    })),
    { id: 'healthPlan', label: 'Health plan', on: planShared, sensitive: true },
  ];
}

/** Sets the six share switches. `wagonOn` and the targets stay as they were. */
export function applyNutritionSection<T extends NutritionSettings>(settings: T, on: boolean): T {
  return {
    ...settings,
    shareFoodDiary: on,
    shareCalories: on,
    shareQuality: on,
    shareProgress: on,
    shareGoal: on,
    wagonVisible: on,
  };
}

export function reasonBodiesOf(reasons: { body: string }[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const reason of reasons) {
    const body = reason.body.trim();
    if (!body || seen.has(body)) continue;
    seen.add(body);
    out.push(body);
  }
  return out;
}

/**
 * You page boxes: pinned quote when one is pinned, stage, town, each reason, and the wagon share.
 * The wagon share is the same `wagonVisible` switch Nutrition uses.
 */
export function youSectionBoxes(input: {
  pinned: boolean;
  pinnedOn: boolean;
  stageOn: boolean;
  townOn: boolean;
  reasons: { body: string }[];
  reasonBodies: string[];
  wagonVisible: boolean;
  planShared: boolean;
}): ShareBox[] {
  const boxes: ShareBox[] = [];
  if (input.pinned) boxes.push({ id: 'pinnedQuote', label: 'Pinned quote', on: input.pinnedOn, sensitive: false });
  boxes.push({ id: 'stage', label: 'Stage', on: input.stageOn, sensitive: true });
  boxes.push({ id: 'town', label: 'Town', on: input.townOn, sensitive: false });
  for (const body of reasonBodiesOf(input.reasons)) {
    boxes.push({ id: `reason:${body}`, label: body, on: input.reasonBodies.includes(body), sensitive: true });
  }
  boxes.push({ id: 'wagonVisible', label: 'The wagon flag', on: input.wagonVisible, sensitive: true });
  boxes.push({ id: 'healthPlan', label: 'Health plan', on: input.planShared, sensitive: true });
  return boxes;
}

export function youSectionPatch(pinned: boolean, reasonBodies: readonly string[]): ProfileSectionPatch {
  return {
    stage: true,
    town: true,
    healthPlan: true,
    ...(pinned ? { pinnedQuote: true } : {}),
    reasonBodies,
  };
}

export function profileTextBoxes(sharing: Pick<ProfileSharing, 'bio' | 'town'>): ShareBox[] {
  return [
    { id: 'bio', label: 'Bio', on: sharing.bio, sensitive: false },
    { id: 'town', label: 'Town', on: sharing.town, sensitive: false },
  ];
}

export function healthSectionBoxes(kinds: readonly string[]): ShareBox[] {
  return HEALTH_METRICS.map((metric) => ({
    id: metric.kind,
    label: `${metric.label} average`,
    on: kinds.includes(metric.kind),
    sensitive: true,
  }));
}

export function healthSectionPatch(): ProfileSectionPatch {
  return { healthKinds: [...HEALTH_KINDS] };
}

export function gratitudeSectionBoxes(
  entries: { id: string; body: string; photos: { id: string; caption: string }[] }[],
  gratitudeIds: readonly string[],
  photoIds: readonly string[],
): ShareBox[] {
  const boxes: ShareBox[] = [];
  for (const entry of entries) {
    boxes.push({
      id: entry.id,
      label: entry.body.trim() || 'This line',
      on: gratitudeIds.includes(entry.id),
      sensitive: false,
    });
    for (const photo of entry.photos) {
      boxes.push({
        id: photo.id,
        label: photo.caption.trim() || 'This gratitude photo',
        on: photoIds.includes(photo.id),
        sensitive: false,
      });
    }
  }
  return boxes;
}

export function gratitudeSectionPatch(entries: { id: string; photos: { id: string }[] }[]): ProfileSectionPatch {
  return {
    gratitudeIds: entries.map((entry) => entry.id),
    gratitudePhotoIds: entries.flatMap((entry) => entry.photos.map((photo) => photo.id)),
  };
}

export function visionSectionBoxes(items: { id: string; caption: string }[], visionIds: readonly string[]): ShareBox[] {
  return items.map((item, index) => ({
    id: item.id,
    label: item.caption.trim() || `Untitled picture ${index + 1}`,
    on: visionIds.includes(item.id),
    sensitive: false,
  }));
}

export function visionSectionPatch(items: { id: string }[]): ProfileSectionPatch {
  return { visionIds: items.map((item) => item.id) };
}

export function photoSectionBoxes(photos: { id: string; monthIndex: number; takenOn: string; visibility: string }[]): ShareBox[] {
  return photos.map((photo) => ({
    id: photo.id,
    label: progressPhotoLabel(photo.monthIndex, photo.takenOn),
    on: photo.visibility === 'community',
    sensitive: true,
  }));
}

/** Every switch on What I share. Progress photos stay on their own screen. */
export function reviewSectionBoxes(input: {
  sharing: ProfileSharing;
  nutrition: Pick<NutritionSettings, 'shareFoodDiary' | 'shareCalories' | 'shareQuality' | 'shareProgress' | 'shareGoal' | 'wagonVisible'>;
  reasons: { body: string }[];
  gratitude: { id: string; body: string; photos: { id: string; caption: string }[] }[];
  vision: { id: string; caption: string }[];
}): ShareBox[] {
  const reasons = reasonBodiesOf(input.reasons);
  return [
    ...profileTextBoxes(input.sharing),
    { id: 'stage', label: 'Stage', on: input.sharing.stage, sensitive: true },
    { id: 'soberDays', label: 'Days sober', on: input.sharing.soberDays, sensitive: true },
    { id: 'milestones', label: 'Milestones', on: input.sharing.milestones, sensitive: true },
    ...reasons.map((body) => ({
      id: `reason:${body}`,
      label: body,
      on: input.sharing.reasonBodies.includes(body),
      sensitive: true,
    })),
    { id: 'moneySaved', label: 'Money saved', on: input.sharing.moneySaved, sensitive: true },
    { id: 'unitsAvoided', label: 'Units avoided', on: input.sharing.unitsAvoided, sensitive: true },
    { id: 'moodStreak', label: 'Mood streak', on: input.sharing.moodStreak, sensitive: true },
    ...healthSectionBoxes(input.sharing.healthKinds),
    ...nutritionSectionBoxes(input.nutrition, input.sharing.healthPlan),
    { id: 'pinnedQuote', label: 'Pinned quote', on: input.sharing.pinnedQuote, sensitive: false },
    ...gratitudeSectionBoxes(input.gratitude, input.sharing.gratitudeIds, input.sharing.gratitudePhotoIds),
    ...visionSectionBoxes(input.vision, input.sharing.visionIds),
  ];
}

export function reviewSectionPatch(input: {
  reasons: { body: string }[];
  gratitude: { id: string; photos: { id: string }[] }[];
  vision: { id: string }[];
}): ProfileSectionPatch {
  return {
    bio: true,
    town: true,
    stage: true,
    soberDays: true,
    milestones: true,
    moneySaved: true,
    unitsAvoided: true,
    moodStreak: true,
    pinnedQuote: true,
    healthPlan: true,
    reasonBodies: reasonBodiesOf(input.reasons),
    healthKinds: [...HEALTH_KINDS],
    ...gratitudeSectionPatch(input.gratitude),
    ...visionSectionPatch(input.vision),
  };
}
