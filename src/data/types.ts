import type { StoredConsent } from '@/domain/consents';
import type { GratitudeCategory, GratitudeEntry, GratitudeReflect } from '@/domain/gratitude';
import type { Stage } from '@/domain/stage';
import type { ThumosMode } from '@/domain/thumos';
import type { VisionArea, VisionItem, VisionSize } from '@/domain/visionBoard';

export type TextScale = 'default' | 'large' | 'extra';
export type ThemePreference = 'system' | 'light' | 'dark';
export type Mood = 1 | 2 | 3 | 4 | 5;

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
  createdAt: string;
};

export type ProgressVisibility = 'private' | 'community';

export type ProgressPhoto = {
  id: string;
  userId: string;
  takenOn: string;
  monthIndex: number;
  note: string;
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
  /** Private diary. Never included in the community directory. */
  gratitude: GratitudeEntry[];
  /** Private vision board. Never included in the community directory. */
  visionItems: VisionItem[];
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
  >
>;

export type NewCheckIn = {
  mood: Mood;
  sleepHours: number;
  craving: number;
  note: string;
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

export interface Repository {
  subscribe(listener: () => void): () => void;
  getSnapshot(): AppSnapshot;
  reload(): Promise<void>;
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
  requestConnection(userId: string): Promise<void>;
  respondConnection(connectionId: string, accept: boolean): Promise<void>;
  sendDirectMessage(connectionId: string, body: string): Promise<void>;
  blockUser(userId: string): Promise<void>;
  unblockUser(userId: string): Promise<void>;
  reportUser(input: NewReport): Promise<void>;
  reviewReport(id: string): Promise<void>;
  ensureThumosGuide(kind: 'opening' | 'craving'): Promise<void>;
  sendThumos(content: string, mode: ThumosMode, onDelta?: (text: string) => void): Promise<void>;
  mintVoiceToken(mode?: ThumosMode): Promise<VoiceMint>;
  saveVoiceTurn(input: VoiceTurnInput): Promise<void>;
  addProgressPhoto(input: NewProgressPhoto): Promise<void>;
  updateProgressPhoto(id: string, input: { takenOn?: string; startingPoint?: boolean; note?: string }): Promise<void>;
  deleteProgressPhoto(id: string): Promise<void>;
  setProgressPhotoVisibility(ids: string[], visibility: ProgressVisibility): Promise<void>;
  openPrivateChat(userId: string): Promise<{ status: 'open'; connectionId: string } | { status: 'requested'; connectionId: string | null }>;
  addGratitudeEntry(input: NewGratitudeEntry): Promise<void>;
  updateGratitudeEntry(id: string, input: NewGratitudeEntry): Promise<void>;
  deleteGratitudeEntry(id: string): Promise<void>;
  addGratitudePhoto(entryId: string, bytes: Uint8Array): Promise<void>;
  deleteGratitudePhoto(id: string): Promise<void>;
  reflectOnGratitude(body: string, category: string | null): Promise<GratitudeReflect>;
  saveVisionStatement(statement: string): Promise<void>;
  addVisionItem(bytes: Uint8Array): Promise<void>;
  updateVisionItem(id: string, patch: { caption?: string; area?: VisionArea | null; size?: VisionSize }): Promise<void>;
  moveVisionItem(id: string, direction: 'up' | 'down'): Promise<void>;
  deleteVisionItem(id: string): Promise<void>;
  exportData(): Promise<Record<string, unknown>>;
  deleteAccount(): Promise<void>;
}
