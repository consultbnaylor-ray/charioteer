import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  EMAIL_TAKEN_MESSAGE,
  RESET_NEEDS_EMAIL,
  UserFacingError,
  WEAK_PASSWORD_MESSAGE,
  WRONG_PASSWORD_MESSAGE,
} from '@/domain/errors';
import { randomId } from '@/domain/id';
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
import { interestSelectionUnchanged, nextInterestIds } from '@/domain/interests';
import { planCustomInterest, validateTown } from '@/domain/privacy';
import { planRelapse } from '@/domain/sober';
import { detectSafety, ensureSafetyNotices } from '@/domain/safety';
import { OFFLINE_COACH_MESSAGE, OPENING_LINE, type ThumosMode } from '@/domain/thumos';
import { CONSENT_VERSION } from '@/data/catalogue';
import { consentRows, missingConsentRows } from '@/domain/consents';
import { stageFromRecord } from '@/domain/stage';
import { createDemoDb, type DemoAccount, type DemoDb } from '@/data/demo-seed';
import type {
  AppSnapshot,
  ConsentInput,
  DirectoryCard,
  NewCheckIn,
  NewGratitudeEntry,
  NewHealthSample,
  NewProgressPhoto,
  NewReport,
  ProgressPhoto,
  ProgressVisibility,
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
    createdAt: profile.createdAt || '2026-01-01T00:00:00.000Z',
  };
}

function readyPhoto(photo: ProgressPhoto, userId: string): ProgressPhoto {
  return {
    ...photo,
    userId: photo.userId || userId,
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
            town: other.profile.town,
            interestIds: other.profile.interestIds,
            sharedInterestIds: other.profile.interestIds.filter((id) => mine.has(id)),
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
            .flatMap((other) => (other.progressPhotos ?? []).map((photo) => readyPhoto(photo, other.profile.id)).filter((photo) => photo.visibility === 'community'))
        : [],
      profile: account ? readyProfile(account.profile) : null,
      gratitude: account ? sortGratitude((account.gratitude ?? []).map((entry) => ({ ...entry, photos: entry.photos ?? [] }))) : [],
      visionItems: account ? sortVisionItems(account.visionItems ?? []) : [],
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
    this.backfillProgressPhotos();
    this.ready = true;
    this.snapshot = this.derive();
    this.listeners.forEach((listener) => listener());
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
        createdAt: new Date().toISOString(),
      },
      reasons: [],
      checkIns: [],
      relapses: [],
      health: [],
      thumos: [],
      consents: [],
      progressPhotos: [],
      gratitude: [],
      visionItems: [],
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
    next.reasons = input.reasons
      .map((body) => body.trim())
      .filter(Boolean)
      .map((body, sortOrder) => ({ id: uid(), body, sortOrder }));
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
    const account = this.me();
    const db = clone(this.db);
    const next = db.accounts[account.profile.id];
    next.profile = {
      ...next.profile,
      ...patch,
      displayName: patch.displayName?.trim() ?? next.profile.displayName,
      town: patch.town === undefined ? next.profile.town : patch.town?.trim() || null,
    };
    this.commit(db);
  }

  async setReasons(bodies: string[]): Promise<void> {
    const account = this.me();
    const db = clone(this.db);
    db.accounts[account.profile.id].reasons = bodies
      .map((body) => body.trim())
      .filter(Boolean)
      .map((body, sortOrder) => ({ id: uid(), body, sortOrder }));
    this.commit(db);
  }

  async addCheckIn(input: NewCheckIn): Promise<void> {
    const account = this.me();
    const db = clone(this.db);
    db.accounts[account.profile.id].checkIns.push({
      id: uid(),
      mood: input.mood,
      sleepHours: input.sleepHours,
      craving: input.craving,
      note: input.note.trim(),
      createdAt: new Date().toISOString(),
    });
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

  async requestConnection(userId: string): Promise<void> {
    const account = this.me();
    if (!account.profile.ageConfirmed18 || !account.profile.communityVisible) {
      throw new Error('Turn on community, and confirm you are 18 or over, before you connect.');
    }
    if (blocked(this.db, account.profile.id, userId)) throw new Error('You cannot contact this person.');
    const exists = this.db.connections.some(
      (connection) =>
        connection.status !== 'declined' &&
        ((connection.requesterId === account.profile.id && connection.addresseeId === userId) ||
          (connection.requesterId === userId && connection.addresseeId === account.profile.id)),
    );
    if (exists) throw new Error('There is already a request between you.');
    const db = clone(this.db);
    db.connections.push({
      id: uid(),
      requesterId: account.profile.id,
      addresseeId: userId,
      status: 'pending',
      createdAt: new Date().toISOString(),
    });
    this.commit(db);
  }

  async respondConnection(connectionId: string, accept: boolean): Promise<void> {
    const account = this.me();
    const db = clone(this.db);
    const connection = db.connections.find((item) => item.id === connectionId);
    if (!connection || connection.addresseeId !== account.profile.id || connection.status !== 'pending') {
      throw new Error('That request is no longer open.');
    }
    connection.status = accept ? 'accepted' : 'declined';
    this.commit(db);
  }

  async sendDirectMessage(connectionId: string, body: string): Promise<void> {
    const text = body.trim();
    if (!text) return;
    const account = this.me();
    const connection = this.db.connections.find((item) => item.id === connectionId);
    if (!connection || connection.status !== 'accepted') throw new Error('You can message once you have both agreed.');
    if (![connection.requesterId, connection.addresseeId].includes(account.profile.id)) throw new Error('That chat is not yours.');
    if (blocked(this.db, connection.requesterId, connection.addresseeId)) throw new Error('This chat is closed.');
    const db = clone(this.db);
    db.messages.push({
      id: uid(),
      connectionId,
      senderId: account.profile.id,
      body: text.slice(0, 2000),
      createdAt: new Date().toISOString(),
    });
    this.commit(db);
  }

  async blockUser(userId: string): Promise<void> {
    const account = this.me();
    if (this.db.blocks.some((row) => row.blockerId === account.profile.id && row.blockedId === userId)) return;
    const db = clone(this.db);
    db.blocks.push({ id: uid(), blockerId: account.profile.id, blockedId: userId });
    this.commit(db);
  }

  async unblockUser(userId: string): Promise<void> {
    const account = this.me();
    const db = clone(this.db);
    db.blocks = db.blocks.filter((row) => !(row.blockerId === account.profile.id && row.blockedId === userId));
    this.commit(db);
  }

  async reportUser(input: NewReport): Promise<void> {
    const account = this.me();
    const reported = this.db.accounts[input.reportedUserId];
    const db = clone(this.db);
    db.reports.push({
      id: uid(),
      reporterId: account.profile.id,
      reportedUserId: input.reportedUserId,
      reportedName: reported?.profile.displayName ?? 'Member',
      reason: input.reason,
      details: input.details.trim(),
      status: 'open',
      createdAt: new Date().toISOString(),
    });
    this.commit(db);
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

  async sendThumos(content: string, mode: ThumosMode, onDelta?: (text: string) => void): Promise<void> {
    const text = content.trim();
    if (!text) return;
    const account = this.me();
    if (!account.profile.consentAi) {
      throw new Error('Agree to the coach consent before sending a message to Thumos.');
    }
    const safety = detectSafety(text);
    const reply = ensureSafetyNotices(OFFLINE_COACH_MESSAGE, safety);
    onDelta?.(reply);
    const db = clone(this.db);
    const thread = db.accounts[account.profile.id].thumos;
    const stamp = new Date();
    thread.push({ id: uid(), role: 'user', content: text, mode, createdAt: stamp.toISOString() });
    thread.push({
      id: uid(),
      role: 'offline',
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
      message: 'Voice needs XAI_API_KEY on the Supabase edge function. The sample on this device does not call xAI.',
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
      storagePath: progressStoragePath(account.profile.id, id),
      createdAt: new Date().toISOString(),
      visibility: 'private',
      previewUrl: bytesToDataUrl(input.bytes),
    });
    next.progressPhotos = photos;
    this.commit(db);
  }

  async updateProgressPhoto(id: string, input: { takenOn?: string; startingPoint?: boolean; note?: string }): Promise<void> {
    const account = this.me();
    const photo = (account.progressPhotos ?? []).find((item) => item.id === id);
    if (!photo) throw new UserFacingError('Could not update that photo.', 'generic');
    const plan = planProgressPhoto({
      takenOn: input.takenOn ?? photo.takenOn,
      startingPoint: input.startingPoint === undefined ? photo.monthIndex === 0 : input.startingPoint,
      note: input.note ?? photo.note,
      anchor: progressAnchor(account.profile.sobrietyStartedAt, account.profile.createdAt),
    });
    if (!plan.ok) throw new UserFacingError(plan.message, 'generic');
    const db = clone(this.db);
    const next = (db.accounts[account.profile.id].progressPhotos ?? []).find((item) => item.id === id);
    if (!next) throw new UserFacingError('Could not update that photo.', 'generic');
    if (input.note !== undefined) next.note = plan.note;
    if (input.takenOn !== undefined || input.startingPoint !== undefined) {
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

  async addGratitudeEntry(input: NewGratitudeEntry): Promise<void> {
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
    this.commit(db);
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
    });
    entry.photos = photos;
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
      })),
      gratitude_photos: (account.gratitude ?? []).flatMap((entry) => (entry.photos ?? []).map((photo) => ({
        id: photo.id,
        entry_id: entry.id,
        user_id: id,
        storage_path: photo.storagePath,
        created_at: photo.createdAt,
        signed_url: photo.previewUrl,
      }))),
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
