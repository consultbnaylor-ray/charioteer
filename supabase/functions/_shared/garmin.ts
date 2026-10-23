/**
 * Garmin Connect, push only. Tokens and health values are never written to logs.
 * A path or position is never copied onto a stored row or a coach line.
 * The OAuth URLs match Garmin's OAuth 2.0 PKCE guide. Webhook field names follow
 * the Health API push shape; the portal still hides the full field list.
 */

export const GARMIN_AUTHORIZE_URL = 'https://connect.garmin.com/oauth2Confirm';
export const GARMIN_TOKEN_URL = 'https://diauth.garmin.com/di-oauth2-service/oauth/token';
export const GARMIN_USER_ID_URL = 'https://apis.garmin.com/wellness-api/rest/user/id';
export const GARMIN_PERMISSIONS_URL = 'https://apis.garmin.com/wellness-api/rest/user/permissions';
export const GARMIN_DEREGISTER_URL = 'https://apis.garmin.com/wellness-api/rest/user/registration';
export const GARMIN_REDIRECT_URI = 'https://jvmmuhljklkahebxdsah.supabase.co/functions/v1/garmin-oauth-callback';
export const GARMIN_APP_SCHEME = 'uk.co.quanticalabs.charioteer';
export const PKCE_TTL_MS = 10 * 60 * 1000;
export const PKCE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';

export const GARMIN_PRIVACY =
  'Garmin readings stay on your account, the same way Apple Health readings do. They are not sold, not shared for ads, and not used to train AI. Thumos sees them only when health data and the coach are on, and personal data is allowed. A path is not stored.';

export const GARMIN_DATA_TABLES = [
  'garmin_dailies',
  'garmin_activities',
  'garmin_sleep',
  'garmin_user_metrics',
  'garmin_respiration',
  'garmin_pulse_ox',
  'garmin_hrv',
  'garmin_oauth_states',
  'garmin_connections',
] as const;

/** Summaries a manual refresh may ask Garmin to send again. Activity details and files stay out. */
export const GARMIN_BACKFILL_TYPES = ['dailies', 'activities', 'sleeps', 'userMetrics'] as const;

export const GARMIN_REFRESH_COOLDOWN_MS = 60_000;

/** Recent days only. Garmin's backfill window is longer; this stays inside it. */
export const GARMIN_REFRESH_LOOKBACK_SECONDS = 7 * 24 * 60 * 60;

/** A window shorter than this is not worth a backfill call. */
export const GARMIN_REFRESH_MIN_WINDOW_SECONDS = 60;

export type GarminDaily = {
  calendarDate: string;
  restingHeartRateBpm: number | null;
  averageHeartRateBpm: number | null;
  moderateMinutes: number | null;
  vigorousMinutes: number | null;
  /** Active kilocalories. Absent until a daily push includes them. */
  activeKilocalories?: number | null;
  /** Present once a daily push included them. Older rows leave them unset. */
  steps?: number | null;
  distanceMetres?: number | null;
  floorsClimbed?: number | null;
  minHeartRateBpm?: number | null;
  maxHeartRateBpm?: number | null;
  averageStressLevel?: number | null;
  bodyBatteryCharged?: number | null;
  bodyBatteryDrained?: number | null;
  bodyBatteryHighest?: number | null;
  bodyBatteryLowest?: number | null;
  stepGoal?: number | null;
  /** Activity duration for that day. Used to choose between duplicate dailies. */
  durationSeconds?: number | null;
};

export type GarminRespiration = {
  summaryId: string;
  calendarDate: string;
  averageBreathsPerMinute: number | null;
  highestBreathsPerMinute: number | null;
  lowestBreathsPerMinute: number | null;
};

export type GarminPulseOx = {
  summaryId: string;
  calendarDate: string;
  averageSpo2: number | null;
  lowestSpo2: number | null;
  highestSpo2: number | null;
};

export type GarminHrvSummary = {
  summaryId: string;
  calendarDate: string;
  lastNightAvgMs: number | null;
  lastNight5MinHighMs: number | null;
};

export type GarminActivity = {
  summaryId: string;
  activityType: string;
  activityName: string;
  startedAt: string;
  durationSeconds: number;
  averageHeartRateBpm: number | null;
  trainingEffect: number | null;
  anaerobicEffect: number | null;
};

export type GarminSleep = {
  summaryId: string;
  calendarDate: string;
  durationSeconds: number;
  deepSeconds: number | null;
  lightSeconds: number | null;
  remSeconds: number | null;
  awakeSeconds: number | null;
  sleepScore: number | null;
};

export type GarminUserMetric = {
  summaryId: string;
  calendarDate: string;
  vo2Max: number | null;
  vo2MaxCycling: number | null;
  fitnessAge: number | null;
};

export type GarminExportPermission = 'ACTIVITY_EXPORT' | 'HEALTH_EXPORT';

export type GarminReadings = {
  connected: boolean;
  connectedAt: string | null;
  dailies: GarminDaily[];
  activities: GarminActivity[];
  sleep: GarminSleep[];
  userMetrics: GarminUserMetric[];
  respiration: GarminRespiration[];
  pulseOx: GarminPulseOx[];
  hrv: GarminHrvSummary[];
  /** True when this person is connected and Garmin is not sending the summaries Charioteer asked for. */
  needsPermissions: boolean;
  /** The export names that are missing. Never a token. */
  missingPermissions: GarminExportPermission[];
  /** When a Garmin push last arrived. Null when this phone has not been told. */
  lastPushAt: string | null;
  /** When Garmin last refused historical catch-up with 412. Null when it has not. */
  historyRefusedAt: string | null;
};

export type GarminFigure = {
  name: string;
  value: string;
  unit: string;
  period: string;
};

export type PkceRow = {
  state: string;
  userId: string;
  codeVerifier: string;
  createdAt: string;
  expiresAt: string;
};

export type GarminPushPlan = {
  dailies: (GarminDaily & { garminUserId: string })[];
  activities: (GarminActivity & { garminUserId: string })[];
  sleep: (GarminSleep & { garminUserId: string })[];
  userMetrics: (GarminUserMetric & { garminUserId: string })[];
  respiration: (GarminRespiration & { garminUserId: string })[];
  pulseOx: (GarminPulseOx & { garminUserId: string })[];
  hrv: (GarminHrvSummary & { garminUserId: string })[];
  deregistered: string[];
  permissionChanges: { garminUserId: string; permissions: string }[];
};

export function emptyGarminReadings(): GarminReadings {
  return {
    connected: false,
    connectedAt: null,
    dailies: [],
    activities: [],
    sleep: [],
    userMetrics: [],
    respiration: [],
    pulseOx: [],
    hrv: [],
    needsPermissions: false,
    missingPermissions: [],
    lastPushAt: null,
    historyRefusedAt: null,
  };
}

export function pkceVerifier(random: Uint8Array): string {
  const count = Math.min(128, Math.max(43, random.length || 64));
  let out = '';
  for (let index = 0; index < count; index += 1) {
    out += PKCE_ALPHABET[(random[index] ?? 0) % PKCE_ALPHABET.length];
  }
  return out;
}

export function pkceRecord(userId: string, now: number, verifierRandom: Uint8Array, stateRandom: Uint8Array): PkceRow {
  return {
    state: pkceVerifier(stateRandom).slice(0, 43),
    userId,
    codeVerifier: pkceVerifier(verifierRandom),
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + PKCE_TTL_MS).toISOString(),
  };
}

export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

export function takePkceState<T extends { state: string; expiresAt: string }>(
  rows: T[],
  state: string,
  now: number,
): { ok: true; row: T; remaining: T[] } | { ok: false; reason: 'missing' | 'expired'; remaining: T[] } {
  const index = rows.findIndex((row) => row.state === state);
  if (index < 0) return { ok: false, reason: 'missing', remaining: rows };
  const row = rows[index];
  const remaining = rows.filter((_, item) => item !== index);
  const expires = Date.parse(row.expiresAt);
  if (!Number.isFinite(expires) || expires <= now) return { ok: false, reason: 'expired', remaining };
  return { ok: true, row, remaining };
}

export function garminAuthorizeUrl(input: { clientId: string; codeChallenge: string; state: string }): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: input.clientId,
    code_challenge: input.codeChallenge,
    code_challenge_method: 'S256',
    redirect_uri: GARMIN_REDIRECT_URI,
    state: input.state,
  });
  return `${GARMIN_AUTHORIZE_URL}?${params.toString()}`;
}

export function garminAppReturn(connected: boolean): string {
  return `${GARMIN_APP_SCHEME}://garmin?connected=${connected ? '1' : '0'}`;
}

export function garminReturnFromUrl(url: string): 'connected' | 'cancelled' | null {
  if (!url.startsWith(`${GARMIN_APP_SCHEME}://garmin`)) return null;
  if (/[?&]connected=1(?:&|$)/.test(url)) return 'connected';
  if (/[?&]connected=0(?:&|$)/.test(url)) return 'cancelled';
  return null;
}

export function garminTokenForm(input: {
  clientId: string;
  clientSecret: string;
  code: string;
  codeVerifier: string;
}): URLSearchParams {
  return new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: input.clientId,
    client_secret: input.clientSecret,
    code: input.code,
    code_verifier: input.codeVerifier,
    redirect_uri: GARMIN_REDIRECT_URI,
  });
}

export function garminRefreshForm(input: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}): URLSearchParams {
  return new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: input.clientId,
    client_secret: input.clientSecret,
    refresh_token: input.refreshToken,
  });
}

export type StoredTokens = {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: string;
  refreshExpiresAt: string | null;
  scopes: string;
};

/** expires_in is shortened by 10 minutes. Garmin's guide shows both a one-day example and a three-month lifetime. */
export function readTokenResponse(body: unknown, now: number): StoredTokens | null {
  if (!body || typeof body !== 'object') return null;
  const record = body as Record<string, unknown>;
  const accessToken = text(record.access_token, 4096);
  const refreshToken = text(record.refresh_token, 4096);
  if (!accessToken || !refreshToken) return null;
  const expiresIn = bounded(record.expires_in, 60, 60 * 60 * 24 * 400) ?? 86400;
  const refreshIn = bounded(record.refresh_token_expires_in, 60, 60 * 60 * 24 * 400);
  const scopes = text(record.scope, 400);
  return {
    accessToken,
    refreshToken,
    accessExpiresAt: new Date(now + Math.max(60, expiresIn - 600) * 1000).toISOString(),
    refreshExpiresAt: refreshIn == null ? null : new Date(now + refreshIn * 1000).toISOString(),
    scopes,
  };
}

export function tokenNeedsRefresh(expiresAt: string | null, now: number): boolean {
  if (!expiresAt) return false;
  const at = Date.parse(expiresAt);
  if (!Number.isFinite(at)) return true;
  return at <= now + 600_000;
}

/** Current AES-GCM key. A later key is a new version, not an overwrite of this one. */
export const GARMIN_TOKEN_KEY_VERSION = 1;

export type SealedToken = {
  ciphertext: string;
  nonce: string;
  keyVersion: number;
};

export function garminTokenAad(userId: string, kind: 'access' | 'refresh', version: number): string {
  return `garmin:${version}:${userId}:${kind}`;
}

/** AES-GCM. The key is 32 bytes from base64. The nonce is 12 random bytes. */
export async function sealGarminToken(plain: string, keyBase64: string, aad: string, version = GARMIN_TOKEN_KEY_VERSION): Promise<SealedToken> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, additionalData: new TextEncoder().encode(aad) },
    await importGarminTokenKey(keyBase64),
    new TextEncoder().encode(plain),
  );
  return {
    ciphertext: encodeBase64(new Uint8Array(cipher)),
    nonce: encodeBase64(nonce),
    keyVersion: version,
  };
}

/** Throws garmin-token: decrypt when the key, nonce, or version does not match. The plaintext is not included. */
export async function openGarminToken(sealed: SealedToken, keyBase64: string, aad: string): Promise<string> {
  if (sealed.keyVersion !== GARMIN_TOKEN_KEY_VERSION) throw new Error('garmin-token: version');
  try {
    const plain = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: decodeBase64(sealed.nonce),
        additionalData: new TextEncoder().encode(aad),
      },
      await importGarminTokenKey(keyBase64),
      decodeBase64(sealed.ciphertext),
    );
    return new TextDecoder().decode(plain);
  } catch (error) {
    if (error instanceof Error && error.message === 'garmin-token: key') throw error;
    throw new Error('garmin-token: decrypt');
  }
}

async function importGarminTokenKey(keyBase64: string): Promise<CryptoKey> {
  const raw = decodeBase64(keyBase64.trim());
  if (raw.length !== 32) throw new Error('garmin-token: key');
  const copy = new Uint8Array(raw.byteLength);
  copy.set(raw);
  return crypto.subtle.importKey('raw', copy, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export function mapGarminPush(body: unknown): GarminPushPlan {
  const root = record(body) ?? {};
  return {
    dailies: list(root, 'dailies').map(mapDaily).filter((row): row is GarminPushPlan['dailies'][number] => row != null),
    activities: list(root, 'activities').map(mapActivity).filter((row): row is GarminPushPlan['activities'][number] => row != null),
    sleep: [...list(root, 'sleeps'), ...list(root, 'sleep')].map(mapSleep).filter((row): row is GarminPushPlan['sleep'][number] => row != null),
    userMetrics: list(root, 'userMetrics').map(mapUserMetric).filter((row): row is GarminPushPlan['userMetrics'][number] => row != null),
    respiration: [...list(root, 'respiration'), ...list(root, 'allDayRespiration')].map(mapRespiration).filter((row): row is GarminPushPlan['respiration'][number] => row != null),
    pulseOx: [...list(root, 'pulseox'), ...list(root, 'pulseOx')].map(mapPulseOx).filter((row): row is GarminPushPlan['pulseOx'][number] => row != null),
    hrv: list(root, 'hrv').map(mapHrv).filter((row): row is GarminPushPlan['hrv'][number] => row != null),
    deregistered: unique(deregisteredIds(root)),
    permissionChanges: permissionChanges(root),
  };
}

/**
 * One row per key. `preferFn` chooses between the row already kept and the one just seen.
 * Order of first occurrence is kept.
 */
export function dedupeBy<T>(rows: readonly T[], keyFn: (row: T) => string, preferFn: (current: T, incoming: T) => T): T[] {
  const next = new Map<string, T>();
  for (const row of rows) {
    const key = keyFn(row);
    const current = next.get(key);
    next.set(key, current === undefined ? row : preferFn(current, row));
  }
  return [...next.values()];
}

/** The row that arrived later. */
export function preferLast<T>(_current: T, incoming: T): T {
  return incoming;
}

/**
 * The daily with the larger duration_seconds. Equal or missing durations keep the later row.
 */
export function preferLargerDuration(current: Record<string, unknown>, incoming: Record<string, unknown>): Record<string, unknown> {
  const left = typeof current.duration_seconds === 'number' ? current.duration_seconds : null;
  const right = typeof incoming.duration_seconds === 'number' ? incoming.duration_seconds : null;
  if (right != null && (left == null || right > left)) return incoming;
  if (left != null && (right == null || left > right)) return current;
  return incoming;
}

export function upsertBy<T>(rows: readonly T[], incoming: readonly T[], key: (row: T) => string): T[] {
  const next = new Map<string, T>();
  for (const row of rows) next.set(key(row), row);
  for (const row of incoming) next.set(key(row), row);
  return [...next.values()];
}

export type GarminStore = {
  connections: { userId: string; garminUserId: string; accessToken: string }[];
  dailies: { userId: string; calendarDate: string }[];
  activities: { userId: string; summaryId: string }[];
  sleep: { userId: string; summaryId: string }[];
  userMetrics: { userId: string; summaryId: string }[];
  states: { userId: string; state: string }[];
};

export function withoutGarminUser(store: GarminStore, userId: string): GarminStore {
  return {
    connections: store.connections.filter((row) => row.userId !== userId),
    dailies: store.dailies.filter((row) => row.userId !== userId),
    activities: store.activities.filter((row) => row.userId !== userId),
    sleep: store.sleep.filter((row) => row.userId !== userId),
    userMetrics: store.userMetrics.filter((row) => row.userId !== userId),
    states: store.states.filter((row) => row.userId !== userId),
  };
}

export function applyGarminPush(
  store: GarminStore,
  plan: GarminPushPlan,
  userIdByGarmin: ReadonlyMap<string, string>,
): GarminStore {
  let next: GarminStore = {
    connections: [...store.connections],
    dailies: [...store.dailies],
    activities: [...store.activities],
    sleep: [...store.sleep],
    userMetrics: [...store.userMetrics],
    states: [...store.states],
  };
  const owned = (garminUserId: string) => userIdByGarmin.get(garminUserId) ?? '';
  next.dailies = upsertBy(
    next.dailies,
    plan.dailies.flatMap((row) => {
      const userId = owned(row.garminUserId);
      return userId ? [{ userId, calendarDate: row.calendarDate }] : [];
    }),
    (row) => `${row.userId}:${row.calendarDate}`,
  );
  next.activities = upsertBy(
    next.activities,
    plan.activities.flatMap((row) => {
      const userId = owned(row.garminUserId);
      return userId ? [{ userId, summaryId: row.summaryId }] : [];
    }),
    (row) => `${row.userId}:${row.summaryId}`,
  );
  next.sleep = upsertBy(
    next.sleep,
    plan.sleep.flatMap((row) => {
      const userId = owned(row.garminUserId);
      return userId ? [{ userId, summaryId: row.summaryId }] : [];
    }),
    (row) => `${row.userId}:${row.summaryId}`,
  );
  next.userMetrics = upsertBy(
    next.userMetrics,
    plan.userMetrics.flatMap((row) => {
      const userId = owned(row.garminUserId);
      return userId ? [{ userId, summaryId: row.summaryId }] : [];
    }),
    (row) => `${row.userId}:${row.summaryId}`,
  );
  for (const garminUserId of plan.deregistered) {
    const userId = owned(garminUserId);
    if (userId) next = withoutGarminUser(next, userId);
  }
  return next;
}

export function dailyRowsFor(plan: GarminPushPlan, userIdByGarmin: ReadonlyMap<string, string>): Record<string, unknown>[] {
  return plan.dailies.flatMap((row) => {
    const userId = userIdByGarmin.get(row.garminUserId);
    if (!userId) return [];
    return [{
      user_id: userId,
      calendar_date: row.calendarDate,
      resting_heart_rate_bpm: row.restingHeartRateBpm,
      average_heart_rate_bpm: row.averageHeartRateBpm,
      moderate_minutes: row.moderateMinutes,
      vigorous_minutes: row.vigorousMinutes,
      active_kilocalories: row.activeKilocalories ?? null,
      steps: row.steps ?? null,
      distance_metres: row.distanceMetres ?? null,
      floors_climbed: row.floorsClimbed ?? null,
      min_heart_rate_bpm: row.minHeartRateBpm ?? null,
      max_heart_rate_bpm: row.maxHeartRateBpm ?? null,
      average_stress_level: row.averageStressLevel ?? null,
      body_battery_charged: row.bodyBatteryCharged ?? null,
      body_battery_drained: row.bodyBatteryDrained ?? null,
      body_battery_highest: row.bodyBatteryHighest ?? null,
      body_battery_lowest: row.bodyBatteryLowest ?? null,
      step_goal: row.stepGoal ?? null,
      duration_seconds: row.durationSeconds ?? null,
    }];
  });
}

export function activityRowsFor(plan: GarminPushPlan, userIdByGarmin: ReadonlyMap<string, string>): Record<string, unknown>[] {
  return plan.activities.flatMap((row) => {
    const userId = userIdByGarmin.get(row.garminUserId);
    if (!userId) return [];
    return [{
      user_id: userId,
      summary_id: row.summaryId,
      activity_type: row.activityType,
      activity_name: row.activityName,
      started_at: row.startedAt,
      duration_seconds: row.durationSeconds,
      average_heart_rate_bpm: row.averageHeartRateBpm,
      training_effect: row.trainingEffect,
      anaerobic_effect: row.anaerobicEffect,
    }];
  });
}

export function sleepRowsFor(plan: GarminPushPlan, userIdByGarmin: ReadonlyMap<string, string>): Record<string, unknown>[] {
  return plan.sleep.flatMap((row) => {
    const userId = userIdByGarmin.get(row.garminUserId);
    if (!userId) return [];
    return [{
      user_id: userId,
      summary_id: row.summaryId,
      calendar_date: row.calendarDate,
      duration_seconds: row.durationSeconds,
      deep_seconds: row.deepSeconds,
      light_seconds: row.lightSeconds,
      rem_seconds: row.remSeconds,
      awake_seconds: row.awakeSeconds,
      sleep_score: row.sleepScore,
    }];
  });
}

export function respirationRowsFor(plan: GarminPushPlan, userIdByGarmin: ReadonlyMap<string, string>): Record<string, unknown>[] {
  return plan.respiration.flatMap((row) => {
    const userId = userIdByGarmin.get(row.garminUserId);
    if (!userId) return [];
    return [{
      user_id: userId,
      summary_id: row.summaryId,
      calendar_date: row.calendarDate,
      average_breaths_per_minute: row.averageBreathsPerMinute,
      highest_breaths_per_minute: row.highestBreathsPerMinute,
      lowest_breaths_per_minute: row.lowestBreathsPerMinute,
    }];
  });
}

export function pulseOxRowsFor(plan: GarminPushPlan, userIdByGarmin: ReadonlyMap<string, string>): Record<string, unknown>[] {
  return plan.pulseOx.flatMap((row) => {
    const userId = userIdByGarmin.get(row.garminUserId);
    if (!userId) return [];
    return [{
      user_id: userId,
      summary_id: row.summaryId,
      calendar_date: row.calendarDate,
      average_spo2: row.averageSpo2,
      lowest_spo2: row.lowestSpo2,
      highest_spo2: row.highestSpo2,
    }];
  });
}

export function hrvRowsFor(plan: GarminPushPlan, userIdByGarmin: ReadonlyMap<string, string>): Record<string, unknown>[] {
  return plan.hrv.flatMap((row) => {
    const userId = userIdByGarmin.get(row.garminUserId);
    if (!userId) return [];
    return [{
      user_id: userId,
      summary_id: row.summaryId,
      calendar_date: row.calendarDate,
      last_night_avg_ms: row.lastNightAvgMs,
      last_night_5min_high_ms: row.lastNight5MinHighMs,
    }];
  });
}

export function userMetricRowsFor(plan: GarminPushPlan, userIdByGarmin: ReadonlyMap<string, string>): Record<string, unknown>[] {
  return plan.userMetrics.flatMap((row) => {
    const userId = userIdByGarmin.get(row.garminUserId);
    if (!userId) return [];
    return [{
      user_id: userId,
      summary_id: row.summaryId,
      calendar_date: row.calendarDate,
      vo2_max: row.vo2Max,
      vo2_max_cycling: row.vo2MaxCycling,
      fitness_age: row.fitnessAge,
    }];
  });
}

/**
 * Backfill from the later of connect time and seven days ago, through now.
 * Null when that slice is empty or shorter than a minute. Never starts before connect.
 */
export function garminBackfillWindow(connectedAt: string | null, nowMs: number): { start: number; end: number } | null {
  const end = Math.floor(nowMs / 1000);
  const lookback = end - GARMIN_REFRESH_LOOKBACK_SECONDS;
  let connected = Number.NaN;
  if (connectedAt) {
    const parsed = Date.parse(connectedAt);
    if (Number.isFinite(parsed)) connected = Math.floor(parsed / 1000);
  }
  const start = Number.isFinite(connected) ? Math.max(lookback, connected) : lookback;
  if (end - start < GARMIN_REFRESH_MIN_WINDOW_SECONDS) return null;
  return { start, end };
}

/**
 * One backfill call per summary type. Garmin answers 202 and later pushes the webhook.
 * Activity details are not a type here.
 */
export function garminBackfillUrl(type: (typeof GARMIN_BACKFILL_TYPES)[number], start: number, end: number): string {
  return `https://apis.garmin.com/wellness-api/rest/backfill/${type}?summaryStartTimeInSeconds=${start}&summaryEndTimeInSeconds=${end}`;
}

/**
 * Null means the stored list is unknown, so every summary is asked.
 * A known list asks only for the exports it names.
 */
export function garminBackfillTypes(permissions: string | null): (typeof GARMIN_BACKFILL_TYPES)[number][] {
  if (permissions == null) return [...GARMIN_BACKFILL_TYPES];
  const names = new Set(permissions.split(/\s+/).filter(Boolean));
  return GARMIN_BACKFILL_TYPES.filter((type) => (
    type === 'activities' ? names.has('ACTIVITY_EXPORT') : names.has('HEALTH_EXPORT')
  ));
}

export type GarminBackfillDecision = {
  code: 'asked' | 'permission' | 'rate' | 'backfill';
  /** At least one type was accepted, so the cooldown may start. */
  accepted: boolean;
};

/**
 * 202, 204, and 409 are accepted. 412 and 403 are permission refusals.
 * 429 stops the summary. Any other status is a per-type refusal that is not permission.
 */
export function garminBackfillDecision(statuses: readonly number[]): GarminBackfillDecision {
  let accepted = false;
  let refused = 0;
  for (const status of statuses) {
    if (status === 429) return { code: 'rate', accepted };
    if (status === 202 || status === 204 || status === 409) {
      accepted = true;
      continue;
    }
    if (status === 412 || status === 403) {
      refused += 1;
      continue;
    }
  }
  if (accepted) return { code: 'asked', accepted: true };
  if (statuses.length > 0 && refused === statuses.length) return { code: 'permission', accepted: false };
  if (statuses.length === 0) return { code: 'permission', accepted: false };
  return { code: 'backfill', accepted: false };
}

/** A permissions body. Null when the shape is not a list. An empty list is an empty string. */
export function garminPermissionText(body: unknown): string | null {
  const values = Array.isArray(body)
    ? body
    : body && typeof body === 'object' && Array.isArray((body as { permissions?: unknown }).permissions)
      ? (body as { permissions: unknown[] }).permissions
      : null;
  if (!values) return null;
  return values
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => /^[A-Z0-9_]{1,40}$/.test(item))
    .join(' ');
}

/**
 * The user's own permissions. Null when Garmin did not answer with a list.
 * The status code is the only thing written to the log.
 */
export async function readGarminPermissions(accessToken: string, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  if (!accessToken) return null;
  try {
    const response = await fetchImpl(GARMIN_PERMISSIONS_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      console.error(`garmin-permissions: ${response.status}`);
      return null;
    }
    return garminPermissionText(await response.json());
  } catch {
    console.error('garmin-permissions: 0');
    return null;
  }
}

export const GARMIN_EXPORT_PERMISSIONS = ['ACTIVITY_EXPORT', 'HEALTH_EXPORT'] as const;

const GARMIN_PERMISSION_DAY_MS = 24 * 60 * 60 * 1000;

/** Exports named in a stored list. Null and an empty list are missing both. */
export function garminMissingPermissions(permissions: string | null): GarminExportPermission[] {
  const names = new Set((permissions ?? '').split(/\s+/).filter(Boolean));
  return GARMIN_EXPORT_PERMISSIONS.filter((name) => !names.has(name));
}

/** True when the last permissions read is missing or at least a day old. */
export function garminPermissionCheckDue(checkedAt: string | null, nowMs: number): boolean {
  if (!checkedAt) return true;
  const at = Date.parse(checkedAt);
  if (!Number.isFinite(at)) return true;
  return nowMs - at >= GARMIN_PERMISSION_DAY_MS;
}

/**
 * Connected, and at least one of: a missing export, a refused refresh, or a day
 * with no Garmin rows. A disconnected account does not need the banner.
 * storedNeeds null means the status view does not say yet, so the row count is used.
 */
export function garminPermissionStatus(input: {
  connected: boolean;
  connectedAt: string | null;
  nowMs: number;
  garminRowCount: number;
  storedNeeds: boolean | null;
  storedMissing: string | null;
  refreshRefused?: boolean;
}): { needs: boolean; missing: GarminExportPermission[] } {
  if (!input.connected) return { needs: false, missing: [] };
  const named = new Set((input.storedMissing ?? '').split(/\s+/).filter(Boolean));
  const missing = GARMIN_EXPORT_PERMISSIONS.filter((name) => named.has(name));
  const connectedMs = input.connectedAt ? Date.parse(input.connectedAt) : Number.NaN;
  const staleEmpty = Number.isFinite(connectedMs)
    && input.nowMs - connectedMs > GARMIN_PERMISSION_DAY_MS
    && input.garminRowCount === 0;
  const fromStore = input.storedNeeds === true || (input.storedNeeds == null && (missing.length > 0 || staleEmpty));
  return { needs: fromStore || input.refreshRefused === true, missing };
}

export const GARMIN_HISTORY_WINDOW_MS = 24 * 60 * 60 * 1000;

/** True for 24 hours after Garmin refused every backfill with 412. */
export function garminHistoryCooling(refusedAt: string | null, nowMs: number): boolean {
  if (!refusedAt) return false;
  const at = Date.parse(refusedAt);
  if (!Number.isFinite(at)) return false;
  return nowMs - at < GARMIN_HISTORY_WINDOW_MS;
}

/** Every requested summary came back 412. An empty list is not a refusal. */
export function garminAllHistoricalRefusal(statuses: readonly number[]): boolean {
  return statuses.length > 0 && statuses.every((status) => status === 412);
}

/**
 * Build 50 only reads a body on HTTP 200, and it treats `{ok:true, garmin:'recent'}`
 * as a muted note. `code` is extra; that build ignores it.
 */
export function garminHistoryBody(): { ok: true; garmin: 'recent'; code: 'history' } {
  return { ok: true, garmin: 'recent', code: 'history' };
}

export function garminRefreshCooling(lastAt: string | null, nowMs: number): boolean {
  if (!lastAt) return false;
  const at = Date.parse(lastAt);
  if (!Number.isFinite(at)) return false;
  return nowMs - at < GARMIN_REFRESH_COOLDOWN_MS;
}

export function garminAllowedForCoach(input: {
  consentAi: boolean;
  consentHealth: boolean;
  personalDataEnabled: boolean;
}): boolean {
  return input.consentAi === true && input.consentHealth === true && input.personalDataEnabled === true;
}

export function garminFigures(readings: GarminReadings): {
  heartRate: GarminFigure | null;
  sleep: GarminFigure | null;
  sleepStages: GarminFigure[];
  effort: GarminFigure | null;
  anaerobic: GarminFigure | null;
  workouts: GarminFigure[];
  heartChart: number[];
  sleepChart: number[];
  effortChart: number[];
} {
  const dailies = [...readings.dailies].sort((left, right) => left.calendarDate.localeCompare(right.calendarDate));
  const sleepNights = sleepByNight(readings.sleep);
  const activities = [...readings.activities].sort((left, right) => left.startedAt.localeCompare(right.startedAt));
  const latestDay = dailies.length ? dailies[dailies.length - 1] : null;
  const heartRate = latestDay
    ? figure(
      latestDay.restingHeartRateBpm != null ? 'Resting heart rate' : 'Average heart rate',
      latestDay.restingHeartRateBpm ?? latestDay.averageHeartRateBpm,
      'bpm',
      `on ${ukDay(latestDay.calendarDate)}`,
    )
    : null;
  const latestNight = sleepNights.length ? sleepNights[sleepNights.length - 1] : null;
  const sleep = latestNight
    ? {
      name: 'Sleep',
      value: hoursValue(latestNight.seconds),
      unit: 'h',
      period: `on the night of ${ukDay(latestNight.calendarDate)}`,
    }
    : null;
  const effort = effortFigure(dailies, activities);
  const anaerobicSource = [...activities].reverse().find((activity) => activity.anaerobicEffect != null);
  const anaerobic = anaerobicSource?.anaerobicEffect == null
    ? null
    : {
      name: 'Anaerobic training effect',
      value: trimNumber(anaerobicSource.anaerobicEffect),
      unit: 'score',
      period: `on ${ukDay(anaerobicSource.startedAt)}`,
    };
  const workouts = [...activities].reverse().slice(0, 7).map((activity) => ({
    name: activity.activityName || activity.activityType || 'Workout',
    value: String(Math.max(0, Math.round(activity.durationSeconds / 60))),
    unit: 'min',
    period: heartPeriod(activity),
  }));
  return {
    heartRate,
    sleep,
    sleepStages: sleepStageFigures(readings.sleep),
    effort,
    anaerobic,
    workouts,
    heartChart: dailies
      .map((day) => day.restingHeartRateBpm ?? day.averageHeartRateBpm)
      .filter((value): value is number => value != null)
      .slice(-14),
    sleepChart: sleepNights.map((night) => Math.round((night.seconds / 3600) * 10) / 10).slice(-14),
    effortChart: effortSeries(dailies, activities).slice(-14),
  };
}

export function garminCoachLines(input: {
  consentAi: boolean;
  consentHealth: boolean;
  personalDataEnabled: boolean;
  readings: GarminReadings;
}): string[] {
  if (!garminAllowedForCoach(input)) return [];
  const shown = garminFigures(input.readings);
  const figures = [shown.heartRate, shown.sleep, ...shown.sleepStages, shown.effort, shown.anaerobic, ...shown.workouts].filter((item): item is GarminFigure => item != null);
  return figures.slice(0, 12).map((item) => `Garmin ${item.name} ${item.value} ${item.unit}, ${item.period}`);
}

export function readingsFromRows(input: {
  connected: boolean;
  connectedAt: string | null;
  dailies: unknown;
  activities: unknown;
  sleep: unknown;
  userMetrics?: unknown;
  respiration?: unknown;
  pulseOx?: unknown;
  hrv?: unknown;
  needsPermissions?: boolean;
  missingPermissions?: GarminExportPermission[];
  lastPushAt?: string | null;
  historyRefusedAt?: string | null;
}): GarminReadings {
  return {
    connected: input.connected,
    connectedAt: input.connectedAt,
    needsPermissions: input.needsPermissions === true,
    missingPermissions: input.missingPermissions ?? [],
    lastPushAt: input.lastPushAt ?? null,
    historyRefusedAt: input.historyRefusedAt ?? null,
    respiration: mapRespirationRows(input.respiration),
    pulseOx: mapPulseOxRows(input.pulseOx),
    hrv: mapHrvRows(input.hrv),
    dailies: asList(input.dailies).flatMap((row) => {
      const calendarDate = day(row.calendar_date);
      if (!calendarDate) return [];
      return [{
        calendarDate,
        restingHeartRateBpm: bounded(row.resting_heart_rate_bpm, 20, 250),
        averageHeartRateBpm: bounded(row.average_heart_rate_bpm, 20, 250),
        moderateMinutes: bounded(row.moderate_minutes, 0, 24 * 60),
        vigorousMinutes: bounded(row.vigorous_minutes, 0, 24 * 60),
        activeKilocalories: roundedKcal(row.active_kilocalories),
        steps: wholeNumber(row.steps, 0, 200_000),
        distanceMetres: wholeNumber(row.distance_metres, 0, 500_000),
        floorsClimbed: wholeNumber(row.floors_climbed, 0, 1_000),
        minHeartRateBpm: bounded(row.min_heart_rate_bpm, 20, 250),
        maxHeartRateBpm: bounded(row.max_heart_rate_bpm, 20, 250),
        averageStressLevel: wholeNumber(row.average_stress_level, 0, 100),
        bodyBatteryCharged: wholeNumber(row.body_battery_charged, 0, 100),
        bodyBatteryDrained: wholeNumber(row.body_battery_drained, 0, 100),
        bodyBatteryHighest: wholeNumber(row.body_battery_highest, 0, 100),
        bodyBatteryLowest: wholeNumber(row.body_battery_lowest, 0, 100),
        stepGoal: wholeNumber(row.step_goal, 0, 200_000),
        durationSeconds: wholeNumber(row.duration_seconds, 0, 24 * 60 * 60),
      }];
    }),
    activities: asList(input.activities).flatMap((row) => {
      const summaryId = ident(row.summary_id);
      const startedAt = instant(row.started_at);
      const durationSeconds = bounded(row.duration_seconds, 0, 24 * 60 * 60);
      if (!summaryId || !startedAt || durationSeconds == null) return [];
      return [{
        summaryId,
        activityType: text(row.activity_type, 40),
        activityName: text(row.activity_name, 80),
        startedAt,
        durationSeconds,
        averageHeartRateBpm: bounded(row.average_heart_rate_bpm, 20, 250),
        trainingEffect: bounded(row.training_effect, 0, 5),
        anaerobicEffect: bounded(row.anaerobic_effect, 0, 5),
      }];
    }),
    sleep: asList(input.sleep).flatMap((row) => {
      const summaryId = ident(row.summary_id);
      const calendarDate = day(row.calendar_date);
      const durationSeconds = bounded(row.duration_seconds, 0, 24 * 60 * 60);
      if (!summaryId || !calendarDate || durationSeconds == null) return [];
      return [{
        summaryId,
        calendarDate,
        durationSeconds,
        deepSeconds: bounded(row.deep_seconds, 0, 24 * 60 * 60),
        lightSeconds: bounded(row.light_seconds, 0, 24 * 60 * 60),
        remSeconds: bounded(row.rem_seconds, 0, 24 * 60 * 60),
        awakeSeconds: bounded(row.awake_seconds, 0, 24 * 60 * 60),
        sleepScore: bounded(row.sleep_score, 0, 100),
      }];
    }),
    userMetrics: asList(input.userMetrics).flatMap((row) => {
      const summaryId = ident(row.summary_id);
      const calendarDate = day(row.calendar_date);
      if (!summaryId || !calendarDate) return [];
      const vo2Max = bounded(row.vo2_max, 1, 100);
      const vo2MaxCycling = bounded(row.vo2_max_cycling, 1, 100);
      const fitnessAge = bounded(row.fitness_age, 1, 120);
      if (vo2Max == null && vo2MaxCycling == null && fitnessAge == null) return [];
      return [{
        summaryId,
        calendarDate,
        vo2Max: vo2Max == null ? null : Math.round(vo2Max * 10) / 10,
        vo2MaxCycling: vo2MaxCycling == null ? null : Math.round(vo2MaxCycling * 10) / 10,
        fitnessAge: fitnessAge == null ? null : Math.round(fitnessAge),
      }];
    }),
  };
}

export type WebhookGate =
  | { ok: true }
  | { ok: false; status: 401 | 503; log: 'garmin-webhook: secret unset' | 'garmin-webhook: token rejected' };

export type WebhookPathSecret = { kind: 'none' } | { kind: 'segment'; value: string } | { kind: 'invalid' };

export type WebhookRoute = {
  path: WebhookPathSecret;
  clientIdHeader: string | null;
  clientId: string | null | undefined;
};

const WEBHOOK_SLUG = 'garmin-webhook';

/**
 * Garmin's endpoint tool drops a query string, so the secret can ride as the one
 * path segment after garmin-webhook/. A bare /garmin-webhook (or a trailing slash)
 * is 'none'. Anything else, an extra segment, an empty segment or a bad escape, is 'invalid'.
 */
export function webhookPathSecret(pathname: string): WebhookPathSecret {
  const parts = pathname.split('/');
  const at = parts.indexOf(WEBHOOK_SLUG);
  if (at < 0) return { kind: 'invalid' };
  const rest = parts.slice(at + 1);
  if (rest.length === 0 || (rest.length === 1 && rest[0] === '')) return { kind: 'none' };
  if (rest.length !== 1) return { kind: 'invalid' };
  try {
    const value = decodeURIComponent(rest[0]);
    return value ? { kind: 'segment', value } : { kind: 'invalid' };
  } catch {
    return { kind: 'invalid' };
  }
}

/**
 * Fail closed. An empty secret is refused with 503.
 * Path route (/garmin-webhook/<secret>, what Garmin is given): the segment must match
 * the secret and the garmin-client-id header must match GARMIN_CLIENT_ID; if that env
 * var is unset the route is refused. Query (?token=) and Authorization: Bearer stay
 * for our own smoke tests and need no client id. Every refusal is the same plain 401.
 */
export function webhookGate(
  header: string | null,
  queryToken: string | null,
  secret: string | null | undefined,
  route?: WebhookRoute,
): WebhookGate {
  const expected = (secret ?? '').trim();
  if (!expected) return { ok: false, status: 503, log: 'garmin-webhook: secret unset' };
  const rejected: WebhookGate = { ok: false, status: 401, log: 'garmin-webhook: token rejected' };
  const path = route?.path ?? { kind: 'none' };
  if (path.kind === 'invalid') return rejected;
  if (path.kind === 'segment') {
    const clientId = (route?.clientId ?? '').trim();
    const presented = (route?.clientIdHeader ?? '').trim();
    const secretOk = constantTimeEqual(path.value, expected);
    const clientOk = clientId.length > 0 && constantTimeEqual(presented, clientId);
    return secretOk && clientOk ? { ok: true } : rejected;
  }
  const bearer = bearerToken(header);
  const query = (queryToken ?? '').trim();
  const queryOk = constantTimeEqual(query, expected);
  const bearerOk = constantTimeEqual(bearer, expected);
  if (queryOk || bearerOk) return { ok: true };
  return rejected;
}

function bearerToken(header: string | null): string {
  if (!header) return '';
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match?.[1] ?? '';
}

export function constantTimeEqual(left: string, right: string): boolean {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  const length = Math.max(a.length, b.length);
  let diff = a.length === b.length ? 0 : 1;
  for (let index = 0; index < length; index += 1) diff |= (a[index] ?? 0) ^ (b[index] ?? 0);
  return diff === 0;
}

export function missingRelation(message: string): boolean {
  return /does not exist|schema cache|could not find the table/i.test(message);
}

/** A select that names a column the live table does not have yet. The table itself can still be read. */
export function missingColumn(message: string, column: string): boolean {
  return missingRelation(message) && message.toLowerCase().includes(column.toLowerCase());
}

type QueryResult = { data: unknown; error: { message: string } | null };

type EqChain = {
  eq(column: string, value: string): Promise<QueryResult> & { maybeSingle(): Promise<QueryResult> };
};

export type GarminDb = {
  from(table: string): {
    select(columns: string): EqChain & { in(column: string, values: string[]): EqChain };
    delete(): { eq(column: string, value: string): Promise<QueryResult> };
    upsert(rows: Record<string, unknown>[], options: { onConflict: string }): Promise<QueryResult>;
    update(values: Record<string, unknown>): { eq(column: string, value: string): Promise<QueryResult> };
    insert(values: Record<string, unknown>): Promise<QueryResult>;
  };
};

export async function deregisterRemote(accessToken: string, fetchImpl: typeof fetch = fetch): Promise<'ok' | 'failed'> {
  if (!accessToken) return 'failed';
  try {
    const response = await fetchImpl(GARMIN_DEREGISTER_URL, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (response.ok || response.status === 404) return 'ok';
    return 'failed';
  } catch {
    return 'failed';
  }
}

/** Opens this person's Garmin access token. An empty string means there is no live connection. */
export async function bearerForGarminUser(
  db: GarminDb,
  userId: string,
  credentials: { clientId: string; clientSecret: string; tokenKey: string; now: number },
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const selected = await db
    .from('garmin_connections')
    .select('access_token_ciphertext, access_token_nonce, refresh_token_ciphertext, refresh_token_nonce, token_key_version, access_expires_at, revoked_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (selected.error) {
    if (missingRelation(selected.error.message)) return '';
    throw new Error('garmin-refresh: lookup');
  }
  const row = selected.data && typeof selected.data === 'object' ? selected.data as Record<string, unknown> : null;
  if (!row || row.revoked_at) return '';
  const accessCipher = sealedText(row.access_token_ciphertext);
  const refreshCipher = sealedText(row.refresh_token_ciphertext);
  if (!accessCipher && !refreshCipher) return '';
  const version = Number(row.token_key_version);
  if (version !== GARMIN_TOKEN_KEY_VERSION || !credentials.tokenKey.trim()) throw new Error('garmin-refresh: key');
  let bearer = await openGarminToken({
    ciphertext: accessCipher,
    nonce: sealedText(row.access_token_nonce),
    keyVersion: version,
  }, credentials.tokenKey, garminTokenAad(userId, 'access', version));
  const refreshToken = await openGarminToken({
    ciphertext: refreshCipher,
    nonce: sealedText(row.refresh_token_nonce),
    keyVersion: version,
  }, credentials.tokenKey, garminTokenAad(userId, 'refresh', version));
  const expiresAt = text(row.access_expires_at, 40);
  if (bearer && refreshToken && credentials.clientId && credentials.clientSecret && tokenNeedsRefresh(expiresAt || null, credentials.now)) {
    const refreshed = await refreshAccessToken({
      clientId: credentials.clientId,
      clientSecret: credentials.clientSecret,
      refreshToken,
      now: credentials.now,
      fetchImpl,
    });
    if (refreshed) {
      bearer = refreshed.accessToken;
      const access = await sealGarminToken(refreshed.accessToken, credentials.tokenKey, garminTokenAad(userId, 'access', version));
      const refresh = await sealGarminToken(refreshed.refreshToken, credentials.tokenKey, garminTokenAad(userId, 'refresh', version));
      await db.from('garmin_connections').update({
        access_token_ciphertext: access.ciphertext,
        access_token_nonce: access.nonce,
        refresh_token_ciphertext: refresh.ciphertext,
        refresh_token_nonce: refresh.nonce,
        access_expires_at: refreshed.accessExpiresAt,
        refresh_expires_at: refreshed.refreshExpiresAt,
      }).eq('user_id', userId);
    }
  }
  return bearer;
}

/** Removes tokens and summaries for one account. Does not call Garmin. */
export async function deleteGarminRows(db: GarminDb, userId: string): Promise<void> {
  for (const table of GARMIN_DATA_TABLES) {
    const removed = await db.from(table).delete().eq('user_id', userId);
    if (removed.error && !missingRelation(removed.error.message)) throw new Error('garmin-webhook: delete');
  }
}

/** Calls Garmin, then removes this person's tokens and summaries. A missing table is ignored. */
export async function forgetGarminAccount(
  db: GarminDb,
  userId: string,
  credentials: { clientId: string; clientSecret: string; tokenKey: string; now: number },
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const selected = await db
    .from('garmin_connections')
    .select('access_token_ciphertext, access_token_nonce, refresh_token_ciphertext, refresh_token_nonce, token_key_version, access_expires_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (selected.error) {
    if (missingRelation(selected.error.message)) return;
    throw new Error('garmin-disconnect: lookup');
  }
  const row = selected.data && typeof selected.data === 'object' ? selected.data as Record<string, unknown> : {};
  const accessCipher = sealedText(row.access_token_ciphertext);
  const refreshCipher = sealedText(row.refresh_token_ciphertext);
  let bearer = '';
  if (accessCipher || refreshCipher) {
    const version = Number(row.token_key_version);
    if (version !== GARMIN_TOKEN_KEY_VERSION) {
      console.error('garmin-disconnect: key version');
      throw new Error('garmin-disconnect: key version');
    }
    if (!credentials.tokenKey.trim()) {
      console.error('garmin-disconnect: key');
      throw new Error('garmin-disconnect: key');
    }
    try {
      bearer = await openGarminToken({
        ciphertext: accessCipher,
        nonce: sealedText(row.access_token_nonce),
        keyVersion: version,
      }, credentials.tokenKey, garminTokenAad(userId, 'access', version));
      const refreshToken = await openGarminToken({
        ciphertext: refreshCipher,
        nonce: sealedText(row.refresh_token_nonce),
        keyVersion: version,
      }, credentials.tokenKey, garminTokenAad(userId, 'refresh', version));
      const expiresAt = text(row.access_expires_at, 40);
      if (bearer && refreshToken && credentials.clientId && credentials.clientSecret && tokenNeedsRefresh(expiresAt || null, credentials.now)) {
        const refreshed = await refreshAccessToken({
          clientId: credentials.clientId,
          clientSecret: credentials.clientSecret,
          refreshToken,
          now: credentials.now,
          fetchImpl,
        });
        if (refreshed) bearer = refreshed.accessToken;
      }
    } catch {
      console.error('garmin-disconnect: decrypt');
      throw new Error('garmin-disconnect: decrypt');
    }
  }
  if (bearer) {
    const remote = await deregisterRemote(bearer, fetchImpl);
    if (remote === 'failed') console.error('garmin-disconnect: remote');
  }
  for (const table of GARMIN_DATA_TABLES) {
    const removed = await db.from(table).delete().eq('user_id', userId);
    if (removed.error && !missingRelation(removed.error.message)) throw new Error('garmin-disconnect: delete');
  }
}

function sealedText(value: unknown): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 12000) return '';
  return trimmed;
}

async function refreshAccessToken(input: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  now: number;
  fetchImpl: typeof fetch;
}): Promise<StoredTokens | null> {
  try {
    const response = await input.fetchImpl(GARMIN_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: garminRefreshForm(input),
    });
    if (!response.ok) return null;
    return readTokenResponse(await response.json(), input.now);
  } catch {
    return null;
  }
}

function effortFigure(dailies: GarminDaily[], activities: GarminActivity[]): GarminFigure | null {
  const latest = [...activities].reverse().find((activity) => activity.trainingEffect != null || activity.anaerobicEffect != null);
  if (latest?.trainingEffect != null) {
    return {
      name: 'Training effect',
      value: trimNumber(latest.trainingEffect),
      unit: 'score',
      period: `on ${ukDay(latest.startedAt)}`,
    };
  }
  const day = [...dailies].reverse().find((item) => (item.moderateMinutes ?? 0) + (item.vigorousMinutes ?? 0) > 0);
  if (!day) return null;
  return {
    name: 'Brisk and vigorous minutes',
    value: String((day.moderateMinutes ?? 0) + (day.vigorousMinutes ?? 0)),
    unit: 'min',
    period: `on ${ukDay(day.calendarDate)}`,
  };
}

function effortSeries(dailies: GarminDaily[], activities: GarminActivity[]): number[] {
  if (activities.some((activity) => activity.trainingEffect != null)) {
    return activities.flatMap((activity) => activity.trainingEffect == null ? [] : [activity.trainingEffect]);
  }
  return dailies.flatMap((day) => {
    const minutes = (day.moderateMinutes ?? 0) + (day.vigorousMinutes ?? 0);
    return minutes > 0 ? [minutes] : [];
  });
}

function heartPeriod(activity: GarminActivity): string {
  const heart = activity.averageHeartRateBpm == null ? '' : `, average heart rate ${activity.averageHeartRateBpm} bpm`;
  return `on ${ukDay(activity.startedAt)}${heart}`;
}

function figure(name: string, value: number | null, unit: string, period: string): GarminFigure | null {
  if (value == null) return null;
  return { name, value: trimNumber(value), unit, period };
}

function sleepStageFigures(rows: GarminSleep[]): GarminFigure[] {
  if (!rows.length) return [];
  const latest = [...rows].map((row) => row.calendarDate).sort().at(-1) ?? '';
  const night = rows.filter((row) => row.calendarDate === latest);
  const period = `on the night of ${ukDay(latest)}`;
  const sum = (pick: (row: GarminSleep) => number | null) => {
    const values = night.map(pick).filter((value): value is number => value != null);
    if (!values.length) return null;
    return values.reduce((total, value) => total + value, 0);
  };
  return [
    hoursFigure('Deep sleep', sum((row) => row.deepSeconds), period),
    hoursFigure('Light sleep', sum((row) => row.lightSeconds), period),
    hoursFigure('REM sleep', sum((row) => row.remSeconds), period),
    hoursFigure('Awake', sum((row) => row.awakeSeconds), period),
  ].filter((item): item is GarminFigure => item != null);
}

function hoursFigure(name: string, seconds: number | null, period: string): GarminFigure | null {
  if (seconds == null) return null;
  return { name, value: hoursValue(seconds), unit: 'h', period };
}

function sleepByNight(rows: GarminSleep[]): { calendarDate: string; seconds: number }[] {
  const totals = new Map<string, number>();
  for (const row of rows) totals.set(row.calendarDate, (totals.get(row.calendarDate) ?? 0) + row.durationSeconds);
  return [...totals.entries()]
    .map(([calendarDate, seconds]) => ({ calendarDate, seconds }))
    .sort((left, right) => left.calendarDate.localeCompare(right.calendarDate));
}

function hoursValue(seconds: number): string {
  return (Math.round((seconds / 3600) * 10) / 10).toFixed(1);
}

function trimNumber(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function ukDay(iso: string): string {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T00:00:00Z`) : new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const weekday = date.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });
  const dayPart = date.toLocaleDateString('en-GB', { day: 'numeric', timeZone: 'UTC' });
  const month = date.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });
  const year = date.toLocaleDateString('en-GB', { year: 'numeric', timeZone: 'UTC' });
  return `${weekday} ${dayPart} ${month} ${year}`.replace(/,/g, '');
}

function mapDaily(row: Record<string, unknown>): GarminPushPlan['dailies'][number] | null {
  const garminUserId = ident(row.userId);
  const calendarDate = day(row.calendarDate);
  if (!garminUserId || !calendarDate) return null;
  const battery = record(row.bodyBattery);
  return {
    garminUserId,
    calendarDate,
    restingHeartRateBpm: bounded(row.restingHeartRateInBeatsPerMinute, 20, 250),
    averageHeartRateBpm: bounded(row.averageHeartRateInBeatsPerMinute, 20, 250),
    minHeartRateBpm: bounded(row.minHeartRateInBeatsPerMinute, 20, 250),
    maxHeartRateBpm: bounded(row.maxHeartRateInBeatsPerMinute, 20, 250),
    moderateMinutes: minutesFromSeconds(row.moderateIntensityDurationInSeconds),
    vigorousMinutes: minutesFromSeconds(row.vigorousIntensityDurationInSeconds),
    activeKilocalories: roundedKcal(row.activeKilocalories),
    steps: wholeNumber(row.steps, 0, 200_000),
    distanceMetres: wholeNumber(row.distanceInMeters, 0, 500_000),
    floorsClimbed: wholeNumber(row.floorsClimbed, 0, 1_000),
    averageStressLevel: wholeNumber(row.averageStressLevel, 0, 100),
    bodyBatteryCharged: wholeNumber(row.bodyBatteryChargedValue ?? battery?.chargedValue ?? battery?.charged, 0, 100),
    bodyBatteryDrained: wholeNumber(row.bodyBatteryDrainedValue ?? battery?.drainedValue ?? battery?.drained, 0, 100),
    bodyBatteryHighest: wholeNumber(row.bodyBatteryHighestValue ?? battery?.highestValue ?? battery?.highest, 0, 100),
    bodyBatteryLowest: wholeNumber(row.bodyBatteryLowestValue ?? battery?.lowestValue ?? battery?.lowest, 0, 100),
    stepGoal: wholeNumber(row.stepsGoal, 0, 200_000),
    durationSeconds: wholeNumber(row.durationInSeconds, 0, 24 * 60 * 60),
  };
}

function mapRespiration(row: Record<string, unknown>): GarminPushPlan['respiration'][number] | null {
  const garminUserId = ident(row.userId);
  const calendarDate = day(row.calendarDate);
  if (!garminUserId || !calendarDate) return null;
  const series = sampleSpan(row.timeOffsetEpochToBreaths, 1, 80);
  const average = oneDecimal(bounded(row.averageRespirationValue ?? row.avgWakingRespirationValue, 1, 80) ?? series.average);
  const highest = oneDecimal(bounded(row.highestRespirationValue, 1, 80) ?? series.highest);
  const lowest = oneDecimal(bounded(row.lowestRespirationValue, 1, 80) ?? series.lowest);
  if (average == null && highest == null && lowest == null) return null;
  return {
    garminUserId,
    summaryId: ident(row.summaryId) || `breath-${calendarDate}`,
    calendarDate,
    averageBreathsPerMinute: average,
    highestBreathsPerMinute: highest,
    lowestBreathsPerMinute: lowest,
  };
}

function mapPulseOx(row: Record<string, unknown>): GarminPushPlan['pulseOx'][number] | null {
  const garminUserId = ident(row.userId);
  const calendarDate = day(row.calendarDate);
  if (!garminUserId || !calendarDate) return null;
  const series = sampleSpan(row.timeOffsetSpo2Values, 50, 100);
  const average = oneDecimal(bounded(row.averageSpo2 ?? row.averageSpO2Value, 50, 100) ?? series.average);
  const lowest = oneDecimal(bounded(row.lowestSpo2 ?? row.lowestSpO2Value, 50, 100) ?? series.lowest);
  const highest = oneDecimal(bounded(row.highestSpo2 ?? row.highestSpO2Value, 50, 100) ?? series.highest);
  if (average == null && lowest == null && highest == null) return null;
  return {
    garminUserId,
    summaryId: ident(row.summaryId) || `spo2-${calendarDate}`,
    calendarDate,
    averageSpo2: average,
    lowestSpo2: lowest,
    highestSpo2: highest,
  };
}

function mapHrv(row: Record<string, unknown>): GarminPushPlan['hrv'][number] | null {
  const garminUserId = ident(row.userId);
  const calendarDate = day(row.calendarDate);
  if (!garminUserId || !calendarDate) return null;
  const series = sampleSpan(row.hrvValues, 1, 300);
  const average = wholeNumber(row.lastNightAvg, 1, 300) ?? (series.average == null ? null : Math.round(series.average));
  const high = wholeNumber(row.lastNight5MinHigh, 1, 300);
  if (average == null && high == null) return null;
  return {
    garminUserId,
    summaryId: ident(row.summaryId) || `hrv-${calendarDate}`,
    calendarDate,
    lastNightAvgMs: average,
    lastNight5MinHighMs: high,
  };
}

function mapRespirationRows(value: unknown): GarminRespiration[] {
  return asList(value).flatMap((row) => {
    const summaryId = ident(row.summary_id);
    const calendarDate = day(row.calendar_date);
    if (!summaryId || !calendarDate) return [];
    return [{
      summaryId,
      calendarDate,
      averageBreathsPerMinute: oneDecimal(bounded(row.average_breaths_per_minute, 1, 80)),
      highestBreathsPerMinute: oneDecimal(bounded(row.highest_breaths_per_minute, 1, 80)),
      lowestBreathsPerMinute: oneDecimal(bounded(row.lowest_breaths_per_minute, 1, 80)),
    }];
  });
}

function mapPulseOxRows(value: unknown): GarminPulseOx[] {
  return asList(value).flatMap((row) => {
    const summaryId = ident(row.summary_id);
    const calendarDate = day(row.calendar_date);
    if (!summaryId || !calendarDate) return [];
    return [{
      summaryId,
      calendarDate,
      averageSpo2: oneDecimal(bounded(row.average_spo2, 50, 100)),
      lowestSpo2: oneDecimal(bounded(row.lowest_spo2, 50, 100)),
      highestSpo2: oneDecimal(bounded(row.highest_spo2, 50, 100)),
    }];
  });
}

function mapHrvRows(value: unknown): GarminHrvSummary[] {
  return asList(value).flatMap((row) => {
    const summaryId = ident(row.summary_id);
    const calendarDate = day(row.calendar_date);
    if (!summaryId || !calendarDate) return [];
    return [{
      summaryId,
      calendarDate,
      lastNightAvgMs: wholeNumber(row.last_night_avg_ms, 1, 300),
      lastNight5MinHighMs: wholeNumber(row.last_night_5min_high_ms, 1, 300),
    }];
  });
}

/** Average, lowest, and highest from a time-offset map. The map itself is not returned. */
function sampleSpan(value: unknown, min: number, max: number): { average: number | null; lowest: number | null; highest: number | null } {
  const row = record(value);
  if (!row) return { average: null, lowest: null, highest: null };
  const numbers = Object.values(row).map((item) => bounded(item, min, max)).filter((item): item is number => item != null);
  if (!numbers.length) return { average: null, lowest: null, highest: null };
  const sum = numbers.reduce((total, item) => total + item, 0);
  return {
    average: sum / numbers.length,
    lowest: Math.min(...numbers),
    highest: Math.max(...numbers),
  };
}

function mapActivity(row: Record<string, unknown>): GarminPushPlan['activities'][number] | null {
  const garminUserId = ident(row.userId);
  const summaryId = ident(row.summaryId) || ident(row.activityId);
  const started = bounded(row.startTimeInSeconds, 1, 4_000_000_000);
  const durationSeconds = bounded(row.durationInSeconds, 0, 24 * 60 * 60);
  if (!garminUserId || !summaryId || started == null || durationSeconds == null) return null;
  return {
    garminUserId,
    summaryId,
    activityType: text(row.activityType, 40),
    activityName: text(row.activityName, 80),
    startedAt: new Date(started * 1000).toISOString(),
    durationSeconds,
    averageHeartRateBpm: bounded(row.averageHeartRateInBeatsPerMinute, 20, 250),
    trainingEffect: bounded(row.aerobicTrainingEffect ?? row.trainingEffect, 0, 5),
    anaerobicEffect: bounded(row.anaerobicTrainingEffect, 0, 5),
  };
}

function mapUserMetric(row: Record<string, unknown>): GarminPushPlan['userMetrics'][number] | null {
  const garminUserId = ident(row.userId);
  const summaryId = ident(row.summaryId);
  const calendarDate = day(row.calendarDate);
  const vo2Max = bounded(row.vo2Max, 1, 100);
  const vo2MaxCycling = bounded(row.vo2MaxCycling, 1, 100);
  const fitnessAge = bounded(row.fitnessAge, 1, 120);
  if (!garminUserId || !summaryId || !calendarDate) return null;
  if (vo2Max == null && vo2MaxCycling == null && fitnessAge == null) return null;
  return {
    garminUserId,
    summaryId,
    calendarDate,
    vo2Max: vo2Max == null ? null : Math.round(vo2Max * 10) / 10,
    vo2MaxCycling: vo2MaxCycling == null ? null : Math.round(vo2MaxCycling * 10) / 10,
    fitnessAge: fitnessAge == null ? null : Math.round(fitnessAge),
  };
}

function mapSleep(row: Record<string, unknown>): GarminPushPlan['sleep'][number] | null {
  const garminUserId = ident(row.userId);
  const calendarDate = day(row.calendarDate);
  const durationSeconds = bounded(row.durationInSeconds, 0, 24 * 60 * 60);
  const summaryId = ident(row.summaryId) || (calendarDate ? `night-${calendarDate}` : '');
  if (!garminUserId || !calendarDate || !summaryId || durationSeconds == null) return null;
  const score = record(row.overallSleepScore);
  return {
    garminUserId,
    summaryId,
    calendarDate,
    durationSeconds,
    deepSeconds: bounded(row.deepSleepDurationInSeconds, 0, 24 * 60 * 60),
    lightSeconds: bounded(row.lightSleepDurationInSeconds, 0, 24 * 60 * 60),
    remSeconds: bounded(row.remSleepInSeconds, 0, 24 * 60 * 60),
    awakeSeconds: bounded(row.awakeDurationInSeconds, 0, 24 * 60 * 60),
    sleepScore: bounded(score?.value ?? row.sleepScore, 0, 100),
  };
}

function deregisteredIds(root: Record<string, unknown>): string[] {
  const rows = [...list(root, 'deregistrations'), ...list(root, 'deregistration')];
  return rows.map((row) => ident(row.userId)).filter(Boolean);
}

function permissionChanges(root: Record<string, unknown>): GarminPushPlan['permissionChanges'] {
  const rows = [...list(root, 'userPermissionsChange'), ...list(root, 'userPermissionChanges')];
  return rows.flatMap((row) => {
    const garminUserId = ident(row.userId);
    if (!garminUserId || !('permissions' in row)) return [];
    const permissions = Array.isArray(row.permissions)
      ? row.permissions.map((item) => text(item, 40)).filter(Boolean).join(' ')
      : text(row.permissions, 400);
    return [{ garminUserId, permissions }];
  });
}

function minutesFromSeconds(value: unknown): number | null {
  const seconds = bounded(value, 0, 24 * 60 * 60);
  if (seconds == null) return null;
  return Math.round(seconds / 60);
}

function roundedKcal(value: unknown): number | null {
  const kcal = bounded(value, 0, 20000);
  return kcal == null ? null : Math.round(kcal);
}

function wholeNumber(value: unknown, min: number, max: number): number | null {
  const number = bounded(value, min, max);
  return number == null ? null : Math.round(number);
}

function oneDecimal(value: number | null): number | null {
  if (value == null) return null;
  return Math.round(value * 10) / 10;
}

function list(root: Record<string, unknown>, key: string): Record<string, unknown>[] {
  const value = root[key];
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const row = record(item);
    return row ? [row] : [];
  });
}

function asList(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const row = record(item);
    return row ? [row] : [];
  });
}

function record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function bounded(value: unknown, min: number, max: number): number | null {
  const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : Number.NaN;
  if (!Number.isFinite(number) || number < min || number > max) return null;
  return number;
}

function text(value: unknown, max: number): string {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value).replace(/[\u0000-\u001f]/g, '').trim().slice(0, max);
}

function ident(value: unknown): string {
  const raw = text(value, 128);
  return /^[A-Za-z0-9_-]+$/.test(raw) ? raw : '';
}

function day(value: unknown): string {
  const raw = text(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
}

function instant(value: unknown): string {
  const raw = text(value, 40);
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) return '';
  return new Date(parsed).toISOString();
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decodeBase64(value: string) {
  const binary = atob(value.replace(/\s/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}
