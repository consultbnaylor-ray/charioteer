import { CONSENT_VERSION, INTEREST_CATALOGUE, RESOURCE_CATALOGUE } from '@/data/catalogue';
import { consentRows } from '@/domain/consents';
import type { StoredConsent } from '@/domain/consents';
import type { CheckIn, Connection, DirectMessage, HealthSample, Profile, ProgressPhoto, Reason, Relapse, ThumosMessage } from '@/data/types';
import { isoDay } from '@/domain/dates';
import { planProgressPhoto, progressStoragePath } from '@/domain/progressPhotos';

export const DEMO_PASSWORD = 'Charioteer-demo-1';

export const PEOPLE = {
  alex: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  jordan: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
  sam: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
  priya: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4',
  rowan: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5',
} as const;

const HIKING = '10000000-0000-4000-8000-000000000002';
const SWIMMING = '10000000-0000-4000-8000-000000000001';
const DANCING = '10000000-0000-4000-8000-000000000003';
const RAVING = '10000000-0000-4000-8000-000000000004';
const CINEMA = '10000000-0000-4000-8000-000000000005';
const NIGHTS = '10000000-0000-4000-8000-000000000006';
const READING = '10000000-0000-4000-8000-000000000007';
const COOKING = '10000000-0000-4000-8000-000000000009';

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
};

export type DemoDb = {
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
    createdAt: '2026-01-01T00:00:00.000Z',
    ...extra,
  };
}

/** A tiny grey JPEG so the sample timeline can render without a camera. */
const SAMPLE_JPEG =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGf/9k=';

function samplePhoto(
  userId: string,
  photoId: string,
  takenOn: string,
  monthIndex: number,
  note: string,
  createdAt: string,
  visibility: ProgressPhoto['visibility'] = 'private',
): ProgressPhoto {
  return {
    id: photoId,
    userId,
    takenOn,
    monthIndex,
    note,
    storagePath: progressStoragePath(userId, photoId),
    createdAt,
    visibility,
    previewUrl: SAMPLE_JPEG,
  };
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
    { id: 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1', mood: 4, sleepHours: 7.5, craving: 2, note: 'Quiet evening. Tea and a film.', createdAt: ago(20) },
    { id: 'c2c2c2c2-c2c2-4c2c-8c2c-c2c2c2c2c2c2', mood: 3, sleepHours: 6.5, craving: 4, note: 'Walked home the long way.', createdAt: ago(44) },
    { id: 'c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3', mood: 2, sleepHours: 5, craving: 8, note: 'The urge was loud after work. I stayed in.', createdAt: ago(68) },
    { id: 'c4c4c4c4-c4c4-4c4c-8c4c-c4c4c4c4c4c4', mood: 4, sleepHours: 8, craving: 1, note: 'Slept properly for once.', createdAt: ago(92) },
    { id: 'c5c5c5c5-c5c5-4c5c-8c5c-c5c5c5c5c5c5', mood: 3, sleepHours: 7, craving: 3, note: '', createdAt: ago(116) },
  ];

  const health: HealthSample[] = [
    { id: 'd1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1', kind: 'steps', value: 8420, unit: 'steps', recordedOn: localDay(now, 1), source: 'manual' },
    { id: 'd2d2d2d2-d2d2-4d2d-8d2d-d2d2d2d2d2d2', kind: 'steps', value: 6104, unit: 'steps', recordedOn: localDay(now, 2), source: 'manual' },
    { id: 'd3d3d3d3-d3d3-4d3d-8d3d-d3d3d3d3d3d3', kind: 'sleep_hours', value: 7.5, unit: 'h', recordedOn: localDay(now, 1), source: 'manual' },
    { id: 'd4d4d4d4-d4d4-4d4d-8d4d-d4d4d4d4d4d4', kind: 'sleep_hours', value: 6.2, unit: 'h', recordedOn: localDay(now, 2), source: 'manual' },
    { id: 'd5d5d5d5-d5d5-4d5d-8d5d-d5d5d5d5d5d5', kind: 'resting_heart_rate', value: 58, unit: 'bpm', recordedOn: localDay(now, 1), source: 'manual' },
    { id: 'd6d6d6d6-d6d6-4d6d-8d6d-d6d6d6d6d6d6', kind: 'resting_heart_rate', value: 61, unit: 'bpm', recordedOn: localDay(now, 3), source: 'manual' },
    { id: 'd7d7d7d7-d7d7-4d7d-8d7d-d7d7d7d7d7d7', kind: 'hrv_sdnn', value: 46, unit: 'ms', recordedOn: localDay(now, 1), source: 'manual' },
    { id: 'd8d8d8d8-d8d8-4d8d-8d8d-d8d8d8d8d8d8', kind: 'hrv_sdnn', value: 41, unit: 'ms', recordedOn: localDay(now, 3), source: 'manual' },
    { id: 'd9d9d9d9-d9d9-4d9d-8d9d-d9d9d9d9d9d9', kind: 'weight_kg', value: 74.2, unit: 'kg', recordedOn: localDay(now, 1), source: 'manual' },
    { id: 'dadadada-dada-4dad-8dad-dadadadadada', kind: 'workout_minutes', value: 32, unit: 'min', recordedOn: localDay(now, 1), source: 'manual' },
  ];

  const thumos: ThumosMessage[] = [
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
    profile: profile(PEOPLE.alex, 'alex.hart@example.com', 'Alex Hart', 'Bristol', [HIKING, CINEMA, NIGHTS], {
      sobrietyStartedAt: started,
      weeklySpendGbp: 48,
      weeklyUnits: 30,
    }),
    reasons: alexReasons,
    checkIns,
    relapses: [],
    health,
    thumos,
    consents: consentRows(CONSENT_VERSION, { consentHealth: true, communityVisible: true, consentAi: true }),
    progressPhotos: [],
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
    alex.progressPhotos.push(samplePhoto(PEOPLE.alex, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', nowPlan.takenOn, nowPlan.monthIndex, nowPlan.note, now.toISOString()));
  }

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
  });

  const jordan = other(PEOPLE.jordan, 'jordan.ellis@example.com', 'Jordan Ellis', 'Manchester', [HIKING, SWIMMING]);
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
    accounts: {
      [PEOPLE.alex]: alex,
      [PEOPLE.jordan]: jordan,
      [PEOPLE.sam]: other(PEOPLE.sam, 'sam.okonkwo@example.com', 'Sam Okonkwo', 'Leeds', [RAVING, NIGHTS]),
      [PEOPLE.priya]: other(PEOPLE.priya, 'priya.shah@example.com', 'Priya Shah', 'London', [DANCING, CINEMA]),
      [PEOPLE.rowan]: other(PEOPLE.rowan, 'rowan.blake@example.com', 'Rowan Blake', 'Glasgow', [COOKING, READING], {
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
