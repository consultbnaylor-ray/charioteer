import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  EMAIL_TAKEN_MESSAGE,
  RESET_NEEDS_EMAIL,
  UserFacingError,
  WEAK_PASSWORD_MESSAGE,
  WRONG_PASSWORD_MESSAGE,
} from '@/domain/errors';
import {
  BUDDY_ADULT,
  BUDDY_ALREADY,
  BUDDY_CANNOT_INVITE,
  BUDDY_CHOOSE,
  BUDDY_INVITE_DAILY_LIMIT,
  BUDDY_INVITE_LIMIT,
  BUDDY_LINK_DAILY_LIMIT,
  BUDDY_LINK_DAYS,
  BUDDY_LINK_LIMIT,
  BUDDY_UNAVAILABLE,
  buddyLinkUrl,
  makeBuddyCode,
  makeBuddyToken,
  normalizeBuddyScope,
  parseBuddyPreview,
  projectBuddyShare,
  scopeHasShare,
  type BuddyLinkPass,
  type BuddyList,
  type BuddyScope,
  type BuddyShareSource,
  type BuddyShareView,
} from '@/domain/buddies';
import { convertStoredMoods, planCheckInGratitudeSync } from '@/domain/checkIns';
import { randomId } from '@/domain/id';
import { shareInflight } from '@/domain/writes';
import { isoDay } from '@/domain/dates';
import { isGratitudeCategory, localGratitudeReflect, planGratitudeEntry, sortGratitude, type GratitudeEntry, type GratitudeReflect } from '@/domain/gratitude';
import { GRATITUDE_MAX_BYTES, gratitudePhotoLimitMessage, gratitudeStoragePath } from '@/domain/gratitudePhotos';
import {
  VISION_CAPTION_LIMIT,
  VISION_MAX_BYTES,
  VISION_STATEMENT_LIMIT,
  isVisionArea,
  isVisionSize,
  moveVisionItem as reorderVisionItems,
  planVisionText,
  sortVisionItems,
  visionPhotoLimitMessage,
  visionStoragePath,
  type VisionArea,
  type VisionSize,
} from '@/domain/visionBoard';
import { planProgressPhoto, progressAnchor, progressPhotoLabel, progressStoragePath, progressVisibility, PROGRESS_MAX_BYTES } from '@/domain/progressPhotos';
import { nextGalleryPositions, PROFILE_GALLERY_LIMIT, PROFILE_GALLERY_LIMIT_MESSAGE, profileStoragePath, sortProfilePhotos } from '@/domain/profilePhotos';
import { interestSelectionUnchanged, nextInterestIds } from '@/domain/interests';
import { planCustomInterest, validateTown } from '@/domain/privacy';
import { planReasons } from '@/domain/reasons';
import { planRelapse } from '@/domain/sober';
import { detectSafety, ensureSafetyNotices } from '@/domain/safety';
import { OPENING_LINE, SCRIPTED_COACH_REPLY, type ThumosMode } from '@/domain/thumos';
import { CONSENT_VERSION } from '@/data/catalogue';
import { consentRows, missingConsentRows } from '@/domain/consents';
import { stageFromRecord } from '@/domain/stage';
import { BIO_LIMIT, PHOTO_CAPTION_LIMIT, defaultProfileSharing, normalizeProfileSharing, planProfileText, projectPublicProfile, sensitiveTurnedOn, shareFreshGratitude, type ProfileSharing, type PublicProfileView, type ShareSource } from '@/domain/profileSharing';
import { quoteById } from '@/domain/stoicQuotes';
import {
  compositionForAssessment,
  defaultNutritionSettings,
  estimateFromText,
  foodItemFromUnknown,
  parsePortion,
  isBodyCompositionSource,
  parseBodyFatPct,
  parseLeanMassKg,
  parseWaistCm,
  presentSharedNutrition,
  samplePhotoMeal,
  weightPointsFrom,
  type BodyCompositionReading,
  type FoodLog,
  type NutritionSettings,
} from '@/domain/nutrition';
import { donePlanTexts, draftHealthPlan, normaliseTrainingSchedule, presentSharedHealthPlan, type HealthPlan, type TrainingSchedule } from '@/domain/healthPlan';
import { createDemoDb, type DemoAccount, type DemoDb } from '@/data/demo-seed';
import { activityTypeFromKind } from '@/domain/fitnessSnapshot';
import type {
  AppSnapshot,
  ConsentInput,
  DirectoryCard,
  NewCheckIn,
  NewGratitudeEntry,
  NewHealthSample,
  NewProfilePhoto,
  NewProgressPhoto,
  NewReport,
  ProfilePhoto,
  ProgressPhoto,
  ProgressVisibility,
  FoodLogUpdate,
  OnboardingInput,
  ProfilePatch,
  Repository,
  VoiceMint,
  VoiceTurnInput,
} from '@/data/types';

const STORAGE_KEY = 'charioteer.demo.v1';

function uid(): string {
  return randomId();
}

function mergeConsents(existing: DemoAccount['consents'] | undefined, input: ConsentInput): DemoAccount['consents'] {
  const kept = existing ?? [];
  return [...kept, ...missingConsentRows(kept, consentRows(CONSENT_VERSION, input))];
}

function readyProfile(profile: DemoAccount['profile']): DemoAccount['profile'] {
  return {
    ...profile,
    stage: stageFromRecord(profile.stage, profile.sobrietyStartedAt),
    plannedQuitAt: profile.plannedQuitAt ?? null,
    weeklyUnitsGoal: profile.weeklyUnitsGoal ?? null,
    drinkFreeDaysGoal: profile.drinkFreeDaysGoal ?? null,
    drinkFreeOn: profile.drinkFreeOn ?? [],
    heightCm: profile.heightCm ?? null,
    visionStatement: profile.visionStatement ?? '',
    visionStartedOn: profile.visionStartedOn ?? null,
    pinnedQuoteId: profile.pinnedQuoteId ?? null,
    bio: profile.bio ?? '',
    createdAt: profile.createdAt || '2026-01-01T00:00:00.000Z',
  };
}

function readyProfilePhoto(photo: ProfilePhoto, userId: string): ProfilePhoto {
  const role = photo.role === 'avatar' ? 'avatar' : 'gallery';
  return {
    ...photo,
    userId: photo.userId || userId,
    role,
    caption: photo.caption ?? '',
    position: photo.position ?? 0,
    previewUrl: photo.previewUrl ?? null,
  };
}

function readyPhoto(photo: ProgressPhoto, userId: string): ProgressPhoto {
  return {
    ...photo,
    userId: photo.userId || userId,
    caption: photo.caption ?? '',
    visibility: progressVisibility(photo.visibility),
    previewUrl: photo.previewUrl ?? null,
  };
}

function bytesToDataUrl(bytes: Uint8Array): string {
  let binary = '';
  const size = 0x8000;
  for (let index = 0; index < bytes.length; index += size) {
    binary += String.fromCharCode(...bytes.subarray(index, index + size));
  }
  return `data:image/jpeg;base64,${btoa(binary)}`;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function latestBody(rows: NonNullable<DemoAccount['bodyComposition']>): { bodyFatPct: number | null; leanMassKg: number | null; waistCm: number | null } {
  const ordered = [...rows].sort((a, b) => b.recordedOn.localeCompare(a.recordedOn));
  return {
    bodyFatPct: ordered.find((row) => row.bodyFatPct != null)?.bodyFatPct ?? null,
    leanMassKg: ordered.find((row) => row.leanMassKg != null)?.leanMassKg ?? null,
    waistCm: ordered.find((row) => row.waistCm != null)?.waistCm ?? null,
  };
}

function shareSource(account: DemoAccount, interests: DemoDb['interests'], now = new Date()): ShareSource {
  const labels = new Map(interests.map((item) => [item.id, item.label]));
  return {
    now,
    today: isoDay(now),
    displayName: account.profile.displayName,
    bio: account.profile.bio ?? '',
    town: account.profile.town,
    stage: account.profile.stage,
    sobrietyStartedAt: account.profile.sobrietyStartedAt,
    weeklySpendGbp: account.profile.weeklySpendGbp,
    weeklyUnits: account.profile.weeklyUnits,
    interestLabels: account.profile.interestIds.map((id) => labels.get(id) ?? 'Interest'),
    reasons: account.reasons.map((reason) => ({ body: reason.body, sortOrder: reason.sortOrder })),
    checkIns: account.checkIns.map((item) => ({ createdAt: item.createdAt })),
    health: account.health.map((item) => ({ kind: item.kind, value: item.value, recordedOn: item.recordedOn })),
    gratitude: (account.gratitude ?? []).map((entry) => ({
      id: entry.id,
      body: entry.body,
      entryDate: entry.entryDate,
      photos: (entry.photos ?? []).map((photo) => ({ id: photo.id, caption: photo.caption ?? '' })),
    })),
    vision: (account.visionItems ?? []).map((item) => ({ id: item.id, caption: item.caption, area: item.area })),
    progressPhotos: (account.progressPhotos ?? []).map((photo) => ({
      id: photo.id,
      note: photo.note,
      caption: photo.caption ?? '',
      takenOn: photo.takenOn,
      monthIndex: photo.monthIndex,
      visibility: photo.visibility === 'community' ? 'community' as const : 'private' as const,
    })),
    pinnedQuoteId: account.profile.pinnedQuoteId ?? null,
    nutrition: {
      logs: account.foodLogs ?? [],
      settings: account.nutrition ?? defaultNutritionSettings(),
      heightCm: account.profile.heightCm,
      weights: weightPointsFrom(account.health),
      ...latestBody(account.bodyComposition ?? []),
    },
    healthPlan: account.healthPlan ?? null,
    profilePhotos: sortProfilePhotos(account.profilePhotos ?? []).map((photo) => ({
      id: photo.id,
      role: photo.role === 'avatar' ? 'avatar' as const : 'gallery' as const,
      caption: photo.caption ?? '',
      position: photo.position ?? 0,
    })),
  };
}

function buddyName(db: DemoDb, id: string): string {
  return db.accounts[id]?.profile.displayName || 'Member';
}

function buddySource(account: DemoAccount, today: string): BuddyShareSource {
  const latest = [...(account.bodyComposition ?? [])].sort((a, b) => b.recordedOn.localeCompare(a.recordedOn))[0];
  return {
    ownerId: account.profile.id,
    displayName: account.profile.displayName,
    today,
    nutrition: account.nutrition ?? defaultNutritionSettings(),
    foodLogs: account.foodLogs ?? [],
    checkIns: account.checkIns,
    gratitude: (account.gratitude ?? []).map((entry) => ({ body: entry.body })),
    visionStatement: account.profile.visionStatement || null,
    visionCaptions: (account.visionItems ?? []).map((item) => item.caption),
    healthPlan: account.healthPlan ?? null,
    health: account.health.map((row) => ({ kind: row.kind, value: row.value, recordedOn: row.recordedOn })),
    bodyFatPct: latest?.bodyFatPct ?? null,
    leanMassKg: latest?.leanMassKg ?? null,
    waistCm: latest?.waistCm ?? null,
    heightCm: account.profile.heightCm,
  };
}

function blocked(db: DemoDb, a: string, b: string): boolean {
  return db.blocks.some(
    (row) => (row.blockerId === a && row.blockedId === b) || (row.blockerId === b && row.blockedId === a),
  );
}

export class DemoRepository implements Repository {
  private db: DemoDb = createDemoDb();
  private ready = false;
  private snapshot: AppSnapshot = this.derive();
  private listeners = new Set<() => void>();
  private once = shareInflight();
  private chatReads = new Map<string, string>();

  constructor() {
    void this.hydrate();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): AppSnapshot {
    return this.snapshot;
  }

  async reload(): Promise<void> {
    this.snapshot = this.derive();
    this.listeners.forEach((listener) => listener());
  }

  async reloadMessages(): Promise<void> {
    await this.reload();
  }

  /** Demo pictures are data URLs, so there is nothing to sign again. */
  async resignOwnerPhotos(_options?: { force?: boolean }): Promise<void> {}

  async refreshOwnerPhotosIfStale(): Promise<void> {}

  watchChat(_connectionId: string): () => void {
    return () => undefined;
  }

  private derive(): AppSnapshot {
    const sessionId = this.db.sessionUserId;
    const account = sessionId ? this.db.accounts[sessionId] : undefined;
    const mine = new Set(account?.profile.interestIds ?? []);
    const directory: DirectoryCard[] = account
      ? Object.values(this.db.accounts)
          .filter((other) => other.profile.id !== account.profile.id)
          .filter((other) => other.profile.onboardingComplete && other.profile.communityVisible && other.profile.ageConfirmed18)
          .filter((other) => !blocked(this.db, account.profile.id, other.profile.id))
          .map((other) => ({
            id: other.profile.id,
            displayName: other.profile.displayName,
            town: normalizeProfileSharing(other.sharing).town ? other.profile.town : null,
            interestIds: other.profile.interestIds,
            sharedInterestIds: other.profile.interestIds.filter((id) => mine.has(id)),
            avatarUrl: (other.profilePhotos ?? []).find((photo) => photo.role === 'avatar')?.previewUrl ?? null,
            avatarPhotoId: (other.profilePhotos ?? []).find((photo) => photo.role === 'avatar')?.id ?? null,
          }))
          .sort((a, b) => b.sharedInterestIds.length - a.sharedInterestIds.length || a.displayName.localeCompare(b.displayName))
      : [];

    const connections = account
      ? this.db.connections.filter(
          (connection) =>
            (connection.requesterId === account.profile.id || connection.addresseeId === account.profile.id) &&
            !blocked(this.db, connection.requesterId, connection.addresseeId),
        )
      : [];
    const connectionIds = new Set(connections.map((connection) => connection.id));
    const reports = account
      ? this.db.reports.filter((report) => account.profile.isModerator || report.reporterId === account.profile.id)
      : [];

    return {
      ready: this.ready,
      mode: 'demo',
      error: null,
      session: account ? { userId: account.profile.id, email: account.email } : null,
      reasons: account ? [...account.reasons].sort((a, b) => a.sortOrder - b.sortOrder) : [],
      checkIns: account ? [...account.checkIns].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : [],
      relapses: account ? [...account.relapses] : [],
      health: account ? [...account.health].sort((a, b) => b.recordedOn.localeCompare(a.recordedOn)) : [],
      interests: this.db.interests,
      resources: this.db.resources,
      directory,
      connections,
      messages: this.db.messages.filter((message) => connectionIds.has(message.connectionId)),
      reports,
      thumos: account ? [...account.thumos] : [],
      consents: account?.consents ?? [],
      progressPhotos: account
        ? [...(account.progressPhotos ?? [])].map((photo) => readyPhoto(photo, account.profile.id)).sort((a, b) => a.monthIndex - b.monthIndex || a.takenOn.localeCompare(b.takenOn))
        : [],
      communityPhotos: account
        ? Object.values(this.db.accounts)
            .filter((other) => other.profile.id !== account.profile.id && !blocked(this.db, account.profile.id, other.profile.id))
            .flatMap((other) => (other.progressPhotos ?? []).map((photo) => readyPhoto(photo, other.profile.id)).filter((photo) => photo.visibility === 'community').map((photo) => ({ ...photo, note: '' })))
        : [],
      profilePhotos: account
        ? sortProfilePhotos((account.profilePhotos ?? []).map((photo) => readyProfilePhoto(photo, account.profile.id)))
        : [],
      profile: account ? readyProfile(account.profile) : null,
      gratitude: account ? sortGratitude((account.gratitude ?? []).map((entry) => ({
        ...entry,
        photos: (entry.photos ?? []).map((photo) => ({ ...photo, caption: photo.caption ?? '' })),
      }))) : [],
      visionItems: account ? sortVisionItems(account.visionItems ?? []) : [],
      sharing: account ? normalizeProfileSharing(account.sharing) : defaultProfileSharing(),
      savedQuotes: account?.savedQuotes ?? [],
      foodLogs: (account?.foodLogs ?? []).map((log) => ({
        ...log,
        eatenAt: log.eatenAt ?? null,
        portion: typeof log.portion === 'number' && log.portion > 0 ? log.portion : 1,
      })),
      nutrition: { ...defaultNutritionSettings(), ...(account?.nutrition ?? {}) },
      waterDays: account?.waterDays ?? [],
      bodyComposition: account?.bodyComposition ?? [],
      healthPlan: account?.healthPlan ?? null,
      trainingSchedule: account?.trainingSchedule ?? null,
    };
  }

  private commit(db: DemoDb) {
    this.db = db;
    this.snapshot = this.derive();
    void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    this.listeners.forEach((listener) => listener());
  }

  private async hydrate() {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      this.db = raw ? (JSON.parse(raw) as DemoDb) : createDemoDb();
    } catch {
      this.db = createDemoDb();
    }
    this.backfillMoodScale();
    this.backfillProgressPhotos();
    this.backfillNutrition();
    this.backfillBuddies();
    this.backfillWorkoutTypes();
    this.ready = true;
    this.snapshot = this.derive();
    this.listeners.forEach((listener) => listener());
  }

  /** Sample invites for a demo account saved before buddies existed. */
  private backfillBuddies() {
    if (this.db.buddyInvites && this.db.buddyLinks) return;
    const fresh = createDemoDb();
    if (!this.db.buddyInvites) this.db.buddyInvites = fresh.buddyInvites ?? [];
    if (!this.db.buddyLinks) this.db.buddyLinks = fresh.buddyLinks ?? [];
    void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(this.db));
  }

  /** Older sample data stored mood from 1 to 5. Double it once, then leave a real 4 alone. */
  private backfillMoodScale() {
    if (this.db.moodScale === 10) return;
    for (const account of Object.values(this.db.accounts)) {
      account.checkIns = convertStoredMoods(account.checkIns, undefined).checkIns as typeof account.checkIns;
    }
    this.db.moodScale = 10;
    void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(this.db));
  }

  /** Sample photos for a demo account saved before this field existed. An empty list stays empty. */
  private backfillProgressPhotos() {
    const fresh = createDemoDb();
    for (const [id, account] of Object.entries(this.db.accounts)) {
      if (!account.progressPhotos) {
        account.progressPhotos = fresh.accounts[id]?.progressPhotos ?? [];
      }
      if (!account.gratitude) {
        account.gratitude = fresh.accounts[id]?.gratitude ?? [];
      }
      if (!account.profile.createdAt) {
        account.profile.createdAt = fresh.accounts[id]?.profile.createdAt ?? new Date(0).toISOString();
      }
      if (account.profile.bio == null) account.profile.bio = '';
      if (account.profile.movementReminder == null) account.profile.movementReminder = false;
      if (account.profile.movementReminderMinute === undefined) account.profile.movementReminderMinute = null;
      for (const photo of account.progressPhotos ?? []) {
        if (photo.caption == null) photo.caption = '';
      }
      for (const entry of account.gratitude ?? []) {
        for (const photo of entry.photos ?? []) {
          if (photo.caption == null) photo.caption = '';
        }
      }
    }
  }

  /** Sample workout types for a demo account saved before the mix split existed. */
  private backfillWorkoutTypes() {
    if (this.db.workoutTypes === 1) return;
    const fresh = createDemoDb();
    let changed = false;
    for (const [id, account] of Object.entries(this.db.accounts)) {
      const health = account.health ?? [];
      const seeded = fresh.accounts[id]?.health ?? [];
      const have = new Set(health.map((row) => `${row.kind}|${row.recordedOn}`));
      const extra = seeded.filter((row) => {
        const typed = activityTypeFromKind(row.kind) != null;
        const bucket = row.kind === 'strength_minutes' || row.kind === 'cardio_minutes' || row.kind === 'conditioning_minutes' || row.kind === 'other_minutes';
        return (typed || bucket) && !have.has(`${row.kind}|${row.recordedOn}`);
      });
      if (!extra.length) continue;
      account.health = [...health, ...extra];
      changed = true;
    }
    this.db.workoutTypes = 1;
    if ((changed || this.db.workoutTypes === 1) && typeof window !== 'undefined') void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(this.db));
  }

  /** Sample meals for a demo account saved before the food log existed. An empty list stays empty. */
  private backfillNutrition() {
    const fresh = createDemoDb();
    for (const [id, account] of Object.entries(this.db.accounts)) {
      if (!account.foodLogs) account.foodLogs = fresh.accounts[id]?.foodLogs ?? [];
      const seeded = fresh.accounts[id]?.nutrition ?? defaultNutritionSettings();
      if (!account.nutrition) account.nutrition = seeded;
      else {
        const stored = account.nutrition as NutritionSettings & { build?: NutritionSettings['build'] };
        account.nutrition = {
          ...defaultNutritionSettings(),
          ...account.nutrition,
          build: stored.build === undefined ? seeded.build : stored.build,
        };
      }
      if (!account.waterDays) account.waterDays = fresh.accounts[id]?.waterDays ?? [];
      if (!account.bodyComposition) account.bodyComposition = fresh.accounts[id]?.bodyComposition ?? [];
      if (account.healthPlan === undefined) account.healthPlan = fresh.accounts[id]?.healthPlan ?? null;
    }
  }

  private me(): DemoAccount {
    const id = this.db.sessionUserId;
    const account = id ? this.db.accounts[id] : undefined;
    if (!account) throw new Error('Sign in first.');
    return account;
  }

  async signIn(email: string, password: string): Promise<void> {
    const account = Object.values(this.db.accounts).find((item) => item.email.toLowerCase() === email.trim().toLowerCase());
    if (!account || account.password !== password) throw new UserFacingError(WRONG_PASSWORD_MESSAGE, 'wrong_password');
    const db = clone(this.db);
    db.sessionUserId = account.profile.id;
    this.commit(db);
  }

  async signUp(email: string, password: string, displayName: string): Promise<void> {
    const normalised = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalised)) throw new UserFacingError('Enter a valid email address.', 'generic');
    if (password.length < 8) throw new UserFacingError(WEAK_PASSWORD_MESSAGE, 'weak_password');
    if (Object.values(this.db.accounts).some((account) => account.email === normalised)) {
      throw new UserFacingError(EMAIL_TAKEN_MESSAGE, 'email_taken');
    }
    const id = uid();
    const account: DemoAccount = {
      email: normalised,
      password,
      profile: {
        id,
        email: normalised,
        displayName: displayName.trim() || normalised.split('@')[0],
        sobrietyStartedAt: null,
        weeklySpendGbp: null,
        weeklyUnits: null,
        town: null,
        ageConfirmed18: false,
        communityVisible: false,
        consentHealth: false,
        consentAi: false,
        onboardingComplete: false,
        isModerator: false,
        textScale: 'default',
        themePreference: 'dark',
        interestIds: [],
        stage: 'exploring',
        plannedQuitAt: null,
        weeklyUnitsGoal: null,
        drinkFreeDaysGoal: null,
        drinkFreeOn: [],
        heightCm: null,
        visionStatement: '',
        visionStartedOn: null,
        pinnedQuoteId: null,
        bio: '',
        messageNotifications: true,
        notifySenderName: false,
        movementReminder: false,
        movementReminderMinute: null,
        createdAt: new Date().toISOString(),
      },
      reasons: [],
      checkIns: [],
      relapses: [],
      health: [],
      thumos: [],
      consents: [],
      progressPhotos: [],
      profilePhotos: [],
      gratitude: [],
      visionItems: [],
      savedQuotes: [],
      foodLogs: [],
      nutrition: defaultNutritionSettings(),
      waterDays: [],
      bodyComposition: [],
      healthPlan: null,
    };
    const db = clone(this.db);
    db.accounts[id] = account;
    db.sessionUserId = id;
    this.commit(db);
  }

  async signInWithApple(): Promise<void> {
    throw new UserFacingError('Sign in with Apple needs Supabase and the Apple provider. Use email in the sample for now.', 'generic');
  }

  async requestPasswordReset(email: string): Promise<void> {
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes('@')) throw new UserFacingError(RESET_NEEDS_EMAIL, 'generic');
    throw new UserFacingError('Password reset emails are not sent for the sample account.', 'generic');
  }

  async updatePassword(password: string): Promise<void> {
    if (password.length < 8) throw new UserFacingError(WEAK_PASSWORD_MESSAGE, 'weak_password');
    const account = this.me();
    const db = clone(this.db);
    db.accounts[account.profile.id].password = password;
    this.commit(db);
  }

  async completeAuthRedirect(_url: string): Promise<void> {
    return undefined;
  }

  async signOut(): Promise<void> {
    const db = clone(this.db);
    db.sessionUserId = null;
    this.commit(db);
  }

  async completeOnboarding(input: OnboardingInput): Promise<void> {
    const townError = validateTown(input.town);
    if (townError) throw new Error(townError);
    if (!input.displayName.trim()) throw new Error('Add the name you want people to see.');
    if (!input.reasons.some((reason) => reason.trim())) throw new Error('Write at least one reason.');
    const account = this.me();
    const db = clone(this.db);
    const next = db.accounts[account.profile.id];
    next.profile = {
      ...next.profile,
      displayName: input.displayName.trim(),
      stage: input.stage,
      sobrietyStartedAt: input.sobrietyStartedAt,
      plannedQuitAt: input.plannedQuitAt,
      weeklyUnitsGoal: input.weeklyUnitsGoal,
      drinkFreeDaysGoal: input.drinkFreeDaysGoal,
      weeklySpendGbp: input.weeklySpendGbp,
      weeklyUnits: input.weeklyUnits,
      town: input.town.trim() || null,
      ageConfirmed18: true,
      communityVisible: input.communityVisible,
      consentHealth: input.consentHealth,
      consentAi: input.consentAi,
      onboardingComplete: true,
      interestIds: input.interestIds,
    };
    next.consents = mergeConsents(next.consents, input);
    next.reasons = planReasons(input.reasons).map((body, sortOrder) => ({ id: uid(), body, sortOrder }));
    this.commit(db);
  }

  async saveConsents(input: ConsentInput): Promise<void> {
    const account = this.me();
    const db = clone(this.db);
    const next = db.accounts[account.profile.id];
    next.profile = {
      ...next.profile,
      communityVisible: input.communityVisible,
      consentHealth: input.consentHealth,
      consentAi: input.consentAi,
    };
    next.consents = mergeConsents(next.consents, input);
    this.commit(db);
  }

  async updateProfile(patch: ProfilePatch): Promise<void> {
    if (patch.town != null) {
      const townError = validateTown(patch.town);
      if (townError) throw new Error(townError);
    }
    let bio: string | undefined;
    if (patch.bio !== undefined) {
      const planned = planProfileText(patch.bio, BIO_LIMIT);
      if (!planned.ok) throw new UserFacingError(planned.message, 'generic');
      bio = planned.text;
    }
    const account = this.me();
    const db = clone(this.db);
    const next = db.accounts[account.profile.id];
    next.profile = {
      ...next.profile,
      ...patch,
      displayName: patch.displayName?.trim() ?? next.profile.displayName,
      town: patch.town === undefined ? next.profile.town : patch.town?.trim() || null,
      bio: bio === undefined ? (next.profile.bio ?? '') : bio,
    };
    this.commit(db);
  }

  async setReasons(bodies: string[]): Promise<void> {
    const account = this.me();
    const db = clone(this.db);
    db.accounts[account.profile.id].reasons = planReasons(bodies).map((body, sortOrder) => ({ id: uid(), body, sortOrder }));
    this.commit(db);
  }

  async addCheckIn(input: NewCheckIn): Promise<void> {
    const account = this.me();
    const existing = account.checkIns.find((item) => item.id === input.id);
    const createdAt = existing?.createdAt ?? new Date().toISOString();
    const linked = (account.gratitude ?? []).find((entry) => entry.checkInId === input.id) ?? null;
    const planned = planCheckInGratitudeSync(
      linked ? { id: linked.id, createdAt: linked.createdAt } : null,
      { id: input.id, createdAt },
      input.gratitude,
      new Date(),
      uid,
    );
    if (!planned.ok) throw new UserFacingError(planned.message, 'generic');
    const db = clone(this.db);
    const next = db.accounts[account.profile.id];
    const checkIn = {
      id: input.id,
      mood: input.mood,
      sleepHours: input.sleepHours,
      craving: input.craving,
      note: input.note.trim(),
      createdAt,
    };
    next.checkIns = existing
      ? next.checkIns.map((item) => item.id === input.id ? checkIn : item)
      : [...next.checkIns, checkIn];
    const list = next.gratitude ?? [];
    const sync = planned.sync;
    if (sync.kind === 'remove') {
      next.gratitude = list.filter((entry) => entry.checkInId !== input.id);
    } else if (sync.kind === 'write' && sync.fresh) {
      const entry: GratitudeEntry = {
        id: sync.id,
        body: sync.body,
        category: null,
        isFavourite: false,
        entryDate: sync.entryDate,
        createdAt: sync.createdAt,
        updatedAt: sync.updatedAt,
        photos: [],
        checkInId: input.id,
      };
      next.gratitude = [entry, ...list];
    } else if (sync.kind === 'write') {
      next.gratitude = list.map((entry) => entry.id === sync.id
        ? { ...entry, body: sync.body, entryDate: sync.entryDate, updatedAt: sync.updatedAt, checkInId: input.id }
        : entry);
    }
    this.commit(db);
  }

  async recordRelapse(note: string): Promise<void> {
    const account = this.me();
    if (!account.profile.sobrietyStartedAt) throw new Error('Set a start date first.');
    const plan = planRelapse(new Date(account.profile.sobrietyStartedAt), new Date(), note);
    const db = clone(this.db);
    const next = db.accounts[account.profile.id];
    next.relapses.push({ id: uid(), ...plan.record });
    next.profile.sobrietyStartedAt = plan.nextStartedAt.toISOString();
    this.commit(db);
  }

  async saveHealth(samples: NewHealthSample[]): Promise<void> {
    const account = this.me();
    if (!account.profile.consentHealth) throw new Error('Health data stays off until you give consent.');
    const db = clone(this.db);
    const list = db.accounts[account.profile.id].health;
    for (const sample of samples) {
      const existing = list.find(
        (item) => item.kind === sample.kind && item.recordedOn === sample.recordedOn && item.source === sample.source,
      );
      if (existing) {
        existing.value = sample.value;
        existing.unit = sample.unit;
      } else {
        list.push({ id: uid(), ...sample });
      }
    }
    this.commit(db);
  }

  async setInterestSelected(interestId: string, selected: boolean): Promise<void> {
    const account = this.me();
    const current = account.profile.interestIds;
    const next = nextInterestIds(current, interestId, selected);
    if (interestSelectionUnchanged(current, next)) return;
    const db = clone(this.db);
    db.accounts[account.profile.id].profile.interestIds = next;
    this.commit(db);
  }

  async addCustomInterest(label: string): Promise<void> {
    const plan = planCustomInterest(label);
    if (!plan.ok) throw new Error(plan.message);
    const account = this.me();
    const db = clone(this.db);
    let interest = db.interests.find((item) => item.slug === plan.slug);
    if (!interest) {
      interest = { id: uid(), slug: plan.slug, label: plan.label, custom: true };
      db.interests.push(interest);
    }
    const ids = new Set(db.accounts[account.profile.id].profile.interestIds);
    ids.add(interest.id);
    db.accounts[account.profile.id].profile.interestIds = [...ids];
    this.commit(db);
  }

  async openPrivateChat(userId: string): Promise<{ status: 'open'; connectionId: string } | { status: 'requested'; connectionId: string | null }> {
    const account = this.me();
    if (!account.profile.ageConfirmed18 || !account.profile.communityVisible) {
      throw new UserFacingError('Turn on community, and confirm you are 18 or over, before you message.', 'generic');
    }
    if (blocked(this.db, account.profile.id, userId)) throw new UserFacingError('You cannot contact this person.', 'generic');
    const existing = this.db.connections.find((connection) =>
      connection.status !== 'declined' &&
      ((connection.requesterId === account.profile.id && connection.addresseeId === userId) ||
        (connection.requesterId === userId && connection.addresseeId === account.profile.id)));
    if (existing?.status === 'accepted') return { status: 'open', connectionId: existing.id };
    if (existing) return { status: 'requested', connectionId: existing.id };
    await this.requestConnection(userId);
    const created = this.db.connections.find((connection) =>
      connection.status === 'pending' &&
      connection.requesterId === account.profile.id &&
      connection.addresseeId === userId);
    return { status: 'requested', connectionId: created?.id ?? null };
  }

  async requestConnection(userId: string, clientId?: string): Promise<void> {
    const id = clientId || uid();
    return this.once(`connect:${userId}`, async () => {
      const account = this.me();
      if (!account.profile.ageConfirmed18 || !account.profile.communityVisible) {
        throw new Error('Turn on community, and confirm you are 18 or over, before you connect.');
      }
      if (blocked(this.db, account.profile.id, userId)) throw new Error('You cannot contact this person.');
      if (this.db.connections.some((connection) => connection.id === id)) return;
      const exists = this.db.connections.some(
        (connection) =>
          connection.status !== 'declined' &&
          ((connection.requesterId === account.profile.id && connection.addresseeId === userId) ||
            (connection.requesterId === userId && connection.addresseeId === account.profile.id)),
      );
      if (exists) return;
      const db = clone(this.db);
      db.connections.push({
        id,
        requesterId: account.profile.id,
        addresseeId: userId,
        status: 'pending',
        createdAt: new Date().toISOString(),
      });
      this.commit(db);
    });
  }

  async respondConnection(connectionId: string, accept: boolean): Promise<void> {
    return this.once(`respond:${connectionId}`, async () => {
      const account = this.me();
      const db = clone(this.db);
      const connection = db.connections.find((item) => item.id === connectionId);
      if (!connection || connection.addresseeId !== account.profile.id) {
        throw new Error('That request is no longer open.');
      }
      if (connection.status !== 'pending') return;
      connection.status = accept ? 'accepted' : 'declined';
      this.commit(db);
    });
  }

  async saveDeviceToken(_token: string, _platform: 'ios' | 'android'): Promise<void> {
    return undefined;
  }

  async sendDirectMessage(connectionId: string, body: string, clientId?: string): Promise<void> {
    const text = body.trim().slice(0, 2000);
    if (!text) return;
    const id = clientId || uid();
    return this.once(`message:${id}`, async () => {
      if (this.db.messages.some((message) => message.id === id)) return;
      const account = this.me();
      const connection = this.db.connections.find((item) => item.id === connectionId);
      if (!connection || connection.status !== 'accepted') throw new Error('You can message once you have both agreed.');
      if (![connection.requesterId, connection.addresseeId].includes(account.profile.id)) throw new Error('That chat is not yours.');
      if (blocked(this.db, connection.requesterId, connection.addresseeId)) throw new Error('This chat is closed.');
      const db = clone(this.db);
      db.messages.push({
        id,
        connectionId,
        senderId: account.profile.id,
        body: text,
        createdAt: new Date().toISOString(),
      });
      this.commit(db);
    });
  }

  async blockUser(userId: string, clientId?: string): Promise<void> {
    const id = clientId || uid();
    return this.once(`block:${userId}`, async () => {
      const account = this.me();
      if (this.db.blocks.some((row) => row.id === id || (row.blockerId === account.profile.id && row.blockedId === userId))) return;
      const db = clone(this.db);
      db.blocks.push({ id, blockerId: account.profile.id, blockedId: userId });
      this.commit(db);
    });
  }

  async unblockUser(userId: string): Promise<void> {
    const account = this.me();
    const db = clone(this.db);
    db.blocks = db.blocks.filter((row) => !(row.blockerId === account.profile.id && row.blockedId === userId));
    this.commit(db);
  }

  async reportUser(input: NewReport): Promise<void> {
    const id = input.clientId || uid();
    return this.once(`report:${id}`, async () => {
      if (this.db.reports.some((report) => report.id === id)) return;
      const account = this.me();
      const reported = this.db.accounts[input.reportedUserId];
      const db = clone(this.db);
      db.reports.push({
        id,
        reporterId: account.profile.id,
        reportedUserId: input.reportedUserId,
        reportedName: reported?.profile.displayName ?? 'Member',
        reason: input.reason,
        details: input.details.trim(),
        status: 'open',
        createdAt: new Date().toISOString(),
      });
      this.commit(db);
    });
  }

  async reviewReport(id: string): Promise<void> {
    const account = this.me();
    if (!account.profile.isModerator) throw new Error('Only moderators can review reports.');
    const db = clone(this.db);
    const report = db.reports.find((item) => item.id === id);
    if (!report) return;
    report.status = 'reviewed';
    this.commit(db);
  }

  async ensureThumosGuide(_kind: 'opening' | 'craving'): Promise<void> {
    if (this.me().thumos.length > 0) return;
    this.appendGuide(OPENING_LINE, 'opening');
  }

  private appendGuide(content: string, mode: ThumosMode | 'opening') {
    const account = this.me();
    const db = clone(this.db);
    db.accounts[account.profile.id].thumos.push({
      id: uid(),
      role: 'guide',
      content,
      mode,
      createdAt: new Date().toISOString(),
    });
    this.commit(db);
  }

  async sendThumos(content: string, mode: ThumosMode, onDelta?: (text: string) => void, onState?: (state: 'sending' | 'waiting' | 'retrying') => void): Promise<void> {
    const text = content.trim();
    if (!text) return;
    const account = this.me();
    if (!account.profile.consentAi) {
      throw new Error('Agree to the coach consent before sending a message to Thumos.');
    }
    onState?.('sending');
    const safety = detectSafety(text);
    const reply = ensureSafetyNotices(SCRIPTED_COACH_REPLY, safety);
    onState?.('waiting');
    onDelta?.(reply);
    const db = clone(this.db);
    const thread = db.accounts[account.profile.id].thumos;
    const stamp = new Date();
    thread.push({ id: uid(), role: 'user', content: text, mode, createdAt: stamp.toISOString() });
    thread.push({
      id: uid(),
      role: 'guide',
      content: reply,
      mode: safety.selfHarm || safety.withdrawal ? 'support' : mode,
      createdAt: new Date(stamp.getTime() + 1).toISOString(),
    });
    this.commit(db);
  }

  async mintVoiceToken(_mode?: ThumosMode): Promise<VoiceMint> {
    return {
      ok: false,
      code: 'missing_key',
      message: 'Couldn\'t reach voice. Text chat is still here.',
    };
  }

  async addProgressPhoto(input: NewProgressPhoto): Promise<void> {
    const account = this.me();
    if (input.bytes.byteLength > PROGRESS_MAX_BYTES) throw new UserFacingError('That photo is still too large.', 'generic');
    const anchor = progressAnchor(account.profile.sobrietyStartedAt, account.profile.createdAt);
    const plan = planProgressPhoto({
      takenOn: input.takenOn,
      startingPoint: input.startingPoint,
      note: input.note,
      anchor,
    });
    if (!plan.ok) throw new UserFacingError(plan.message, 'generic');
    const id = uid();
    const db = clone(this.db);
    const next = db.accounts[account.profile.id];
    const photos = next.progressPhotos ?? [];
    photos.push({
      id,
      userId: account.profile.id,
      takenOn: plan.takenOn,
      monthIndex: plan.monthIndex,
      note: plan.note,
      caption: '',
      storagePath: progressStoragePath(account.profile.id, id),
      createdAt: new Date().toISOString(),
      visibility: 'private',
      previewUrl: bytesToDataUrl(input.bytes),
    });
    next.progressPhotos = photos;
    this.commit(db);
  }

  async updateProgressPhoto(id: string, input: { takenOn?: string; startingPoint?: boolean; note?: string; caption?: string }): Promise<void> {
    const account = this.me();
    const photo = (account.progressPhotos ?? []).find((item) => item.id === id);
    if (!photo) throw new UserFacingError('Could not update that photo.', 'generic');
    let caption: string | undefined;
    if (input.caption !== undefined) {
      const planned = planProfileText(input.caption, PHOTO_CAPTION_LIMIT);
      if (!planned.ok) throw new UserFacingError(planned.message, 'generic');
      caption = planned.text;
    }
    const touchesDetails = input.note !== undefined || input.takenOn !== undefined || input.startingPoint !== undefined;
    const plan = touchesDetails
      ? planProgressPhoto({
        takenOn: input.takenOn ?? photo.takenOn,
        startingPoint: input.startingPoint === undefined ? photo.monthIndex === 0 : input.startingPoint,
        note: input.note ?? photo.note,
        anchor: progressAnchor(account.profile.sobrietyStartedAt, account.profile.createdAt),
      })
      : null;
    if (plan && !plan.ok) throw new UserFacingError(plan.message, 'generic');
    const db = clone(this.db);
    const next = (db.accounts[account.profile.id].progressPhotos ?? []).find((item) => item.id === id);
    if (!next) throw new UserFacingError('Could not update that photo.', 'generic');
    if (caption !== undefined) next.caption = caption;
    if (plan?.ok && input.note !== undefined) next.note = plan.note;
    if (plan?.ok && (input.takenOn !== undefined || input.startingPoint !== undefined)) {
      next.takenOn = plan.takenOn;
      next.monthIndex = plan.monthIndex;
    }
    this.commit(db);
  }

  async setProgressPhotoVisibility(ids: string[], visibility: ProgressVisibility): Promise<void> {
    const next = progressVisibility(visibility);
    if (visibility !== 'private' && visibility !== 'community') throw new UserFacingError('Could not update that photo.', 'generic');
    const account = this.me();
    const db = clone(this.db);
    const photos = db.accounts[account.profile.id].progressPhotos ?? [];
    const wanted = new Set(ids);
    let changed = 0;
    for (const photo of photos) {
      if (!wanted.has(photo.id)) continue;
      photo.visibility = next;
      changed += 1;
    }
    if (!changed) throw new UserFacingError('Could not update that photo.', 'generic');
    this.commit(db);
  }

  async saveQuote(quoteId: string): Promise<void> {
    if (!quoteById(quoteId)) throw new UserFacingError('That quote is not in the library.', 'generic');
    const account = this.me();
    const saved = account.savedQuotes ?? [];
    if (saved.some((item) => item.quoteId === quoteId)) return;
    const db = clone(this.db);
    const next = db.accounts[account.profile.id];
    next.savedQuotes = [...(next.savedQuotes ?? []), { quoteId, createdAt: new Date().toISOString() }];
    this.commit(db);
  }

  async unsaveQuote(quoteId: string): Promise<void> {
    const account = this.me();
    const db = clone(this.db);
    const next = db.accounts[account.profile.id];
    next.savedQuotes = (next.savedQuotes ?? []).filter((item) => item.quoteId !== quoteId);
    this.commit(db);
  }

  async pinQuote(quoteId: string | null): Promise<void> {
    if (quoteId && !quoteById(quoteId)) throw new UserFacingError('That quote is not in the library.', 'generic');
    const account = this.me();
    const db = clone(this.db);
    db.accounts[account.profile.id].profile.pinnedQuoteId = quoteId;
    this.commit(db);
  }

  async setProfileSharing(sharing: ProfileSharing): Promise<void> {
    const account = this.me();
    const next = normalizeProfileSharing(sharing);
    if (sensitiveTurnedOn(normalizeProfileSharing(account.sharing), next) && !next.sensitiveConsentAt) {
      throw new UserFacingError('Confirm that other people may see this first.', 'generic');
    }
    const db = clone(this.db);
    db.accounts[account.profile.id].sharing = next;
    this.commit(db);
  }

  async estimateMeal(input: { text?: string; imageBase64?: string }) {
    const text = input.text?.trim() ?? '';
    const items = text ? estimateFromText(text) : samplePhotoMeal();
    if (!items.length) throw new UserFacingError('Could not read that meal. You can still type it in yourself.', 'generic');
    return { items, source: 'local' as const };
  }

  async saveFoodLog(input: import('@/data/types').NewFoodLog): Promise<void> {
    return this.once(`food:${input.id}`, async () => {
      const account = this.me();
      const items = input.items.map(foodItemFromUnknown).filter((item): item is NonNullable<typeof item> => item != null);
      if (!items.length) throw new UserFacingError('Add at least one food.', 'generic');
      const db = clone(this.db);
      const next = db.accounts[account.profile.id];
      const logs = next.foodLogs ?? [];
      if (logs.some((log) => log.id === input.id)) return;
      const log: FoodLog = {
        id: input.id,
        userId: account.profile.id,
        eatenOn: input.eatenOn,
        eatenAt: new Date().toISOString(),
        meal: input.meal,
        source: input.source,
        note: input.note.slice(0, 500),
        items,
        estimated: input.estimated,
        portion: 1,
        createdAt: new Date().toISOString(),
        previewUrl: input.photoBase64 ? `data:image/jpeg;base64,${input.photoBase64}` : null,
      };
      next.foodLogs = [log, ...logs];
      this.commit(db);
    });
  }

  async updateFoodLog(id: string, patch: FoodLogUpdate): Promise<void> {
    return this.once(`food-edit:${id}`, async () => {
      const account = this.me();
      const db = clone(this.db);
      const next = db.accounts[account.profile.id];
      const logs = next.foodLogs ?? [];
      const current = logs.find((log) => log.id === id);
      if (!current || current.userId !== account.profile.id) throw new UserFacingError('That meal is not on this account.', 'generic');
      const portion = parsePortion(patch.portion);
      if (portion == null) throw new UserFacingError('Portion sits between 0.25 and 12.', 'generic');
      const items = patch.items.map(foodItemFromUnknown).filter((item): item is NonNullable<typeof item> => item != null);
      if (!items.length) throw new UserFacingError('Add at least one food.', 'generic');
      const eatenAt = patch.eatenAt && !Number.isNaN(new Date(patch.eatenAt).getTime()) ? new Date(patch.eatenAt).toISOString() : null;
      next.foodLogs = logs.map((log) => (log.id === id ? {
        ...log,
        eatenOn: patch.eatenOn,
        eatenAt,
        meal: patch.meal,
        note: patch.note.slice(0, 500),
        items,
        estimated: patch.estimated,
        portion,
      } : log));
      this.commit(db);
    });
  }

  async deleteFoodLog(id: string): Promise<void> {
    return this.once(`food-delete:${id}`, async () => {
      const account = this.me();
      const db = clone(this.db);
      const next = db.accounts[account.profile.id];
      next.foodLogs = (next.foodLogs ?? []).filter((log) => log.id !== id);
      this.commit(db);
    });
  }

  async setNutritionSettings(settings: NutritionSettings): Promise<void> {
    const account = this.me();
    const db = clone(this.db);
    db.accounts[account.profile.id].nutrition = {
      ...defaultNutritionSettings(),
      ...settings,
      wagonNote: settings.wagonNote.slice(0, 200),
      wagonVisible: settings.wagonVisible,
      updatedAt: new Date().toISOString(),
    };
    this.commit(db);
  }

  async saveBodyComposition(input: {
    recordedOn: string;
    bodyFatPct: number | null;
    leanMassKg: number | null;
    waistCm: number | null;
    source: import('@/domain/nutrition').BodyCompositionSource;
  }): Promise<void> {
    const recordedOn = input.recordedOn.slice(0, 10);
    if (!isBodyCompositionSource(input.source) || !/^\d{4}-\d{2}-\d{2}$/.test(recordedOn)) return;
    const account = this.me();
    const db = clone(this.db);
    const next = db.accounts[account.profile.id];
    const rows = next.bodyComposition ?? [];
    const previous = rows.find((row) => row.recordedOn === recordedOn && row.source === input.source);
    const bodyFatPct = input.bodyFatPct == null ? (previous?.bodyFatPct ?? null) : parseBodyFatPct(input.bodyFatPct);
    const leanMassKg = input.leanMassKg == null ? (previous?.leanMassKg ?? null) : parseLeanMassKg(input.leanMassKg);
    const waistCm = input.waistCm == null ? (previous?.waistCm ?? null) : parseWaistCm(input.waistCm, 'cm');
    if (bodyFatPct == null && leanMassKg == null && waistCm == null) return;
    const saved: BodyCompositionReading = {
      id: previous?.id ?? randomId(),
      recordedOn,
      bodyFatPct,
      leanMassKg,
      waistCm,
      source: input.source,
      createdAt: previous?.createdAt ?? new Date().toISOString(),
    };
    next.bodyComposition = [saved, ...rows.filter((row) => !(row.recordedOn === recordedOn && row.source === input.source))];
    this.commit(db);
  }

  async setWater(day: string, waterMl: number): Promise<void> {
    const account = this.me();
    const ml = Math.max(0, Math.min(8000, Math.round(waterMl)));
    const db = clone(this.db);
    const next = db.accounts[account.profile.id];
    const days = (next.waterDays ?? []).filter((item) => item.day !== day);
    next.waterDays = [...days, { day, waterMl: ml }];
    this.commit(db);
  }

  async loadChatReads(): Promise<Record<string, string>> {
    return Object.fromEntries(this.chatReads);
  }

  async saveChatRead(connectionId: string, readThrough: string): Promise<void> {
    const previous = this.chatReads.get(connectionId);
    if (previous && Date.parse(previous) >= Date.parse(readThrough)) return;
    this.chatReads.set(connectionId, readThrough);
  }

  async logClientError(_screen: string, _message: string, _appBuild: string): Promise<void> {
    return undefined;
  }

  async saveTrainingSchedule(schedule: TrainingSchedule | null): Promise<void> {
    const account = this.me();
    const next = schedule ? normaliseTrainingSchedule(schedule) : null;
    if (schedule && !next) throw new UserFacingError('Could not save that training schedule.', 'generic');
    const db = clone(this.db);
    db.accounts[account.profile.id].trainingSchedule = next;
    this.commit(db);
  }

  async saveHealthPlan(plan: HealthPlan): Promise<void> {
    const account = this.me();
    const db = clone(this.db);
    db.accounts[account.profile.id].healthPlan = { ...plan, limits: plan.limits.slice(0, 280) };
    this.commit(db);
  }

  async refreshHealthPlan(limits: string): Promise<void> {
    const account = this.me();
    if (!account.profile.consentAi) {
      throw new UserFacingError('Writing a plan needs the coach consent, because your figures are sent to the model.', 'generic');
    }
    const nutrition = { ...defaultNutritionSettings(), ...(account.nutrition ?? {}) };
    const figures = compositionForAssessment(account.bodyComposition ?? []);
    const interestLabels = account.profile.interestIds.flatMap((id) => {
      const label = this.db.interests.find((item) => item.id === id)?.label;
      return label ? [label] : [];
    });
    const plan = draftHealthPlan({
      now: new Date(),
      salt: new Date().toISOString(),
      displayName: account.profile.displayName,
      stage: account.profile.stage,
      sobrietyStartedAt: account.profile.sobrietyStartedAt,
      heightCm: account.profile.heightCm,
      visionStatement: account.profile.visionStatement,
      visionCaptions: (account.visionItems ?? []).map((item) => item.caption).filter(Boolean),
      interestLabels,
      reasons: account.reasons.map((reason) => reason.body),
      limits: limits.trim().slice(0, 280),
      weeklyUnits: account.profile.weeklyUnits,
      goal: nutrition.goal,
      goalSex: nutrition.goalSex,
      goalAge: nutrition.goalAge,
      build: nutrition.build,
      kcalTarget: nutrition.kcalTarget,
      proteinTarget: nutrition.proteinTarget,
      carbTarget: nutrition.carbTarget,
      fatTarget: nutrition.fatTarget,
      goalPhase: nutrition.goalPhase,
      weightClassKg: nutrition.weightClassKg,
      hideCalories: nutrition.hideCalories,
      foodLogs: account.foodLogs ?? [],
      checkIns: account.checkIns.map((row) => ({
        mood: row.mood,
        craving: row.craving,
        sleepHours: row.sleepHours,
        note: row.note,
        createdAt: row.createdAt,
      })),
      health: account.health.map((row) => ({ kind: row.kind, value: row.value, recordedOn: row.recordedOn })),
      bodyFatPct: figures.bodyFatPct,
      leanMassKg: figures.leanMassKg,
      waistCm: figures.waistCm,
      doneTexts: account.healthPlan ? donePlanTexts(account.healthPlan) : [],
      schedule: account.trainingSchedule ?? null,
    });
    const db = clone(this.db);
    db.accounts[account.profile.id].healthPlan = plan;
    this.commit(db);
  }

  private liveInvites() {
    return this.db.buddyInvites ?? [];
  }

  async listBuddies(): Promise<BuddyList> {
    const account = this.me();
    const id = account.profile.id;
    const invites = this.liveInvites().filter((invite) => invite.status === 'pending' || invite.status === 'accepted');
    const now = new Date().toISOString();
    return {
      sharing: invites
        .filter((invite) => invite.ownerId === id)
        .map((invite) => ({ ...invite, scope: normalizeBuddyScope(invite.scope), name: buddyName(this.db, invite.buddyId) })),
      watching: invites
        .filter((invite) => invite.buddyId === id)
        .map((invite) => ({ ...invite, scope: normalizeBuddyScope(invite.scope), name: buddyName(this.db, invite.ownerId) })),
      links: (this.db.buddyLinks ?? [])
        .filter((link) => link.ownerId === id && !link.usedBy && !link.revokedAt && link.expiresAt > now)
        .map((link) => ({ id: link.id, expiresAt: link.expiresAt, scope: normalizeBuddyScope(link.scope), createdAt: link.createdAt })),
    };
  }

  async createBuddyInvite(buddyId: string, scope: BuddyScope): Promise<void> {
    const account = this.me();
    const chosen = normalizeBuddyScope(scope);
    if (!scopeHasShare(chosen)) throw new UserFacingError(BUDDY_CHOOSE, 'generic');
    if (!account.profile.ageConfirmed18) throw new UserFacingError(BUDDY_ADULT, 'generic');
    const other = this.db.accounts[buddyId];
    if (!other || other.profile.id === account.profile.id || !other.profile.ageConfirmed18 || blocked(this.db, account.profile.id, buddyId)) {
      throw new UserFacingError(BUDDY_CANNOT_INVITE, 'generic');
    }
    const db = clone(this.db);
    const invites = db.buddyInvites ?? [];
    const live = invites.find((invite) => invite.ownerId === account.profile.id && invite.buddyId === buddyId && (invite.status === 'pending' || invite.status === 'accepted'));
    if (live?.status === 'accepted') throw new UserFacingError(BUDDY_ALREADY, 'generic');
    if (live) {
      live.scope = chosen;
      db.buddyInvites = invites;
      this.commit(db);
      return;
    }
    const dayAgo = Date.now() - 86_400_000;
    const recent = invites.filter((invite) => invite.ownerId === account.profile.id && Date.parse(invite.createdAt) > dayAgo).length;
    if (recent >= BUDDY_INVITE_DAILY_LIMIT) throw new UserFacingError(BUDDY_INVITE_LIMIT, 'generic');
    invites.push({
      id: randomId(),
      ownerId: account.profile.id,
      buddyId,
      status: 'pending',
      scope: chosen,
      createdAt: new Date().toISOString(),
    });
    db.buddyInvites = invites;
    this.commit(db);
  }

  async createBuddyLink(scope: BuddyScope): Promise<BuddyLinkPass> {
    const account = this.me();
    const chosen = normalizeBuddyScope(scope);
    if (!scopeHasShare(chosen)) throw new UserFacingError(BUDDY_CHOOSE, 'generic');
    if (!account.profile.ageConfirmed18) throw new UserFacingError(BUDDY_ADULT, 'generic');
    const db = clone(this.db);
    const links = db.buddyLinks ?? [];
    const dayAgo = Date.now() - 86_400_000;
    const recent = links.filter((link) => link.ownerId === account.profile.id && Date.parse(link.createdAt) > dayAgo).length;
    if (recent >= BUDDY_LINK_DAILY_LIMIT) throw new UserFacingError(BUDDY_LINK_LIMIT, 'generic');
    const bytes = Uint8Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
    const token = makeBuddyToken(bytes);
    const code = makeBuddyCode(bytes);
    const expiresAt = new Date(Date.now() + BUDDY_LINK_DAYS * 86_400_000).toISOString();
    const id = randomId();
    links.push({
      id,
      ownerId: account.profile.id,
      token,
      code,
      scope: chosen,
      expiresAt,
      createdAt: new Date().toISOString(),
      usedBy: null,
      revokedAt: null,
    });
    db.buddyLinks = links;
    this.commit(db);
    return { id, token, code, expiresAt, url: buddyLinkUrl(token) };
  }

  async acceptBuddyInvite(inviteId: string): Promise<void> {
    const account = this.me();
    const db = clone(this.db);
    const invite = (db.buddyInvites ?? []).find((item) => item.id === inviteId && item.buddyId === account.profile.id && item.status === 'pending');
    if (!invite || !account.profile.ageConfirmed18 || blocked(this.db, account.profile.id, invite.ownerId)) {
      throw new UserFacingError(BUDDY_UNAVAILABLE, 'generic');
    }
    invite.status = 'accepted';
    this.commit(db);
  }

  async declineBuddyInvite(inviteId: string): Promise<void> {
    const account = this.me();
    const db = clone(this.db);
    const invite = (db.buddyInvites ?? []).find((item) => item.id === inviteId && item.buddyId === account.profile.id && item.status === 'pending');
    if (!invite) throw new UserFacingError(BUDDY_UNAVAILABLE, 'generic');
    invite.status = 'declined';
    this.commit(db);
  }

  async previewBuddyLink(secret: string): Promise<{ name: string; scope: BuddyScope }> {
    const account = this.me();
    const cleaned = secret.trim();
    const wanted = cleaned.length === 8 ? cleaned.toUpperCase() : cleaned.toLowerCase();
    const link = (this.db.buddyLinks ?? []).find((item) => {
      if (item.usedBy || item.revokedAt || item.expiresAt <= new Date().toISOString()) return false;
      return item.token === wanted || item.code === wanted;
    });
    if (!link || link.ownerId === account.profile.id || !account.profile.ageConfirmed18 || blocked(this.db, account.profile.id, link.ownerId)) {
      throw new UserFacingError(BUDDY_UNAVAILABLE, 'generic');
    }
    return parseBuddyPreview({ name: buddyName(this.db, link.ownerId), scope: link.scope }) ?? { name: 'Member', scope: normalizeBuddyScope(link.scope) };
  }

  async acceptBuddyLink(secret: string): Promise<void> {
    const account = this.me();
    const cleaned = secret.trim();
    const wanted = cleaned.length === 8 ? cleaned.toUpperCase() : cleaned.toLowerCase();
    const db = clone(this.db);
    const link = (db.buddyLinks ?? []).find((item) => {
      if (item.usedBy || item.revokedAt || item.expiresAt <= new Date().toISOString()) return false;
      return item.token === wanted || item.code === wanted;
    });
    if (!link || link.ownerId === account.profile.id || !account.profile.ageConfirmed18 || blocked(this.db, account.profile.id, link.ownerId)) {
      throw new UserFacingError(BUDDY_UNAVAILABLE, 'generic');
    }
    const invites = db.buddyInvites ?? [];
    const live = invites.find((invite) => invite.ownerId === link.ownerId && invite.buddyId === account.profile.id && (invite.status === 'pending' || invite.status === 'accepted'));
    if (live) {
      live.status = 'accepted';
      live.scope = link.scope;
    } else {
      invites.push({
        id: randomId(),
        ownerId: link.ownerId,
        buddyId: account.profile.id,
        status: 'accepted',
        scope: link.scope,
        createdAt: new Date().toISOString(),
      });
    }
    link.usedBy = account.profile.id;
    db.buddyInvites = invites;
    this.commit(db);
  }

  async revokeBuddy(inviteId: string): Promise<void> {
    const account = this.me();
    const db = clone(this.db);
    const invite = (db.buddyInvites ?? []).find((item) => item.id === inviteId && (item.ownerId === account.profile.id || item.buddyId === account.profile.id) && (item.status === 'pending' || item.status === 'accepted'));
    if (!invite) throw new UserFacingError(BUDDY_UNAVAILABLE, 'generic');
    invite.status = 'revoked';
    this.commit(db);
  }

  async revokeBuddyLink(linkId: string): Promise<void> {
    const account = this.me();
    const db = clone(this.db);
    const link = (db.buddyLinks ?? []).find((item) => item.id === linkId && item.ownerId === account.profile.id && !item.usedBy && !item.revokedAt);
    if (!link) throw new UserFacingError(BUDDY_UNAVAILABLE, 'generic');
    link.revokedAt = new Date().toISOString();
    this.commit(db);
  }

  async updateBuddyScope(inviteId: string, scope: BuddyScope): Promise<void> {
    const account = this.me();
    const chosen = normalizeBuddyScope(scope);
    if (!scopeHasShare(chosen)) throw new UserFacingError(BUDDY_CHOOSE, 'generic');
    const db = clone(this.db);
    const invite = (db.buddyInvites ?? []).find((item) => item.id === inviteId && item.ownerId === account.profile.id && (item.status === 'pending' || item.status === 'accepted'));
    if (!invite) throw new UserFacingError(BUDDY_UNAVAILABLE, 'generic');
    invite.scope = chosen;
    this.commit(db);
  }

  async sharedBuddyData(ownerId: string): Promise<BuddyShareView | null> {
    const account = this.me();
    const invite = this.liveInvites().find((item) => item.ownerId === ownerId && item.buddyId === account.profile.id && item.status === 'accepted');
    const owner = this.db.accounts[ownerId];
    if (!invite || !owner || !account.profile.ageConfirmed18 || !owner.profile.ageConfirmed18 || blocked(this.db, account.profile.id, ownerId)) return null;
    return projectBuddyShare(buddySource(owner, isoDay(new Date())), normalizeBuddyScope(invite.scope));
  }

  async sharedHealthPlan(userId: string) {
    const session = this.snapshot.session;
    if (!session) return null;
    const viewer = this.db.accounts[session.userId];
    const other = this.db.accounts[userId];
    if (!viewer || !other?.profile.onboardingComplete) return null;
    if (blocked(this.db, session.userId, userId)) return null;
    if (!other.profile.communityVisible || !other.profile.ageConfirmed18) return null;
    if (session.userId !== userId && (!viewer.profile.communityVisible || !viewer.profile.ageConfirmed18)) return null;
    const sharing = normalizeProfileSharing(other.sharing);
    return presentSharedHealthPlan(other.healthPlan ?? null, sharing.healthPlan, other.nutrition?.goal ?? null);
  }

  async sharedNutrition(userId: string) {
    const session = this.snapshot.session;
    if (!session) return null;
    const other = this.db.accounts[userId];
    if (!other?.profile.onboardingComplete) return null;
    if (blocked(this.db, session.userId, userId)) return null;
    if (!other.profile.communityVisible || !other.profile.ageConfirmed18) return null;
    const figures = compositionForAssessment(other.bodyComposition ?? []);
    return presentSharedNutrition(
      { ...defaultNutritionSettings(), ...(other.nutrition ?? {}) },
      other.foodLogs ?? [],
      isoDay(new Date()),
      {
        heightCm: other.profile.heightCm,
        weights: weightPointsFrom(other.health),
        bodyFatPct: figures.bodyFatPct,
        leanMassKg: figures.leanMassKg,
        waistCm: figures.waistCm,
      },
    );
  }

  async publicProfile(userId: string): Promise<PublicProfileView | null> {
    const session = this.snapshot.session;
    if (!session) return null;
    const other = this.db.accounts[userId];
    if (!other || !other.profile.onboardingComplete) return null;
    if (blocked(this.db, session.userId, userId)) return null;
    if (!other.profile.communityVisible || !other.profile.ageConfirmed18) return null;
    return projectPublicProfile(shareSource(other, this.db.interests), normalizeProfileSharing(other.sharing));
  }

  async addProfilePhoto(input: NewProfilePhoto): Promise<void> {
    if (input.bytes.byteLength > PROGRESS_MAX_BYTES) throw new UserFacingError('That photo is still too large.', 'generic');
    if (input.role !== 'avatar' && input.role !== 'gallery') throw new UserFacingError('Could not store that photo.', 'generic');
    const account = this.me();
    const existing = account.profilePhotos ?? [];
    const gallery = existing.filter((photo) => photo.role === 'gallery');
    if (input.role === 'gallery' && gallery.length >= PROFILE_GALLERY_LIMIT) {
      throw new UserFacingError(PROFILE_GALLERY_LIMIT_MESSAGE, 'generic');
    }
    const id = uid();
    const position = input.role === 'avatar' ? 0 : gallery.reduce((max, photo) => Math.max(max, photo.position), -1) + 1;
    const photo: ProfilePhoto = {
      id,
      userId: account.profile.id,
      role: input.role,
      caption: '',
      position,
      storagePath: profileStoragePath(account.profile.id, id),
      createdAt: new Date().toISOString(),
      previewUrl: bytesToDataUrl(input.bytes),
    };
    const db = clone(this.db);
    const next = db.accounts[account.profile.id];
    const kept = input.role === 'avatar' ? existing.filter((item) => item.role !== 'avatar') : existing;
    next.profilePhotos = [...kept, photo];
    this.commit(db);
  }

  async updateProfilePhoto(id: string, input: { caption: string }): Promise<void> {
    const plan = planProfileText(input.caption, PHOTO_CAPTION_LIMIT);
    if (!plan.ok) throw new UserFacingError(plan.message, 'generic');
    const account = this.me();
    const db = clone(this.db);
    const photo = (db.accounts[account.profile.id].profilePhotos ?? []).find((item) => item.id === id);
    if (!photo) throw new UserFacingError('Could not save that photo.', 'generic');
    photo.caption = plan.text;
    this.commit(db);
  }

  async moveProfilePhoto(id: string, direction: 'up' | 'down'): Promise<void> {
    const account = this.me();
    const gallery = (account.profilePhotos ?? []).filter((photo) => photo.role === 'gallery');
    const next = nextGalleryPositions(gallery, id, direction);
    if (!next) return;
    const db = clone(this.db);
    const photos = db.accounts[account.profile.id].profilePhotos ?? [];
    for (const row of next) {
      const photo = photos.find((item) => item.id === row.id);
      if (photo) photo.position = row.position;
    }
    this.commit(db);
  }

  async deleteProfilePhoto(id: string): Promise<void> {
    const account = this.me();
    const db = clone(this.db);
    const next = db.accounts[account.profile.id];
    next.profilePhotos = (next.profilePhotos ?? []).filter((photo) => photo.id !== id);
    this.commit(db);
  }

  async profilePhotoUrls(ids: string[]): Promise<{ id: string; url: string }[]> {
    const session = this.snapshot.session;
    if (!session) return [];
    const wanted = new Set(ids);
    const urls: { id: string; url: string }[] = [];
    for (const account of Object.values(this.db.accounts)) {
      const own = account.profile.id === session.userId;
      if (!own && (!account.profile.communityVisible || !account.profile.ageConfirmed18 || blocked(this.db, session.userId, account.profile.id))) continue;
      for (const photo of account.profilePhotos ?? []) {
        if (!wanted.has(photo.id) || !photo.previewUrl) continue;
        urls.push({ id: photo.id, url: photo.previewUrl });
      }
    }
    return urls;
  }

  async deleteProgressPhoto(id: string): Promise<void> {
    const account = this.me();
    const db = clone(this.db);
    const next = db.accounts[account.profile.id];
    next.progressPhotos = (next.progressPhotos ?? []).filter((photo) => photo.id !== id);
    this.commit(db);
  }

  async saveVoiceTurn(input: VoiceTurnInput): Promise<void> {
    const account = this.me();
    const db = clone(this.db);
    const thread = db.accounts[account.profile.id].thumos;
    const stamp = new Date();
    thread.push({ id: uid(), role: 'user', content: input.user, mode: input.mode, createdAt: stamp.toISOString() });
    thread.push({
      id: uid(),
      role: 'assistant',
      content: input.assistant,
      mode: input.mode,
      createdAt: new Date(stamp.getTime() + 1).toISOString(),
    });
    this.commit(db);
  }

  async addGratitudeEntry(input: NewGratitudeEntry): Promise<string> {
    const plan = planGratitudeEntry(input.body, input.entryDate, isoDay(new Date()));
    if (!plan.ok) throw new UserFacingError(plan.message, 'generic');
    const account = this.me();
    const db = clone(this.db);
    const next = db.accounts[account.profile.id];
    const stamp = new Date().toISOString();
    const entry: GratitudeEntry = {
      id: uid(),
      body: plan.body,
      category: input.category && isGratitudeCategory(input.category) ? input.category : null,
      isFavourite: input.isFavourite,
      entryDate: plan.entryDate,
      createdAt: stamp,
      updatedAt: stamp,
      photos: [],
    };
    next.gratitude = [entry, ...(next.gratitude ?? [])];
    const followed = shareFreshGratitude(normalizeProfileSharing(next.sharing), { entryId: entry.id });
    if (followed) next.sharing = followed;
    this.commit(db);
    return entry.id;
  }

  async updateGratitudeEntry(id: string, input: NewGratitudeEntry): Promise<void> {
    const plan = planGratitudeEntry(input.body, input.entryDate, isoDay(new Date()));
    if (!plan.ok) throw new UserFacingError(plan.message, 'generic');
    const account = this.me();
    const db = clone(this.db);
    const next = db.accounts[account.profile.id];
    const list = next.gratitude ?? [];
    const index = list.findIndex((entry) => entry.id === id);
    if (index < 0) throw new UserFacingError('Could not update that line.', 'generic');
    list[index] = {
      ...list[index],
      body: plan.body,
      category: input.category && isGratitudeCategory(input.category) ? input.category : null,
      isFavourite: input.isFavourite,
      entryDate: plan.entryDate,
      updatedAt: new Date().toISOString(),
    };
    next.gratitude = list;
    this.commit(db);
  }

  async deleteGratitudeEntry(id: string): Promise<void> {
    const account = this.me();
    const db = clone(this.db);
    const next = db.accounts[account.profile.id];
    next.gratitude = (next.gratitude ?? []).filter((entry) => entry.id !== id);
    this.commit(db);
  }

  async addGratitudePhoto(entryId: string, bytes: Uint8Array): Promise<void> {
    if (bytes.byteLength > GRATITUDE_MAX_BYTES) throw new UserFacingError('That photo is still too large.', 'generic');
    const account = this.me();
    const db = clone(this.db);
    const entry = (db.accounts[account.profile.id].gratitude ?? []).find((item) => item.id === entryId);
    if (!entry) throw new UserFacingError('Could not add that photo.', 'generic');
    const photos = entry.photos ?? [];
    const limit = gratitudePhotoLimitMessage(photos.length);
    if (limit) throw new UserFacingError(limit, 'generic');
    const id = uid();
    photos.push({
      id,
      entryId,
      storagePath: gratitudeStoragePath(account.profile.id, id),
      createdAt: new Date().toISOString(),
      previewUrl: bytesToDataUrl(bytes),
      caption: '',
    });
    entry.photos = photos;
    const followed = shareFreshGratitude(normalizeProfileSharing(db.accounts[account.profile.id].sharing), { photoId: id });
    if (followed) db.accounts[account.profile.id].sharing = followed;
    this.commit(db);
  }

  async updateGratitudePhoto(id: string, input: { caption: string }): Promise<void> {
    const planned = planProfileText(input.caption, PHOTO_CAPTION_LIMIT);
    if (!planned.ok) throw new UserFacingError(planned.message, 'generic');
    const account = this.me();
    const db = clone(this.db);
    const photo = (db.accounts[account.profile.id].gratitude ?? []).flatMap((entry) => entry.photos ?? []).find((item) => item.id === id);
    if (!photo) throw new UserFacingError('Could not update that photo.', 'generic');
    photo.caption = planned.text;
    this.commit(db);
  }

  async deleteGratitudePhoto(id: string): Promise<void> {
    const account = this.me();
    const db = clone(this.db);
    const list = db.accounts[account.profile.id].gratitude ?? [];
    let removed = false;
    for (const entry of list) {
      const photos = entry.photos ?? [];
      if (!photos.some((photo) => photo.id === id)) continue;
      entry.photos = photos.filter((photo) => photo.id !== id);
      removed = true;
    }
    if (!removed) throw new UserFacingError('Could not remove that photo.', 'generic');
    this.commit(db);
  }

  async saveVisionStatement(statement: string): Promise<void> {
    const plan = planVisionText(statement, VISION_STATEMENT_LIMIT);
    if (!plan.ok) throw new UserFacingError(plan.message, 'generic');
    const account = this.me();
    const db = clone(this.db);
    const next = db.accounts[account.profile.id];
    next.profile.visionStatement = plan.text;
    if (plan.text && !next.profile.visionStartedOn) next.profile.visionStartedOn = isoDay(new Date());
    this.commit(db);
  }

  async addVisionItem(bytes: Uint8Array): Promise<void> {
    if (bytes.byteLength > VISION_MAX_BYTES) throw new UserFacingError('That photo is still too large.', 'generic');
    const account = this.me();
    const db = clone(this.db);
    const next = db.accounts[account.profile.id];
    const items = next.visionItems ?? [];
    const limit = visionPhotoLimitMessage(items.length);
    if (limit) throw new UserFacingError(limit, 'generic');
    const id = uid();
    const now = new Date().toISOString();
    const position = items.reduce((max, item) => Math.max(max, item.position), -1) + 1;
    items.push({
      id,
      caption: '',
      area: null,
      size: 'medium',
      position,
      storagePath: visionStoragePath(account.profile.id, id),
      createdAt: now,
      updatedAt: now,
      previewUrl: bytesToDataUrl(bytes),
    });
    next.visionItems = items;
    if (!next.profile.visionStartedOn) next.profile.visionStartedOn = isoDay(new Date());
    this.commit(db);
  }

  async updateVisionItem(id: string, patch: { caption?: string; area?: VisionArea | null; size?: VisionSize }): Promise<void> {
    const account = this.me();
    const db = clone(this.db);
    const items = db.accounts[account.profile.id].visionItems ?? [];
    const item = items.find((row) => row.id === id);
    if (!item) throw new UserFacingError('Could not update that photo.', 'generic');
    if (patch.caption !== undefined) {
      const plan = planVisionText(patch.caption, VISION_CAPTION_LIMIT);
      if (!plan.ok) throw new UserFacingError(plan.message, 'generic');
      item.caption = plan.text;
    }
    if (patch.area !== undefined) item.area = patch.area && isVisionArea(patch.area) ? patch.area : null;
    if (patch.size !== undefined) {
      if (!isVisionSize(patch.size)) throw new UserFacingError('Could not change that size.', 'generic');
      item.size = patch.size;
    }
    item.updatedAt = new Date().toISOString();
    this.commit(db);
  }

  async moveVisionItem(id: string, direction: 'up' | 'down'): Promise<void> {
    const account = this.me();
    const db = clone(this.db);
    const next = db.accounts[account.profile.id];
    const ordered = sortVisionItems(next.visionItems ?? []);
    const moved = reorderVisionItems(ordered, id, direction);
    next.visionItems = moved.map((item, index) => ({ ...item, position: index }));
    this.commit(db);
  }

  async deleteVisionItem(id: string): Promise<void> {
    const account = this.me();
    const db = clone(this.db);
    const next = db.accounts[account.profile.id];
    const items = next.visionItems ?? [];
    if (!items.some((item) => item.id === id)) throw new UserFacingError('Could not remove that photo.', 'generic');
    next.visionItems = items.filter((item) => item.id !== id);
    this.commit(db);
  }

  async reflectOnGratitude(body: string, category: string | null): Promise<GratitudeReflect> {
    const account = this.me();
    if (!account.profile.consentAi) {
      throw new Error('Agree to the coach consent before sending a message to Thumos.');
    }
    return localGratitudeReflect(body, category);
  }

  async exportData(): Promise<Record<string, unknown>> {
    const account = this.me();
    const id = account.profile.id;
    return {
      exportedAt: new Date().toISOString(),
      mode: 'demo',
      profile: account.profile,
      reasons: account.reasons,
      checkIns: account.checkIns,
      relapses: account.relapses,
      health: account.health,
      thumos: account.thumos,
      connections: this.db.connections.filter((connection) => connection.requesterId === id || connection.addresseeId === id),
      messages: this.snapshot.messages,
      reports: this.db.reports.filter((report) => report.reporterId === id),
      consentVersion: CONSENT_VERSION,
      progress_photos: (account.progressPhotos ?? []).map((photo) => ({
        id: photo.id,
        taken_on: photo.takenOn,
        month_index: photo.monthIndex,
        note: photo.note,
        caption: photo.caption ?? '',
        storage_path: photo.storagePath,
        created_at: photo.createdAt,
        visibility: progressVisibility(photo.visibility),
        label: progressPhotoLabel(photo.monthIndex, photo.takenOn),
        signed_url: photo.previewUrl,
      })),
      gratitude_entries: (account.gratitude ?? []).map((entry) => ({
        id: entry.id,
        user_id: id,
        body: entry.body,
        category: entry.category,
        is_favourite: entry.isFavourite,
        entry_date: entry.entryDate,
        created_at: entry.createdAt,
        updated_at: entry.updatedAt,
        check_in_id: entry.checkInId ?? null,
      })),
      gratitude_photos: (account.gratitude ?? []).flatMap((entry) => (entry.photos ?? []).map((photo) => ({
        id: photo.id,
        entry_id: entry.id,
        user_id: id,
        storage_path: photo.storagePath,
        caption: photo.caption ?? '',
        created_at: photo.createdAt,
        signed_url: photo.previewUrl,
      }))),
      profile_photos: (account.profilePhotos ?? []).map((photo) => ({
        id: photo.id,
        user_id: id,
        role: photo.role,
        caption: photo.caption ?? '',
        position: photo.position ?? 0,
        storage_path: photo.storagePath,
        created_at: photo.createdAt,
        signed_url: photo.previewUrl,
      })),
      vision_board_items: (account.visionItems ?? []).map((item) => ({
        id: item.id,
        user_id: id,
        storage_path: item.storagePath,
        caption: item.caption,
        area: item.area,
        size: item.size,
        position: item.position,
        created_at: item.createdAt,
        updated_at: item.updatedAt,
        signed_url: item.previewUrl,
      })),
    };
  }

  async deleteAccount(): Promise<void> {
    const account = this.me();
    const id = account.profile.id;
    const db = clone(this.db);
    delete db.accounts[id];
    db.connections = db.connections.filter((connection) => connection.requesterId !== id && connection.addresseeId !== id);
    const remaining = new Set(db.connections.map((connection) => connection.id));
    db.messages = db.messages.filter((message) => remaining.has(message.connectionId));
    db.blocks = db.blocks.filter((row) => row.blockerId !== id && row.blockedId !== id);
    db.reports = db.reports.filter((report) => report.reporterId !== id);
    db.sessionUserId = null;
    this.commit(db);
  }
}
