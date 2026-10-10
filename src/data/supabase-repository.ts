import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

import { signInWithApple as nativeApple } from '@/auth/appleSignIn';
import {
  CONFIRM_EMAIL_MESSAGE,
  EMAIL_TAKEN_MESSAGE,
  OFFLINE_MESSAGE,
  RESET_NEEDS_EMAIL,
  UserFacingError,
  WEAK_PASSWORD_MESSAGE,
  asUserFacing,
  isTransientNetworkError,
} from '@/domain/errors';
import { passwordResetRedirect, recoveryLink } from '@/domain/passwordReset';
import { createUtf8Decoder } from '@/domain/utf8';
import { slugifyInterest, validateTown } from '@/domain/privacy';
import { fetchWithOneRetry } from '@/domain/retryFetch';
import { planRelapse } from '@/domain/sober';
import { parseSseBuffer } from '@/domain/sse';
import { detectSafety } from '@/domain/safety';
import { CRAVING_LINE, OFFLINE_COACH_MESSAGE, OPENING_LINE, type ThumosMode } from '@/domain/thumos';
import { CONSENT_VERSION } from '@/data/catalogue';
import type {
  AppSnapshot,
  CheckIn,
  Connection,
  DirectoryCard,
  HealthSample,
  Interest,
  NewCheckIn,
  NewHealthSample,
  NewReport,
  OnboardingInput,
  Profile,
  ProfilePatch,
  Reason,
  Relapse,
  Report,
  Repository,
  Resource,
  ThumosMessage,
  VoiceMint,
} from '@/data/types';

type Row = Record<string, unknown>;

function localToday(date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Expo's static web render has no window. iOS does not either, and must still start the client. */
const staticWebRender = Platform.OS === 'web' && typeof window === 'undefined';

const serverStorage = {
  getItem: (_key: string) => Promise.resolve(null),
  setItem: (_key: string, _value: string) => Promise.resolve(),
  removeItem: (_key: string) => Promise.resolve(),
};

function emptySnapshot(): AppSnapshot {
  return {
    ready: false,
    mode: 'supabase',
    error: null,
    session: null,
    profile: null,
    reasons: [],
    checkIns: [],
    relapses: [],
    health: [],
    interests: [],
    resources: [],
    directory: [],
    connections: [],
    messages: [],
    reports: [],
    thumos: [],
  };
}

export class SupabaseRepository implements Repository {
  private client: SupabaseClient;
  private url: string;
  private anonKey: string;
  private snapshot: AppSnapshot = emptySnapshot();
  private listeners = new Set<() => void>();
  private started = false;

  constructor(url: string, anonKey: string) {
    this.url = url;
    this.anonKey = anonKey;
    this.client = createClient(url, anonKey, {
      auth: {
        storage: staticWebRender ? serverStorage : AsyncStorage,
        autoRefreshToken: !staticWebRender,
        persistSession: !staticWebRender,
        detectSessionInUrl: Platform.OS === 'web' && !staticWebRender,
        flowType: 'implicit',
      },
      global: { fetch: fetchWithOneRetry() },
    });
    if (!staticWebRender) void this.start();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): AppSnapshot {
    return this.snapshot;
  }

  private emit(next: AppSnapshot) {
    this.snapshot = next;
    this.listeners.forEach((listener) => listener());
  }

  private async start() {
    if (this.started) return;
    this.started = true;
    this.client.auth.onAuthStateChange(() => {
      void this.refresh();
    });
    await this.refresh();
    this.client
      .channel('direct-messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages' }, () => {
        void this.refresh();
      })
      .subscribe();
  }

  private async refresh() {
    const { data: sessionData } = await this.client.auth.getSession();
    const session = sessionData.session;
    const [interestsRes, resourcesRes] = await Promise.all([
      this.client.from('interests').select('id, slug, label, created_by').order('label'),
      this.client.from('resources').select('*').order('sort_order'),
    ]);
    const interests = ((interestsRes.data ?? []) as Row[]).map(mapInterest);
    const resources = ((resourcesRes.data ?? []) as Row[]).map(mapResource);

    if (!session) {
      this.emit({ ...emptySnapshot(), ready: true, interests, resources });
      return;
    }

    const userId = session.user.id;
    const email = session.user.email ?? '';
    const [profileRes, reasonsRes, checkRes, relapseRes, healthRes, mineRes, thumosRes, directoryRes, interestLinks, connectionsRes, reportsRes] =
      await Promise.all([
        this.client.from('profiles').select('*').eq('id', userId).maybeSingle(),
        this.client.from('reasons').select('*').eq('user_id', userId).order('sort_order'),
        this.client.from('check_ins').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
        this.client.from('relapses').select('*').eq('user_id', userId).order('occurred_at', { ascending: false }),
        this.client.from('health_samples').select('*').eq('user_id', userId).order('recorded_on', { ascending: false }),
        this.client.from('profile_interests').select('user_id, interest_id'),
        this.client.from('thumos_messages').select('*').eq('user_id', userId).order('created_at'),
        this.client.from('directory').select('*'),
        this.client.from('profile_interests').select('user_id, interest_id'),
        this.client.from('connections').select('*').order('created_at', { ascending: false }),
        this.client.from('reports').select('*').order('created_at', { ascending: false }),
      ]);

    const profileRow = profileRes.data as Row | null;
    const myInterestIds = ((mineRes.data ?? []) as Row[])
      .filter((row) => row.user_id === userId)
      .map((row) => String(row.interest_id));
    const profile = profileRow ? mapProfile(profileRow, email, myInterestIds) : null;
    const links = (interestLinks.data ?? []) as Row[];
    const byUser = new Map<string, string[]>();
    for (const link of links) {
      const owner = String(link.user_id);
      const list = byUser.get(owner) ?? [];
      list.push(String(link.interest_id));
      byUser.set(owner, list);
    }
    const mine = new Set(myInterestIds);
    const directory: DirectoryCard[] = ((directoryRes.data ?? []) as Row[])
      .filter((row) => String(row.user_id) !== userId)
      .map((row) => {
        const interestIds = byUser.get(String(row.user_id)) ?? [];
        return {
          id: String(row.user_id),
          displayName: String(row.display_name ?? ''),
          town: (row.town as string | null) ?? null,
          interestIds,
          sharedInterestIds: interestIds.filter((id) => mine.has(id)),
        };
      })
      .sort((a, b) => b.sharedInterestIds.length - a.sharedInterestIds.length || a.displayName.localeCompare(b.displayName));

    const connections = ((connectionsRes.data ?? []) as Row[]).map(mapConnection);
    const connectionIds = connections.map((connection) => connection.id);
    let messages: AppSnapshot['messages'] = [];
    if (connectionIds.length) {
      const messageRes = await this.client
        .from('direct_messages')
        .select('*')
        .in('connection_id', connectionIds)
        .order('created_at');
      messages = ((messageRes.data ?? []) as Row[]).map((row) => ({
        id: String(row.id),
        connectionId: String(row.connection_id),
        senderId: String(row.sender_id),
        body: String(row.body),
        createdAt: String(row.created_at),
      }));
    }

    this.emit({
      ready: true,
      mode: 'supabase',
      error: profileRes.error?.message ?? null,
      session: { userId, email },
      profile,
      reasons: ((reasonsRes.data ?? []) as Row[]).map(mapReason),
      checkIns: ((checkRes.data ?? []) as Row[]).map(mapCheckIn),
      relapses: ((relapseRes.data ?? []) as Row[]).map(mapRelapse),
      health: ((healthRes.data ?? []) as Row[]).map(mapHealth),
      interests,
      resources,
      directory,
      connections,
      messages,
      reports: ((reportsRes.data ?? []) as Row[]).map(mapReport),
      thumos: ((thumosRes.data ?? []) as Row[]).map(mapThumos),
    });
  }

  private async userId(): Promise<string> {
    const { data } = await this.client.auth.getUser();
    if (!data.user) throw new Error('Sign in first.');
    return data.user.id;
  }

  async signIn(email: string, password: string): Promise<void> {
    try {
      const { error } = await this.client.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
      await this.refresh();
    } catch (error) {
      throw asUserFacing(error, 'sign-in');
    }
  }

  async signUp(email: string, password: string, displayName: string): Promise<void> {
    if (password.length < 8) throw new UserFacingError(WEAK_PASSWORD_MESSAGE, 'weak_password');
    const normalised = email.trim();
    try {
      const { data, error } = await this.client.auth.signUp({
        email: normalised,
        password,
        options: { data: { display_name: displayName.trim() } },
      });
      if (error) throw error;
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        throw new UserFacingError(EMAIL_TAKEN_MESSAGE, 'email_taken');
      }
      const session = data.session ?? (await this.client.auth.getSession()).data.session;
      if (!session) throw new UserFacingError(CONFIRM_EMAIL_MESSAGE, 'confirm_email');
      await this.refresh();
    } catch (error) {
      if (error instanceof UserFacingError) throw error;
      if (isTransientNetworkError(error)) {
        console.error('sign-up failed', error);
        const recovered = await this.probeSignUp(normalised, password);
        if (recovered === 'signed-in') return;
        if (recovered === 'confirm') throw new UserFacingError(CONFIRM_EMAIL_MESSAGE, 'confirm_email');
        if (recovered === 'unreachable') throw new UserFacingError(OFFLINE_MESSAGE, 'offline');
        throw new UserFacingError('Could not create the account. Try again.', 'generic');
      }
      throw asUserFacing(error, 'sign-up');
    }
  }

  /**
   * Sign-up itself is not retried. If the response was lost, a sign-in tells us
   * whether that password now belongs to an account.
   */
  private async probeSignUp(email: string, password: string): Promise<'signed-in' | 'confirm' | 'unreachable' | 'answered'> {
    try {
      const { error } = await this.client.auth.signInWithPassword({ email, password });
      if (!error) {
        await this.refresh();
        return 'signed-in';
      }
      const faced = asUserFacing(error, 'sign-in');
      if (faced.code === 'confirm_email') return 'confirm';
      return 'answered';
    } catch (error) {
      console.error('sign-up existence check failed', error);
      return isTransientNetworkError(error) ? 'unreachable' : 'answered';
    }
  }

  async requestPasswordReset(email: string): Promise<void> {
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes('@')) throw new UserFacingError(RESET_NEEDS_EMAIL, 'generic');
    const redirectTo = passwordResetRedirect(
      Platform.OS === 'web' ? 'web' : 'native',
      Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : undefined,
    );
    try {
      const { error } = await this.client.auth.resetPasswordForEmail(trimmed, { redirectTo });
      if (error) throw error;
    } catch (error) {
      throw asUserFacing(error, 'reset');
    }
  }

  async updatePassword(password: string): Promise<void> {
    if (password.length < 8) throw new UserFacingError(WEAK_PASSWORD_MESSAGE, 'weak_password');
    try {
      const { error } = await this.client.auth.updateUser({ password });
      if (error) throw error;
      await this.refresh();
    } catch (error) {
      throw asUserFacing(error, 'reset');
    }
  }

  async completeAuthRedirect(url: string): Promise<void> {
    const link = recoveryLink(url);
    if (!link) return;
    try {
      if (link.kind === 'code') {
        const { error } = await this.client.auth.exchangeCodeForSession(link.code);
        if (error) throw error;
      } else {
        const { error } = await this.client.auth.setSession({
          access_token: link.accessToken,
          refresh_token: link.refreshToken,
        });
        if (error) throw error;
      }
      await this.refresh();
    } catch (error) {
      throw asUserFacing(error, 'reset');
    }
  }

  async signInWithApple(): Promise<void> {
    try {
      await nativeApple(this.client);
      await this.refresh();
    } catch (error) {
      throw asUserFacing(error, 'sign-in');
    }
  }

  async signOut(): Promise<void> {
    await this.client.auth.signOut();
    await this.refresh();
  }

  async completeOnboarding(input: OnboardingInput): Promise<void> {
    const townError = validateTown(input.town);
    if (townError) throw new Error(townError);
    const userId = await this.userId();
    const { error } = await this.client
      .from('profiles')
      .update({
        display_name: input.displayName.trim(),
        sobriety_started_at: input.sobrietyStartedAt,
        weekly_spend_gbp: input.weeklySpendGbp,
        weekly_units: input.weeklyUnits,
        town: input.town.trim() || null,
        age_confirmed_18: true,
        community_visible: input.communityVisible,
        consent_health: input.consentHealth,
        consent_ai: input.consentAi,
        onboarding_complete: true,
      })
      .eq('id', userId);
    if (error) throw new Error(error.message);
    await this.replaceInterests(userId, input.interestIds);
    await this.client.from('reasons').delete().eq('user_id', userId);
    const reasons = input.reasons.map((body) => body.trim()).filter(Boolean);
    if (reasons.length) {
      await this.client.from('reasons').insert(reasons.map((body, sort_order) => ({ user_id: userId, body, sort_order })));
    }
    await this.insertConsents(userId, input);
    await this.refresh();
  }

  async updateProfile(patch: ProfilePatch): Promise<void> {
    if (patch.town != null) {
      const townError = validateTown(patch.town);
      if (townError) throw new Error(townError);
    }
    const userId = await this.userId();
    const column: Record<string, unknown> = {};
    if (patch.displayName != null) column.display_name = patch.displayName.trim();
    if (patch.town !== undefined) column.town = patch.town?.trim() || null;
    if (patch.weeklySpendGbp !== undefined) column.weekly_spend_gbp = patch.weeklySpendGbp;
    if (patch.weeklyUnits !== undefined) column.weekly_units = patch.weeklyUnits;
    if (patch.communityVisible !== undefined) column.community_visible = patch.communityVisible;
    if (patch.consentHealth !== undefined) column.consent_health = patch.consentHealth;
    if (patch.consentAi !== undefined) column.consent_ai = patch.consentAi;
    if (patch.textScale !== undefined) column.text_scale = patch.textScale;
    if (patch.themePreference !== undefined) column.theme_preference = patch.themePreference;
    if (Object.keys(column).length) {
      const { error } = await this.client.from('profiles').update(column).eq('id', userId);
      if (error) throw new Error(error.message);
    }
    if (patch.interestIds) await this.replaceInterests(userId, patch.interestIds);
    await this.refresh();
  }

  async setReasons(bodies: string[]): Promise<void> {
    const userId = await this.userId();
    await this.client.from('reasons').delete().eq('user_id', userId);
    const reasons = bodies.map((body) => body.trim()).filter(Boolean);
    if (reasons.length) {
      const { error } = await this.client.from('reasons').insert(reasons.map((body, sort_order) => ({ user_id: userId, body, sort_order })));
      if (error) throw new Error(error.message);
    }
    await this.refresh();
  }

  async addCheckIn(input: NewCheckIn): Promise<void> {
    const userId = await this.userId();
    const { error } = await this.client.from('check_ins').insert({
      user_id: userId,
      mood: input.mood,
      sleep_hours: input.sleepHours,
      craving: input.craving,
      note: input.note.trim(),
    });
    if (error) throw new Error(error.message);
    await this.refresh();
  }

  async recordRelapse(note: string): Promise<void> {
    const profile = this.snapshot.profile;
    if (!profile?.sobrietyStartedAt) throw new Error('Set a start date first.');
    const plan = planRelapse(new Date(profile.sobrietyStartedAt), new Date(), note);
    const userId = await this.userId();
    const { error } = await this.client.from('relapses').insert({
      user_id: userId,
      occurred_at: plan.record.occurredAt,
      previous_started_at: plan.record.previousStartedAt,
      days_kept: plan.record.daysKept,
      note: plan.record.note,
    });
    if (error) throw new Error(error.message);
    const update = await this.client.from('profiles').update({ sobriety_started_at: plan.nextStartedAt.toISOString() }).eq('id', userId);
    if (update.error) throw new Error(update.error.message);
    await this.refresh();
  }

  async saveHealth(samples: NewHealthSample[]): Promise<void> {
    if (!this.snapshot.profile?.consentHealth) throw new Error('Health data stays off until you give consent.');
    const userId = await this.userId();
    const { error } = await this.client.from('health_samples').upsert(
      samples.map((sample) => ({
        user_id: userId,
        kind: sample.kind,
        value: sample.value,
        unit: sample.unit,
        recorded_on: sample.recordedOn,
        source: sample.source,
      })),
      { onConflict: 'user_id,kind,recorded_on,source' },
    );
    if (error) throw new Error(error.message);
    await this.refresh();
  }

  async addCustomInterest(label: string): Promise<void> {
    const name = label.trim();
    const slug = slugifyInterest(name);
    if (!slug) throw new Error('Use letters or numbers.');
    const userId = await this.userId();
    let interest = this.snapshot.interests.find((item) => item.slug === slug);
    if (!interest) {
      const { data, error } = await this.client.from('interests').insert({ slug, label: name, created_by: userId }).select('id, slug, label, created_by').single();
      if (error) throw new Error(error.message);
      interest = mapInterest(data as Row);
    }
    const ids = new Set(this.snapshot.profile?.interestIds ?? []);
    ids.add(interest.id);
    await this.replaceInterests(userId, [...ids]);
    await this.refresh();
  }

  async requestConnection(userId: string): Promise<void> {
    const me = await this.userId();
    const { error } = await this.client.from('connections').insert({ requester_id: me, addressee_id: userId, status: 'pending' });
    if (error) throw new Error(error.message);
    await this.refresh();
  }

  async respondConnection(connectionId: string, accept: boolean): Promise<void> {
    const { error } = await this.client.from('connections').update({ status: accept ? 'accepted' : 'declined' }).eq('id', connectionId);
    if (error) throw new Error(error.message);
    await this.refresh();
  }

  async sendDirectMessage(connectionId: string, body: string): Promise<void> {
    const text = body.trim();
    if (!text) return;
    const userId = await this.userId();
    const { error } = await this.client.from('direct_messages').insert({
      connection_id: connectionId,
      sender_id: userId,
      body: text.slice(0, 2000),
    });
    if (error) throw new Error(error.message);
    await this.refresh();
  }

  async blockUser(userId: string): Promise<void> {
    const me = await this.userId();
    const { error } = await this.client.from('blocks').insert({ blocker_id: me, blocked_id: userId });
    if (error && !error.message.toLowerCase().includes('duplicate')) throw new Error(error.message);
    await this.refresh();
  }

  async unblockUser(userId: string): Promise<void> {
    const me = await this.userId();
    await this.client.from('blocks').delete().eq('blocker_id', me).eq('blocked_id', userId);
    await this.refresh();
  }

  async reportUser(input: NewReport): Promise<void> {
    const me = await this.userId();
    const name = this.snapshot.directory.find((card) => card.id === input.reportedUserId)?.displayName ?? 'Member';
    const { error } = await this.client.from('reports').insert({
      reporter_id: me,
      reported_user_id: input.reportedUserId,
      reported_name: name,
      reason: input.reason,
      details: input.details.trim(),
    });
    if (error) throw new Error(error.message);
    await this.refresh();
  }

  async reviewReport(id: string): Promise<void> {
    const { error } = await this.client.from('reports').update({ status: 'reviewed' }).eq('id', id);
    if (error) throw new Error(error.message);
    await this.refresh();
  }

  async ensureThumosGuide(kind: 'opening' | 'craving'): Promise<void> {
    const messages = this.snapshot.thumos;
    if (kind === 'opening') {
      if (messages.length > 0) return;
      await this.insertGuide(OPENING_LINE, 'opening');
      return;
    }
    const today = localToday();
    const already = messages.some((message) => message.content === CRAVING_LINE && localToday(new Date(message.createdAt)) === today);
    if (!already) await this.insertGuide(CRAVING_LINE, 'support');
  }

  private async insertGuide(content: string, mode: string) {
    const userId = await this.userId();
    await this.client.from('thumos_messages').insert({ user_id: userId, role: 'guide', content, mode });
    await this.refresh();
  }

  async sendThumos(content: string, mode: ThumosMode, onDelta?: (text: string) => void): Promise<void> {
    const text = content.trim();
    if (!text) return;
    if (!this.snapshot.profile?.consentAi) throw new Error('Agree to the coach consent before sending a message to Thumos.');
    const safety = detectSafety(text);
    const effectiveMode: ThumosMode = safety.selfHarm || safety.withdrawal ? 'support' : mode;

    let response: Response;
    try {
      const { data: sessionData } = await this.client.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('Sign in first.');
      response = await fetch(`${this.url}/functions/v1/thumos-chat`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: this.anonKey,
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({ content: text, mode: effectiveMode }),
      });
    } catch {
      await this.insertOfflinePair(text, effectiveMode);
      return;
    }

    if (!response.ok) {
      if (response.status >= 500) {
        await this.insertOfflinePair(text, effectiveMode);
        return;
      }
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      throw asUserFacing(new Error(body?.message ?? 'Could not send that.'), 'thumos');
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('text/event-stream')) {
      await this.refresh();
      return;
    }

    let accumulated = '';
    let failed: string | null = null;
    const apply = (chunk: string) => {
      parseSseBuffer(chunk, (event) => {
        if (event.type === 'delta') {
          accumulated += event.text;
          onDelta?.(accumulated);
        } else if (event.type === 'done') {
          accumulated = event.reply;
          onDelta?.(event.reply);
        } else if (event.type === 'error') {
          failed = event.message;
        }
      });
    };

    if (response.body && typeof response.body.getReader === 'function') {
      const reader = response.body.getReader();
      const decoder = createUtf8Decoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value);
        const leftover = parseSseBuffer(buffer, (event) => {
          if (event.type === 'delta') {
            accumulated += event.text;
            onDelta?.(accumulated);
          } else if (event.type === 'done') {
            accumulated = event.reply;
            onDelta?.(event.reply);
          } else if (event.type === 'error') {
            failed = event.message;
          }
        });
        buffer = leftover;
      }
      buffer += decoder.flush();
      if (buffer.trim()) apply(`${buffer}\n\n`);
    } else {
      apply(`${await response.text()}\n\n`);
    }

    if (failed) throw asUserFacing(new Error(failed), 'thumos');
    await this.refresh();
  }

  private async insertOfflinePair(text: string, mode: ThumosMode) {
    const userId = await this.userId();
    const { error: insertError } = await this.client.from('thumos_messages').insert([
      { user_id: userId, role: 'user', content: text, mode },
      { user_id: userId, role: 'offline', content: OFFLINE_COACH_MESSAGE, mode: 'support' },
    ]);
    if (insertError) throw asUserFacing(insertError, 'thumos');
    await this.refresh();
  }

  async mintVoiceToken(): Promise<VoiceMint> {
    const { data, error } = await this.client.functions.invoke('thumos-voice-token', { body: {} });
    if (error || !data?.ok) {
      return {
        ok: false,
        code: data?.code ?? 'missing_key',
        message: data?.message ?? 'Voice is unavailable until the edge function and XAI_API_KEY are set.',
      };
    }
    return { ok: true, token: data.token, expiresAt: Number(data.expiresAt ?? 0) };
  }

  async exportData(): Promise<Record<string, unknown>> {
    const invoked = await this.client.functions.invoke('account-export', { body: {} });
    if (!invoked.error && invoked.data?.data) return invoked.data.data as Record<string, unknown>;
    const { data, error } = await this.client.rpc('export_my_data');
    if (error) throw new Error(error.message);
    return data as Record<string, unknown>;
  }

  async deleteAccount(): Promise<void> {
    const invoked = await this.client.functions.invoke('account-delete', { body: {} });
    if (invoked.error) {
      const { error } = await this.client.rpc('delete_my_account');
      if (error) throw new Error(error.message);
    }
    await this.client.auth.signOut();
    await this.refresh();
  }

  private async replaceInterests(userId: string, interestIds: string[]) {
    await this.client.from('profile_interests').delete().eq('user_id', userId);
    if (!interestIds.length) return;
    const { error } = await this.client.from('profile_interests').insert(interestIds.map((interest_id) => ({ user_id: userId, interest_id })));
    if (error) throw new Error(error.message);
  }

  private async insertConsents(userId: string, input: OnboardingInput) {
    const { error } = await this.client.from('consents').insert([
      { user_id: userId, kind: 'age_18', granted: true, version: CONSENT_VERSION },
      { user_id: userId, kind: 'health', granted: input.consentHealth, version: CONSENT_VERSION },
      { user_id: userId, kind: 'community', granted: input.communityVisible, version: CONSENT_VERSION },
      { user_id: userId, kind: 'ai_coach', granted: input.consentAi, version: CONSENT_VERSION },
    ]);
    if (error) throw asUserFacing(error, 'general');
  }
}

function mapInterest(row: Row): Interest {
  return { id: String(row.id), slug: String(row.slug), label: String(row.label), custom: row.created_by != null };
}

function mapResource(row: Row): Resource {
  return {
    id: String(row.id),
    category: row.category as Resource['category'],
    title: String(row.title),
    detail: String(row.detail),
    url: (row.url as string | null) ?? null,
    phone: (row.phone as string | null) ?? null,
    verification: row.verification as Resource['verification'],
    verificationNote: String(row.verification_note ?? ''),
  };
}

function mapProfile(row: Row, email: string, interestIds: string[]): Profile {
  return {
    id: String(row.id),
    email,
    displayName: String(row.display_name ?? ''),
    sobrietyStartedAt: (row.sobriety_started_at as string | null) ?? null,
    weeklySpendGbp: row.weekly_spend_gbp == null ? null : Number(row.weekly_spend_gbp),
    weeklyUnits: row.weekly_units == null ? null : Number(row.weekly_units),
    town: (row.town as string | null) ?? null,
    ageConfirmed18: Boolean(row.age_confirmed_18),
    communityVisible: Boolean(row.community_visible),
    consentHealth: Boolean(row.consent_health),
    consentAi: Boolean(row.consent_ai),
    onboardingComplete: Boolean(row.onboarding_complete),
    isModerator: Boolean(row.is_moderator),
    textScale: (row.text_scale as Profile['textScale']) ?? 'default',
    themePreference: (row.theme_preference as Profile['themePreference']) ?? 'dark',
    interestIds,
  };
}

function mapReason(row: Row): Reason {
  return { id: String(row.id), body: String(row.body), sortOrder: Number(row.sort_order ?? 0) };
}

function mapCheckIn(row: Row): CheckIn {
  return {
    id: String(row.id),
    mood: Number(row.mood) as CheckIn['mood'],
    sleepHours: Number(row.sleep_hours),
    craving: Number(row.craving),
    note: String(row.note ?? ''),
    createdAt: String(row.created_at),
  };
}

function mapRelapse(row: Row): Relapse {
  return {
    id: String(row.id),
    occurredAt: String(row.occurred_at),
    previousStartedAt: String(row.previous_started_at),
    daysKept: Number(row.days_kept),
    note: String(row.note ?? ''),
  };
}

function mapHealth(row: Row): HealthSample {
  return {
    id: String(row.id),
    kind: row.kind as HealthSample['kind'],
    value: Number(row.value),
    unit: String(row.unit),
    recordedOn: String(row.recorded_on),
    source: row.source as HealthSample['source'],
  };
}

function mapConnection(row: Row): Connection {
  return {
    id: String(row.id),
    requesterId: String(row.requester_id),
    addresseeId: String(row.addressee_id),
    status: row.status as Connection['status'],
    createdAt: String(row.created_at),
  };
}

function mapReport(row: Row): Report {
  return {
    id: String(row.id),
    reporterId: String(row.reporter_id),
    reportedUserId: (row.reported_user_id as string | null) ?? null,
    reportedName: String(row.reported_name ?? ''),
    reason: String(row.reason),
    details: String(row.details ?? ''),
    status: row.status as Report['status'],
    createdAt: String(row.created_at),
  };
}

function mapThumos(row: Row): ThumosMessage {
  return {
    id: String(row.id),
    role: row.role as ThumosMessage['role'],
    content: String(row.content),
    mode: row.mode as ThumosMessage['mode'],
    createdAt: String(row.created_at),
  };
}
