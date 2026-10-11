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
import { gratitudeFromRows, isGratitudeCategory, localGratitudeReflect, planGratitudeEntry, type GratitudePhoto, type GratitudeReflect } from '@/domain/gratitude';
import {
  GRATITUDE_BUCKET,
  GRATITUDE_MAX_BYTES,
  GRATITUDE_SIGNED_URL_SECONDS,
  gratitudePhotoLimitMessage,
  gratitudePhotosFromRows,
  gratitudeStoragePath,
  withGratitudePhotos,
} from '@/domain/gratitudePhotos';
import {
  VISION_BUCKET,
  VISION_CAPTION_LIMIT,
  VISION_MAX_BYTES,
  VISION_SIGNED_URL_SECONDS,
  VISION_STATEMENT_LIMIT,
  isVisionArea,
  isVisionSize,
  moveVisionItem as reorderVisionItems,
  planVisionText,
  type VisionArea,
  type VisionSize,
  sortVisionItems,
  visionItemsFromRows,
  visionPhotoLimitMessage,
  visionStoragePath,
} from '@/domain/visionBoard';
import { isoDay } from '@/domain/dates';
import { randomId } from '@/domain/id';
import { passwordResetRedirect, recoveryLink } from '@/domain/passwordReset';
import { createUtf8Decoder } from '@/domain/utf8';
import {
  PROGRESS_BUCKET,
  PROGRESS_MAX_BYTES,
  PROGRESS_SIGNED_URL_SECONDS,
  planProgressPhoto,
  progressAnchor,
  progressStoragePath,
  progressVisibility,
} from '@/domain/progressPhotos';
import {
  nextGalleryPositions,
  PROFILE_GALLERY_LIMIT,
  PROFILE_GALLERY_LIMIT_MESSAGE,
  PROFILE_PHOTO_BUCKET,
  PROFILE_SIGNED_URL_SECONDS,
  profileStoragePath,
  sortProfilePhotos,
} from '@/domain/profilePhotos';
import { interestSelectionUnchanged, nextInterestIds, rolledBackInterestIds, snapshotWithOwnInterests } from '@/domain/interests';
import { planCustomInterest, validateTown } from '@/domain/privacy';
import { fetchWithOneRetry } from '@/domain/retryFetch';
import { planReasons } from '@/domain/reasons';
import { BIO_LIMIT, PHOTO_CAPTION_LIMIT, defaultProfileSharing, normalizeProfileSharing, parsePublicProfile, planProfileText, sensitiveTurnedOn, type ProfileSharing } from '@/domain/profileSharing';
import { quoteById } from '@/domain/stoicQuotes';
import { planRelapse } from '@/domain/sober';
import { parseSseBuffer } from '@/domain/sse';
import { detectSafety } from '@/domain/safety';
import { OFFLINE_COACH_MESSAGE, OPENING_LINE, type ThumosMode } from '@/domain/thumos';
import { CONSENT_VERSION } from '@/data/catalogue';
import { consentRows, missingConsentRows, type StoredConsent } from '@/domain/consents';
import { stageFromRecord } from '@/domain/stage';
import type {
  AppSnapshot,
  CheckIn,
  Connection,
  ConsentInput,
  DirectoryCard,
  HealthSample,
  Interest,
  NewCheckIn,
  NewGratitudeEntry,
  NewHealthSample,
  NewProfilePhoto,
  NewProgressPhoto,
  NewReport,
  ProfilePhoto,
  ProgressPhoto,
  ProgressVisibility,
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
  VoiceTurnInput,
} from '@/data/types';

type Row = Record<string, unknown>;

/** Expo's static web render has no window. iOS does not either, and must still start the client. */
const staticWebRender = Platform.OS === 'web' && typeof window === 'undefined';

const serverStorage = {
  getItem: (_key: string) => Promise.resolve(null),
  setItem: (_key: string, _value: string) => Promise.resolve(),
  removeItem: (_key: string) => Promise.resolve(),
};

function loggedEmptyGratitude(message: string): [] {
  console.error(message);
  return [];
}

function gratitudeCategory(value: NewGratitudeEntry['category']): NewGratitudeEntry['category'] {
  return value && isGratitudeCategory(value) ? value : null;
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
    consents: [],
    progressPhotos: [],
    communityPhotos: [],
    profilePhotos: [],
    gratitude: [],
    visionItems: [],
    sharing: defaultProfileSharing(),
    savedQuotes: [],
  };
}

export class SupabaseRepository implements Repository {
  private client: SupabaseClient;
  private url: string;
  private anonKey: string;
  private snapshot: AppSnapshot = emptySnapshot();
  private listeners = new Set<() => void>();
  private started = false;
  private interestWrites = new Map<string, Promise<void>>();
  /** In-flight chip saves, so a refresh does not paint the previous selection over an optimistic one. */
  private pendingInterests = new Map<string, boolean>();
  private interestQueues = new Map<string, Promise<void>>();

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

  async reload(): Promise<void> {
    await this.refresh();
  }

  private emit(next: AppSnapshot) {
    this.snapshot = next;
    this.listeners.forEach((listener) => listener());
  }

  private applyPendingInterests(ids: string[]): string[] {
    let next = ids;
    for (const [interestId, selected] of this.pendingInterests) {
      if (ids.includes(interestId) === selected) {
        this.pendingInterests.delete(interestId);
        continue;
      }
      next = nextInterestIds(next, interestId, selected);
    }
    return next;
  }

  private enqueueInterest(interestId: string, work: () => Promise<void>): Promise<void> {
    const prior = this.interestQueues.get(interestId) ?? Promise.resolve();
    const run = prior.then(work, work);
    this.interestQueues.set(
      interestId,
      run.then(
        () => undefined,
        () => undefined,
      ),
    );
    return run;
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
    const [profileRes, reasonsRes, checkRes, relapseRes, healthRes, mineRes, thumosRes, directoryRes, interestLinks, connectionsRes, reportsRes, consentsRes, photosRes, gratitudeRes, gratitudePhotoRes, visionRes, sharingRes, quotesRes, profilePhotoRes] =
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
        this.client.from('consents').select('kind, granted, version').eq('user_id', userId),
        this.client.from('progress_photos').select('id, user_id, taken_on, month_index, note, caption, storage_path, created_at, visibility').eq('user_id', userId).order('month_index').order('taken_on'),
        this.client.from('gratitude_entries').select('id, body, category, is_favourite, entry_date, created_at, updated_at').eq('user_id', userId).order('entry_date', { ascending: false }),
        this.client.from('gratitude_photos').select('id, entry_id, user_id, storage_path, caption, created_at').eq('user_id', userId).order('created_at'),
        this.client.from('vision_board_items').select('id, user_id, storage_path, caption, area, size, position, created_at, updated_at').eq('user_id', userId).order('position'),
        this.client.from('profile_sharing').select('settings').eq('user_id', userId).maybeSingle(),
        this.client.from('user_quotes').select('quote_id, created_at').eq('user_id', userId).order('created_at', { ascending: false }),
        this.client.from('profile_photos').select('id, user_id, role, caption, position, storage_path, created_at').eq('user_id', userId).order('position').order('created_at'),
      ]);

    const profileRow = profileRes.data as Row | null;
    const myInterestIds = this.applyPendingInterests(
      ((mineRes.data ?? []) as Row[])
        .filter((row) => row.user_id === userId)
        .map((row) => String(row.interest_id)),
    );
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
    const directoryRows = ((directoryRes.data ?? []) as Row[]).filter((row) => String(row.user_id) !== userId);
    const avatarById = await this.profilePhotoUrlMap(
      directoryRows.map((row) => (typeof row.avatar_photo_id === 'string' ? row.avatar_photo_id : '')).filter(Boolean),
    );
    const directory: DirectoryCard[] = directoryRows
      .map((row) => {
        const interestIds = byUser.get(String(row.user_id)) ?? [];
        const avatarId = typeof row.avatar_photo_id === 'string' ? row.avatar_photo_id : '';
        return {
          id: String(row.user_id),
          displayName: String(row.display_name ?? ''),
          town: (row.town as string | null) ?? null,
          interestIds,
          sharedInterestIds: interestIds.filter((id) => mine.has(id)),
          avatarUrl: avatarById.get(avatarId) ?? null,
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
      consents: ((consentsRes.data ?? []) as Row[]).map(mapConsent),
      progressPhotos: await this.signedProgressPhotos(photosRes.error ? null : ((photosRes.data ?? []) as Row[]), photosRes.error?.message, userId),
      communityPhotos: photosRes.error ? [] : await this.communityProgressPhotos(userId),
      profilePhotos: await this.signedProfilePhotos(profilePhotoRes.error ? null : ((profilePhotoRes.data ?? []) as Row[]), profilePhotoRes.error?.message, userId),
      gratitude: withGratitudePhotos(
        gratitudeRes.error ? loggedEmptyGratitude(gratitudeRes.error.message) : gratitudeFromRows(gratitudeRes.data),
        await this.signedGratitudePhotos(gratitudePhotoRes.error ? null : ((gratitudePhotoRes.data ?? []) as Row[]), gratitudePhotoRes.error?.message),
      ),
      visionItems: await this.signedVisionItems(visionRes.error ? null : visionRes.data, visionRes.error?.message),
      sharing: sharingRes.error ? defaultProfileSharing() : normalizeProfileSharing((sharingRes.data as Row | null)?.settings),
      savedQuotes: quotesRes.error
        ? []
        : ((quotesRes.data ?? []) as Row[]).flatMap((row) => {
            const quoteId = String(row.quote_id ?? '');
            if (!quoteById(quoteId)) return [];
            return [{ quoteId, createdAt: String(row.created_at ?? '') }];
          }),
    });
  }

  private async signedProgressPhotos(rows: Row[] | null, queryError: string | undefined, userId: string): Promise<ProgressPhoto[]> {
    if (queryError || !rows) {
      if (queryError) console.error(queryError);
      return [];
    }
    const paths = rows.map((row) => String(row.storage_path)).filter((path) => path && !path.includes('..'));
    const signedByPath = new Map<string, string>();
    if (paths.length) {
      try {
        const signed = await this.client.storage.from(PROGRESS_BUCKET).createSignedUrls(paths, PROGRESS_SIGNED_URL_SECONDS);
        if (signed.error) console.error(signed.error.message);
        for (const item of signed.data ?? []) {
          if (item.path && item.signedUrl) signedByPath.set(item.path, item.signedUrl);
        }
      } catch (error) {
        console.error(error);
      }
    }
    return rows.map((row) => {
      const taken = String(row.taken_on ?? '');
      const path = String(row.storage_path ?? '');
      return {
        id: String(row.id),
        userId: String(row.user_id ?? userId),
        takenOn: /^\d{4}-\d{2}-\d{2}/.test(taken) ? taken.slice(0, 10) : taken,
        monthIndex: Number(row.month_index ?? 0),
        note: String(row.note ?? ''),
        caption: String(row.caption ?? ''),
        storagePath: path,
        createdAt: String(row.created_at ?? ''),
        visibility: progressVisibility(row.visibility),
        previewUrl: signedByPath.get(path) ?? null,
      };
    });
  }

  private async signedProfilePhotos(rows: Row[] | null, queryError: string | undefined, userId: string): Promise<ProfilePhoto[]> {
    if (queryError || !rows) {
      if (queryError) console.error(queryError);
      return [];
    }
    const paths = rows.map((row) => String(row.storage_path)).filter((path) => path && !path.includes('..'));
    const signedByPath = new Map<string, string>();
    if (paths.length) {
      try {
        const signed = await this.client.storage.from(PROFILE_PHOTO_BUCKET).createSignedUrls(paths, PROFILE_SIGNED_URL_SECONDS);
        if (signed.error) console.error(signed.error.message);
        for (const item of signed.data ?? []) {
          if (item.path && item.signedUrl) signedByPath.set(item.path, item.signedUrl);
        }
      } catch (error) {
        console.error(error);
      }
    }
    return sortProfilePhotos(rows.map((row) => {
      const path = String(row.storage_path ?? '');
      const role = row.role === 'avatar' ? 'avatar' as const : 'gallery' as const;
      return {
        id: String(row.id),
        userId: String(row.user_id ?? userId),
        role,
        caption: String(row.caption ?? ''),
        position: Number(row.position ?? 0),
        storagePath: path,
        createdAt: String(row.created_at ?? ''),
        previewUrl: signedByPath.get(path) ?? null,
      };
    }));
  }

  /** Signed URLs for profile photos. A missing function leaves initials in place. */
  private async profilePhotoUrlMap(ids: string[]): Promise<Map<string, string>> {
    const urls = new Map<string, string>();
    const unique = [...new Set(ids)].filter((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id));
    for (let index = 0; index < unique.length; index += 24) {
      const slice = unique.slice(index, index + 24);
      try {
        const invoked = await this.client.functions.invoke('profile-photo-url', { body: { ids: slice } });
        const photos = invoked.data?.photos;
        if (invoked.error || !invoked.data?.ok || !Array.isArray(photos)) continue;
        for (const photo of photos) {
          if (photo && typeof photo.id === 'string' && typeof photo.signed_url === 'string') urls.set(photo.id, photo.signed_url);
        }
      } catch (error) {
        console.error(error);
      }
    }
    return urls;
  }

  /** Owner signed links only. Gratitude photos are never asked of the community signer. */
  private async signedGratitudePhotos(rows: Row[] | null, queryError: string | undefined): Promise<GratitudePhoto[]> {
    if (queryError || !rows) {
      if (queryError) console.error(queryError);
      return [];
    }
    const parsed = gratitudePhotosFromRows(rows);
    const paths = parsed.map((photo) => photo.storagePath);
    const signedByPath = new Map<string, string>();
    if (paths.length) {
      try {
        const signed = await this.client.storage.from(GRATITUDE_BUCKET).createSignedUrls(paths, GRATITUDE_SIGNED_URL_SECONDS);
        if (signed.error) console.error(signed.error.message);
        for (const item of signed.data ?? []) {
          if (item.path && item.signedUrl) signedByPath.set(item.path, item.signedUrl);
        }
      } catch (error) {
        console.error(error);
      }
    }
    return parsed.map((photo) => ({ ...photo, previewUrl: signedByPath.get(photo.storagePath) ?? null }));
  }

  private async signedVisionItems(rows: unknown, queryError: string | undefined) {
    if (queryError || !rows) {
      if (queryError) console.error(queryError);
      return [];
    }
    const parsed = visionItemsFromRows(rows);
    const paths = parsed.map((item) => item.storagePath);
    const signedByPath = new Map<string, string>();
    if (paths.length) {
      try {
        const signed = await this.client.storage.from(VISION_BUCKET).createSignedUrls(paths, VISION_SIGNED_URL_SECONDS);
        if (signed.error) console.error(signed.error.message);
        for (const item of signed.data ?? []) {
          if (item.path && item.signedUrl) signedByPath.set(item.path, item.signedUrl);
        }
      } catch (error) {
        console.error(error);
      }
    }
    return sortVisionItems(parsed.map((item) => ({ ...item, previewUrl: signedByPath.get(item.storagePath) ?? null })));
  }

  /**
   * Shared photos only. The definer function returns the caption and never the
   * private note. The edge function signs a URL for those rows.
   */
  private async communityProgressPhotos(userId: string): Promise<ProgressPhoto[]> {
    const shared = await this.client.rpc('shared_progress_photos');
    if (shared.error || !shared.data?.length) {
      if (shared.error) console.error(shared.error.message);
      return [];
    }
    const rows = shared.data as Row[];
    const urls = new Map<string, string>();
    try {
      const invoked = await this.client.functions.invoke('progress-photo-url', {
        body: { ids: rows.map((row) => String(row.id)) },
      });
      const list = invoked.data?.photos;
      if (Array.isArray(list)) {
        for (const item of list) {
          if (item && typeof item.id === 'string' && typeof item.signed_url === 'string') urls.set(item.id, item.signed_url);
        }
      }
    } catch (error) {
      console.error(error);
    }
    return rows.filter((row) => progressVisibility(row.visibility) === 'community' && String(row.user_id ?? '') !== userId).map((row) => {
      const taken = String(row.taken_on ?? '');
      return {
        id: String(row.id),
        userId: String(row.user_id ?? ''),
        takenOn: /^\d{4}-\d{2}-\d{2}/.test(taken) ? taken.slice(0, 10) : taken,
        monthIndex: Number(row.month_index ?? 0),
        note: '',
        caption: String(row.caption ?? ''),
        storagePath: String(row.storage_path ?? ''),
        createdAt: String(row.created_at ?? ''),
        visibility: 'community' as const,
        previewUrl: urls.get(String(row.id)) ?? null,
      };
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
        stage: input.stage,
        sobriety_started_at: input.sobrietyStartedAt,
        planned_quit_at: input.plannedQuitAt,
        weekly_units_goal: input.weeklyUnitsGoal,
        drink_free_days_goal: input.drinkFreeDaysGoal,
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
    if (error) throw asUserFacing(error, 'general');
    await this.replaceInterests(userId, input.interestIds);
    await this.writeReasons(input.reasons);
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
    if (patch.stage !== undefined) column.stage = patch.stage;
    if (patch.sobrietyStartedAt !== undefined) column.sobriety_started_at = patch.sobrietyStartedAt;
    if (patch.plannedQuitAt !== undefined) column.planned_quit_at = patch.plannedQuitAt;
    if (patch.weeklyUnitsGoal !== undefined) column.weekly_units_goal = patch.weeklyUnitsGoal;
    if (patch.drinkFreeDaysGoal !== undefined) column.drink_free_days_goal = patch.drinkFreeDaysGoal;
    if (patch.drinkFreeOn !== undefined) column.drink_free_on = patch.drinkFreeOn;
    if (patch.heightCm !== undefined) column.height_cm = patch.heightCm;
    if (patch.visionStatement !== undefined) column.vision_statement = patch.visionStatement || null;
    if (patch.visionStartedOn !== undefined) column.vision_started_on = patch.visionStartedOn;
    if (patch.pinnedQuoteId !== undefined) {
      if (patch.pinnedQuoteId && !quoteById(patch.pinnedQuoteId)) throw new UserFacingError('That quote is not in the library.', 'generic');
      column.pinned_quote_id = patch.pinnedQuoteId;
    }
    if (patch.bio !== undefined) {
      const planned = planProfileText(patch.bio, BIO_LIMIT);
      if (!planned.ok) throw new UserFacingError(planned.message, 'generic');
      column.bio = planned.text || null;
    }
    if (Object.keys(column).length) {
      const { error } = await this.client.from('profiles').update(column).eq('id', userId);
      if (error) throw asUserFacing(error, 'general');
    }
    if (patch.interestIds) await this.replaceInterests(userId, patch.interestIds);
    await this.refresh();
  }

  async setReasons(bodies: string[]): Promise<void> {
    await this.writeReasons(bodies);
    await this.refresh();
  }

  /** One transaction. The function deletes this user's rows, then inserts the cleaned list. */
  private async writeReasons(bodies: string[]): Promise<void> {
    const { error } = await this.client.rpc('set_reasons', { bodies: planReasons(bodies) });
    if (error) throw asUserFacing(error, 'general');
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
    if (error) throw asUserFacing(error, 'general');
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
    if (error) throw asUserFacing(error, 'general');
    const update = await this.client.from('profiles').update({ sobriety_started_at: plan.nextStartedAt.toISOString() }).eq('id', userId);
    if (update.error) throw asUserFacing(update.error, 'general');
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
    if (error) throw asUserFacing(error, 'general');
    await this.refresh();
  }

  async setInterestSelected(interestId: string, selected: boolean): Promise<void> {
    const profile = this.snapshot.profile;
    if (!profile) throw new Error('Sign in first.');
    const previous = profile.interestIds;
    const optimistic = nextInterestIds(previous, interestId, selected);
    if (interestSelectionUnchanged(previous, optimistic)) return;
    this.pendingInterests.set(interestId, selected);
    this.emit(snapshotWithOwnInterests(this.snapshot, optimistic));
    await this.enqueueInterest(interestId, async () => {
      try {
        await this.writeInterestLink(profile.id, interestId, selected);
      } catch (error) {
        if (this.pendingInterests.get(interestId) === selected) this.pendingInterests.delete(interestId);
        const current = this.snapshot.profile?.interestIds ?? [];
        const restored = rolledBackInterestIds(current, optimistic, previous);
        if (!interestSelectionUnchanged(current, restored)) this.emit(snapshotWithOwnInterests(this.snapshot, restored));
        throw asUserFacing(error, 'general');
      }
    });
  }

  /** One link row. A repeat insert is the same choice, not an error. */
  private async writeInterestLink(userId: string, interestId: string, selected: boolean): Promise<void> {
    if (selected) {
      const { error } = await this.client.from('profile_interests').insert({ user_id: userId, interest_id: interestId });
      if (error && !/duplicate|23505/i.test(`${error.code ?? ''} ${error.message}`)) throw error;
      return;
    }
    const { error } = await this.client.from('profile_interests').delete().eq('user_id', userId).eq('interest_id', interestId);
    if (error) throw error;
  }

  async addCustomInterest(label: string): Promise<void> {
    const plan = planCustomInterest(label);
    if (!plan.ok) throw new Error(plan.message);
    const pending = this.interestWrites.get(plan.slug);
    if (pending) return pending;
    const run = this.writeInterest(plan.label, plan.slug);
    this.interestWrites.set(plan.slug, run);
    try {
      await run;
    } finally {
      if (this.interestWrites.get(plan.slug) === run) this.interestWrites.delete(plan.slug);
    }
  }

  /**
   * One round trip. A matching slug is reused, including a repeat tap.
   * The catalogue updates in memory so onboarding does not reload the whole account.
   */
  private async writeInterest(label: string, slug: string): Promise<void> {
    const existing = this.snapshot.interests.find((item) => item.slug === slug);
    if (existing) {
      if (!this.snapshot.profile?.interestIds.includes(existing.id)) await this.setInterestSelected(existing.id, true);
      return;
    }
    const { data, error } = await this.client.rpc('add_interest', { label });
    if (error) throw asUserFacing(error, 'general');
    const row = (Array.isArray(data) ? data[0] : data) as Row | null;
    if (!row?.id) throw new Error('Could not add that.');
    const interest = mapInterest(row);
    const known = this.snapshot.interests.find((item) => item.id === interest.id || item.slug === interest.slug);
    const interests = known
      ? this.snapshot.interests
      : [...this.snapshot.interests, interest].sort((a, b) => a.label.localeCompare(b.label));
    const id = known?.id ?? interest.id;
    this.pendingInterests.set(id, true);
    const ids = nextInterestIds(this.snapshot.profile?.interestIds ?? [], id, true);
    this.emit(snapshotWithOwnInterests({ ...this.snapshot, interests }, ids));
  }

  async openPrivateChat(userId: string): Promise<{ status: 'open'; connectionId: string } | { status: 'requested'; connectionId: string | null }> {
    const me = await this.userId();
    const profile = this.snapshot.profile;
    if (!profile?.ageConfirmed18 || !profile.communityVisible) {
      throw new UserFacingError('Turn on community, and confirm you are 18 or over, before you message.', 'generic');
    }
    if (userId === me) throw new UserFacingError('You cannot message yourself.', 'generic');
    const blocks = await this.client.from('blocks').select('blocker_id, blocked_id').or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`);
    if (blocks.error) throw asUserFacing(blocks.error, 'general');
    const closed = (blocks.data ?? []).some((row) => {
      const record = row as { blocker_id?: string; blocked_id?: string };
      return (record.blocker_id === me && record.blocked_id === userId) || (record.blocker_id === userId && record.blocked_id === me);
    });
    if (closed) throw new UserFacingError('You cannot contact this person.', 'generic');
    const existing = this.snapshot.connections.find((connection) =>
      connection.status !== 'declined' &&
      ((connection.requesterId === me && connection.addresseeId === userId) ||
        (connection.requesterId === userId && connection.addresseeId === me)));
    if (existing?.status === 'accepted') return { status: 'open', connectionId: existing.id };
    if (existing) return { status: 'requested', connectionId: existing.id };
    await this.requestConnection(userId);
    const created = this.getSnapshot().connections.find((connection) =>
      connection.status !== 'declined' &&
      ((connection.requesterId === me && connection.addresseeId === userId) ||
        (connection.requesterId === userId && connection.addresseeId === me)));
    return { status: 'requested', connectionId: created?.id ?? null };
  }

  async requestConnection(userId: string): Promise<void> {
    const me = await this.userId();
    const { error } = await this.client.from('connections').insert({ requester_id: me, addressee_id: userId, status: 'pending' });
    if (error) throw asUserFacing(error, 'general');
    await this.refresh();
  }

  async respondConnection(connectionId: string, accept: boolean): Promise<void> {
    const { error } = await this.client.from('connections').update({ status: accept ? 'accepted' : 'declined' }).eq('id', connectionId);
    if (error) throw asUserFacing(error, 'general');
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
    if (error) throw asUserFacing(error, 'general');
    await this.refresh();
  }

  async blockUser(userId: string): Promise<void> {
    const me = await this.userId();
    const { error } = await this.client.from('blocks').insert({ blocker_id: me, blocked_id: userId });
    if (error && !/duplicate|23505/i.test(`${error.code ?? ''} ${error.message}`)) throw asUserFacing(error, 'general');
    await this.refresh();
  }

  async unblockUser(userId: string): Promise<void> {
    const me = await this.userId();
    const { error } = await this.client.from('blocks').delete().eq('blocker_id', me).eq('blocked_id', userId);
    if (error) throw asUserFacing(error, 'general');
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
    if (error) throw asUserFacing(error, 'general');
    await this.refresh();
  }

  async reviewReport(id: string): Promise<void> {
    const { error } = await this.client.from('reports').update({ status: 'reviewed' }).eq('id', id);
    if (error) throw asUserFacing(error, 'general');
    await this.refresh();
  }

  async ensureThumosGuide(_kind: 'opening' | 'craving'): Promise<void> {
    if (this.snapshot.thumos.length > 0) return;
    await this.insertGuide(OPENING_LINE, 'opening');
  }

  private async insertGuide(content: string, mode: string) {
    const userId = await this.userId();
    const { error } = await this.client.from('thumos_messages').insert({ user_id: userId, role: 'guide', content, mode });
    if (error) throw asUserFacing(error, 'thumos');
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

  async mintVoiceToken(mode?: ThumosMode): Promise<VoiceMint> {
    const { data, error } = await this.client.functions.invoke('thumos-voice-token', { body: { mode } });
    if (error || !data?.ok || typeof data?.token !== 'string') {
      const message = typeof data?.message === 'string' ? data.message : '';
      return {
        ok: false,
        code: typeof data?.code === 'string' ? data.code : 'missing_key',
        message: message && message.length < 180 ? message : 'Voice is unavailable just now. Text chat is still here.',
      };
    }
    const history = Array.isArray(data.history)
      ? data.history.flatMap((turn: { role?: string; content?: string }) => (
          (turn?.role === 'user' || turn?.role === 'assistant') && typeof turn.content === 'string'
            ? [{ role: turn.role, content: turn.content }]
            : []
        ))
      : [];
    return {
      ok: true,
      token: data.token,
      expiresAt: Number(data.expiresAt ?? 0),
      instructions: typeof data.instructions === 'string' ? data.instructions : null,
      crisisInstructions: typeof data.crisisInstructions === 'string' ? data.crisisInstructions : null,
      history,
      greeting: typeof data.greeting === 'string' ? data.greeting : null,
      mode: data.mode === 'support' || data.mode === 'growth' || data.mode === 'opening' || data.mode === 'steady' ? data.mode : null,
    };
  }

  async saveVoiceTurn(input: VoiceTurnInput): Promise<void> {
    const invoked = await this.client.functions.invoke('thumos-voice-turn', { body: input });
    if (!invoked.error && invoked.data?.ok) {
      await this.refresh();
      return;
    }
    const userId = await this.userId();
    const { error } = await this.client.from('thumos_messages').insert([
      { user_id: userId, role: 'user', content: input.user, mode: input.mode },
      { user_id: userId, role: 'assistant', content: input.assistant, mode: input.mode },
    ]);
    if (error) throw asUserFacing(error, 'thumos');
    await this.refresh();
  }

  async addProgressPhoto(input: NewProgressPhoto): Promise<void> {
    if (input.bytes.byteLength > PROGRESS_MAX_BYTES) throw new UserFacingError('That photo is still too large.', 'generic');
    const profile = this.snapshot.profile;
    if (!profile) throw new UserFacingError('Sign in first.', 'generic');
    const plan = planProgressPhoto({
      takenOn: input.takenOn,
      startingPoint: input.startingPoint,
      note: input.note,
      anchor: progressAnchor(profile.sobrietyStartedAt, profile.createdAt),
    });
    if (!plan.ok) throw new UserFacingError(plan.message, 'generic');
    const userId = await this.userId();
    const photoId = randomId();
    const path = progressStoragePath(userId, photoId);
    const body = new Uint8Array(input.bytes.byteLength);
    body.set(input.bytes);
    const uploaded = await this.client.storage.from(PROGRESS_BUCKET).upload(path, body, {
      contentType: 'image/jpeg',
      upsert: false,
    });
    if (uploaded.error) throw asUserFacing(uploaded.error, 'general');
    const inserted = await this.client.from('progress_photos').insert({
      id: photoId,
      user_id: userId,
      taken_on: plan.takenOn,
      month_index: plan.monthIndex,
      note: plan.note,
      storage_path: path,
    });
    if (inserted.error) {
      await this.client.storage.from(PROGRESS_BUCKET).remove([path]);
      throw asUserFacing(inserted.error, 'general');
    }
    await this.refresh();
  }

  async updateProgressPhoto(id: string, input: { takenOn?: string; startingPoint?: boolean; note?: string; caption?: string }): Promise<void> {
    const profile = this.snapshot.profile;
    const photo = this.snapshot.progressPhotos.find((item) => item.id === id && item.userId === profile?.id);
    if (!profile || !photo) throw new UserFacingError('Could not update that photo.', 'generic');
    const patch: { note?: string; taken_on?: string; month_index?: number; caption?: string } = {};
    if (input.caption !== undefined) {
      const planned = planProfileText(input.caption, PHOTO_CAPTION_LIMIT);
      if (!planned.ok) throw new UserFacingError(planned.message, 'generic');
      patch.caption = planned.text;
    }
    if (input.note !== undefined || input.takenOn !== undefined || input.startingPoint !== undefined) {
      const takenOn = input.takenOn ?? photo.takenOn;
      const note = input.note ?? photo.note;
      const startingPoint = input.startingPoint ?? false;
      const plan = planProgressPhoto({
        takenOn,
        startingPoint: input.startingPoint === undefined ? photo.monthIndex === 0 : startingPoint,
        note,
        anchor: progressAnchor(profile.sobrietyStartedAt, profile.createdAt),
      });
      if (!plan.ok) throw new UserFacingError(plan.message, 'generic');
      if (input.note !== undefined) patch.note = plan.note;
      if (input.takenOn !== undefined || input.startingPoint !== undefined) {
        patch.taken_on = plan.takenOn;
        patch.month_index = plan.monthIndex;
      }
    }
    if (!Object.keys(patch).length) return;
    const userId = await this.userId();
    const { error } = await this.client.from('progress_photos').update(patch).eq('id', id).eq('user_id', userId);
    if (error) throw asUserFacing(error, 'general');
    await this.refresh();
  }

  async setProgressPhotoVisibility(ids: string[], visibility: ProgressVisibility): Promise<void> {
    const next = progressVisibility(visibility);
    if (!ids.length || (visibility !== 'private' && visibility !== 'community')) {
      throw new UserFacingError('Could not update that photo.', 'generic');
    }
    const userId = await this.userId();
    const { error } = await this.client.from('progress_photos').update({ visibility: next }).in('id', ids).eq('user_id', userId);
    if (error) throw asUserFacing(error, 'general');
    await this.refresh();
  }

  async saveQuote(quoteId: string): Promise<void> {
    if (!quoteById(quoteId)) throw new UserFacingError('That quote is not in the library.', 'generic');
    const userId = await this.userId();
    const { error } = await this.client.from('user_quotes').upsert(
      { user_id: userId, quote_id: quoteId },
      { onConflict: 'user_id,quote_id' },
    );
    if (error) throw asUserFacing(error, 'general');
    await this.refresh();
  }

  async unsaveQuote(quoteId: string): Promise<void> {
    const userId = await this.userId();
    const { error } = await this.client.from('user_quotes').delete().eq('user_id', userId).eq('quote_id', quoteId);
    if (error) throw asUserFacing(error, 'general');
    await this.refresh();
  }

  async pinQuote(quoteId: string | null): Promise<void> {
    await this.updateProfile({ pinnedQuoteId: quoteId });
  }

  async setProfileSharing(sharing: ProfileSharing): Promise<void> {
    const next = normalizeProfileSharing(sharing);
    if (sensitiveTurnedOn(this.snapshot.sharing, next) && !next.sensitiveConsentAt) {
      throw new UserFacingError('Confirm that other people may see this first.', 'generic');
    }
    const userId = await this.userId();
    const { error } = await this.client.from('profile_sharing').upsert(
      { user_id: userId, settings: next, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
    if (error) throw asUserFacing(error, 'general');
    this.emit({ ...this.snapshot, sharing: next });
  }

  async publicProfile(userId: string): Promise<ReturnType<typeof parsePublicProfile>> {
    const { data, error } = await this.client.rpc('public_profile', { user_id: userId });
    if (error) return null;
    return parsePublicProfile(data);
  }

  async addProfilePhoto(input: NewProfilePhoto): Promise<void> {
    if (input.bytes.byteLength > PROGRESS_MAX_BYTES) throw new UserFacingError('That photo is still too large.', 'generic');
    if (input.role !== 'avatar' && input.role !== 'gallery') throw new UserFacingError('Could not store that photo.', 'generic');
    const gallery = this.snapshot.profilePhotos.filter((photo) => photo.role === 'gallery');
    if (input.role === 'gallery' && gallery.length >= PROFILE_GALLERY_LIMIT) {
      throw new UserFacingError(PROFILE_GALLERY_LIMIT_MESSAGE, 'generic');
    }
    const userId = await this.userId();
    const photoId = randomId();
    const path = profileStoragePath(userId, photoId);
    const position = input.role === 'avatar' ? 0 : gallery.reduce((max, photo) => Math.max(max, photo.position), -1) + 1;
    const body = new Uint8Array(input.bytes.byteLength);
    body.set(input.bytes);
    const uploaded = await this.client.storage.from(PROFILE_PHOTO_BUCKET).upload(path, body, {
      contentType: 'image/jpeg',
      upsert: false,
    });
    if (uploaded.error) throw asUserFacing(uploaded.error, 'general');
    const existing = input.role === 'avatar' ? this.snapshot.profilePhotos.find((photo) => photo.role === 'avatar') : undefined;
    if (existing) {
      const removed = await this.client.from('profile_photos').delete().eq('id', existing.id).eq('user_id', userId);
      if (removed.error) {
        await this.client.storage.from(PROFILE_PHOTO_BUCKET).remove([path]);
        throw asUserFacing(removed.error, 'general');
      }
    }
    const inserted = await this.client.from('profile_photos').insert({
      id: photoId,
      user_id: userId,
      role: input.role,
      caption: '',
      position,
      storage_path: path,
    });
    if (inserted.error) {
      await this.client.storage.from(PROFILE_PHOTO_BUCKET).remove([path]);
      if (existing) {
        await this.client.from('profile_photos').insert({
          id: existing.id,
          user_id: userId,
          role: 'avatar',
          caption: existing.caption,
          position: existing.position,
          storage_path: existing.storagePath,
        });
      }
      throw asUserFacing(inserted.error, 'general');
    }
    if (existing && existing.storagePath.startsWith(`${userId}/`) && !existing.storagePath.includes('..')) {
      await this.client.storage.from(PROFILE_PHOTO_BUCKET).remove([existing.storagePath]);
    }
    await this.refresh();
  }

  async updateProfilePhoto(id: string, input: { caption: string }): Promise<void> {
    const plan = planProfileText(input.caption, PHOTO_CAPTION_LIMIT);
    if (!plan.ok) throw new UserFacingError(plan.message, 'generic');
    const userId = await this.userId();
    const { error } = await this.client.from('profile_photos').update({ caption: plan.text }).eq('id', id).eq('user_id', userId);
    if (error) throw asUserFacing(error, 'general');
    await this.refresh();
  }

  async moveProfilePhoto(id: string, direction: 'up' | 'down'): Promise<void> {
    const gallery = this.snapshot.profilePhotos.filter((photo) => photo.role === 'gallery');
    const next = nextGalleryPositions(gallery, id, direction);
    if (!next) return;
    const userId = await this.userId();
    for (const row of next) {
      const current = gallery.find((photo) => photo.id === row.id);
      if (!current || current.position === row.position) continue;
      const { error } = await this.client.from('profile_photos').update({ position: row.position }).eq('id', row.id).eq('user_id', userId);
      if (error) throw asUserFacing(error, 'general');
    }
    await this.refresh();
  }

  async deleteProfilePhoto(id: string): Promise<void> {
    const userId = await this.userId();
    const known = this.snapshot.profilePhotos.find((photo) => photo.id === id);
    const path = known?.storagePath ?? profileStoragePath(userId, id);
    const removed = await this.client.storage.from(PROFILE_PHOTO_BUCKET).remove([path]);
    if (removed.error && !/not found/i.test(removed.error.message)) throw asUserFacing(removed.error, 'general');
    const { error } = await this.client.from('profile_photos').delete().eq('id', id).eq('user_id', userId);
    if (error) throw asUserFacing(error, 'general');
    await this.refresh();
  }

  async profilePhotoUrls(ids: string[]): Promise<{ id: string; url: string }[]> {
    const urls = await this.profilePhotoUrlMap(ids);
    return [...urls.entries()].map(([id, url]) => ({ id, url }));
  }

  async deleteProgressPhoto(id: string): Promise<void> {
    const userId = await this.userId();
    const known = this.snapshot.progressPhotos.find((photo) => photo.id === id);
    const path = known?.storagePath ?? progressStoragePath(userId, id);
    const removed = await this.client.storage.from(PROGRESS_BUCKET).remove([path]);
    if (removed.error && !/not found/i.test(removed.error.message)) throw asUserFacing(removed.error, 'general');
    const { error } = await this.client.from('progress_photos').delete().eq('id', id).eq('user_id', userId);
    if (error) throw asUserFacing(error, 'general');
    await this.refresh();
  }

  async addGratitudeEntry(input: NewGratitudeEntry): Promise<void> {
    const plan = planGratitudeEntry(input.body, input.entryDate, isoDay(new Date()));
    if (!plan.ok) throw new UserFacingError(plan.message, 'generic');
    const userId = await this.userId();
    const { error } = await this.client.from('gratitude_entries').insert({
      user_id: userId,
      body: plan.body,
      category: gratitudeCategory(input.category),
      is_favourite: input.isFavourite,
      entry_date: plan.entryDate,
    });
    if (error) throw asUserFacing(error, 'general');
    await this.refresh();
  }

  async updateGratitudeEntry(id: string, input: NewGratitudeEntry): Promise<void> {
    const plan = planGratitudeEntry(input.body, input.entryDate, isoDay(new Date()));
    if (!plan.ok) throw new UserFacingError(plan.message, 'generic');
    const userId = await this.userId();
    const { error } = await this.client.from('gratitude_entries').update({
      body: plan.body,
      category: gratitudeCategory(input.category),
      is_favourite: input.isFavourite,
      entry_date: plan.entryDate,
    }).eq('id', id).eq('user_id', userId);
    if (error) throw asUserFacing(error, 'general');
    await this.refresh();
  }

  async deleteGratitudeEntry(id: string): Promise<void> {
    const userId = await this.userId();
    const entry = this.snapshot.gratitude.find((item) => item.id === id);
    const paths = (entry?.photos ?? [])
      .map((photo) => photo.storagePath)
      .filter((path) => path.startsWith(`${userId}/`) && !path.includes('..'));
    if (paths.length) {
      const removed = await this.client.storage.from(GRATITUDE_BUCKET).remove(paths);
      if (removed.error && !/not found/i.test(removed.error.message)) throw asUserFacing(removed.error, 'general');
    }
    const { error } = await this.client.from('gratitude_entries').delete().eq('id', id).eq('user_id', userId);
    if (error) throw asUserFacing(error, 'general');
    await this.refresh();
  }

  async addGratitudePhoto(entryId: string, bytes: Uint8Array): Promise<void> {
    if (bytes.byteLength > GRATITUDE_MAX_BYTES) throw new UserFacingError('That photo is still too large.', 'generic');
    const entry = this.snapshot.gratitude.find((item) => item.id === entryId);
    if (!entry) throw new UserFacingError('Could not add that photo.', 'generic');
    const limit = gratitudePhotoLimitMessage(entry.photos.length);
    if (limit) throw new UserFacingError(limit, 'generic');
    const userId = await this.userId();
    const photoId = randomId();
    const path = gratitudeStoragePath(userId, photoId);
    const body = new Uint8Array(bytes.byteLength);
    body.set(bytes);
    const uploaded = await this.client.storage.from(GRATITUDE_BUCKET).upload(path, body, {
      contentType: 'image/jpeg',
      upsert: false,
    });
    if (uploaded.error) throw asUserFacing(uploaded.error, 'general');
    const inserted = await this.client.from('gratitude_photos').insert({
      id: photoId,
      entry_id: entryId,
      user_id: userId,
      storage_path: path,
    });
    if (inserted.error) {
      await this.client.storage.from(GRATITUDE_BUCKET).remove([path]);
      throw asUserFacing(inserted.error, 'general');
    }
    await this.refresh();
  }

  async updateGratitudePhoto(id: string, input: { caption: string }): Promise<void> {
    const planned = planProfileText(input.caption, PHOTO_CAPTION_LIMIT);
    if (!planned.ok) throw new UserFacingError(planned.message, 'generic');
    const known = this.snapshot.gratitude.flatMap((entry) => entry.photos).find((photo) => photo.id === id);
    if (!known) throw new UserFacingError('Could not update that photo.', 'generic');
    const userId = await this.userId();
    const { error } = await this.client.from('gratitude_photos').update({ caption: planned.text }).eq('id', id).eq('user_id', userId);
    if (error) throw asUserFacing(error, 'general');
    await this.refresh();
  }

  async deleteGratitudePhoto(id: string): Promise<void> {
    const userId = await this.userId();
    const known = this.snapshot.gratitude.flatMap((entry) => entry.photos).find((photo) => photo.id === id);
    const path = known?.storagePath && known.storagePath.startsWith(`${userId}/`) && !known.storagePath.includes('..')
      ? known.storagePath
      : gratitudeStoragePath(userId, id);
    const removed = await this.client.storage.from(GRATITUDE_BUCKET).remove([path]);
    if (removed.error && !/not found/i.test(removed.error.message)) throw asUserFacing(removed.error, 'general');
    const { error } = await this.client.from('gratitude_photos').delete().eq('id', id).eq('user_id', userId);
    if (error) throw asUserFacing(error, 'general');
    await this.refresh();
  }

  async saveVisionStatement(statement: string): Promise<void> {
    const plan = planVisionText(statement, VISION_STATEMENT_LIMIT);
    if (!plan.ok) throw new UserFacingError(plan.message, 'generic');
    const userId = await this.userId();
    const column: Record<string, unknown> = { vision_statement: plan.text || null };
    if (plan.text && !this.snapshot.profile?.visionStartedOn) column.vision_started_on = isoDay(new Date());
    const { error } = await this.client.from('profiles').update(column).eq('id', userId);
    if (error) throw asUserFacing(error, 'general');
    await this.refresh();
  }

  async addVisionItem(bytes: Uint8Array): Promise<void> {
    if (bytes.byteLength > VISION_MAX_BYTES) throw new UserFacingError('That photo is still too large.', 'generic');
    const limit = visionPhotoLimitMessage(this.snapshot.visionItems.length);
    if (limit) throw new UserFacingError(limit, 'generic');
    const userId = await this.userId();
    const photoId = randomId();
    const path = visionStoragePath(userId, photoId);
    const body = new Uint8Array(bytes.byteLength);
    body.set(bytes);
    const uploaded = await this.client.storage.from(VISION_BUCKET).upload(path, body, {
      contentType: 'image/jpeg',
      upsert: false,
    });
    if (uploaded.error) throw asUserFacing(uploaded.error, 'general');
    const position = this.snapshot.visionItems.reduce((max, item) => Math.max(max, item.position), -1) + 1;
    const inserted = await this.client.from('vision_board_items').insert({
      id: photoId,
      user_id: userId,
      storage_path: path,
      caption: '',
      area: null,
      size: 'medium',
      position,
    });
    if (inserted.error) {
      await this.client.storage.from(VISION_BUCKET).remove([path]);
      throw asUserFacing(inserted.error, 'general');
    }
    if (!this.snapshot.profile?.visionStartedOn) {
      const started = await this.client.from('profiles').update({ vision_started_on: isoDay(new Date()) }).eq('id', userId);
      if (started.error) console.error(started.error.message);
    }
    await this.refresh();
  }

  async updateVisionItem(id: string, patch: { caption?: string; area?: VisionArea | null; size?: VisionSize }): Promise<void> {
    const column: Record<string, unknown> = {};
    if (patch.caption !== undefined) {
      const plan = planVisionText(patch.caption, VISION_CAPTION_LIMIT);
      if (!plan.ok) throw new UserFacingError(plan.message, 'generic');
      column.caption = plan.text;
    }
    if (patch.area !== undefined) column.area = patch.area && isVisionArea(patch.area) ? patch.area : null;
    if (patch.size !== undefined) {
      if (!isVisionSize(patch.size)) throw new UserFacingError('Could not change that size.', 'generic');
      column.size = patch.size;
    }
    if (!Object.keys(column).length) return;
    const userId = await this.userId();
    const { error } = await this.client.from('vision_board_items').update(column).eq('id', id).eq('user_id', userId);
    if (error) throw asUserFacing(error, 'general');
    await this.refresh();
  }

  async moveVisionItem(id: string, direction: 'up' | 'down'): Promise<void> {
    const ordered = sortVisionItems(this.snapshot.visionItems);
    const next = reorderVisionItems(ordered, id, direction);
    if (next.every((item, index) => item.id === ordered[index]?.id)) return;
    const userId = await this.userId();
    for (let index = 0; index < next.length; index += 1) {
      const item = next[index];
      if (!item || item.position === index) continue;
      const { error } = await this.client.from('vision_board_items').update({ position: index }).eq('id', item.id).eq('user_id', userId);
      if (error) throw asUserFacing(error, 'general');
    }
    await this.refresh();
  }

  async deleteVisionItem(id: string): Promise<void> {
    const userId = await this.userId();
    const known = this.snapshot.visionItems.find((item) => item.id === id);
    const path = known?.storagePath && known.storagePath.startsWith(`${userId}/`) && !known.storagePath.includes('..')
      ? known.storagePath
      : visionStoragePath(userId, id);
    const removed = await this.client.storage.from(VISION_BUCKET).remove([path]);
    if (removed.error && !/not found/i.test(removed.error.message)) throw asUserFacing(removed.error, 'general');
    const { error } = await this.client.from('vision_board_items').delete().eq('id', id).eq('user_id', userId);
    if (error) throw asUserFacing(error, 'general');
    await this.refresh();
  }

  async reflectOnGratitude(body: string, category: string | null): Promise<GratitudeReflect> {
    if (!this.snapshot.profile?.consentAi) {
      throw new Error('Agree to the coach consent before sending a message to Thumos.');
    }
    try {
      const invoked = await this.client.functions.invoke('gratitude-reflect', { body: { body, category } });
      const data = invoked.data as { ok?: boolean; code?: string; comment?: unknown; suggestions?: unknown } | null;
      if (data?.code === 'consent') {
        throw new Error('Agree to the coach consent before sending a message to Thumos.');
      }
      if (!invoked.error && data?.ok === true && typeof data.comment === 'string' && Array.isArray(data.suggestions)) {
        const suggestions = data.suggestions.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
        if (suggestions.length >= 2) return { comment: data.comment, suggestions: suggestions.slice(0, 3) };
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('Agree to the coach consent')) throw error;
    }
    return localGratitudeReflect(body, category);
  }

  async exportData(): Promise<Record<string, unknown>> {
    const invoked = await this.client.functions.invoke('account-export', { body: {} });
    if (!invoked.error && invoked.data?.data) return invoked.data.data as Record<string, unknown>;
    const { data, error } = await this.client.rpc('export_my_data');
    if (error) throw asUserFacing(error, 'general');
    return this.attachProgressLinks(data as Record<string, unknown>, 3600);
  }

  async deleteAccount(): Promise<void> {
    const removed = await this.removeOwnProgressPhotos();
    const removedDiary = await this.removeOwnGratitudePhotos();
    const removedVision = await this.removeOwnVisionPhotos();
    const removedProfile = await this.removeOwnProfilePhotos();
    const invoked = await this.client.functions.invoke('account-delete', { body: {} });
    if (invoked.error || invoked.data?.ok === false) {
      if (!removed || !removedDiary || !removedVision || !removedProfile) throw new UserFacingError('Could not remove the private photos, so the account was left in place.', 'generic');
      const { error } = await this.client.rpc('delete_my_account');
      if (error) throw asUserFacing(error, 'general');
    }
    await this.client.auth.signOut();
    await this.refresh();
  }

  private async attachProgressLinks(record: Record<string, unknown>, seconds: number): Promise<Record<string, unknown>> {
    const withProgress = await this.attachBucketLinks(record, 'progress_photos', PROGRESS_BUCKET, seconds);
    const withGratitude = Array.isArray(withProgress.gratitude_photos)
      ? await this.attachBucketLinks(withProgress, 'gratitude_photos', GRATITUDE_BUCKET, seconds)
      : withProgress;
    const withVision = Array.isArray(withGratitude.vision_board_items)
      ? await this.attachBucketLinks(withGratitude, 'vision_board_items', VISION_BUCKET, seconds)
      : withGratitude;
    if (!Array.isArray(withVision.profile_photos)) return withVision;
    return this.attachBucketLinks(withVision, 'profile_photos', PROFILE_PHOTO_BUCKET, seconds);
  }

  private async attachBucketLinks(
    record: Record<string, unknown>,
    key: 'progress_photos' | 'gratitude_photos' | 'vision_board_items' | 'profile_photos',
    bucket: string,
    seconds: number,
  ): Promise<Record<string, unknown>> {
    const photos = Array.isArray(record[key]) ? (record[key] as Record<string, unknown>[]) : [];
    if (!photos.length) return { ...record, [key]: photos };
    const paths = photos
      .map((photo) => (typeof photo.storage_path === 'string' ? photo.storage_path : ''))
      .filter((path) => path && !path.includes('..'));
    const signedByPath = new Map<string, string>();
    if (paths.length) {
      const signed = await this.client.storage.from(bucket).createSignedUrls(paths, seconds);
      if (signed.error) console.error(signed.error.message);
      for (const item of signed.data ?? []) {
        if (item.path && item.signedUrl) signedByPath.set(item.path, item.signedUrl);
      }
    }
    return {
      ...record,
      [key]: photos.map((photo) => ({
        ...photo,
        signed_url: typeof photo.storage_path === 'string' ? (signedByPath.get(photo.storage_path) ?? null) : null,
      })),
    };
  }

  /** Clears the signed-in folder before the SQL fallback, which cannot see Storage. */
  private async removeOwnProgressPhotos(): Promise<boolean> {
    const userId = this.snapshot.session?.userId;
    if (!userId) return true;
    return this.removeOwnerFolder(PROGRESS_BUCKET, userId, this.snapshot.progressPhotos.map((photo) => photo.storagePath));
  }

  private async removeOwnGratitudePhotos(): Promise<boolean> {
    const userId = this.snapshot.session?.userId;
    if (!userId) return true;
    const known = this.snapshot.gratitude.flatMap((entry) => entry.photos.map((photo) => photo.storagePath));
    return this.removeOwnerFolder(GRATITUDE_BUCKET, userId, known);
  }

  private async removeOwnProfilePhotos(): Promise<boolean> {
    const userId = this.snapshot.session?.userId;
    if (!userId) return true;
    return this.removeOwnerFolder(PROFILE_PHOTO_BUCKET, userId, this.snapshot.profilePhotos.map((photo) => photo.storagePath));
  }

  private async removeOwnVisionPhotos(): Promise<boolean> {
    const userId = this.snapshot.session?.userId;
    if (!userId) return true;
    return this.removeOwnerFolder(VISION_BUCKET, userId, this.snapshot.visionItems.map((item) => item.storagePath));
  }

  private async removeOwnerFolder(bucket: string, userId: string, known: string[]): Promise<boolean> {
    const paths = new Set(known.filter(Boolean));
    try {
      for (let offset = 0; offset < 10000; offset += 100) {
        const listed = await this.client.storage.from(bucket).list(userId, { limit: 100, offset });
        if (listed.error) {
          if (/bucket not found/i.test(listed.error.message)) return true;
          break;
        }
        const page = listed.data ?? [];
        for (const item of page) {
          if (!item.name || item.name.includes('/') || item.name.includes('..') || !item.name.toLowerCase().endsWith('.jpg')) continue;
          paths.add(`${userId}/${item.name}`);
        }
        if (page.length < 100) break;
      }
    } catch (error) {
      console.error(error);
    }
    if (!paths.size) return true;
    const { error } = await this.client.storage.from(bucket).remove([...paths]);
    if (!error || /not found|bucket/i.test(error.message)) return true;
    return false;
  }

  private async replaceInterests(userId: string, interestIds: string[]) {
    const removed = await this.client.from('profile_interests').delete().eq('user_id', userId);
    if (removed.error) throw asUserFacing(removed.error, 'general');
    if (!interestIds.length) return;
    const { error } = await this.client.from('profile_interests').insert(interestIds.map((interest_id) => ({ user_id: userId, interest_id })));
    if (error) throw asUserFacing(error, 'general');
  }

  async saveConsents(input: ConsentInput): Promise<void> {
    const userId = await this.userId();
    const { error } = await this.client.from('profiles').update({
      community_visible: input.communityVisible,
      consent_health: input.consentHealth,
      consent_ai: input.consentAi,
    }).eq('id', userId);
    if (error) throw asUserFacing(error, 'general');
    await this.insertConsents(userId, input);
    await this.refresh();
  }

  private async insertConsents(userId: string, input: ConsentInput) {
    const next = missingConsentRows(this.snapshot.consents, consentRows(CONSENT_VERSION, input));
    if (!next.length) return;
    const { error } = await this.client.from('consents').insert(next.map((row) => ({
      user_id: userId,
      kind: row.kind,
      granted: row.granted,
      version: row.version,
    })));
    if (error && !/duplicate|23505/i.test(`${error.code ?? ''} ${error.message}`)) throw asUserFacing(error, 'general');
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
    stage: stageFromRecord(row.stage, (row.sobriety_started_at as string | null) ?? null),
    plannedQuitAt: (row.planned_quit_at as string | null) ?? null,
    weeklyUnitsGoal: row.weekly_units_goal == null ? null : Number(row.weekly_units_goal),
    drinkFreeDaysGoal: row.drink_free_days_goal == null ? null : Number(row.drink_free_days_goal),
    drinkFreeOn: Array.isArray(row.drink_free_on) ? row.drink_free_on.map(String) : [],
    heightCm: row.height_cm == null ? null : Number(row.height_cm),
    visionStatement: typeof row.vision_statement === 'string' ? row.vision_statement : '',
    pinnedQuoteId: typeof row.pinned_quote_id === 'string' && quoteById(row.pinned_quote_id) ? row.pinned_quote_id : null,
    bio: typeof row.bio === 'string' ? row.bio : '',
    visionStartedOn: typeof row.vision_started_on === 'string'
      ? (/^(\d{4}-\d{2}-\d{2})/.exec(row.vision_started_on)?.[1] ?? null)
      : null,
    createdAt: row.created_at ? String(row.created_at) : '1970-01-01T00:00:00.000Z',
  };
}

function mapConsent(row: Row): StoredConsent {
  return {
    kind: row.kind as StoredConsent['kind'],
    granted: Boolean(row.granted),
    version: String(row.version),
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
