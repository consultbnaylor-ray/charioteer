import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

import { signInWithApple as nativeApple } from '@/auth/appleSignIn';
import { slugifyInterest, validateTown } from '@/domain/privacy';
import { planRelapse } from '@/domain/sober';
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

function uid(): string {
  return globalThis.crypto.randomUUID();
}

function localToday(date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

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
  private snapshot: AppSnapshot = emptySnapshot();
  private listeners = new Set<() => void>();
  private started = false;

  constructor(url: string, anonKey: string) {
    this.client = createClient(url, anonKey, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: Platform.OS === 'web',
      },
    });
    void this.start();
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
    const { error } = await this.client.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw new Error(error.message);
    await this.refresh();
  }

  async signUp(email: string, password: string, displayName: string): Promise<void> {
    const { error } = await this.client.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { display_name: displayName.trim() } },
    });
    if (error) throw new Error(error.message);
    const { data } = await this.client.auth.getSession();
    if (!data.session) throw new Error('Check your email to confirm the account, then sign in.');
    await this.refresh();
  }

  async signInWithApple(): Promise<void> {
    await nativeApple(this.client);
    await this.refresh();
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

  async sendThumos(content: string, mode: ThumosMode): Promise<void> {
    const text = content.trim();
    if (!text) return;
    if (!this.snapshot.profile?.consentAi) throw new Error('Agree to the coach consent before sending a message to Thumos.');
    const safety = detectSafety(text);
    const { data, error } = await this.client.functions.invoke('thumos-chat', { body: { content: text, mode } });
    if (!error && data) {
      await this.refresh();
      return;
    }
    const userId = await this.userId();
    const reply = OFFLINE_COACH_MESSAGE;
    const { error: insertError } = await this.client.from('thumos_messages').insert([
      { user_id: userId, role: 'user', content: text, mode: safety.selfHarm || safety.withdrawal ? 'support' : mode },
      { user_id: userId, role: 'offline', content: reply, mode: 'support' },
    ]);
    if (insertError) throw new Error(insertError.message);
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
    await this.client.from('consents').insert([
      { id: uid(), user_id: userId, kind: 'age_18', granted: true, version: CONSENT_VERSION },
      { id: uid(), user_id: userId, kind: 'health', granted: input.consentHealth, version: CONSENT_VERSION },
      { id: uid(), user_id: userId, kind: 'community', granted: input.communityVisible, version: CONSENT_VERSION },
      { id: uid(), user_id: userId, kind: 'ai_coach', granted: input.consentAi, version: CONSENT_VERSION },
    ]);
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
    themePreference: (row.theme_preference as Profile['themePreference']) ?? 'system',
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
