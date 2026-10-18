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
  type VisionItem,
  type VisionSize,
  sortVisionItems,
  visionItemsFromRows,
  visionPhotoLimitMessage,
  visionStoragePath,
} from '@/domain/visionBoard';
import { isoDay } from '@/domain/dates';
import {
  foodPhotoStoragePath,
  OWNER_PHOTO_URL_SECONDS,
  ownerPhotoResignCooling,
  ownerPhotoUrlsStale,
  withSignedFoodPhotos,
  withSignedGratitudePhotos,
  withSignedPreviewUrls,
} from '@/domain/ownerPhotos';
import {
  defaultNutritionSettings,
  estimateFromText,
  foodItemFromUnknown,
  isBodyBuild,
  isBuilderPhase,
  parsePortion,
  isBodyCompositionSource,
  isMealSlot,
  isNutritionGoal,
  isNutritionSex,
  parseBodyFatPct,
  parseLeanMassKg,
  parseMealEstimate,
  parseSharedNutrition,
  parseWaistCm,
  parseWorkoutBuckets,
  samplePhotoMeal,
  storedMealInstant,
  type BodyCompositionReading,
  type FoodItem,
  type FoodLog,
  type NutritionDay,
  type NutritionSettings,
} from '@/domain/nutrition';
import { PLAN_DISCLAIMER, healthPlanFromStored, normaliseTrainingSchedule, parseSharedHealthPlan, trainingScheduleFromRow, type HealthPlan, type TrainingSchedule } from '@/domain/healthPlan';
import { parseBuddyLinkPass, parseBuddyList, parseBuddyPreview, parseBuddyShare, type BuddyLinkPass, type BuddyList, type BuddyScope, type BuddyShareView } from '@/domain/buddies';
import { randomId } from '@/domain/id';
import { chatInsertFilter, messageFromRealtime, withIncomingMessage } from '@/domain/liveChat';
import { isDuplicateWrite, mergeOutgoingMessages, shareInflight } from '@/domain/writes';
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
import { CoalescedSave, sameJson } from '@/domain/coalescedSave';
import { interestSelectionUnchanged, nextInterestIds, rolledBackInterestIds, snapshotWithOwnInterests } from '@/domain/interests';
import { profileWithColumn, profileWithPatch } from '@/domain/profilePatch';
import { planCustomInterest, validateTown } from '@/domain/privacy';
import { fetchWithOneRetry } from '@/domain/retryFetch';
import { planReasons } from '@/domain/reasons';
import { BIO_LIMIT, PHOTO_CAPTION_LIMIT, defaultProfileSharing, normalizeProfileSharing, parsePublicProfile, planProfileText, sensitiveTurnedOn, shareFreshGratitude, type ProfileSharing } from '@/domain/profileSharing';
import { moodOnTen, planCheckInGratitude } from '@/domain/checkIns';
import { quoteById } from '@/domain/stoicQuotes';
import { planRelapse } from '@/domain/sober';
import { parseSseBuffer } from '@/domain/sse';
import { detectSafety } from '@/domain/safety';
import {
  ESTIMATE_CLIENT_TIMEOUT_MS,
  PLAN_NOT_SAVED,
  PLAN_UNREACHABLE,
  VOICE_UNREACHABLE,
  EdgeSessionError,
  aiCallMessage,
  classifyEdgeError,
  classifyEdgeStatus,
  edgeFailureLog,
  postWithRetry,
  prepareAiSession,
  type AiFeature,
  type EdgeFailureKind,
  type EdgeSendState,
  type SessionTicket,
} from '@/domain/edgeRetry';
import { clientAppBuild } from '@/domain/clientError';
import { OPENING_LINE, SCRIPTED_COACH_REPLY, type ThumosMode } from '@/domain/thumos';
import Constants from 'expo-constants';
import { CONSENT_VERSION } from '@/data/catalogue';
import { consentRows, missingConsentRows, type StoredConsent } from '@/domain/consents';
import { stageFromRecord } from '@/domain/stage';
import type {
  AppSnapshot,
  CheckIn,
  Connection,
  ConsentInput,
  DirectoryCard,
  DirectMessage,
  HealthSample,
  Interest,
  MealEstimate,
  NewCheckIn,
  FoodLogUpdate,
  NewFoodLog,
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
    foodLogs: [],
    nutrition: defaultNutritionSettings(),
    waterDays: [],
    bodyComposition: [],
    healthPlan: null,
    trainingSchedule: null,
  };
}

const FOOD_BUCKET = 'food-photos';

type ProfileWrite = { column: Record<string, unknown>; interestIds?: string[] };

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
  /** One lane per choice, so rapid taps send only the latest value. */
  private saves = new Map<string, CoalescedSave<unknown>>();
  /** Profile to restore if a chip save fails and nothing newer has been chosen. */
  private profileBase: Profile | null = null;
  private consentBase: Pick<Profile, 'communityVisible' | 'consentHealth' | 'consentAi'> | null = null;
  /** Consent rows from before the optimistic insert, so the real insert is not skipped. */
  private consentExisting: StoredConsent[] | null = null;
  private once = shareInflight();
  /** Messages shown before the server confirms them. The id is the client idempotency key. */
  private outgoingMessages = new Map<string, DirectMessage>();
  /** Unfiltered insert stream for the chats list. Recreated only when sign-in changes. */
  private messageChannel: ReturnType<SupabaseClient['channel']> | null = null;
  private messagesListening = false;
  /** When owner progress, profile, gratitude, and vision links were last signed. */
  private ownerPhotosSignedAt: number | null = null;
  private ownerPhotoResign: Promise<void> | null = null;
  /** One extra sign after the current one, shared by every image error that arrives mid-sign. */
  private ownerPhotoResignFollowUp: Promise<void> | null = null;
  /** One shared session refresh for AI calls that start together. */
  private aiSession: Promise<string> | null = null;

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

  async resignOwnerPhotos(options?: { force?: boolean }): Promise<void> {
    const force = options?.force === true;
    if (this.ownerPhotoResign) {
      if (!force) return this.ownerPhotoResign;
      if (!this.ownerPhotoResignFollowUp) {
        const running = this.ownerPhotoResign;
        this.ownerPhotoResignFollowUp = running.then(() => {
          this.ownerPhotoResignFollowUp = null;
          return this.resignOwnerPhotos({ force: true });
        });
      }
      return this.ownerPhotoResignFollowUp;
    }
    if (!force && ownerPhotoResignCooling(this.ownerPhotosSignedAt)) return;
    const run = this.resignOwnerPhotosNow().finally(() => {
      if (this.ownerPhotoResign === run) this.ownerPhotoResign = null;
    });
    this.ownerPhotoResign = run;
    return run;
  }

  async refreshOwnerPhotosIfStale(): Promise<void> {
    if (!ownerPhotoUrlsStale(this.ownerPhotosSignedAt)) return;
    await this.resignOwnerPhotos();
  }

  async reloadMessages(): Promise<void> {
    const { data: sessionData } = await this.client.auth.getSession();
    if (!sessionData.session) return;
    const connectionIds = this.snapshot.connections.map((connection) => connection.id);
    if (!connectionIds.length) return;
    const messageRes = await this.client
      .from('direct_messages')
      .select('*')
      .in('connection_id', connectionIds)
      .order('created_at');
    if (messageRes.error) throw asUserFacing(messageRes.error, 'general');
    const fetched = ((messageRes.data ?? []) as Row[]).map(mapDirectMessage);
    const allowed = new Set(connectionIds);
    this.emit({
      ...this.snapshot,
      messages: mergeFetchedMessages(this.snapshot.messages, fetched, allowed),
    });
  }

  watchChat(connectionId: string): () => void {
    const filter = chatInsertFilter(connectionId);
    if (!filter) return () => undefined;
    const channel = this.client
      .channel(`chat:${connectionId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'direct_messages', filter },
        (payload) => {
          this.ingestMessage(payload.new);
        },
      )
      .subscribe();
    return () => {
      void this.client.removeChannel(channel);
    };
  }

  private emit(next: AppSnapshot) {
    if (this.outgoingMessages.size === 0) {
      this.snapshot = next;
    } else {
      const base = next.messages.filter((message) => !this.outgoingMessages.has(message.id));
      this.snapshot = { ...next, messages: [...mergeOutgoingMessages(base, [...this.outgoingMessages.values()])] };
    }
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

  private async start() {
    if (this.started) return;
    this.started = true;
    this.client.auth.onAuthStateChange((_event, session) => {
      void this.client.realtime.setAuth(session?.access_token ?? null);
      this.listenForMessages(Boolean(session));
      void this.refresh();
    });
    const { data } = await this.client.auth.getSession();
    await this.client.realtime.setAuth(data.session?.access_token ?? null);
    this.listenForMessages(Boolean(data.session));
    await this.refresh();
  }

  /** One insert stream for every chat this account can read. Realtime applies the select policy. */
  private listenForMessages(signedIn: boolean) {
    if (!signedIn) {
      if (this.messageChannel) void this.client.removeChannel(this.messageChannel);
      this.messageChannel = null;
      this.messagesListening = false;
      return;
    }
    if (this.messagesListening) return;
    this.messagesListening = true;
    this.messageChannel = this.client
      .channel('direct-messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages' }, (payload) => {
        this.ingestMessage(payload.new);
      })
      .subscribe();
  }

  private ingestMessage(row: unknown) {
    const incoming = messageFromRealtime(row);
    if (!incoming) return;
    this.outgoingMessages.delete(incoming.id);
    const next = withIncomingMessage(this.snapshot.messages, incoming);
    if (next === this.snapshot.messages) return;
    this.emit({ ...this.snapshot, messages: [...next] });
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
      this.ownerPhotosSignedAt = null;
      this.emit({ ...emptySnapshot(), ready: true, interests, resources });
      return;
    }

    const userId = session.user.id;
    const email = session.user.email ?? '';
    const [profileRes, reasonsRes, checkRes, relapseRes, healthRes, mineRes, thumosRes, directoryRes, interestLinks, connectionsRes, reportsRes, consentsRes, photosRes, gratitudeRes, gratitudePhotoRes, visionRes, sharingRes, quotesRes, profilePhotoRes, healthPlanRes, scheduleRes] =
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
        this.client.from('gratitude_entries').select('id, body, category, is_favourite, entry_date, created_at, updated_at, check_in_id').eq('user_id', userId).order('entry_date', { ascending: false }),
        this.client.from('gratitude_photos').select('id, entry_id, user_id, storage_path, caption, created_at').eq('user_id', userId).order('created_at'),
        this.client.from('vision_board_items').select('id, user_id, storage_path, caption, area, size, position, created_at, updated_at').eq('user_id', userId).order('position'),
        this.client.from('profile_sharing').select('settings').eq('user_id', userId).maybeSingle(),
        this.client.from('user_quotes').select('quote_id, created_at').eq('user_id', userId).order('created_at', { ascending: false }),
        this.client.from('profile_photos').select('id, user_id, role, caption, position, storage_path, created_at').eq('user_id', userId).order('position').order('created_at'),
        this.client.from('health_plans').select('focus, nutrition, fitness, wellbeing, limits, disclaimer, updated_at').eq('user_id', userId).maybeSingle(),
        this.client.from('training_schedules').select('monday, tuesday, wednesday, thursday, friday, saturday, sunday, typical_minutes, longer_day, longer_minutes, walk_day, note').eq('user_id', userId).maybeSingle(),
      ]);

    const profileRow = profileRes.data as Row | null;
    const serverInterestIds = ((mineRes.data ?? []) as Row[])
      .filter((row) => row.user_id === userId)
      .map((row) => String(row.interest_id));
    this.settleInterestLanes(serverInterestIds);
    const myInterestIds = this.applyPendingInterests(serverInterestIds);
    const profile = this.withPendingProfile(profileRow ? mapProfile(profileRow, email, myInterestIds) : null);
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
          avatarPhotoId: avatarId || null,
        };
      })
      .sort((a, b) => b.sharedInterestIds.length - a.sharedInterestIds.length || a.displayName.localeCompare(b.displayName));

    const connections = ((connectionsRes.data ?? []) as Row[]).map(mapConnection);
    const connectionIds = connections.map((connection) => connection.id);
    const allowedConnections = new Set(connectionIds);
    const sameAccount = this.snapshot.session?.userId === userId;
    let messages: AppSnapshot['messages'] = sameAccount
      ? this.snapshot.messages.filter((message) => allowedConnections.has(message.connectionId))
      : [];
    if (connectionIds.length) {
      const messageRes = await this.client
        .from('direct_messages')
        .select('*')
        .in('connection_id', connectionIds)
        .order('created_at');
      if (!messageRes.error) {
        messages = mergeFetchedMessages(
          sameAccount ? this.snapshot.messages : [],
          ((messageRes.data ?? []) as Row[]).map(mapDirectMessage),
          allowedConnections,
        );
      }
    }

    let gratitudeRows: unknown = gratitudeRes.data;
    let gratitudeMessage = gratitudeRes.error?.message ?? null;
    if (gratitudeMessage && /check_in_id/i.test(gratitudeMessage)) {
      const again = await this.client
        .from('gratitude_entries')
        .select('id, body, category, is_favourite, entry_date, created_at, updated_at')
        .eq('user_id', userId)
        .order('entry_date', { ascending: false });
      gratitudeRows = again.data;
      gratitudeMessage = again.error?.message ?? null;
    }

    this.ownerPhotosSignedAt = Date.now();
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
      consents: this.overlayConsentRows(((consentsRes.data ?? []) as Row[]).map(mapConsent)),
      progressPhotos: this.overlayProgress(await this.signedProgressPhotos(photosRes.error ? null : ((photosRes.data ?? []) as Row[]), photosRes.error?.message, userId)),
      communityPhotos: photosRes.error ? [] : await this.communityProgressPhotos(userId),
      profilePhotos: await this.signedProfilePhotos(profilePhotoRes.error ? null : ((profilePhotoRes.data ?? []) as Row[]), profilePhotoRes.error?.message, userId),
      gratitude: withGratitudePhotos(
        gratitudeMessage ? loggedEmptyGratitude(gratitudeMessage) : gratitudeFromRows(gratitudeRows),
        await this.signedGratitudePhotos(gratitudePhotoRes.error ? null : ((gratitudePhotoRes.data ?? []) as Row[]), gratitudePhotoRes.error?.message),
      ),
      visionItems: this.overlayVision(await this.signedVisionItems(visionRes.error ? null : visionRes.data, visionRes.error?.message)),
      ...(await this.nutritionSnapshot(userId)),
      sharing: this.prefer('sharing', sharingRes.error ? defaultProfileSharing() : normalizeProfileSharing((sharingRes.data as Row | null)?.settings)),
      savedQuotes: quotesRes.error
        ? []
        : ((quotesRes.data ?? []) as Row[]).flatMap((row) => {
            const quoteId = String(row.quote_id ?? '');
            if (!quoteById(quoteId)) return [];
            return [{ quoteId, createdAt: String(row.created_at ?? '') }];
          }),
      healthPlan: healthPlanRes.error ? null : healthPlanFromStored(healthPlanRes.data),
      trainingSchedule: scheduleRes.error ? null : trainingScheduleFromRow(scheduleRes.data),
    });
  }

  /** Signs the paths already on the snapshot and writes only the new preview URLs. */
  private async resignOwnerPhotosNow(): Promise<void> {
    const { data } = await this.client.auth.getSession();
    if (!data.session) return;
    const currentPaths = this.snapshot;
    const mealPaths = currentPaths.foodLogs.flatMap((log) => (
      log.previewUrl ? [foodPhotoStoragePath(log.userId, log.id)] : []
    ));
    const [progress, profile, gratitude, vision, meals] = await Promise.all([
      this.signedUrlMap(PROGRESS_BUCKET, currentPaths.progressPhotos.map((photo) => photo.storagePath), PROGRESS_SIGNED_URL_SECONDS),
      this.signedUrlMap(PROFILE_PHOTO_BUCKET, currentPaths.profilePhotos.map((photo) => photo.storagePath), PROFILE_SIGNED_URL_SECONDS),
      this.signedUrlMap(
        GRATITUDE_BUCKET,
        currentPaths.gratitude.flatMap((entry) => entry.photos.map((photo) => photo.storagePath)),
        GRATITUDE_SIGNED_URL_SECONDS,
      ),
      this.signedUrlMap(VISION_BUCKET, currentPaths.visionItems.map((item) => item.storagePath), VISION_SIGNED_URL_SECONDS),
      this.signedUrlMap(FOOD_BUCKET, mealPaths, OWNER_PHOTO_URL_SECONDS),
    ]);
    const wanted = currentPaths.progressPhotos.length
      + currentPaths.profilePhotos.length
      + currentPaths.gratitude.reduce((sum, entry) => sum + entry.photos.length, 0)
      + currentPaths.visionItems.length
      + mealPaths.length;
    const signedCount = progress.size + profile.size + gratitude.size + vision.size + meals.size;
    if (wanted === 0 || signedCount > 0) this.ownerPhotosSignedAt = Date.now();
    const latest = this.snapshot;
    const progressPhotos = withSignedPreviewUrls(latest.progressPhotos, progress);
    const profilePhotos = withSignedPreviewUrls(latest.profilePhotos, profile);
    const gratitudeEntries = withSignedGratitudePhotos(latest.gratitude, gratitude);
    const visionItems = withSignedPreviewUrls(latest.visionItems, vision);
    const foodLogs = withSignedFoodPhotos(latest.foodLogs, meals);
    if (
      progressPhotos === latest.progressPhotos
      && profilePhotos === latest.profilePhotos
      && gratitudeEntries === latest.gratitude
      && visionItems === latest.visionItems
      && foodLogs === latest.foodLogs
    ) return;
    this.emit({
      ...latest,
      progressPhotos,
      profilePhotos,
      gratitude: gratitudeEntries,
      visionItems,
      foodLogs,
    });
  }

  private async signedUrlMap(bucket: string, paths: string[], seconds: number): Promise<Map<string, string>> {
    const signedByPath = new Map<string, string>();
    const clean = [...new Set(paths.filter((path) => path && !path.includes('..')))];
    if (!clean.length) return signedByPath;
    try {
      const signed = await this.client.storage.from(bucket).createSignedUrls(clean, seconds);
      if (signed.error) console.error(signed.error.message);
      for (const item of signed.data ?? []) {
        if (item.path && item.signedUrl) signedByPath.set(item.path, item.signedUrl);
      }
    } catch (error) {
      console.error(error);
    }
    return signedByPath;
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
    const column: Record<string, unknown> = {};
    const shown: ProfilePatch = { ...patch };
    if (patch.displayName != null) {
      const displayName = patch.displayName.trim();
      column.display_name = displayName;
      shown.displayName = displayName;
    }
    if (patch.town !== undefined) {
      const town = patch.town?.trim() || null;
      column.town = town;
      shown.town = town;
    }
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
      shown.bio = planned.text;
    }
    if (patch.messageNotifications !== undefined) column.message_notifications = patch.messageNotifications;
    if (patch.notifySenderName !== undefined) column.notify_sender_name = patch.notifySenderName;
    if (patch.movementReminder !== undefined) column.movement_reminder = patch.movementReminder;
    if (patch.movementReminderMinute !== undefined) column.movement_reminder_minute = patch.movementReminderMinute;
    const profile = this.snapshot.profile;
    if (!profile) throw new Error('Sign in first.');
    const lane = this.profileLane();
    const merged: ProfileWrite = {
      column: stableRecord({ ...(lane.dirty ? lane.value.column : {}), ...column }),
      interestIds: patch.interestIds ?? (lane.dirty ? lane.value.interestIds : undefined),
    };
    if (!lane.dirty) this.profileBase = profile;
    this.emit({ ...this.snapshot, profile: profileWithPatch(profile, shown) });
    try {
      await lane.choose(merged);
    } catch (error) {
      if (!lane.dirty && this.profileBase) this.emit({ ...this.snapshot, profile: this.profileAfterConsent(this.profileBase) });
      throw asUserFacing(error, 'general');
    }
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
    const planned = planCheckInGratitude(input.gratitude);
    if (!planned.ok) throw new UserFacingError(planned.message, 'generic');
    const { error } = await this.client.rpc('save_check_in', {
      check_in_id: input.id,
      mood: input.mood,
      sleep_hours: input.sleepHours,
      craving: input.craving,
      note: input.note.trim(),
      gratitude: planned.body,
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
    const lane = this.saveLane(`interest:${interestId}`, previous.includes(interestId), async (value) => {
      await this.writeInterestLink(profile.id, interestId, value);
    });
    try {
      await lane.choose(selected);
      if (this.pendingInterests.get(interestId) === selected && !lane.dirty) this.pendingInterests.delete(interestId);
    } catch (error) {
      if (this.pendingInterests.get(interestId) === selected) this.pendingInterests.delete(interestId);
      const current = this.snapshot.profile?.interestIds ?? [];
      const restored = rolledBackInterestIds(current, optimistic, previous);
      if (!interestSelectionUnchanged(current, restored)) this.emit(snapshotWithOwnInterests(this.snapshot, restored));
      throw asUserFacing(error, 'general');
    }
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
    // A block, the age check, and who may read the chat are enforced on the server.
    // authenticated cannot select blocks, so this does not read that table.
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

  async requestConnection(userId: string, clientId?: string): Promise<void> {
    const id = clientId || randomId();
    return this.once(`connect:${userId}`, async () => {
      const me = await this.userId();
      const live = this.snapshot.connections.some((connection) =>
        connection.status !== 'declined' &&
        ((connection.requesterId === me && connection.addresseeId === userId) ||
          (connection.requesterId === userId && connection.addresseeId === me)));
      if (live) return;
      const { error } = await this.client.from('connections').insert({ id, requester_id: me, addressee_id: userId, status: 'pending' });
      // The private-message screen shows this server reason. Other callers still run it through shownError.
      if (error && !isDuplicateWrite(error)) throw error;
      // The request is saved. A slow or failed reload afterwards must not report
      // it as unsent, or the card stays on "Ask to connect" after an error.
      await this.refresh().catch((reloadError: unknown) => console.error(reloadError));
    });
  }

  async respondConnection(connectionId: string, accept: boolean): Promise<void> {
    return this.once(`respond:${connectionId}`, async () => {
      const current = this.snapshot.connections.find((connection) => connection.id === connectionId);
      if (current && current.status !== 'pending') return;
      const { error } = await this.client.from('connections').update({ status: accept ? 'accepted' : 'declined' }).eq('id', connectionId);
      if (error) throw asUserFacing(error, 'general');
      await this.refresh().catch((reloadError: unknown) => console.error(reloadError));
    });
  }

  async sendDirectMessage(connectionId: string, body: string, clientId?: string): Promise<void> {
    const text = body.trim().slice(0, 2000);
    if (!text) return;
    const id = clientId || randomId();
    return this.once(`message:${id}`, async () => {
      if (this.snapshot.messages.some((message) => message.id === id && !message.delivery)) return;
      const userId = await this.userId();
      const optimistic: DirectMessage = {
        id,
        connectionId,
        senderId: userId,
        body: text,
        createdAt: this.outgoingMessages.get(id)?.createdAt ?? new Date().toISOString(),
        delivery: 'sending',
      };
      this.outgoingMessages.set(id, optimistic);
      this.emit({ ...this.snapshot });
      const { data, error } = await this.client.from('direct_messages').insert({
        id,
        connection_id: connectionId,
        sender_id: userId,
        body: text,
      }).select('id').single();
      if (error && !isDuplicateWrite(error)) {
        this.outgoingMessages.set(id, { ...optimistic, delivery: 'failed' });
        this.emit({ ...this.snapshot });
        throw asUserFacing(error, 'general');
      }
      const messageId = !error && data && typeof data.id === 'string' ? data.id : '';
      if (messageId) {
        void this.client.functions.invoke('notify-direct-message', { body: { messageId } }).then(({ error: pushError }) => {
          if (pushError) this.rememberEdgeFailure('notify-direct-message', new Error('Push send failed'));
        }).catch(() => {
          this.rememberEdgeFailure('notify-direct-message', new Error('Push send failed'));
        });
      }
      const { delivery: _delivery, ...confirmed } = optimistic;
      this.outgoingMessages.set(id, confirmed);
      this.emit({ ...this.snapshot });
      await this.refresh().catch((reloadError: unknown) => console.error(reloadError));
      this.outgoingMessages.delete(id);
      if (!this.snapshot.messages.some((message) => message.id === id)) {
        this.outgoingMessages.set(id, confirmed);
      }
      this.emit({ ...this.snapshot });
    });
  }

  async loadChatReads(): Promise<Record<string, string>> {
    const { data, error } = await this.client.from('chat_reads').select('connection_id, read_through');
    if (error) throw error;
    const marks: Record<string, string> = {};
    for (const row of data ?? []) {
      const id = (row as { connection_id?: unknown }).connection_id;
      const at = (row as { read_through?: unknown }).read_through;
      if (typeof id === 'string' && typeof at === 'string' && at) marks[id] = at;
    }
    return marks;
  }

  async saveChatRead(connectionId: string, readThrough: string): Promise<void> {
    try {
      const { error } = await this.client.rpc('save_chat_read', {
        p_connection_id: connectionId,
        p_read_through: readThrough,
      });
      if (error) console.error('chat read', error);
    } catch (error) {
      console.error('chat read', error);
    }
  }

  async logClientError(screen: string, message: string, appBuild: string): Promise<void> {
    try {
      const clip = (value: string, max: number) => value.replace(/\s+/g, ' ').trim().slice(0, max);
      const stored = this.snapshot.session?.userId ?? null;
      const sessionUser = stored ? null : (await this.client.auth.getSession()).data.session?.user?.id ?? null;
      const userId = stored ?? sessionUser;
      if (!userId) {
        console.error('client error log', 'no session', clip(screen, 80), clip(message, 300));
        return;
      }
      const { error } = await this.client.from('client_errors').insert({
        user_id: userId,
        screen: clip(screen, 80) || 'app',
        message: clip(message, 300) || 'Unknown error',
        app_build: clip(appBuild, 40) || 'unknown',
      });
      if (error) console.error('client error log', error.message);
    } catch (error) {
      console.error('client error log', error);
    }
  }

  async saveDeviceToken(token: string, platform: 'ios' | 'android'): Promise<void> {
    const userId = await this.userId();
    const { error } = await this.client.from('device_tokens').upsert({
      user_id: userId,
      expo_push_token: token,
      platform,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,expo_push_token' });
    if (error) throw asUserFacing(error, 'general');
  }

  async blockUser(userId: string, clientId?: string): Promise<void> {
    const id = clientId || randomId();
    return this.once(`block:${userId}`, async () => {
      const me = await this.userId();
      const { error } = await this.client.from('blocks').insert({ id, blocker_id: me, blocked_id: userId });
      if (error && !isDuplicateWrite(error)) throw asUserFacing(error, 'general');
      await this.refresh();
    });
  }

  async unblockUser(userId: string): Promise<void> {
    // A filtered delete needs SELECT. Authenticated must not have that on blocks.
    const { error } = await this.client.rpc('unblock_user', { target: userId });
    if (error) throw asUserFacing(error, 'general');
    await this.refresh();
  }

  async reportUser(input: NewReport): Promise<void> {
    const id = input.clientId || randomId();
    return this.once(`report:${id}`, async () => {
      const me = await this.userId();
      const name = this.snapshot.directory.find((card) => card.id === input.reportedUserId)?.displayName ?? 'Member';
      const { error } = await this.client.from('reports').insert({
        id,
        reporter_id: me,
        reported_user_id: input.reportedUserId,
        reported_name: name,
        reason: input.reason,
        details: input.details.trim(),
      });
      if (error && !isDuplicateWrite(error)) throw asUserFacing(error, 'general');
      await this.refresh();
    });
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

  async sendThumos(
    content: string,
    mode: ThumosMode,
    onDelta?: (text: string) => void,
    onState?: (state: EdgeSendState) => void,
  ): Promise<void> {
    const text = content.trim();
    if (!text) return;
    if (!this.snapshot.profile?.consentAi) throw new Error('Agree to the coach consent before sending a message to Thumos.');
    const safety = detectSafety(text);
    const effectiveMode: ThumosMode = safety.selfHarm || safety.withdrawal ? 'support' : mode;
    const requestId = randomId();

    let response: Response;
    try {
      const token = await this.sessionForAiCall();
      response = await postWithRetry({
        fetchImpl: (url, init) => fetch(url, init),
        url: `${this.url}/functions/v1/thumos-chat`,
        init: {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            apikey: this.anonKey,
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
          },
          body: JSON.stringify({ content: text, mode: effectiveMode, request_id: requestId }),
        },
        onState,
      });
    } catch (error) {
      if (error instanceof UserFacingError) throw error;
      throw this.aiFailure('thumos', 'thumos', error);
    }

    if (!response.ok) {
      const kind = classifyEdgeStatus(response.status);
      if (kind) throw this.aiFailure('thumos', 'thumos', new Error('Thumos did not answer.'), response.status);
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
        if (event.type === 'ping') {
          onState?.('waiting');
        } else if (event.type === 'status') {
          onState?.(event.state === 'retrying' ? 'retrying' : 'waiting');
        } else if (event.type === 'delta') {
          accumulated += event.text;
          onDelta?.(accumulated);
        } else if (event.type === 'replace') {
          accumulated = event.reply;
          onDelta?.(event.reply);
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
          if (event.type === 'ping') {
            onState?.('waiting');
          } else if (event.type === 'status') {
            onState?.(event.state === 'retrying' ? 'retrying' : 'waiting');
          } else if (event.type === 'delta') {
            accumulated += event.text;
            onDelta?.(accumulated);
          } else if (event.type === 'replace') {
            accumulated = event.reply;
            onDelta?.(event.reply);
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

  private async accessToken(): Promise<string> {
    const { data: sessionData } = await this.client.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new Error('Sign in first.');
    return token;
  }

  private sessionTicket(session: { access_token?: string; expires_at?: number; user?: { id?: string } } | null): SessionTicket {
    return {
      accessToken: session?.access_token ?? null,
      expiresAt: typeof session?.expires_at === 'number' ? session.expires_at : null,
      userId: session?.user?.id ?? null,
    };
  }

  /** Refresh the session once, then once more if that refresh does not return a token. */
  private sessionForAiCall(): Promise<string> {
    if (this.aiSession) return this.aiSession;
    this.aiSession = this.loadAiSession().finally(() => {
      this.aiSession = null;
    });
    return this.aiSession;
  }

  private async loadAiSession(): Promise<string> {
    const ready = await prepareAiSession({
      read: async () => this.sessionTicket((await this.client.auth.getSession()).data.session),
      refresh: async () => {
        const { data, error } = await this.client.auth.refreshSession();
        return { ticket: this.sessionTicket(data.session), error };
      },
    });
    if ('failure' in ready) throw new EdgeSessionError(ready.failure);
    return ready.accessToken;
  }

  private rememberEdgeFailure(screen: string, error: unknown, status?: number, kind?: EdgeFailureKind) {
    const detail = edgeFailureLog(error, status);
    const line = kind ? `${kind}: ${detail}` : detail;
    console.error(screen, line);
    void this.logClientError(screen, line, clientAppBuild({
      buildNumber: Constants.expoConfig?.ios?.buildNumber,
      version: Constants.expoConfig?.version,
    }));
  }

  private aiFailure(feature: AiFeature, screen: string, error: unknown, status?: number): UserFacingError {
    if (error instanceof UserFacingError) return error;
    const kind: EdgeFailureKind = error instanceof EdgeSessionError
      ? error.kind
      : status != null
        ? (classifyEdgeStatus(status) ?? 'server')
        : classifyEdgeError(error);
    this.rememberEdgeFailure(screen, error, status, kind);
    const message = feature === 'thumos' && (kind === 'network' || kind === 'timeout' || kind === 'server')
      ? `${aiCallMessage(feature, kind)} ${SCRIPTED_COACH_REPLY}`
      : aiCallMessage(feature, kind);
    return new UserFacingError(message, 'generic');
  }

  private async callEdge(
    name: string,
    body: unknown,
    options?: { ai?: boolean; timeoutMs?: number },
  ): Promise<{ status: number; data: unknown }> {
    const token = options?.ai ? await this.sessionForAiCall() : await this.accessToken();
    const controller = options?.timeoutMs ? new AbortController() : null;
    const timer = controller && options?.timeoutMs
      ? setTimeout(() => controller.abort(), options.timeoutMs)
      : null;
    try {
      const response = await postWithRetry({
        fetchImpl: (url, init) => fetch(url, init),
        url: `${this.url}/functions/v1/${name}`,
        init: {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            apikey: this.anonKey,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(body),
          signal: controller?.signal,
        },
      });
      return { status: response.status, data: await response.json().catch(() => null) };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async mintVoiceToken(mode?: ThumosMode): Promise<VoiceMint> {
    type VoicePayload = {
      ok?: boolean;
      code?: string;
      message?: string;
      token?: unknown;
      expiresAt?: unknown;
      instructions?: unknown;
      crisisInstructions?: unknown;
      history?: unknown;
      greeting?: unknown;
      mode?: unknown;
    };
    let data: VoicePayload | null = null;
    try {
      const invoked = await this.callEdge('thumos-voice-token', { mode });
      data = invoked.data as VoicePayload | null;
      if (invoked.status >= 500) {
        this.rememberEdgeFailure('voice', new Error('Voice did not answer.'), invoked.status);
        return { ok: false, code: 'unavailable', message: VOICE_UNREACHABLE };
      }
    } catch (error) {
      this.rememberEdgeFailure('voice', error);
      return { ok: false, code: 'unavailable', message: VOICE_UNREACHABLE };
    }
    if (!data?.ok || typeof data?.token !== 'string') {
      const message = typeof data?.message === 'string' ? data.message : '';
      const honest = message.length > 0 && message.length < 180 && !/xAI key|XAI_API_KEY/i.test(message) ? message : '';
      return {
        ok: false,
        code: typeof data?.code === 'string' ? data.code : 'unavailable',
        message: honest || VOICE_UNREACHABLE,
      };
    }
    const history: { role: 'user' | 'assistant'; content: string }[] = [];
    if (Array.isArray(data.history)) {
      for (const turn of data.history) {
        if (!turn || typeof turn !== 'object') continue;
        const role = (turn as { role?: unknown }).role;
        const content = (turn as { content?: unknown }).content;
        if ((role === 'user' || role === 'assistant') && typeof content === 'string') history.push({ role, content });
      }
    }
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
    const before = stableRecord(progressColumn(photo));
    const lane = this.saveLane(`progress:${id}`, before, (value) => this.persistProgress(id, value));
    if (!lane.dirty) lane.seen(before);
    const merged = stableRecord({ ...(lane.dirty ? lane.value : before), ...patch });
    this.emit({
      ...this.snapshot,
      progressPhotos: this.snapshot.progressPhotos.map((item) => item.id === id ? progressWithColumn(item, merged) : item),
    });
    try {
      await lane.choose(merged);
    } catch (error) {
      if (!lane.dirty) {
        this.emit({
          ...this.snapshot,
          progressPhotos: this.snapshot.progressPhotos.map((item) => item.id === id ? progressWithColumn(item, lane.value) : item),
        });
      }
      throw asUserFacing(error, 'general');
    }
  }

  async setProgressPhotoVisibility(ids: string[], visibility: ProgressVisibility): Promise<void> {
    const next = progressVisibility(visibility);
    if (!ids.length || (visibility !== 'private' && visibility !== 'community')) {
      throw new UserFacingError('Could not update that photo.', 'generic');
    }
    const known = new Set(ids);
    const previous = new Map(ids.map((id) => {
      const photo = this.snapshot.progressPhotos.find((item) => item.id === id);
      return [id, photo?.visibility ?? 'private'] as const;
    }));
    this.emit({
      ...this.snapshot,
      progressPhotos: this.snapshot.progressPhotos.map((photo) => known.has(photo.id) ? { ...photo, visibility: next } : photo),
    });
    try {
      await Promise.all(ids.map(async (id) => {
        const before = previous.get(id) ?? 'private';
        const lane = this.saveLane(`visibility:${id}`, before, (value) => this.persistVisibility(id, value), Object.is);
        if (!lane.dirty) lane.seen(before);
        await lane.choose(next);
      }));
    } catch (error) {
      this.emit({
        ...this.snapshot,
        progressPhotos: this.snapshot.progressPhotos.map((photo) => {
          const lane = this.saves.get(`visibility:${photo.id}`) as CoalescedSave<ProgressVisibility> | undefined;
          if (!lane || lane.dirty) return photo;
          return { ...photo, visibility: lane.value };
        }),
      });
      throw asUserFacing(error, 'general');
    }
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
    const lane = this.saveLane('sharing', this.snapshot.sharing, (value) => this.persistSharing(value));
    if (!lane.dirty) lane.seen(this.snapshot.sharing);
    this.emit({ ...this.snapshot, sharing: next });
    try {
      await lane.choose(next);
    } catch (error) {
      if (!lane.dirty) this.emit({ ...this.snapshot, sharing: lane.value });
      throw asUserFacing(error, 'general');
    }
  }

  async publicProfile(userId: string): Promise<ReturnType<typeof parsePublicProfile>> {
    const { data, error } = await this.client.rpc('public_profile', { user_id: userId });
    if (error) throw asUserFacing(error, 'general');
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

  async addGratitudeEntry(input: NewGratitudeEntry): Promise<string> {
    const plan = planGratitudeEntry(input.body, input.entryDate, isoDay(new Date()));
    if (!plan.ok) throw new UserFacingError(plan.message, 'generic');
    const userId = await this.userId();
    const inserted = await this.client.from('gratitude_entries').insert({
      user_id: userId,
      body: plan.body,
      category: gratitudeCategory(input.category),
      is_favourite: input.isFavourite,
      entry_date: plan.entryDate,
    }).select('id').single();
    if (inserted.error) throw asUserFacing(inserted.error, 'general');
    const id = inserted.data?.id;
    if (typeof id !== 'string' || !id) throw new UserFacingError('Could not save that line.', 'generic');
    await this.refresh();
    await this.shareAddedGratitude({ entryId: id });
    return id;
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
    await this.shareAddedGratitude({ photoId });
  }

  /** A new line or photo follows Share Whole Section only when the person opted in. */
  private async shareAddedGratitude(added: { entryId?: string; photoId?: string }): Promise<void> {
    const next = shareFreshGratitude(this.snapshot.sharing, added);
    if (!next) return;
    await this.setProfileSharing(next);
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
    const existing = this.snapshot.visionItems.find((item) => item.id === id);
    const before = stableRecord(existing ? { caption: existing.caption, area: existing.area, size: existing.size } : column);
    const lane = this.saveLane(`vision:${id}`, before, (value) => this.persistVision(id, value));
    if (!lane.dirty) lane.seen(before);
    const merged = stableRecord({ ...(lane.dirty ? lane.value : before), ...column });
    if (existing) {
      this.emit({
        ...this.snapshot,
        visionItems: this.snapshot.visionItems.map((item) => item.id === id ? visionWithColumn(item, merged) : item),
      });
    }
    try {
      await lane.choose(merged);
    } catch (error) {
      if (!lane.dirty) {
        this.emit({
          ...this.snapshot,
          visionItems: this.snapshot.visionItems.map((item) => item.id === id ? visionWithColumn(item, lane.value) : item),
        });
      }
      throw asUserFacing(error, 'general');
    }
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
      const invoked = await this.callEdge('gratitude-reflect', { body, category }, { ai: true });
      const data = invoked.data as { ok?: boolean; code?: string; comment?: unknown; suggestions?: unknown } | null;
      if (data?.code === 'consent') {
        throw new Error('Agree to the coach consent before sending a message to Thumos.');
      }
      if (invoked.status === 401 || invoked.status >= 500) {
        throw this.aiFailure('reflect', 'gratitude', new Error('Reflection did not answer.'), invoked.status);
      }
      if (invoked.status < 400 && data?.ok === true && typeof data.comment === 'string' && Array.isArray(data.suggestions)) {
        const suggestions = data.suggestions.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
        if (suggestions.length >= 2) return { comment: data.comment, suggestions: suggestions.slice(0, 3) };
      }
    } catch (error) {
      if (error instanceof UserFacingError) throw error;
      if (error instanceof Error && error.message.includes('Agree to the coach consent')) throw error;
      throw this.aiFailure('reflect', 'gratitude', error);
    }
    return localGratitudeReflect(body, category);
  }

  /** Older databases lack the later share and goal columns. A missing column stays off. */
  private async nutritionSettingsRow(userId: string) {
    const athlete = 'kcal_target, hide_calories, share_food_diary, share_calories, share_quality, share_progress, goal, goal_age, goal_sex, protein_target_g, carb_target_g, fat_target_g, goal_phase, weight_class_kg, activity_energy_kcal, share_goal, wagon_on, wagon_note, wagon_visible, build, workout_buckets, updated_at';
    const widened = await this.client.from('nutrition_settings').select(athlete).eq('user_id', userId).maybeSingle();
    if (!widened.error) return widened;
    const goal = 'kcal_target, hide_calories, share_food_diary, share_calories, share_quality, share_progress, goal, goal_age, goal_sex, protein_target_g, activity_energy_kcal, share_goal, wagon_on, wagon_note, wagon_visible, build, updated_at';
    const first = await this.client.from('nutrition_settings').select(goal).eq('user_id', userId).maybeSingle();
    if (!first.error) return first;
    const withoutBuild = 'kcal_target, hide_calories, share_food_diary, share_calories, share_quality, share_progress, goal, goal_age, goal_sex, protein_target_g, activity_energy_kcal, share_goal, wagon_on, wagon_note, wagon_visible, updated_at';
    const built = await this.client.from('nutrition_settings').select(withoutBuild).eq('user_id', userId).maybeSingle();
    if (!built.error) return built;
    const shares = 'kcal_target, hide_calories, share_food_diary, share_calories, share_quality, share_progress, wagon_on, wagon_note, wagon_visible, updated_at';
    const second = await this.client.from('nutrition_settings').select(shares).eq('user_id', userId).maybeSingle();
    if (!second.error) return second;
    const narrow = 'kcal_target, hide_calories, share_food_diary, wagon_on, wagon_note, wagon_visible, updated_at';
    return this.client.from('nutrition_settings').select(narrow).eq('user_id', userId).maybeSingle();
  }

  private async nutritionSnapshot(userId: string): Promise<Pick<AppSnapshot, 'foodLogs' | 'nutrition' | 'waterDays' | 'bodyComposition'>> {
    const [logsRes, settingsRes, waterRes, bodyRes] = await Promise.all([
      this.foodLogRows(userId),
      this.nutritionSettingsRow(userId),
      this.client.from('nutrition_days').select('day, water_ml').eq('user_id', userId).order('day', { ascending: false }).limit(14),
      this.client.from('body_composition').select('id, recorded_on, body_fat_pct, lean_mass_kg, waist_cm, source, created_at').eq('user_id', userId).order('recorded_on', { ascending: false }).order('created_at', { ascending: false }).limit(60),
    ]);
    const logs = logsRes.error ? [] : ((logsRes.data ?? []) as Row[]).map((row) => mapFoodLog(row, userId)).filter((log): log is FoodLog => log != null);
    const paths = logsRes.error ? [] : ((logsRes.data ?? []) as Row[]).map((row) => String(row.photo_path ?? '')).filter((path) => path && !path.includes('..'));
    const signed = new Map<string, string>();
    if (paths.length) {
      try {
        const urls = await this.client.storage.from(FOOD_BUCKET).createSignedUrls(paths, 3600);
        for (const item of urls.data ?? []) {
          if (item.path && item.signedUrl) signed.set(item.path, item.signedUrl);
        }
      } catch (error) {
        console.error(error);
      }
    }
    return {
      foodLogs: logs.map((log) => {
        const path = ((logsRes.data ?? []) as Row[]).find((row) => String(row.id) === log.id);
        const photo = path ? String(path.photo_path ?? '') : '';
        return { ...log, previewUrl: signed.get(photo) ?? null };
      }),
      nutrition: this.prefer('nutrition', settingsRes.error ? defaultNutritionSettings() : nutritionFromRow(settingsRes.data as Row | null)),
      waterDays: waterRes.error ? [] : ((waterRes.data ?? []) as Row[]).map(mapWaterDay),
      bodyComposition: bodyRes.error ? [] : ((bodyRes.data ?? []) as Row[]).map(mapBodyComposition).filter((row): row is BodyCompositionReading => row != null),
    };
  }

  /** Older databases have no meal time or portion. Those columns are left unset. */
  private async foodLogRows(userId: string): Promise<{ data: Row[] | null; error: { message: string } | null }> {
    const order = (columns: string) => this.client
      .from('food_logs')
      .select(columns)
      .eq('user_id', userId)
      .order('eaten_on', { ascending: false })
      .order('created_at', { ascending: false });
    const full = 'id, user_id, eaten_on, eaten_at, meal, source, note, items, estimated, photo_path, created_at, portion';
    const first = await order(full);
    const chosen = !first.error || !/eaten_at|portion/i.test(first.error.message)
      ? first
      : await order('id, user_id, eaten_on, meal, source, note, items, estimated, photo_path, created_at');
    return {
      data: (chosen.data ?? null) as unknown as Row[] | null,
      error: chosen.error ? { message: chosen.error.message } : null,
    };
  }

  async estimateMeal(input: { text?: string; imageBase64?: string }): Promise<MealEstimate> {
    const text = input.text?.trim() ?? '';
    const local = (): MealEstimate => ({ items: text ? estimateFromText(text) : samplePhotoMeal(), source: 'local' });
    try {
      const invoked = await this.callEdge('estimate-meal', { text, imageBase64: input.imageBase64 ?? '' }, {
        ai: true,
        timeoutMs: ESTIMATE_CLIENT_TIMEOUT_MS,
      });
      const data = invoked.data as { ok?: boolean; items?: unknown; source?: string; code?: string; message?: string } | null;
      if (data?.code === 'consent') return local();
      if (invoked.status === 401 || invoked.status >= 500) {
        throw this.aiFailure('meal', 'estimate-meal', new Error('Meal estimate did not answer.'), invoked.status);
      }
      const items = parseMealEstimate({ items: data?.items });
      if (invoked.status < 400 && data?.ok === true && items) {
        return { items, source: data.source === 'model' ? 'model' : 'local' };
      }
    } catch (error) {
      if (error instanceof UserFacingError) throw error;
      throw this.aiFailure('meal', 'estimate-meal', error);
    }
    const fallback = local();
    if (!fallback.items.length) throw new UserFacingError('Could not read that meal. You can still type it in yourself.', 'generic');
    return fallback;
  }

  async saveFoodLog(input: NewFoodLog): Promise<void> {
    return this.once(`food:${input.id}`, async () => {
      const userId = await this.userId();
      let photoPath: string | null = null;
      if (input.photoBase64) {
        photoPath = `${userId}/${input.id}.jpg`;
        const binary = atob(input.photoBase64);
        const body = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) body[index] = binary.charCodeAt(index);
        const uploaded = await this.client.storage.from(FOOD_BUCKET).upload(photoPath, body, { contentType: 'image/jpeg', upsert: true });
        if (uploaded.error) throw asUserFacing(uploaded.error, 'general');
      }
      const row = {
        id: input.id,
        user_id: userId,
        eaten_on: input.eatenOn,
        eaten_at: storedMealInstant(input),
        meal: input.meal,
        source: input.source,
        note: input.note.slice(0, 500),
        items: input.items,
        estimated: input.estimated,
        photo_path: photoPath,
        portion: 1,
      };
      let inserted = await this.client.from('food_logs').insert(row);
      if (inserted.error && !isDuplicateWrite(inserted.error) && /eaten_at|portion/i.test(inserted.error.message)) {
        const { eaten_at: _eatenAt, portion: _portion, ...legacy } = row;
        inserted = await this.client.from('food_logs').insert(legacy);
      }
      if (inserted.error && !isDuplicateWrite(inserted.error)) throw asUserFacing(inserted.error, 'general');
      await this.refresh();
    });
  }

  async updateFoodLog(id: string, patch: FoodLogUpdate): Promise<void> {
    return this.once(`food-edit:${id}`, async () => {
      const userId = this.snapshot.session?.userId ?? await this.userId();
      const before = this.snapshot.foodLogs;
      const current = before.find((log) => log.id === id);
      if (!current || current.userId !== userId) throw new UserFacingError('That meal is not on this account.', 'generic');
      const next = foodLogFromUpdate(current, patch);
      this.emit({ ...this.snapshot, foodLogs: before.map((log) => (log.id === id ? next : log)) });
      const row = {
        eaten_on: next.eatenOn,
        eaten_at: next.eatenAt,
        meal: next.meal,
        note: next.note,
        items: next.items,
        estimated: next.estimated,
        portion: next.portion,
      };
      let { error } = await this.client.from('food_logs').update(row).eq('id', id).eq('user_id', userId);
      if (error && /eaten_at|portion/i.test(error.message)) {
        const { eaten_at: _eatenAt, portion: _portion, ...legacy } = row;
        ({ error } = await this.client.from('food_logs').update(legacy).eq('id', id).eq('user_id', userId));
      }
      if (error) {
        this.emit({ ...this.snapshot, foodLogs: before });
        throw asUserFacing(error, 'general');
      }
    });
  }

  async deleteFoodLog(id: string): Promise<void> {
    return this.once(`food-delete:${id}`, async () => {
      const userId = this.snapshot.session?.userId ?? await this.userId();
      const before = this.snapshot.foodLogs;
      const known = before.find((log) => log.id === id);
      this.emit({ ...this.snapshot, foodLogs: before.filter((log) => log.id !== id) });
      try {
        if (known?.previewUrl) {
          const path = `${userId}/${id}.jpg`;
          const removed = await this.client.storage.from(FOOD_BUCKET).remove([path]);
          if (removed.error && !/not found/i.test(removed.error.message)) console.error(removed.error.message);
        }
        const { error } = await this.client.from('food_logs').delete().eq('id', id).eq('user_id', userId);
        if (error) throw error;
      } catch (error) {
        this.emit({ ...this.snapshot, foodLogs: before });
        throw asUserFacing(error, 'general');
      }
    });
  }

  async setNutritionSettings(settings: NutritionSettings): Promise<void> {
    const next = canonicalNutrition({ ...settings, updatedAt: new Date().toISOString() });
    const lane = this.saveLane('nutrition', this.snapshot.nutrition, (value) => this.persistNutrition(value));
    if (!lane.dirty) lane.seen(canonicalNutrition(this.snapshot.nutrition));
    this.emit({ ...this.snapshot, nutrition: next });
    try {
      await lane.choose(next);
    } catch (error) {
      if (!lane.dirty) this.emit({ ...this.snapshot, nutrition: lane.value });
      throw asUserFacing(error, 'general');
    }
  }

  private async persistNutrition(settings: NutritionSettings): Promise<void> {
    const userId = this.snapshot.session?.userId ?? await this.userId();
    const row = {
      user_id: userId,
      kcal_target: settings.kcalTarget,
      hide_calories: settings.hideCalories,
      share_food_diary: settings.shareFoodDiary,
      share_calories: settings.shareCalories,
      share_quality: settings.shareQuality,
      share_progress: settings.shareProgress,
      goal: settings.goal,
      goal_age: settings.goalAge,
      goal_sex: settings.goalSex,
      protein_target_g: settings.proteinTarget,
      carb_target_g: settings.carbTarget,
      fat_target_g: settings.fatTarget,
      goal_phase: settings.goalPhase,
      weight_class_kg: settings.weightClassKg,
      activity_energy_kcal: settings.activityEnergyKcal,
      share_goal: settings.shareGoal,
      wagon_on: settings.wagonOn,
      wagon_note: settings.wagonNote.slice(0, 200),
      wagon_visible: settings.wagonVisible,
      build: settings.build,
      workout_buckets: settings.workoutBuckets,
      updated_at: new Date().toISOString(),
    };
    let payload: Record<string, unknown> = row;
    let { error } = await this.client.from('nutrition_settings').upsert(payload);
    const leavingGoalOff = settings.goal == null
      && settings.goalAge == null
      && settings.goalSex == null
      && settings.proteinTarget == null
      && settings.activityEnergyKcal == null
      && !settings.shareGoal;
    if (error && leavingGoalOff && /goal|protein_target_g|activity_energy_kcal|share_goal/i.test(error.message)) {
      const { goal: _goal, goal_age: _age, goal_sex: _sex, protein_target_g: _protein, activity_energy_kcal: _energy, share_goal: _shareGoal, ...withoutGoal } = row;
      payload = withoutGoal;
      ({ error } = await this.client.from('nutrition_settings').upsert(payload));
    }
    const athleteUnset = settings.carbTarget == null
      && settings.fatTarget == null
      && settings.goalPhase == null
      && settings.weightClassKg == null;
    if (error && athleteUnset && /carb_target_g|fat_target_g|goal_phase|weight_class_kg/i.test(error.message)) {
      const { carb_target_g: _carb, fat_target_g: _fat, goal_phase: _phase, weight_class_kg: _klass, ...withoutAthlete } = payload;
      payload = withoutAthlete;
      ({ error } = await this.client.from('nutrition_settings').upsert(payload));
    }
    if (error && settings.build == null && /\bbuild\b/i.test(error.message)) {
      const { build: _build, ...withoutBuild } = payload;
      payload = withoutBuild;
      ({ error } = await this.client.from('nutrition_settings').upsert(payload));
    }
    if (error && Object.keys(settings.workoutBuckets).length === 0 && /workout_buckets/i.test(error.message)) {
      const { workout_buckets: _buckets, ...withoutBuckets } = payload;
      payload = withoutBuckets;
      ({ error } = await this.client.from('nutrition_settings').upsert(payload));
    }
    const leavingNewSharesOff = !settings.shareCalories && !settings.shareQuality && !settings.shareProgress;
    if (error && leavingNewSharesOff && /share_calories|share_quality|share_progress/i.test(error.message)) {
      const { share_calories: _calories, share_quality: _quality, share_progress: _progress, ...legacy } = payload;
      ({ error } = await this.client.from('nutrition_settings').upsert(legacy));
    }
    if (error) throw asUserFacing(error, 'general');
  }

  async setWater(day: string, waterMl: number): Promise<void> {
    const userId = await this.userId();
    const ml = Math.max(0, Math.min(8000, Math.round(waterMl)));
    const { error } = await this.client.from('nutrition_days').upsert({ user_id: userId, day, water_ml: ml });
    if (error) throw asUserFacing(error, 'general');
    await this.refresh();
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
    const userId = this.snapshot.session?.userId ?? await this.userId();
    return this.once(`body:${recordedOn}:${input.source}`, async () => {
      const previous = this.snapshot.bodyComposition.find((row) => row.recordedOn === recordedOn && row.source === input.source);
      const bodyFatPct = input.bodyFatPct == null ? (previous?.bodyFatPct ?? null) : parseBodyFatPct(input.bodyFatPct);
      const leanMassKg = input.leanMassKg == null ? (previous?.leanMassKg ?? null) : parseLeanMassKg(input.leanMassKg);
      const waistCm = input.waistCm == null ? (previous?.waistCm ?? null) : parseWaistCm(input.waistCm, 'cm');
      if (bodyFatPct == null && leanMassKg == null && waistCm == null) return;
      const next: BodyCompositionReading = {
        id: previous?.id ?? randomId(),
        recordedOn,
        bodyFatPct,
        leanMassKg,
        waistCm,
        source: input.source,
        createdAt: previous?.createdAt ?? new Date().toISOString(),
      };
      const before = this.snapshot.bodyComposition;
      const rest = before.filter((row) => !(row.recordedOn === recordedOn && row.source === input.source));
      this.emit({ ...this.snapshot, bodyComposition: [next, ...rest] });
      const { error } = await this.client.from('body_composition').upsert({
        user_id: userId,
        recorded_on: recordedOn,
        body_fat_pct: bodyFatPct,
        lean_mass_kg: leanMassKg,
        waist_cm: waistCm,
        source: input.source,
      }, { onConflict: 'user_id,recorded_on,source' });
      if (error) {
        this.emit({ ...this.snapshot, bodyComposition: before });
        throw asUserFacing(error, 'general');
      }
    });
  }

  async saveTrainingSchedule(schedule: TrainingSchedule | null): Promise<void> {
    const userId = this.snapshot.session?.userId ?? await this.userId();
    const before = this.snapshot.trainingSchedule;
    const next = schedule ? normaliseTrainingSchedule(schedule) : null;
    if (schedule && !next) throw new UserFacingError('Could not save that training schedule.', 'generic');
    this.emit({ ...this.snapshot, trainingSchedule: next });
    if (!next) {
      const { error } = await this.client.from('training_schedules').delete().eq('user_id', userId);
      if (error) {
        this.emit({ ...this.snapshot, trainingSchedule: before });
        throw asUserFacing(error, 'general');
      }
      return;
    }
    const days = new Set(next.days);
    const { error } = await this.client.from('training_schedules').upsert({
      user_id: userId,
      monday: days.has('Monday'),
      tuesday: days.has('Tuesday'),
      wednesday: days.has('Wednesday'),
      thursday: days.has('Thursday'),
      friday: days.has('Friday'),
      saturday: days.has('Saturday'),
      sunday: days.has('Sunday'),
      typical_minutes: next.typicalMinutes,
      longer_day: next.longerDay,
      longer_minutes: next.longerMinutes,
      walk_day: next.walkDay,
      note: next.note,
      updated_at: new Date().toISOString(),
    });
    if (error) {
      this.emit({ ...this.snapshot, trainingSchedule: before });
      throw asUserFacing(error, 'general');
    }
  }

  async saveHealthPlan(plan: HealthPlan): Promise<void> {
    const userId = this.snapshot.session?.userId ?? await this.userId();
    const before = this.snapshot.healthPlan;
    const next: HealthPlan = {
      ...plan,
      limits: plan.limits.slice(0, 280),
      disclaimer: (plan.disclaimer || PLAN_DISCLAIMER).slice(0, 400),
    };
    this.emit({ ...this.snapshot, healthPlan: next });
    const { error } = await this.client.from('health_plans').upsert({
      user_id: userId,
      focus: next.focus,
      nutrition: next.nutrition,
      fitness: next.fitness,
      wellbeing: next.wellbeing,
      limits: next.limits,
      disclaimer: next.disclaimer,
      updated_at: next.updatedAt,
    });
    if (error) {
      this.emit({ ...this.snapshot, healthPlan: before });
      throw asUserFacing(error, 'general');
    }
  }

  async refreshHealthPlan(limits: string): Promise<void> {
    if (!this.snapshot.profile?.consentAi) {
      throw new UserFacingError('Writing a plan needs the coach consent, because your figures are sent to the model.', 'generic');
    }
    const userId = this.snapshot.session?.userId ?? await this.userId();
    let invoked: { status: number; data: unknown };
    try {
      invoked = await this.callEdge('health-plan', { limits: limits.trim().slice(0, 280) }, { ai: true });
    } catch (error) {
      if (error instanceof UserFacingError) throw error;
      throw this.aiFailure('plan', 'health-plan', error);
    }
    if (invoked.status === 401 || invoked.status >= 500) {
      throw this.aiFailure('plan', 'health-plan', new Error('Health Plan did not answer.'), invoked.status);
    }
    const data = invoked.data as { ok?: boolean; code?: string; message?: string; plan?: unknown } | null;
    if (data?.code === 'consent') {
      throw new UserFacingError(
        data.message || 'Writing a plan needs the coach consent, because your figures are sent to the model.',
        'generic',
      );
    }
    const plan = healthPlanFromStored(data?.plan);
    if (data?.ok !== true || !plan) {
      throw new UserFacingError(PLAN_UNREACHABLE, 'generic');
    }
    const { error } = await this.client.from('health_plans').upsert({
      user_id: userId,
      focus: plan.focus,
      nutrition: plan.nutrition,
      fitness: plan.fitness,
      wellbeing: plan.wellbeing,
      limits: plan.limits,
      disclaimer: plan.disclaimer.slice(0, 400),
      updated_at: plan.updatedAt,
    });
    this.emit({ ...this.snapshot, healthPlan: plan });
    if (error) {
      const detail = typeof error.message === 'string' && error.message.trim()
        ? error.message
        : 'health plan upsert failed';
      await this.logClientError('health-plan', detail, clientAppBuild({
        buildNumber: Constants.expoConfig?.ios?.buildNumber,
        version: Constants.expoConfig?.version,
      }));
      throw new UserFacingError(PLAN_NOT_SAVED, 'generic');
    }
  }

  async sharedNutrition(userId: string) {
    const { data, error } = await this.client.rpc('shared_nutrition', { target: userId });
    if (error || data == null) return null;
    const parsed = parseSharedNutrition(data);
    if (!parsed?.mealPhotos?.length) return parsed;
    const paths = parsed.mealPhotos.map((photo) => `${userId}/${photo.id}.jpg`);
    try {
      const signed = await this.client.storage.from(FOOD_BUCKET).createSignedUrls(paths, 3600);
      if (signed.error || !signed.data) return { ...parsed, mealPhotos: [] };
      const byPath = new Map<string, string>();
      for (const item of signed.data) {
        if (item.path && item.signedUrl) byPath.set(item.path, item.signedUrl);
      }
      return {
        ...parsed,
        mealPhotos: parsed.mealPhotos.flatMap((photo) => {
          const url = byPath.get(`${userId}/${photo.id}.jpg`);
          return url ? [{ ...photo, url }] : [];
        }),
      };
    } catch {
      return { ...parsed, mealPhotos: [] };
    }
  }

  async sharedHealthPlan(userId: string) {
    const { data, error } = await this.client.rpc('shared_health_plan', { target: userId });
    if (error || data == null) return null;
    return parseSharedHealthPlan(data);
  }

  async listBuddies(): Promise<BuddyList> {
    const { data, error } = await this.client.rpc('list_buddies');
    if (error) throw error;
    return parseBuddyList(data);
  }

  async createBuddyInvite(buddyId: string, scope: BuddyScope): Promise<void> {
    const { data, error } = await this.client.rpc('create_buddy_invite', { buddy: buddyId, scope });
    if (error) throw error;
    const inviteId = typeof data === 'string' ? data : '';
    if (inviteId) {
      void this.client.functions.invoke('notify-buddy-invite', { body: { inviteId } }).catch(() => undefined);
    }
  }

  async createBuddyLink(scope: BuddyScope): Promise<BuddyLinkPass> {
    const { data, error } = await this.client.rpc('create_buddy_link', { scope });
    if (error) throw error;
    const pass = parseBuddyLinkPass(data);
    if (!pass) throw new UserFacingError('Could not create that link.', 'generic');
    return pass;
  }

  async acceptBuddyInvite(inviteId: string): Promise<void> {
    const { error } = await this.client.rpc('accept_buddy_invite', { invite: inviteId });
    if (error) throw error;
  }

  async declineBuddyInvite(inviteId: string): Promise<void> {
    const { error } = await this.client.rpc('decline_buddy_invite', { invite: inviteId });
    if (error) throw error;
  }

  async previewBuddyLink(secret: string): Promise<{ name: string; scope: BuddyScope }> {
    const { data, error } = await this.client.rpc('preview_buddy_link', { secret });
    if (error) throw error;
    const preview = parseBuddyPreview(data);
    if (!preview) throw new UserFacingError('That invite is not available.', 'generic');
    return preview;
  }

  async acceptBuddyLink(secret: string): Promise<void> {
    const { error } = await this.client.rpc('accept_buddy_link', { secret });
    if (error) throw error;
  }

  async revokeBuddy(inviteId: string): Promise<void> {
    const { error } = await this.client.rpc('revoke_buddy', { invite: inviteId });
    if (error) throw error;
  }

  async revokeBuddyLink(linkId: string): Promise<void> {
    const { error } = await this.client.rpc('revoke_buddy_link', { link: linkId });
    if (error) throw error;
  }

  async updateBuddyScope(inviteId: string, scope: BuddyScope): Promise<void> {
    const { error } = await this.client.rpc('update_buddy_scope', { invite: inviteId, scope });
    if (error) throw error;
  }

  async sharedBuddyData(ownerId: string): Promise<BuddyShareView | null> {
    const { data, error } = await this.client.rpc('shared_buddy_data', { owner: ownerId });
    if (error || data == null) return null;
    return parseBuddyShare(data);
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
    const profile = this.snapshot.profile;
    if (!profile) throw new Error('Sign in first.');
    const next = canonicalConsent(input);
    const lane = this.saveLane('consent', next, (value) => this.persistConsents(value));
    if (!lane.dirty) {
      this.consentBase = {
        communityVisible: profile.communityVisible,
        consentHealth: profile.consentHealth,
        consentAi: profile.consentAi,
      };
      this.consentExisting = this.snapshot.consents;
      lane.seen(canonicalConsent(this.consentBase));
    }
    const rows = consentRows(CONSENT_VERSION, next);
    const replaced = this.snapshot.consents.map((row) => {
      const match = rows.find((item) => item.kind === row.kind && item.version === row.version);
      return match ? { ...row, granted: match.granted } : row;
    });
    const added = missingConsentRows(replaced, rows);
    this.emit({
      ...this.snapshot,
      profile: {
        ...profile,
        communityVisible: next.communityVisible,
        consentHealth: next.consentHealth,
        consentAi: next.consentAi,
      },
      consents: [...replaced, ...added],
    });
    try {
      await lane.choose(next);
      if (!lane.dirty && sameJson(lane.value, next) && this.profileBase) {
        this.profileBase = {
          ...this.profileBase,
          communityVisible: next.communityVisible,
          consentHealth: next.consentHealth,
          consentAi: next.consentAi,
        };
      }
    } catch (error) {
      if (!lane.dirty && this.consentBase) {
        const current = this.snapshot.profile;
        this.emit({
          ...this.snapshot,
          profile: current
            ? {
              ...current,
              communityVisible: this.consentBase.communityVisible,
              consentHealth: this.consentBase.consentHealth,
              consentAi: this.consentBase.consentAi,
            }
            : current,
          consents: this.consentExisting ?? this.snapshot.consents,
        });
        if (this.profileBase) {
          this.profileBase = {
            ...this.profileBase,
            communityVisible: this.consentBase.communityVisible,
            consentHealth: this.consentBase.consentHealth,
            consentAi: this.consentBase.consentAi,
          };
        }
      }
      throw asUserFacing(error, 'general');
    }
  }

  private saveLane<T>(
    key: string,
    initial: T,
    write: (value: T) => Promise<void>,
    equals?: (left: T, right: T) => boolean,
  ): CoalescedSave<T> {
    const found = this.saves.get(key) as CoalescedSave<T> | undefined;
    if (found) return found;
    const lane = new CoalescedSave(initial, write, equals ?? sameJson);
    this.saves.set(key, lane as CoalescedSave<unknown>);
    return lane;
  }

  private profileLane(): CoalescedSave<ProfileWrite> {
    return this.saveLane('profile', { column: {} }, (value) => this.persistProfile(value));
  }

  private async persistProfile(value: ProfileWrite): Promise<void> {
    const userId = this.snapshot.session?.userId ?? await this.userId();
    if (Object.keys(value.column).length) {
      const { error } = await this.client.from('profiles').update(value.column).eq('id', userId);
      if (error) throw error;
    }
    if (value.interestIds) await this.replaceInterests(userId, value.interestIds);
    if (this.profileBase) this.profileBase = profileWithColumn(this.profileBase, value.column, value.interestIds);
  }

  private async persistSharing(next: ProfileSharing): Promise<void> {
    const userId = this.snapshot.session?.userId ?? await this.userId();
    const { error } = await this.client.from('profile_sharing').upsert(
      { user_id: userId, settings: next, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
    if (error) throw error;
  }

  private async persistConsents(input: ConsentInput): Promise<void> {
    const userId = this.snapshot.session?.userId ?? await this.userId();
    const { error } = await this.client.from('profiles').update({
      community_visible: input.communityVisible,
      consent_health: input.consentHealth,
      consent_ai: input.consentAi,
    }).eq('id', userId);
    if (error) throw error;
    await this.insertConsents(userId, input, this.consentExisting ?? []);
  }

  private async persistProgress(id: string, patch: Record<string, unknown>): Promise<void> {
    const userId = this.snapshot.session?.userId ?? await this.userId();
    const { error } = await this.client.from('progress_photos').update(patch).eq('id', id).eq('user_id', userId);
    if (error) throw error;
  }

  private async persistVisibility(id: string, visibility: ProgressVisibility): Promise<void> {
    const userId = this.snapshot.session?.userId ?? await this.userId();
    const { error } = await this.client.from('progress_photos').update({ visibility }).eq('id', id).eq('user_id', userId);
    if (error) throw error;
  }

  private async persistVision(id: string, column: Record<string, unknown>): Promise<void> {
    const userId = this.snapshot.session?.userId ?? await this.userId();
    const { error } = await this.client.from('vision_board_items').update(column).eq('id', id).eq('user_id', userId);
    if (error) throw error;
  }

  /** A loaded value replaces a settled choice. An unsaved tap stays on screen. */
  private prefer<T>(key: string, server: T): T {
    const lane = this.saves.get(key) as CoalescedSave<T> | undefined;
    if (!lane) return server;
    return lane.seen(server);
  }

  private withPendingProfile(profile: Profile | null): Profile | null {
    if (!profile) return null;
    const lane = this.saves.get('profile') as CoalescedSave<ProfileWrite> | undefined;
    const next = lane?.dirty ? profileWithColumn(profile, lane.value.column, lane.value.interestIds) : profile;
    if (!lane?.dirty) this.profileBase = profile;
    return this.profileAfterConsent(next);
  }

  private profileAfterConsent(profile: Profile): Profile {
    const lane = this.saves.get('consent') as CoalescedSave<ConsentInput> | undefined;
    if (!lane?.dirty) return profile;
    return {
      ...profile,
      communityVisible: lane.value.communityVisible,
      consentHealth: lane.value.consentHealth,
      consentAi: lane.value.consentAi,
    };
  }

  private overlayConsentRows(rows: StoredConsent[]): StoredConsent[] {
    const lane = this.saves.get('consent') as CoalescedSave<ConsentInput> | undefined;
    if (!lane?.dirty) return rows;
    const next = consentRows(CONSENT_VERSION, lane.value);
    const replaced = rows.map((row) => {
      const match = next.find((item) => item.kind === row.kind && item.version === row.version);
      return match ? { ...row, granted: match.granted } : row;
    });
    return [...replaced, ...missingConsentRows(replaced, next)];
  }

  private overlayVision(items: VisionItem[]): VisionItem[] {
    return items.map((item) => {
      const lane = this.saves.get(`vision:${item.id}`) as CoalescedSave<Record<string, unknown>> | undefined;
      if (!lane) return item;
      if (!lane.dirty) {
        lane.seen(stableRecord({ caption: item.caption, area: item.area, size: item.size }));
        return item;
      }
      return visionWithColumn(item, lane.value);
    });
  }

  private overlayProgress(photos: ProgressPhoto[]): ProgressPhoto[] {
    return photos.map((photo) => {
      const details = this.saves.get(`progress:${photo.id}`) as CoalescedSave<Record<string, unknown>> | undefined;
      const visibility = this.saves.get(`visibility:${photo.id}`) as CoalescedSave<ProgressVisibility> | undefined;
      let next = photo;
      if (details?.dirty) next = progressWithColumn(next, details.value);
      else if (details) details.seen(stableRecord(progressColumn(next)));
      if (visibility?.dirty) next = { ...next, visibility: visibility.value };
      else if (visibility) visibility.seen(next.visibility);
      return next;
    });
  }

  private settleInterestLanes(serverIds: readonly string[]) {
    for (const [key, lane] of this.saves) {
      if (!key.startsWith('interest:')) continue;
      const typed = lane as CoalescedSave<boolean>;
      if (typed.dirty) continue;
      typed.seen(serverIds.includes(key.slice('interest:'.length)));
    }
  }

  private async insertConsents(userId: string, input: ConsentInput, existing: readonly { kind: string; version: string }[] = this.snapshot.consents) {
    const next = missingConsentRows(existing, consentRows(CONSENT_VERSION, input));
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
    messageNotifications: row.message_notifications == null ? true : Boolean(row.message_notifications),
    notifySenderName: Boolean(row.notify_sender_name),
    movementReminder: Boolean(row.movement_reminder),
    movementReminderMinute: row.movement_reminder_minute == null ? null : Number(row.movement_reminder_minute),
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
    mood: moodOnTen(row.mood, row.mood_10) as CheckIn['mood'],
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

function mapDirectMessage(row: Row): DirectMessage {
  return {
    id: String(row.id),
    connectionId: String(row.connection_id),
    senderId: String(row.sender_id),
    body: String(row.body),
    createdAt: String(row.created_at),
  };
}

/** Keeps a message Realtime already showed when a slower fetch has not caught up. */
function mergeFetchedMessages(
  current: readonly DirectMessage[],
  fetched: readonly DirectMessage[],
  allowed: ReadonlySet<string>,
): DirectMessage[] {
  const fetchedIds = new Set(fetched.map((message) => message.id));
  const kept = current.filter((message) => allowed.has(message.connectionId) && !fetchedIds.has(message.id));
  return [...fetched, ...kept].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
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

function mapFoodLog(row: Row, userId: string): FoodLog | null {
  const meal = String(row.meal ?? '');
  if (!isMealSlot(meal)) return null;
  const source = row.source === 'photo' || row.source === 'text' || row.source === 'manual' ? row.source : 'manual';
  const eaten = String(row.eaten_on ?? '').slice(0, 10);
  const items = Array.isArray(row.items) ? row.items.map(foodItemFromUnknown).filter((item): item is FoodItem => item != null) : [];
  return {
    id: String(row.id),
    userId: String(row.user_id ?? userId),
    eatenOn: eaten,
    meal,
    source,
    note: String(row.note ?? ''),
    items,
    estimated: row.estimated === true,
    eatenAt: typeof row.eaten_at === 'string' && row.eaten_at ? row.eaten_at : null,
    portion: parsePortion(row.portion) ?? 1,
    createdAt: String(row.created_at ?? ''),
    previewUrl: null,
  };
}

function foodLogFromUpdate(current: FoodLog, patch: FoodLogUpdate): FoodLog {
  if (!isMealSlot(patch.meal) || !/^\d{4}-\d{2}-\d{2}$/.test(patch.eatenOn)) {
    throw new UserFacingError('That meal could not be saved.', 'generic');
  }
  const portion = parsePortion(patch.portion);
  if (portion == null) throw new UserFacingError('Portion sits between 0.25 and 12.', 'generic');
  const items = patch.items.map(foodItemFromUnknown).filter((item): item is FoodItem => item != null);
  if (!items.length) throw new UserFacingError('Add at least one food.', 'generic');
  const eatenAt = patch.eatenAt && !Number.isNaN(new Date(patch.eatenAt).getTime()) ? new Date(patch.eatenAt).toISOString() : null;
  return {
    ...current,
    eatenOn: patch.eatenOn,
    eatenAt,
    meal: patch.meal,
    note: patch.note.slice(0, 500),
    items,
    estimated: patch.estimated,
    portion,
  };
}

function nutritionNumber(value: unknown, min: number, max: number): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : null;
  if (parsed == null || !Number.isFinite(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}

function nutritionFromRow(row: Row | null): NutritionSettings {
  const base = defaultNutritionSettings();
  if (!row) return base;
  const target = nutritionNumber(row.kcal_target, 800, 6000);
  const age = nutritionNumber(row.goal_age, 18, 100);
  const goal = typeof row.goal === 'string' && isNutritionGoal(row.goal) ? row.goal : null;
  const sex = typeof row.goal_sex === 'string' && isNutritionSex(row.goal_sex) ? row.goal_sex : null;
  return {
    ...base,
    kcalTarget: target == null ? null : Math.round(target),
    hideCalories: row.hide_calories === true,
    shareFoodDiary: row.share_food_diary === true,
    shareCalories: row.share_calories === true,
    shareQuality: row.share_quality === true,
    shareProgress: row.share_progress === true,
    goal,
    goalAge: age == null ? null : Math.round(age),
    goalSex: sex,
    proteinTarget: nutritionNumber(row.protein_target_g, 0, 700),
    carbTarget: nutritionNumber(row.carb_target_g, 0, 1000),
    fatTarget: nutritionNumber(row.fat_target_g, 0, 400),
    goalPhase: typeof row.goal_phase === 'string' && isBuilderPhase(row.goal_phase) ? row.goal_phase : null,
    weightClassKg: nutritionNumber(row.weight_class_kg, 40, 200),
    activityEnergyKcal: nutritionNumber(row.activity_energy_kcal, 0, 2500),
    shareGoal: row.share_goal === true,
    wagonOn: row.wagon_on === true,
    wagonNote: String(row.wagon_note ?? '').slice(0, 200),
    wagonVisible: row.wagon_visible === true,
    build: typeof row.build === 'string' && isBodyBuild(row.build) ? row.build : null,
    workoutBuckets: parseWorkoutBuckets(row.workout_buckets),
    updatedAt: typeof row.updated_at === 'string' && row.updated_at ? row.updated_at : null,
  };
}

function mapBodyComposition(row: Row): BodyCompositionReading | null {
  const source = typeof row.source === 'string' && isBodyCompositionSource(row.source) ? row.source : null;
  const recordedOn = String(row.recorded_on ?? '').slice(0, 10);
  if (!source || !recordedOn) return null;
  const bodyFatPct = parseBodyFatPct(nutritionNumber(row.body_fat_pct, 0, 100));
  const leanMassKg = parseLeanMassKg(nutritionNumber(row.lean_mass_kg, 0, 300));
  const waistCm = parseWaistCm(nutritionNumber(row.waist_cm, 0, 300), 'cm');
  if (bodyFatPct == null && leanMassKg == null && waistCm == null) return null;
  return {
    id: String(row.id),
    recordedOn,
    bodyFatPct,
    leanMassKg,
    waistCm,
    source,
    createdAt: String(row.created_at ?? ''),
  };
}

function mapWaterDay(row: Row): NutritionDay {
  return { day: String(row.day ?? '').slice(0, 10), waterMl: Number(row.water_ml ?? 0) };
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

function canonicalNutrition(settings: NutritionSettings): NutritionSettings {
  return {
    ...defaultNutritionSettings(),
    ...settings,
    wagonNote: settings.wagonNote.slice(0, 200),
    workoutBuckets: parseWorkoutBuckets(settings.workoutBuckets),
  };
}

function canonicalConsent(input: ConsentInput): ConsentInput {
  return {
    communityVisible: input.communityVisible,
    consentHealth: input.consentHealth,
    consentAi: input.consentAi,
  };
}

function stableRecord(record: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) next[key] = record[key];
  return next;
}

function progressColumn(photo: ProgressPhoto): Record<string, unknown> {
  return {
    caption: photo.caption,
    month_index: photo.monthIndex,
    note: photo.note,
    taken_on: photo.takenOn,
  };
}

function progressWithColumn(photo: ProgressPhoto, column: Record<string, unknown>): ProgressPhoto {
  return {
    ...photo,
    caption: 'caption' in column ? String(column.caption ?? '') : photo.caption,
    monthIndex: 'month_index' in column ? Number(column.month_index ?? photo.monthIndex) : photo.monthIndex,
    note: 'note' in column ? String(column.note ?? '') : photo.note,
    takenOn: 'taken_on' in column ? String(column.taken_on ?? photo.takenOn) : photo.takenOn,
  };
}

function visionWithColumn(item: VisionItem, column: Record<string, unknown>): VisionItem {
  return {
    ...item,
    caption: 'caption' in column ? String(column.caption ?? '') : item.caption,
    area: 'area' in column ? (column.area as VisionItem['area']) : item.area,
    size: 'size' in column ? (column.size as VisionItem['size']) : item.size,
  };
}
