import { CONSENT_VERSION, INTEREST_CATALOGUE, RESOURCE_CATALOGUE } from '@/data/catalogue';
import { consentRows } from '@/domain/consents';
import type { StoredConsent } from '@/domain/consents';
import type { CheckIn, Connection, DirectMessage, HealthSample, Profile, ProfilePhoto, ProgressPhoto, Reason, Relapse, ThumosMessage } from '@/data/types';
import type { VisionItem } from '@/domain/visionBoard';
import { visionStoragePath } from '@/domain/visionBoard';
import { VISION_SAMPLE_PHOTOS } from '@/data/visionSamples';
import { isoDay } from '@/domain/dates';
import { defaultNutritionSettings, estimateFromText } from '@/domain/nutrition';
import type { BodyCompositionReading } from '@/domain/nutrition';
import type { GratitudeEntry } from '@/domain/gratitude';
import { gratitudeStoragePath } from '@/domain/gratitudePhotos';
import { planProgressPhoto, progressStoragePath } from '@/domain/progressPhotos';
import { profileStoragePath } from '@/domain/profilePhotos';

export const DEMO_PASSWORD = 'Charioteer-demo-1';

export const PEOPLE = {
  alex: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  jordan: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
  sam: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
  priya: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4',
  rowan: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5',
} as const;

const EXERCISE = '10000000-0000-4000-8000-000000000011';
const GYM = '10000000-0000-4000-8000-000000000012';
const HEALTH = '10000000-0000-4000-8000-000000000013';
const HIKING = '10000000-0000-4000-8000-000000000002';

export type DemoAccount = {
  email: string;
  password: string;
  profile: Profile;
  reasons: Reason[];
  checkIns: CheckIn[];
  relapses: Relapse[];
  health: HealthSample[];
  thumos: ThumosMessage[];
  consents: StoredConsent[];
  progressPhotos: ProgressPhoto[];
  /** Absent on older sample data. Profile picture and gallery. */
  profilePhotos?: ProfilePhoto[];
  gratitude: GratitudeEntry[];
  visionItems: VisionItem[];
  /** Absent on older sample data. Name and interests stay public; everything else starts off. */
  sharing?: import('@/domain/profileSharing').ProfileSharing;
  /** Absent on older sample data. Private favourite quote ids. */
  savedQuotes?: { quoteId: string; createdAt: string }[];
  /** Absent on older sample data. Private meals. */
  foodLogs?: import('@/domain/nutrition').FoodLog[];
  nutrition?: import('@/domain/nutrition').NutritionSettings;
  waterDays?: import('@/domain/nutrition').NutritionDay[];
  /** Absent on older sample data. Private body-fat, lean-mass, and waist history. */
  bodyComposition?: BodyCompositionReading[];
};

export type DemoDb = {
  /** 10 once check-in moods are stored on the 1-10 scale. Absent on older sample data. */
  moodScale?: 10;
  accounts: Record<string, DemoAccount>;
  sessionUserId: string | null;
  connections: Connection[];
  messages: DirectMessage[];
  blocks: { id: string; blockerId: string; blockedId: string }[];
  reports: import('@/data/types').Report[];
  interests: typeof INTEREST_CATALOGUE;
  resources: typeof RESOURCE_CATALOGUE;
};

function localDay(now: Date, daysAgo: number): string {
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function demoHealth(now: Date): HealthSample[] {
  let n = 1;
  const sample = (kind: HealthSample['kind'], value: number, unit: string, daysAgo: number): HealthSample => {
    const id = `d1d1d1d1-d1d1-4d1d-8d1d-${n.toString(16).padStart(12, '0')}`;
    n += 1;
    return { id, kind, value, unit, recordedOn: localDay(now, daysAgo), source: 'manual' };
  };
  const rows: HealthSample[] = [];
  const steps = [9100, 8800, 8600, 8420, 8200, 9000, 8700, 7000, 6800, 6600, 7200, 6400, 6900, 4682];
  const sleep = [7.4, 7.2, 7.6, 7.1, 7.5, 7.3, 7.8, 6.4, 6.2, 6.6, 6.1, 6.5, 6.3, 6.8];
  steps.forEach((value, daysAgo) => rows.push(sample('steps', value, 'steps', daysAgo)));
  sleep.forEach((value, daysAgo) => rows.push(sample('sleep_hours', value, 'h', daysAgo)));
  rows.push(
    sample('resting_heart_rate', 62, 'bpm', 0),
    sample('resting_heart_rate', 61, 'bpm', 1),
    sample('resting_heart_rate', 63, 'bpm', 3),
    sample('resting_heart_rate', 70, 'bpm', 55),
    sample('resting_heart_rate', 66, 'bpm', 62),
    sample('hrv_sdnn', 48, 'ms', 0),
    sample('hrv_sdnn', 46, 'ms', 1),
    sample('hrv_sdnn', 44, 'ms', 2),
    sample('hrv_sdnn', 50, 'ms', 4),
    sample('hrv_sdnn', 47, 'ms', 6),
    sample('workout_minutes', 32, 'min', 0),
    sample('workout_minutes', 45, 'min', 2),
    sample('workout_minutes', 20, 'min', 5),
    sample('workout_minutes', 40, 'min', 8),
    sample('weight_kg', 74.2, 'kg', 0),
    sample('weight_kg', 74.6, 'kg', 7),
    sample('weight_kg', 74.8, 'kg', 14),
  );
  return rows;
}

function profile(
  id: string,
  email: string,
  displayName: string,
  town: string,
  interestIds: string[],
  extra: Partial<Profile> = {},
): Profile {
  return {
    id,
    email,
    displayName,
    sobrietyStartedAt: null,
    weeklySpendGbp: null,
    weeklyUnits: null,
    town,
    ageConfirmed18: true,
    communityVisible: true,
    consentHealth: true,
    consentAi: true,
    onboardingComplete: true,
    isModerator: false,
    textScale: 'default',
    themePreference: 'dark',
    interestIds,
    stage: 'stopped',
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
    createdAt: '2026-01-01T00:00:00.000Z',
    ...extra,
  };
}

/** A tiny grey JPEG so the sample timeline can render without a camera. */
const SAMPLE_JPEG =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGf/9k=';

function diaryLine(
  id: string,
  body: string,
  category: GratitudeEntry['category'],
  isFavourite: boolean,
  entryDate: string,
): GratitudeEntry {
  const [year, month, day] = entryDate.split('-').map(Number);
  const created = new Date(year, (month ?? 1) - 1, day ?? 1, 9, 0, 0, 0).toISOString();
  return { id, body, category, isFavourite, entryDate, createdAt: created, updatedAt: created, photos: [] };
}

function sampleProfilePhoto(
  userId: string,
  photoId: string,
  role: ProfilePhoto['role'],
  caption: string,
  position: number,
): ProfilePhoto {
  return {
    id: photoId,
    userId,
    role,
    caption,
    position,
    storagePath: profileStoragePath(userId, photoId),
    createdAt: '2026-10-11T09:00:00.000Z',
    previewUrl: SAMPLE_JPEG,
  };
}

function samplePhoto(
  userId: string,
  photoId: string,
  takenOn: string,
  monthIndex: number,
  note: string,
  createdAt: string,
  visibility: ProgressPhoto['visibility'] = 'private',
  caption = '',
): ProgressPhoto {
  return {
    id: photoId,
    userId,
    takenOn,
    monthIndex,
    note,
    caption,
    storagePath: progressStoragePath(userId, photoId),
    createdAt,
    visibility,
    previewUrl: SAMPLE_JPEG,
  };
}

function alexVision(userId: string): VisionItem[] {
  const created = '2026-10-11T09:00:00.000Z';
  const tile = (
    photoId: string,
    caption: string,
    area: VisionItem['area'],
    size: VisionItem['size'],
    position: number,
    previewUrl: string,
  ): VisionItem => ({
    id: photoId,
    caption,
    area,
    size,
    position,
    storagePath: visionStoragePath(userId, photoId),
    createdAt: created,
    updatedAt: created,
    previewUrl,
  });
  return [
    tile('a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1', 'A kitchen with morning light', 'home', 'large', 0, VISION_SAMPLE_PHOTOS.dawn),
    tile('a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2', 'A body that feels looked after', 'health', 'medium', 1, VISION_SAMPLE_PHOTOS.leaf),
    tile('a3a3a3a3-a3a3-4a3a-8a3a-a3a3a3a3a3a3', 'A train to somewhere new', 'travel', 'small', 2, VISION_SAMPLE_PHOTOS.sea),
    tile('a4a4a4a4-a4a4-4a4a-8a4a-a4a4a4a4a4a4', 'Sunday with the people I love', 'family', 'medium', 3, VISION_SAMPLE_PHOTOS.sand),
    tile('a5a5a5a5-a5a5-4a5a-8a5a-a5a5a5a5a5a5', 'Work I am glad to start', 'career', 'small', 4, VISION_SAMPLE_PHOTOS.clay),
    tile('a6a6a6a6-a6a6-4a6a-8a6a-a6a6a6a6a6a6', 'A quiet hour that is mine', 'mind', 'large', 5, VISION_SAMPLE_PHOTOS.sky),
  ];
}

export function createDemoDb(now = new Date()): DemoDb {
  const started = new Date(now.getTime() - (47 * 24 + 6) * 60 * 60 * 1000).toISOString();
  const ago = (hours: number) => new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString();

  const alexReasons: Reason[] = [
    { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', body: 'I want to remember my evenings.', sortOrder: 0 },
    { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', body: 'My sleep has been a mess for years.', sortOrder: 1 },
    { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3', body: "I want to be present for my sister's wedding in June.", sortOrder: 2 },
  ];

  const checkIns: CheckIn[] = [
    { id: 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1', mood: 8, sleepHours: 7.5, craving: 2, note: 'Quiet evening. Tea and a film.', createdAt: ago(20) },
    { id: 'c2c2c2c2-c2c2-4c2c-8c2c-c2c2c2c2c2c2', mood: 6, sleepHours: 6.5, craving: 4, note: 'Walked home the long way.', createdAt: ago(44) },
    { id: 'c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3', mood: 4, sleepHours: 5, craving: 8, note: 'The urge was loud after work. I stayed in.', createdAt: ago(68) },
    { id: 'c4c4c4c4-c4c4-4c4c-8c4c-c4c4c4c4c4c4', mood: 8, sleepHours: 8, craving: 1, note: 'Slept properly for once.', createdAt: ago(92) },
    { id: 'c5c5c5c5-c5c5-4c5c-8c5c-c5c5c5c5c5c5', mood: 6, sleepHours: 7, craving: 3, note: '', createdAt: ago(116) },
  ];

  const health = demoHealth(now);

  const thumos: ThumosMessage[] = [
    { id: 'e0e0e0e0-e0e0-4e0e-8e0e-e0e0e0e0e0e1', role: 'user', content: 'The afternoon felt long.', mode: 'steady', createdAt: ago(32) },
    { id: 'e0e0e0e0-e0e0-4e0e-8e0e-e0e0e0e0e0e2', role: 'assistant', content: 'A long afternoon can still be got through. Tea and a short walk are enough for now.', mode: 'steady', createdAt: ago(32) },
    { id: 'e0e0e0e0-e0e0-4e0e-8e0e-e0e0e0e0e0e3', role: 'user', content: 'I might aim for bed at ten.', mode: 'steady', createdAt: ago(30) },
    {
      id: 'e0e0e0e0-e0e0-4e0e-8e0e-e0e0e0e0e0e4',
      role: 'assistant',
      content: 'Ten o\'clock is a clear bedtime. Put the phone in another room at half past nine, dim the lights, and leave tomorrow\'s first job written down so it is not spinning in your head. If you wake in the night, stay in bed and count breaths rather than opening the phone. That is the whole plan for this evening, and it does not need anything else added to it.',
      mode: 'growth',
      createdAt: ago(30),
    },
    { id: 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1', role: 'guide', content: 'How are you feeling?', mode: 'opening', createdAt: ago(26) },
    { id: 'e2e2e2e2-e2e2-4e2e-8e2e-e2e2e2e2e2e2', role: 'user', content: 'Restless this afternoon, but I slept.', mode: 'steady', createdAt: ago(25) },
    {
      id: 'e3e3e3e3-e3e3-4e3e-8e3e-e3e3e3e3e3e3',
      role: 'assistant',
      content: 'Restless can still be a decent day, especially after a proper night. A walk before dinner has suited you on days like this. What would make tonight feel looked after?',
      mode: 'growth',
      createdAt: ago(25),
    },
  ];

  const alex: DemoAccount = {
    email: 'alex.hart@example.com',
    password: DEMO_PASSWORD,
    profile: profile(PEOPLE.alex, 'alex.hart@example.com', 'Alex Hart', 'Bristol', [HIKING, GYM], {
      sobrietyStartedAt: started,
      weeklySpendGbp: 48,
      weeklyUnits: 30,
      heightCm: 178,
      visionStatement: 'A steady morning, a home that feels like mine, and people I can be honest with.',
      visionStartedOn: '2026-10-11',
    }),
    reasons: alexReasons,
    checkIns,
    relapses: [],
    health,
    thumos,
    consents: consentRows(CONSENT_VERSION, { consentHealth: true, communityVisible: true, consentAi: true }),
    progressPhotos: [],
    gratitude: [],
    visionItems: alexVision(PEOPLE.alex),
    nutrition: { ...defaultNutritionSettings(), build: 'muscular' },
    bodyComposition: [{
      id: 'c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c0c1',
      recordedOn: isoDay(now),
      bodyFatPct: 15,
      leanMassKg: 63,
      waistCm: 84,
      source: 'dexa',
      createdAt: now.toISOString(),
    }],
  };
  const anchor = new Date(started);
  const startPlan = planProgressPhoto({
    takenOn: isoDay(anchor),
    startingPoint: true,
    note: 'Where I began.',
    anchor,
    today: isoDay(now),
  });
  const nowPlan = planProgressPhoto({
    takenOn: isoDay(now),
    startingPoint: false,
    note: '',
    anchor,
    today: isoDay(now),
  });
  if (startPlan.ok) {
    alex.progressPhotos.push(samplePhoto(PEOPLE.alex, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', startPlan.takenOn, startPlan.monthIndex, startPlan.note, started));
  }
  if (nowPlan.ok) {
    alex.progressPhotos.push(samplePhoto(PEOPLE.alex, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', nowPlan.takenOn, nowPlan.monthIndex, nowPlan.note, now.toISOString(), 'community', 'A clearer morning.'));
  }
  const lastYear = `${now.getFullYear() - 1}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  alex.gratitude = [
    diaryLine('11111111-1111-4111-8111-111111111101', 'My sister rang just to say she was thinking of me.', 'People', true, localDay(now, 3)),
    diaryLine('11111111-1111-4111-8111-111111111102', 'The river path after rain, and nobody asking me to hurry.', 'Nature', false, localDay(now, 40)),
    diaryLine('11111111-1111-4111-8111-111111111103', 'A quiet cup of tea before the house woke.', 'Small joys', false, lastYear),
  ];
  const sister = alex.gratitude[0];
  alex.profilePhotos = [
    sampleProfilePhoto(PEOPLE.alex, 'e7e7e7e7-e7e7-4e7e-8e7e-e7e7e7e7e7e1', 'avatar', 'Morning light.', 0),
    sampleProfilePhoto(PEOPLE.alex, 'e7e7e7e7-e7e7-4e7e-8e7e-e7e7e7e7e7e2', 'gallery', 'The path after rain.', 0),
    sampleProfilePhoto(PEOPLE.alex, 'e7e7e7e7-e7e7-4e7e-8e7e-e7e7e7e7e7e3', 'gallery', 'A quieter evening.', 1),
  ];
  if (sister) {
    const photoId = '11111111-1111-4111-8111-1111111111a1';
    sister.photos = [{
      id: photoId,
      entryId: sister.id,
      storagePath: gratitudeStoragePath(PEOPLE.alex, photoId),
      createdAt: sister.createdAt,
      previewUrl: SAMPLE_JPEG,
      caption: '',
    }];
  }
  const lowMood = checkIns.find((item) => item.mood === 4);
  alex.foodLogs = [
    {
      id: '11111111-1111-4111-8111-111111111111',
      userId: PEOPLE.alex,
      eatenOn: isoDay(now),
      eatenAt: now.toISOString(),
      meal: 'breakfast',
      source: 'text',
      note: 'Porridge and a banana',
      items: estimateFromText('porridge and a banana'),
      estimated: true,
      portion: 1,
      createdAt: now.toISOString(),
      previewUrl: null,
    },
    {
      id: '11111111-1111-4111-8111-111111111112',
      userId: PEOPLE.alex,
      eatenOn: lowMood ? isoDay(new Date(lowMood.createdAt)) : isoDay(now),
      eatenAt: lowMood?.createdAt ?? now.toISOString(),
      meal: 'snack',
      source: 'text',
      note: 'Crisps after a short night',
      items: estimateFromText('crisps'),
      estimated: true,
      portion: 1,
      createdAt: lowMood?.createdAt ?? now.toISOString(),
      previewUrl: null,
    },
  ];
  alex.waterDays = [{ day: isoDay(now), waterMl: 350 }];

  const other = (
    id: string,
    email: string,
    name: string,
    town: string,
    interestIds: string[],
    extra: Partial<Profile> = {},
  ): DemoAccount => ({
    email,
    password: DEMO_PASSWORD,
    profile: profile(id, email, name, town, interestIds, extra),
    reasons: [],
    checkIns: [],
    relapses: [],
    health: [],
    thumos: [],
    consents: consentRows(CONSENT_VERSION, { consentHealth: true, communityVisible: true, consentAi: true }),
    progressPhotos: [],
    profilePhotos: [],
    gratitude: [],
    visionItems: [],
  });

  const jordan = other(PEOPLE.jordan, 'jordan.ellis@example.com', 'Jordan Ellis', 'Manchester', [HIKING, EXERCISE]);
  jordan.profilePhotos = [
    sampleProfilePhoto(PEOPLE.jordan, 'e7e7e7e7-e7e7-4e7e-8e7e-e7e7e7e7e7e4', 'avatar', 'Out walking.', 0),
  ];
  jordan.nutrition = {
    kcalTarget: null,
    hideCalories: false,
    shareFoodDiary: true,
    shareCalories: false,
    shareQuality: false,
    shareProgress: false,
    goal: null,
    goalAge: null,
    goalSex: null,
    proteinTarget: null,
    activityEnergyKcal: null,
    shareGoal: false,
    wagonOn: true,
    wagonNote: 'A rough evening. I am still here.',
    wagonVisible: true,
    build: null,
    updatedAt: null,
  };
  jordan.foodLogs = [{
    id: '11111111-1111-4111-8111-111111111113',
    userId: PEOPLE.jordan,
    eatenOn: isoDay(now),
    eatenAt: now.toISOString(),
    meal: 'dinner',
    source: 'text',
    note: 'Chicken',
    items: estimateFromText('chicken'),
    estimated: true,
    portion: 1,
    createdAt: now.toISOString(),
    previewUrl: null,
  }];
  const jordanAnchor = new Date('2026-01-01T00:00:00.000Z');
  const sharedPlan = planProgressPhoto({
    takenOn: isoDay(now),
    startingPoint: false,
    note: 'Out on the canal.',
    anchor: jordanAnchor,
    today: isoDay(now),
  });
  if (sharedPlan.ok) {
    jordan.progressPhotos.push(samplePhoto(
      PEOPLE.jordan,
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb6',
      sharedPlan.takenOn,
      sharedPlan.monthIndex,
      sharedPlan.note,
      now.toISOString(),
      'community',
    ));
  }

  const connectionId = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1';
  const requestId = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2';

  return {
    moodScale: 10,
    accounts: {
      [PEOPLE.alex]: alex,
      [PEOPLE.jordan]: jordan,
      [PEOPLE.sam]: other(PEOPLE.sam, 'sam.okonkwo@example.com', 'Sam Okonkwo', 'Leeds', [GYM, HEALTH]),
      [PEOPLE.priya]: other(PEOPLE.priya, 'priya.shah@example.com', 'Priya Shah', 'London', [EXERCISE, HEALTH]),
      [PEOPLE.rowan]: other(PEOPLE.rowan, 'rowan.blake@example.com', 'Rowan Blake', 'Glasgow', [HEALTH, HIKING], {
        isModerator: true,
      }),
    },
    sessionUserId: null,
    connections: [
      { id: connectionId, requesterId: PEOPLE.alex, addresseeId: PEOPLE.jordan, status: 'accepted', createdAt: ago(200) },
      { id: requestId, requesterId: PEOPLE.sam, addresseeId: PEOPLE.alex, status: 'pending', createdAt: ago(10) },
    ],
    messages: [
      { id: 'f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1', connectionId, senderId: PEOPLE.jordan, body: 'Sunday hike is still on, if you want a lift towards the bridge.', createdAt: ago(30) },
      { id: 'f2f2f2f2-f2f2-4f2f-8f2f-f2f2f2f2f2f2', connectionId, senderId: PEOPLE.alex, body: "I'll be there. Early, before anywhere is open.", createdAt: ago(28) },
      { id: 'f3f3f3f3-f3f3-4f3f-8f3f-f3f3f3f3f3f3', connectionId, senderId: PEOPLE.jordan, body: 'Coffee after. No fuss if you need to head off.', createdAt: ago(27) },
    ],
    blocks: [],
    reports: [],
    interests: INTEREST_CATALOGUE.map((item) => ({ ...item })),
    resources: RESOURCE_CATALOGUE.map((item) => ({ ...item })),
  };
}

export const DEMO_CONSENT_VERSION = CONSENT_VERSION;
