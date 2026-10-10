import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  EMAIL_TAKEN_MESSAGE,
  RESET_NEEDS_EMAIL,
  UserFacingError,
  WEAK_PASSWORD_MESSAGE,
  WRONG_PASSWORD_MESSAGE,
} from '@/domain/errors';
import { randomId } from '@/domain/id';
import { planCustomInterest, validateTown } from '@/domain/privacy';
import { planRelapse } from '@/domain/sober';
import { detectSafety, ensureSafetyNotices } from '@/domain/safety';
import { CRAVING_LINE, OFFLINE_COACH_MESSAGE, OPENING_LINE, type ThumosMode } from '@/domain/thumos';
import { CONSENT_VERSION } from '@/data/catalogue';
import { createDemoDb, type DemoAccount, type DemoDb } from '@/data/demo-seed';
import type {
  AppSnapshot,
  DirectoryCard,
  NewCheckIn,
  NewHealthSample,
  NewReport,
  OnboardingInput,
  ProfilePatch,
  Repository,
  VoiceMint,
} from '@/data/types';

const STORAGE_KEY = 'charioteer.demo.v1';

function uid(): string {
  return randomId();
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function localToday(date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
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
      profile: account ? clone(account.profile) : null,
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
    this.ready = true;
    this.snapshot = this.derive();
    this.listeners.forEach((listener) => listener());
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
      },
      reasons: [],
      checkIns: [],
      relapses: [],
      health: [],
      thumos: [],
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
      sobrietyStartedAt: input.sobrietyStartedAt,
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
    next.reasons = input.reasons
      .map((body) => body.trim())
      .filter(Boolean)
      .map((body, sortOrder) => ({ id: uid(), body, sortOrder }));
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

  async ensureThumosGuide(kind: 'opening' | 'craving'): Promise<void> {
    const account = this.me();
    if (kind === 'opening') {
      if (account.thumos.length > 0) return;
      this.appendGuide(OPENING_LINE, 'opening');
      return;
    }
    const today = localToday();
    const already = account.thumos.some((message) => message.content === CRAVING_LINE && localToday(new Date(message.createdAt)) === today);
    if (!already) this.appendGuide(CRAVING_LINE, 'support');
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

  async mintVoiceToken(): Promise<VoiceMint> {
    return {
      ok: false,
      code: 'missing_key',
      message: 'Voice needs XAI_API_KEY on the Supabase edge function. The sample on this device does not call xAI.',
    };
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
