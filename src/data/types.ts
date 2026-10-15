import type { StoredConsent } from '@/domain/consents';
import type { BodyCompositionReading, BodyCompositionSource, FoodItem, FoodLog, MealSlot, MealSource, NutritionDay, NutritionSettings, SharedNutritionView } from '@/domain/nutrition';
import type { ProfileSharing, PublicProfileView } from '@/domain/profileSharing';
import type { GratitudeCategory, GratitudeEntry, GratitudeReflect } from '@/domain/gratitude';
import type { HealthPlan, SharedHealthPlan } from '@/domain/healthPlan';
import type { Stage } from '@/domain/stage';
import type { ThumosMode } from '@/domain/thumos';
import type { VisionArea, VisionItem, VisionSize } from '@/domain/visionBoard';

export type TextScale = 'default' | 'large' | 'extra';
export type ThemePreference = 'system' | 'light' | 'dark';
export type Mood = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export type HealthKind =
  | 'steps'
  | 'sleep_hours'
  | 'resting_heart_rate'
  | 'hrv_sdnn'
  | 'workout_minutes'
  | 'weight_kg';

export type ResourceCategory = 'quit_lit' | 'groups' | 'helplines' | 'health';
export type Verification = 'verified' | 'partial' | 'unverified';

export type Profile = {
  id: string;
  email: string;
  displayName: string;
  sobrietyStartedAt: string | null;
  weeklySpendGbp: number | null;
  weeklyUnits: number | null;
  town: string | null;
  ageConfirmed18: boolean;
  communityVisible: boolean;
  consentHealth: boolean;
  consentAi: boolean;
  onboardingComplete: boolean;
  isModerator: boolean;
  textScale: TextScale;
  themePreference: ThemePreference;
  interestIds: string[];
  stage: Stage;
  plannedQuitAt: string | null;
  weeklyUnitsGoal: number | null;
  drinkFreeDaysGoal: number | null;
  drinkFreeOn: string[];
  /** Centimetres, used only to calculate BMI. Never shown on the public profile. */
  heightCm: number | null;
  /** Private words for the vision board. Photos are stored separately and are not on the public profile. */
  visionStatement: string;
  /** The day the board began. The target is five years after this, and it does not move. */
  visionStartedOn: string | null;
  /** Id from the bundled Stoic catalogue. Null when nothing is pinned. */
  pinnedQuoteId: string | null;
  /** Public words under the name. Empty when unset. Sharing starts on. */
  bio: string;
  /** The Notifications switch. The same column the Edit Profile turn-off control writes. */
  messageNotifications: boolean;
  /** When on, a private-message alert names the sender. The message text is never included. */
  notifySenderName: boolean;
  /** Gentle movement nudge. Off until the person turns it on. */
  movementReminder: boolean;
  /** Minutes after midnight, local to the phone that schedules it. Null when unset. */
  movementReminderMinute: number | null;
  createdAt: string;
};

export type ProgressVisibility = 'private' | 'community';

export type ProgressPhoto = {
  id: string;
  userId: string;
  takenOn: string;
  monthIndex: number;
  /** Private. Never copied onto the public profile. */
  note: string;
  /** What other people see under a shared photo. */
  caption: string;
  storagePath: string;
  createdAt: string;
  visibility: ProgressVisibility;
  /** Short-lived signed URL, or a demo data URL. Never a public object URL. */
  previewUrl: string | null;
};

export type NewProgressPhoto = {
  bytes: Uint8Array;
  takenOn: string;
  startingPoint: boolean;
  note: string;
};

export type ProfilePhotoRole = 'avatar' | 'gallery';

export type ProfilePhoto = {
  id: string;
  userId: string;
  role: ProfilePhotoRole;
  caption: string;
  position: number;
  storagePath: string;
  createdAt: string;
  /** Short-lived signed URL, or a demo data URL. Never a public object URL. */
  previewUrl: string | null;
};

export type NewProfilePhoto = {
  bytes: Uint8Array;
  role: ProfilePhotoRole;
};

export type Reason = { id: string; body: string; sortOrder: number };
export type CheckIn = {
  id: string;
  mood: Mood;
  sleepHours: number;
  craving: number;
  note: string;
  createdAt: string;
};
export type Relapse = {
  id: string;
  occurredAt: string;
  previousStartedAt: string;
  daysKept: number;
  note: string;
};
export type HealthSample = {
  id: string;
  kind: HealthKind;
  value: number;
  unit: string;
  recordedOn: string;
  source: 'manual' | 'healthkit';
};
export type Interest = { id: string; slug: string; label: string; custom: boolean };
export type Resource = {
  id: string;
  category: ResourceCategory;
  title: string;
  detail: string;
  url: string | null;
  phone: string | null;
  verification: Verification;
  verificationNote: string;
};
export type DirectoryCard = {
  id: string;
  displayName: string;
  town: string | null;
  interestIds: string[];
  sharedInterestIds: string[];
  /** Short-lived signed URL for the profile picture. Null falls back to initials. */
  avatarUrl: string | null;
  /** Profile picture id, so a screen can ask for a fresh signed URL when it opens. */
  avatarPhotoId?: string | null;
};
export type Connection = {
  id: string;
  requesterId: string;
  addresseeId: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: string;
};
export type DirectMessage = {
  id: string;
  connectionId: string;
  senderId: string;
  body: string;
  createdAt: string;
  /** Missing once the server has the row. `sending` is the optimistic copy. */
  delivery?: 'sending' | 'failed';
};
export type Report = {
  id: string;
  reporterId: string;
  reportedUserId: string | null;
  reportedName: string;
  reason: string;
  details: string;
  status: 'open' | 'reviewed';
  createdAt: string;
};
export type ThumosMessage = {
  id: string;
  role: 'user' | 'assistant' | 'guide' | 'offline';
  content: string;
  mode: ThumosMode | 'opening';
  createdAt: string;
};
export type SavedQuote = { quoteId: string; createdAt: string };

export type Session = { userId: string; email: string };

export type AppSnapshot = {
  ready: boolean;
  mode: 'demo' | 'supabase';
  error: string | null;
  session: Session | null;
  profile: Profile | null;
  reasons: Reason[];
  checkIns: CheckIn[];
  relapses: Relapse[];
  health: HealthSample[];
  interests: Interest[];
  resources: Resource[];
  directory: DirectoryCard[];
  connections: Connection[];
  messages: DirectMessage[];
  reports: Report[];
  thumos: ThumosMessage[];
  consents: StoredConsent[];
  progressPhotos: ProgressPhoto[];
  /** Other people's photos that they have chosen to share. Private photos are never included. */
  communityPhotos: ProgressPhoto[];
  /** This person's profile picture and gallery. Visible while Community is on. */
  profilePhotos: ProfilePhoto[];
  /** Private diary. Never included in the community directory. */
  gratitude: GratitudeEntry[];
  /** Private vision board. Never included in the community directory. */
  visionItems: VisionItem[];
  /** Which sections this person has chosen to show. Name and interests stay on. */
  sharing: ProfileSharing;
  /** Private favourite Stoic lines. Other people cannot read this list. */
  savedQuotes: SavedQuote[];
  /** Private food log. Other people see today's meals only when the diary is shared. */
  foodLogs: FoodLog[];
  nutrition: NutritionSettings;
  waterDays: NutritionDay[];
  /** Private body-fat, lean-mass, and waist history. Shared only as a progress line when that switch is on. */
  bodyComposition: BodyCompositionReading[];
  /** Private Thumos plan. Never included in the community directory. */
  healthPlan: HealthPlan | null;
};

export type NewGratitudeEntry = {
  body: string;
  category: GratitudeCategory | null;
  isFavourite: boolean;
  entryDate: string;
};

export type OnboardingInput = {
  displayName: string;
  stage: Stage;
  sobrietyStartedAt: string | null;
  plannedQuitAt: string | null;
  weeklyUnitsGoal: number | null;
  drinkFreeDaysGoal: number | null;
  reasons: string[];
  weeklySpendGbp: number;
  weeklyUnits: number;
  interestIds: string[];
  town: string;
  communityVisible: boolean;
  consentHealth: boolean;
  consentAi: boolean;
};

export type ConsentInput = {
  communityVisible: boolean;
  consentHealth: boolean;
  consentAi: boolean;
};

export type ProfilePatch = Partial<
  Pick<
    Profile,
    | 'displayName'
    | 'town'
    | 'weeklySpendGbp'
    | 'weeklyUnits'
    | 'communityVisible'
    | 'consentHealth'
    | 'consentAi'
    | 'textScale'
    | 'themePreference'
    | 'interestIds'
    | 'stage'
    | 'sobrietyStartedAt'
    | 'plannedQuitAt'
    | 'weeklyUnitsGoal'
    | 'drinkFreeDaysGoal'
    | 'drinkFreeOn'
    | 'heightCm'
    | 'visionStatement'
    | 'visionStartedOn'
    | 'pinnedQuoteId'
    | 'bio'
    | 'messageNotifications'
    | 'notifySenderName'
    | 'movementReminder'
    | 'movementReminderMinute'
  >
>;

export type NewCheckIn = {
  /** Stable for one save, including a retry, so the diary row is not inserted twice. */
  id: string;
  mood: Mood;
  sleepHours: number;
  craving: number;
  note: string;
  /** Blank saves the check-in and creates no diary row. */
  gratitude: string;
};

export type NewHealthSample = {
  kind: HealthKind;
  value: number;
  unit: string;
  recordedOn: string;
  source: 'manual' | 'healthkit';
};

export type NewReport = {
  reportedUserId: string;
  reason: string;
  details: string;
  /** Stable for one send, including a retry, so the report row is not inserted twice. */
  clientId?: string;
};

export type VoiceHistoryTurn = { role: 'user' | 'assistant'; content: string };

export type VoiceMint =
  | {
      ok: true;
      token: string;
      expiresAt: number;
      instructions: string | null;
      crisisInstructions: string | null;
      history: VoiceHistoryTurn[];
      greeting: string | null;
      mode: ThumosMode | null;
    }
  | { ok: false; code: string; message: string };

export type VoiceTurnInput = {
  user: string;
  assistant: string;
  mode: ThumosMode;
};

export type NewFoodLog = {
  /** Stable for one save, including a retry, so the meal is not inserted twice. */
  id: string;
  eatenOn: string;
  meal: MealSlot;
  source: MealSource;
  note: string;
  items: FoodItem[];
  estimated: boolean;
  photoBase64?: string | null;
};

/** Replaces one saved meal. The id stays, so the day is not given a second row. */
export type FoodLogUpdate = {
  eatenOn: string;
  eatenAt: string | null;
  meal: MealSlot;
  note: string;
  items: FoodItem[];
  estimated: boolean;
  portion: number;
};

export type MealEstimate = { items: FoodItem[]; source: 'model' | 'local' };

export interface Repository {
  subscribe(listener: () => void): () => void;
  getSnapshot(): AppSnapshot;
  reload(): Promise<void>;
  /** Messages only. Used while a chat is open and when the app returns. */
  reloadMessages(): Promise<void>;
  /**
   * New owner signed URLs for progress, profile, gratitude, and vision photos.
   * Patches those links only, so a chip save in flight is left as it is.
   */
  resignOwnerPhotos(): Promise<void>;
  /** Re-signs those owner URLs when the last sign is more than about eight minutes old. */
  refreshOwnerPhotosIfStale(): Promise<void>;
  /**
   * Inserts for one chat. Realtime applies the select policy, and the filter
   * limits the stream to this connection. Call the returned function to stop.
   */
  watchChat(connectionId: string): () => void;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string, displayName: string): Promise<void>;
  signInWithApple(): Promise<void>;
  requestPasswordReset(email: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
  completeAuthRedirect(url: string): Promise<void>;
  signOut(): Promise<void>;
  completeOnboarding(input: OnboardingInput): Promise<void>;
  saveConsents(input: ConsentInput): Promise<void>;
  updateProfile(patch: ProfilePatch): Promise<void>;
  setReasons(bodies: string[]): Promise<void>;
  addCheckIn(input: NewCheckIn): Promise<void>;
  recordRelapse(note: string): Promise<void>;
  saveHealth(samples: NewHealthSample[]): Promise<void>;
  setInterestSelected(interestId: string, selected: boolean): Promise<void>;
  addCustomInterest(label: string): Promise<void>;
  requestConnection(userId: string, clientId?: string): Promise<void>;
  respondConnection(connectionId: string, accept: boolean): Promise<void>;
  sendDirectMessage(connectionId: string, body: string, clientId?: string): Promise<void>;
  /** Stores this phone's Expo push token for the signed-in person. */
  saveDeviceToken(token: string, platform: 'ios' | 'android'): Promise<void>;
  blockUser(userId: string, clientId?: string): Promise<void>;
  unblockUser(userId: string): Promise<void>;
  reportUser(input: NewReport): Promise<void>;
  reviewReport(id: string): Promise<void>;
  ensureThumosGuide(kind: 'opening' | 'craving'): Promise<void>;
  sendThumos(content: string, mode: ThumosMode, onDelta?: (text: string) => void, onState?: (state: 'sending' | 'waiting' | 'retrying') => void): Promise<void>;
  mintVoiceToken(mode?: ThumosMode): Promise<VoiceMint>;
  saveVoiceTurn(input: VoiceTurnInput): Promise<void>;
  addProgressPhoto(input: NewProgressPhoto): Promise<void>;
  updateProgressPhoto(id: string, input: { takenOn?: string; startingPoint?: boolean; note?: string; caption?: string }): Promise<void>;
  deleteProgressPhoto(id: string): Promise<void>;
  addProfilePhoto(input: NewProfilePhoto): Promise<void>;
  updateProfilePhoto(id: string, input: { caption: string }): Promise<void>;
  moveProfilePhoto(id: string, direction: 'up' | 'down'): Promise<void>;
  deleteProfilePhoto(id: string): Promise<void>;
  /** Signed URLs for profile photos the caller is allowed to see. */
  profilePhotoUrls(ids: string[]): Promise<{ id: string; url: string }[]>;
  setProgressPhotoVisibility(ids: string[], visibility: ProgressVisibility): Promise<void>;
  setProfileSharing(sharing: ProfileSharing): Promise<void>;
  saveQuote(quoteId: string): Promise<void>;
  unsaveQuote(quoteId: string): Promise<void>;
  /** Pass null to unpin. Only a catalogue id can be pinned. */
  pinQuote(quoteId: string | null): Promise<void>;
  /** Shared fields only. Null when the profile is hidden or blocked. */
  publicProfile(userId: string): Promise<PublicProfileView | null>;
  openPrivateChat(userId: string): Promise<{ status: 'open'; connectionId: string } | { status: 'requested'; connectionId: string | null }>;
  /** Returns the saved line id, so a photo can be stored on it straight away. */
  addGratitudeEntry(input: NewGratitudeEntry): Promise<string>;
  updateGratitudeEntry(id: string, input: NewGratitudeEntry): Promise<void>;
  deleteGratitudeEntry(id: string): Promise<void>;
  addGratitudePhoto(entryId: string, bytes: Uint8Array): Promise<void>;
  updateGratitudePhoto(id: string, input: { caption: string }): Promise<void>;
  deleteGratitudePhoto(id: string): Promise<void>;
  reflectOnGratitude(body: string, category: string | null): Promise<GratitudeReflect>;
  saveVisionStatement(statement: string): Promise<void>;
  addVisionItem(bytes: Uint8Array): Promise<void>;
  updateVisionItem(id: string, patch: { caption?: string; area?: VisionArea | null; size?: VisionSize }): Promise<void>;
  moveVisionItem(id: string, direction: 'up' | 'down'): Promise<void>;
  deleteVisionItem(id: string): Promise<void>;
  exportData(): Promise<Record<string, unknown>>;
  deleteAccount(): Promise<void>;
  /** Reads a photo or a sentence. The person confirms the items before they are saved. */
  estimateMeal(input: { text?: string; imageBase64?: string }): Promise<MealEstimate>;
  saveFoodLog(input: NewFoodLog): Promise<void>;
  updateFoodLog(id: string, patch: FoodLogUpdate): Promise<void>;
  deleteFoodLog(id: string): Promise<void>;
  setNutritionSettings(settings: NutritionSettings): Promise<void>;
  setWater(day: string, waterMl: number): Promise<void>;
  /** Saves one day and source. A blank figure keeps the figure already stored for that day. */
  saveBodyComposition(input: {
    recordedOn: string;
    bodyFatPct: number | null;
    leanMassKg: number | null;
    waistCm: number | null;
    source: BodyCompositionSource;
  }): Promise<void>;
  /** Shared nutrition items. Each field is null unless that switch is on. Null when the profile is hidden or blocked. */
  sharedNutrition(userId: string): Promise<SharedNutritionView | null>;
  /** Headline, focus, and tick count. Null when the switch is off, the profile is hidden, or the viewer is outside Community. */
  sharedHealthPlan(userId: string): Promise<SharedHealthPlan | null>;
  /** Invites this person sent, invites waiting for them, and unused links. */
  listBuddies(): Promise<import('@/domain/buddies').BuddyList>;
  /** In-app invite. The scope is what the buddy will be able to see. */
  createBuddyInvite(buddyId: string, scope: import('@/domain/buddies').BuddyScope): Promise<void>;
  /** Single-use link. The token and code are returned once. */
  createBuddyLink(scope: import('@/domain/buddies').BuddyScope): Promise<import('@/domain/buddies').BuddyLinkPass>;
  acceptBuddyInvite(inviteId: string): Promise<void>;
  declineBuddyInvite(inviteId: string): Promise<void>;
  /** Scope summary for a link, before it is used. */
  previewBuddyLink(secret: string): Promise<{ name: string; scope: import('@/domain/buddies').BuddyScope }>;
  acceptBuddyLink(secret: string): Promise<void>;
  revokeBuddy(inviteId: string): Promise<void>;
  revokeBuddyLink(linkId: string): Promise<void>;
  updateBuddyScope(inviteId: string, scope: import('@/domain/buddies').BuddyScope): Promise<void>;
  /** Sections the caller is allowed to see. Null when they are not an accepted buddy. Community is not required. */
  sharedBuddyData(ownerId: string): Promise<import('@/domain/buddies').BuddyShareView | null>;
  /** Read lines for this person's chats. Empty when none are stored yet. */
  loadChatReads(): Promise<Record<string, string>>;
  /** Moves one chat's read line forward. An older time is ignored. */
  saveChatRead(connectionId: string, readThrough: string): Promise<void>;
  /** A caught screen error. Screen name, short message, and build only. */
  logClientError(screen: string, message: string, appBuild: string): Promise<void>;
  /** Writes the ticked actions and the limits. It does not call the model. */
  saveHealthPlan(plan: HealthPlan): Promise<void>;
  /** Asks Thumos for a new plan from this person's figures. Finished actions are left behind. */
  refreshHealthPlan(limits: string): Promise<void>;
}
