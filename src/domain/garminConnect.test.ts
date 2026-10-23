import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { buildThumosContext } from '../../supabase/functions/_shared/thumos';
import {
  GARMIN_BACKFILL_TYPES,
  GARMIN_DATA_TABLES,
  GARMIN_REDIRECT_URI,
  activityRowsFor,
  applyGarminPush,
  dailyRowsFor,
  dedupeBy,
  emptyGarminReadings,
  garminAllowedForCoach,
  garminAppReturn,
  garminAuthorizeUrl,
  garminCoachLines,
  garminFigures,
  garminRefreshForm,
  garminReturnFromUrl,
  garminTokenForm,
  garminBackfillUrl,
  garminRefreshCooling,
  mapGarminPush,
  preferLargerDuration,
  preferLast,
  userMetricRowsFor,
  pkceChallenge,
  pkceRecord,
  pkceVerifier,
  readTokenResponse,
  sleepRowsFor,
  takePkceState,
  garminTokenAad,
  openGarminToken,
  sealGarminToken,
  webhookGate,
  webhookPathSecret,
  withoutGarminUser,
  type GarminReadings,
  type GarminStore,
} from '../../supabase/functions/_shared/garmin';

const now = Date.parse('2026-10-22T12:00:00Z');

describe('Garmin PKCE state', () => {
  it('builds a verifier, an S256 challenge, and a single-use state that expires', async () => {
    const verifier = pkceVerifier(new Uint8Array(64).fill(7));
    expect(verifier).toHaveLength(64);
    expect(verifier).toMatch(/^[A-Za-z0-9\-._~]+$/);
    const challenge = await pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk');
    expect(challenge).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
    const row = pkceRecord('user-1', now, new Uint8Array(64).fill(3), new Uint8Array(64).fill(9));
    expect(row.state).toHaveLength(43);
    expect(row.codeVerifier).toHaveLength(64);
    expect(Date.parse(row.expiresAt) - now).toBe(10 * 60 * 1000);
    const url = garminAuthorizeUrl({ clientId: 'client', codeChallenge: challenge, state: row.state });
    expect(url.startsWith('https://connect.garmin.com/oauth2Confirm?')).toBe(true);
    expect(url).toContain('code_challenge_method=S256');
    expect(url).toContain(encodeURIComponent(GARMIN_REDIRECT_URI));
    expect(url).not.toContain('client_secret');
    const kept = takePkceState([row], row.state, now);
    expect(kept.ok).toBe(true);
    if (kept.ok) expect(kept.remaining).toEqual([]);
    const again = takePkceState(kept.ok ? kept.remaining : [], row.state, now);
    expect(again).toMatchObject({ ok: false, reason: 'missing' });
    const stale = takePkceState([row], row.state, Date.parse(row.expiresAt));
    expect(stale).toMatchObject({ ok: false, reason: 'expired' });
    expect(stale.remaining).toEqual([]);
  });

  it('sends the verifier only on the token request', () => {
    const form = garminTokenForm({
      clientId: 'client',
      clientSecret: 'secret',
      code: 'code',
      codeVerifier: 'verifier',
    });
    expect(form.get('grant_type')).toBe('authorization_code');
    expect(form.get('code_verifier')).toBe('verifier');
    expect(form.get('redirect_uri')).toBe(GARMIN_REDIRECT_URI);
    const refresh = garminRefreshForm({ clientId: 'client', clientSecret: 'secret', refreshToken: 'next' });
    expect(refresh.get('grant_type')).toBe('refresh_token');
    const tokens = readTokenResponse({
      access_token: 'access',
      refresh_token: 'refresh',
      expires_in: 86400,
      scope: 'CONNECT_READ',
    }, now);
    expect(tokens?.accessExpiresAt).toBe(new Date(now + (86400 - 600) * 1000).toISOString());
    expect(garminAppReturn(true)).toBe('uk.co.quanticalabs.charioteer://garmin?connected=1');
    expect(garminReturnFromUrl('uk.co.quanticalabs.charioteer://garmin?connected=1')).toBe('connected');
    expect(garminReturnFromUrl('charioteer://garmin?connected=1')).toBeNull();
  });
});

describe('Garmin webhook mapping', () => {
  const push = {
    dailies: [{
      userId: 'garmin1',
      calendarDate: '2026-10-21',
      restingHeartRateInBeatsPerMinute: 61,
      averageHeartRateInBeatsPerMinute: 72,
      moderateIntensityDurationInSeconds: 1200,
      vigorousIntensityDurationInSeconds: 600,
      timeOffsetHeartRateSamples: { '15': 70 },
    }, {
      userId: 'garmin1',
      calendarDate: '2026-10-22',
      restingHeartRateInBeatsPerMinute: 58,
    }],
    activities: [{
      userId: 'garmin1',
      summaryId: 'run1',
      activityType: 'RUNNING',
      activityName: 'Morning run',
      startTimeInSeconds: 1761000000,
      durationInSeconds: 1920,
      averageHeartRateInBeatsPerMinute: 142,
      aerobicTrainingEffect: 3.2,
      anaerobicTrainingEffect: 0.4,
      startLatInDegree: 51.5,
      startLongInDegree: -0.12,
      samples: [{ position: 4 }],
    }],
    sleeps: [{
      userId: 'garmin1',
      summaryId: 'night1',
      calendarDate: '2026-10-22',
      durationInSeconds: 27000,
      deepSleepDurationInSeconds: 5400,
      overallSleepScore: { value: 81 },
    }],
    deregistrations: [{ userId: 'garmin-old' }],
    userPermissionsChange: [{ userId: 'garmin1', permissions: ['HEALTH_EXPORT', 'ACTIVITY_EXPORT'] }],
  };

  it('keeps the fields the app shows and drops a path', () => {
    const plan = mapGarminPush(push);
    const packed = JSON.stringify(plan);
    expect(packed).not.toContain('51.5');
    expect(packed).not.toContain('-0.12');
    expect(packed).not.toContain('samples');
    expect(packed).not.toContain('timeOffset');
    expect(plan.dailies[0]).toMatchObject({
      garminUserId: 'garmin1',
      calendarDate: '2026-10-21',
      restingHeartRateBpm: 61,
      moderateMinutes: 20,
      vigorousMinutes: 10,
    });
    expect(plan.activities[0]).toMatchObject({
      summaryId: 'run1',
      activityName: 'Morning run',
      durationSeconds: 1920,
      averageHeartRateBpm: 142,
      trainingEffect: 3.2,
    });
    expect(plan.sleep[0]).toMatchObject({ durationSeconds: 27000, sleepScore: 81 });
    expect(plan.deregistered).toEqual(['garmin-old']);
    expect(plan.permissionChanges).toEqual([{
      garminUserId: 'garmin1',
      permissions: 'HEALTH_EXPORT ACTIVITY_EXPORT',
    }]);
    const users = new Map([['garmin1', 'user-1']]);
    expect(dailyRowsFor(plan, users)[1]).toMatchObject({ user_id: 'user-1', calendar_date: '2026-10-22' });
    expect(activityRowsFor(plan, users)).toHaveLength(1);
    expect(sleepRowsFor(plan, users)[0]).not.toHaveProperty('samples');
    expect(dailyRowsFor(plan, new Map())).toEqual([]);
  });

  it('keeps one daily per day, the wellness summaries, and drops sample maps', () => {
    const plan = mapGarminPush({
      dailies: [{
        userId: 'garmin1',
        calendarDate: '2026-10-22',
        durationInSeconds: 1200,
        steps: 4000,
        distanceInMeters: 3100.4,
        floorsClimbed: 8,
        minHeartRateInBeatsPerMinute: 52,
        maxHeartRateInBeatsPerMinute: 160,
        averageStressLevel: 28,
        bodyBatteryChargedValue: 40,
        bodyBatteryDrainedValue: 55,
        stepsGoal: 10000,
        startLatInDegree: 51.5,
        startLongInDegree: -0.1,
      }, {
        userId: 'garmin1',
        calendarDate: '2026-10-22',
        durationInSeconds: 5400,
        steps: 9200,
        distanceInMeters: 7400,
        floorsClimbed: 12,
      }, {
        userId: 'garmin1',
        calendarDate: '2026-10-22',
        durationInSeconds: 900,
        steps: 100,
      }],
      sleeps: [{
        userId: 'garmin1',
        summaryId: 'night1',
        calendarDate: '2026-10-22',
        durationInSeconds: 100,
        overallSleepScore: { value: 70 },
      }, {
        userId: 'garmin1',
        summaryId: 'night1',
        calendarDate: '2026-10-22',
        durationInSeconds: 27000,
        overallSleepScore: { value: 81 },
      }],
      respiration: [{
        userId: 'garmin1',
        summaryId: 'breath1',
        calendarDate: '2026-10-22',
        timeOffsetEpochToBreaths: { '0': 14.2, '60': 16.4 },
        startLatInDegree: 51.5,
      }],
      pulseOx: [{
        userId: 'garmin1',
        summaryId: 'ox1',
        calendarDate: '2026-10-22',
        timeOffsetSpo2Values: { '0': 96, '30': 94 },
      }],
      hrv: [{
        userId: 'garmin1',
        summaryId: 'hrv1',
        calendarDate: '2026-10-22',
        lastNightAvg: 46,
        lastNight5MinHigh: 78,
        hrvValues: { '0': 40, '300': 80 },
      }],
    });
    const packed = JSON.stringify(plan);
    expect(packed).not.toContain('timeOffset');
    expect(packed).not.toContain('hrvValues');
    expect(packed).not.toContain('51.5');
    expect(packed).not.toContain('-0.1');
    const users = new Map([['garmin1', 'user-1']]);
    const dailies = dedupeBy(
      dailyRowsFor(plan, users),
      (row) => `${String(row.user_id)}:${String(row.calendar_date)}`,
      preferLargerDuration,
    );
    expect(dailies).toHaveLength(1);
    expect(dailies[0]).toMatchObject({ steps: 9200, distance_metres: 7400, floors_climbed: 12, duration_seconds: 5400 });
    const tied = dedupeBy(
      [
        { user_id: 'user-1', calendar_date: '2026-10-22', duration_seconds: 10, steps: 1 },
        { user_id: 'user-1', calendar_date: '2026-10-22', duration_seconds: 10, steps: 2 },
      ],
      (row) => `${row.user_id}:${row.calendar_date}`,
      preferLargerDuration,
    );
    expect(tied[0]?.steps).toBe(2);
    const nights = dedupeBy(
      sleepRowsFor(plan, users),
      (row) => `${String(row.user_id)}:${String(row.summary_id)}`,
      preferLast,
    );
    expect(nights).toHaveLength(1);
    expect(nights[0]).toMatchObject({ sleep_score: 81, duration_seconds: 27000 });
    expect(plan.respiration[0]).toMatchObject({ averageBreathsPerMinute: 15.3, lowestBreathsPerMinute: 14.2, highestBreathsPerMinute: 16.4 });
    expect(plan.pulseOx[0]).toMatchObject({ averageSpo2: 95, lowestSpo2: 94, highestSpo2: 96 });
    expect(plan.hrv[0]).toMatchObject({ lastNightAvgMs: 46, lastNight5MinHighMs: 78 });
    expect(plan.dailies[0]).toMatchObject({
      steps: 4000,
      minHeartRateBpm: 52,
      maxHeartRateBpm: 160,
      averageStressLevel: 28,
      bodyBatteryCharged: 40,
      bodyBatteryDrained: 55,
      stepGoal: 10000,
    });
    const webhook = readFileSync('supabase/functions/garmin-webhook/index.ts', 'utf8');
    expect(webhook).toContain('dedupeBy(');
    expect(webhook).toContain('preferLargerDuration');
    expect(webhook).toContain('preferLast');
    expect(webhook).toContain('garmin-webhook: ${table}');
    const sql = readFileSync('supabase/migrations/20261023220000_garmin_wellness_summaries.sql', 'utf8');
    expect(sql).toContain('add column if not exists steps integer');
    expect(sql).toContain('create table public.garmin_respiration');
    expect(sql).toContain('create table public.garmin_pulse_ox');
    expect(sql).toContain('create table public.garmin_hrv');
    expect(sql).toContain('using (user_id = auth.uid())');
    expect(sql).toContain('grant select on table public.garmin_respiration to authenticated');
    expect(sql).not.toMatch(/grant insert|grant update|grant delete/i);
    expect(sql).not.toMatch(/latitude|longitude/);
    expect(sql).not.toContain('time_offset');
    const lines = garminCoachLines({
      consentAi: true,
      consentHealth: true,
      personalDataEnabled: true,
      readings: {
        ...emptyGarminReadings(),
        connected: true,
        dailies: [{
          calendarDate: '2026-10-22',
          restingHeartRateBpm: null,
          averageHeartRateBpm: null,
          moderateMinutes: null,
          vigorousMinutes: null,
          steps: 9200,
        }],
      },
    });
    expect(lines.join('\n')).not.toContain('9200');
  });

  it('keeps VO2 max from a user metrics push and drops a path', () => {
    const plan = mapGarminPush({
      userMetrics: [{
        userId: 'garmin1',
        summaryId: 'vo2-1',
        calendarDate: '2026-10-21',
        vo2Max: 46.2,
        vo2MaxCycling: 41,
        fitnessAge: 32,
        enhanced: true,
      }, {
        userId: 'garmin1',
        summaryId: 'empty',
        calendarDate: '2026-10-20',
      }],
    });
    expect(plan.userMetrics).toEqual([{
      garminUserId: 'garmin1',
      summaryId: 'vo2-1',
      calendarDate: '2026-10-21',
      vo2Max: 46.2,
      vo2MaxCycling: 41,
      fitnessAge: 32,
    }]);
    expect(JSON.stringify(plan.userMetrics)).not.toContain('enhanced');
    const rows = userMetricRowsFor(plan, new Map([['garmin1', 'user-1']]));
    expect(rows[0]).toMatchObject({ user_id: 'user-1', vo2_max: 46.2, fitness_age: 32 });
    expect(userMetricRowsFor(plan, new Map())).toEqual([]);
    expect(GARMIN_BACKFILL_TYPES).toEqual(['dailies', 'activities', 'sleeps', 'userMetrics']);
    expect(garminBackfillUrl('dailies', 1, 2)).toContain('/backfill/dailies?summaryStartTimeInSeconds=1&summaryEndTimeInSeconds=2');
    expect(garminBackfillUrl('userMetrics', 1, 2)).not.toContain('activityDetails');
    expect(garminRefreshCooling('2026-10-22T11:59:30Z', Date.parse('2026-10-22T12:00:00Z'))).toBe(true);
    expect(garminRefreshCooling('2026-10-22T11:58:00Z', Date.parse('2026-10-22T12:00:00Z'))).toBe(false);
    const metricsSql = readFileSync('supabase/migrations/20261023120000_garmin_user_metrics.sql', 'utf8');
    expect(metricsSql).toContain('grant select on table public.garmin_user_metrics to authenticated');
    expect(metricsSql).toContain('revoke all on table public.garmin_user_metrics from public, anon, authenticated');
    expect(metricsSql).not.toMatch(/grant insert|grant update|grant delete/i);
    expect(metricsSql).toContain('on delete cascade');
    expect(metricsSql).toContain("'garmin_user_metrics'");
    expect(metricsSql).not.toMatch(/latitude|longitude/);
    const refreshSql = readFileSync('supabase/migrations/20261023140000_garmin_manual_refresh.sql', 'utf8');
    expect(refreshSql).toContain('last_manual_refresh_at');
    expect(refreshSql).not.toMatch(/grant /i);
    const refreshFn = readFileSync('supabase/functions/garmin-refresh/index.ts', 'utf8');
    expect(refreshFn).toContain('garminBackfillTypes');
    expect(refreshFn).not.toMatch(/activityDetails|activityFile/);
    expect(readFileSync('supabase/config.toml', 'utf8')).toContain('[functions.garmin-refresh]\nverify_jwt = true');
    expect(readFileSync('supabase/functions/garmin-webhook/index.ts', 'utf8')).toContain("from('garmin_user_metrics')");
  });

  it('upserts on the summary key and removes that person on deregistration', () => {
    const store: GarminStore = {
      connections: [
        { userId: 'user-1', garminUserId: 'garmin1', accessToken: 'kept-secret' },
        { userId: 'user-2', garminUserId: 'other', accessToken: 'other-secret' },
      ],
      dailies: [{ userId: 'user-1', calendarDate: '2026-10-21' }],
      activities: [{ userId: 'user-1', summaryId: 'run1' }, { userId: 'user-2', summaryId: 'ride' }],
      sleep: [],
      userMetrics: [],
      states: [{ userId: 'user-1', state: 'abc' }],
    };
    const plan = mapGarminPush(push);
    const users = new Map([['garmin1', 'user-1'], ['garmin-old', 'user-1']]);
    const upserted = applyGarminPush({ ...store, connections: store.connections }, { ...plan, deregistered: [] }, users);
    expect(upserted.dailies).toEqual([
      { userId: 'user-1', calendarDate: '2026-10-21' },
      { userId: 'user-1', calendarDate: '2026-10-22' },
    ]);
    expect(upserted.activities.filter((row) => row.userId === 'user-1')).toEqual([{ userId: 'user-1', summaryId: 'run1' }]);
    expect(upserted.activities.filter((row) => row.userId === 'user-2')).toHaveLength(1);
    const cleared = applyGarminPush(upserted, { ...plan, dailies: [], activities: [], sleep: [] }, users);
    expect(withoutGarminUser(cleared, 'user-2').connections).toEqual([]);
    expect(cleared.connections.find((row) => row.userId === 'user-2')?.accessToken).toBe('other-secret');
    expect(cleared.dailies).toEqual([]);
    expect(cleared.activities).toEqual([{ userId: 'user-2', summaryId: 'ride' }]);
    expect(cleared.states).toEqual([]);
  });
});

describe('Garmin coach gate', () => {
  const readings: GarminReadings = {
    connected: true,
    connectedAt: '2026-10-22T08:00:00Z',
    dailies: [
      { calendarDate: '2026-10-21', restingHeartRateBpm: 61, averageHeartRateBpm: 70, moderateMinutes: 20, vigorousMinutes: 0 },
      { calendarDate: '2026-10-22', restingHeartRateBpm: 58, averageHeartRateBpm: 69, moderateMinutes: 10, vigorousMinutes: 5 },
    ],
    activities: [{
      summaryId: 'run1',
      activityType: 'RUNNING',
      activityName: 'Morning run',
      startedAt: '2026-10-22T07:00:00Z',
      durationSeconds: 1920,
      averageHeartRateBpm: 142,
      trainingEffect: 3.2,
      anaerobicEffect: null,
    }],
    sleep: [{
      summaryId: 'night1',
      calendarDate: '2026-10-22',
      durationSeconds: 27000,
      deepSeconds: 5400,
      lightSeconds: null,
      remSeconds: null,
      awakeSeconds: null,
      sleepScore: 81,
    }],
    userMetrics: [],
    respiration: [],
    pulseOx: [],
    hrv: [],
    needsPermissions: false,
    missingPermissions: [],
    lastPushAt: null,
    historyRefusedAt: null,
  };

  it('withholds Garmin unless health consent, coach consent, and the personal-data switch are on', () => {
    expect(garminAllowedForCoach({ consentAi: true, consentHealth: true, personalDataEnabled: false })).toBe(false);
    expect(garminCoachLines({ consentAi: false, consentHealth: true, personalDataEnabled: true, readings })).toEqual([]);
    expect(garminCoachLines({ consentAi: true, consentHealth: false, personalDataEnabled: true, readings })).toEqual([]);
    expect(garminCoachLines({ consentAi: true, consentHealth: true, personalDataEnabled: false, readings })).toEqual([]);
    const lines = garminCoachLines({ consentAi: true, consentHealth: true, personalDataEnabled: true, readings });
    expect(lines[0]).toContain('Resting heart rate');
    expect(lines[0]).toContain('58');
    expect(lines[0]).toContain('bpm');
    expect(lines.some((line) => line.includes('Sleep') && line.includes('h'))).toBe(true);
    expect(lines.some((line) => line.includes('Training effect') && line.includes('score'))).toBe(true);
    expect(lines.some((line) => line.includes('Morning run') && line.includes('min'))).toBe(true);
    expect(lines.join('\n')).not.toContain('51.5');
    const shown = garminFigures(readings);
    expect(shown.heartChart).toEqual([61, 58]);
    expect(shown.sleepChart).toEqual([7.5]);
    expect(shown.effortChart).toEqual([3.2]);
    const context = buildThumosContext({
      now: new Date('2026-10-22T12:00:00Z'),
      displayName: 'Alex',
      sobrietyStartedAt: null,
      reasons: [],
      weeklySpendGbp: null,
      weeklyUnits: null,
      checkIns: [],
      health: [],
      mode: 'steady',
      safety: { selfHarm: false, withdrawal: false, reasons: [] },
      garminLines: lines,
    });
    expect(context).toContain('Garmin Resting heart rate 58 bpm');
    const withheld = buildThumosContext({
      now: new Date('2026-10-22T12:00:00Z'),
      displayName: 'Alex',
      sobrietyStartedAt: null,
      reasons: [],
      weeklySpendGbp: null,
      weeklyUnits: null,
      checkIns: [],
      health: [],
      mode: 'support',
      safety: { selfHarm: true, withdrawal: false, reasons: [] },
      garminLines: lines,
    });
    expect(withheld).not.toContain('58 bpm');
    expect(withheld).toContain('Garmin readings');
  });
});

describe('Garmin token sealing', () => {
  it('round-trips with the right key and fails with the wrong key', async () => {
    const key = encodeBase64(new Uint8Array(32).fill(4));
    const other = encodeBase64(new Uint8Array(32).fill(9));
    const aad = garminTokenAad('user-1', 'access', 1);
    const sealed = await sealGarminToken('access-secret', key, aad);
    expect(sealed.keyVersion).toBe(1);
    expect(sealed.ciphertext).not.toContain('access-secret');
    expect(sealed.nonce).not.toContain('access-secret');
    expect(await openGarminToken(sealed, key, aad)).toBe('access-secret');
    await expect(openGarminToken(sealed, other, aad)).rejects.toThrow('garmin-token: decrypt');
    await expect(openGarminToken(sealed, key, garminTokenAad('user-2', 'access', 1))).rejects.toThrow('garmin-token: decrypt');
    await expect(openGarminToken({ ...sealed, keyVersion: 2 }, key, aad)).rejects.toThrow('garmin-token: version');
    await expect(sealGarminToken('access-secret', encodeBase64(new Uint8Array(16).fill(1)), aad)).rejects.toThrow('garmin-token: key');
  });
});

function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function columnNames(sql: string, table: string): string[] {
  const start = sql.indexOf(`create table public.${table} (`);
  const body = sql.slice(start, sql.indexOf(');', start));
  return [...body.matchAll(/^\s{2}([a-z0-9_]+)\s/gm)].map((match) => match[1]);
}

describe('Garmin storage rules', () => {
  const sql = readFileSync('supabase/migrations/20261022180000_garmin_connect.sql', 'utf8');

  it('has no path column, and the download leaves the tokens out', () => {
    for (const name of ['garmin_oauth_states', 'garmin_connections', 'garmin_dailies', 'garmin_activities', 'garmin_sleep']) {
      const body = sql.slice(sql.indexOf(`create table public.${name}`), sql.indexOf(');', sql.indexOf(`create table public.${name}`)));
      expect(body, name).not.toMatch(/route|gps|polyline|latitude|longitude|lat\b|lng\b/i);
    }
    const download = sql.slice(sql.lastIndexOf("'garmin_connection'"));
    expect(download).toContain("'garmin_dailies'");
    expect(download).toContain("'garmin_activities'");
    expect(download).toContain("'garmin_sleep'");
    expect(download).not.toContain('access_token');
    expect(download).not.toContain('refresh_token');
    expect(download).not.toContain('code_verifier');
    const connectionColumns = columnNames(sql, 'garmin_connections');
    expect(connectionColumns).not.toContain('access_token');
    expect(connectionColumns).not.toContain('refresh_token');
    expect(connectionColumns).toEqual(expect.arrayContaining([
      'access_token_ciphertext',
      'access_token_nonce',
      'refresh_token_ciphertext',
      'refresh_token_nonce',
      'token_key_version',
    ]));
    const view = sql.slice(sql.indexOf('create view public.garmin_connection_status'), sql.indexOf('revoke all on table public.garmin_connection_status'));
    const selectList = view.slice(view.search(/\bselect\b/i), view.search(/\bfrom\b/i));
    expect(selectList).toContain("(revoked_at is null and access_token_ciphertext <> '') as connected");
    expect(selectList).not.toMatch(/\b(access_token_nonce|refresh_token_ciphertext|refresh_token_nonce|token_key_version)\b/);
    expect(selectList).not.toMatch(/\baccess_token\b/);
    expect(selectList).not.toMatch(/\brefresh_token\b/);
    expect(sql).toContain('revoke all on table public.garmin_connections from public, anon, authenticated');
    expect(sql).toContain('grant select on table public.garmin_connection_status to authenticated');
    expect(sql).not.toMatch(/latitude|longitude/);
  });

  it('checks the webhook, disconnect, export, and coach paths', () => {
    const webhook = readFileSync('supabase/functions/garmin-webhook/index.ts', 'utf8');
    const disconnect = readFileSync('supabase/functions/garmin-disconnect/index.ts', 'utf8');
    const deleted = readFileSync('supabase/functions/account-delete/index.ts', 'utf8');
    const chat = readFileSync('supabase/functions/thumos-chat/index.ts', 'utf8');
    const voice = readFileSync('supabase/functions/thumos-voice-token/index.ts', 'utf8');
    const config = readFileSync('supabase/config.toml', 'utf8');
    expect(webhook).toContain("onConflict: 'user_id,calendar_date'");
    expect(webhook).toContain("onConflict: 'user_id,summary_id'");
    expect(webhook).toContain('deleteGarminRows');
    expect(webhook).toContain('webhookGate');
    expect(webhook).toContain('console.error(gate.log)');
    expect(disconnect).toContain('forgetGarminAccount');
    expect(deleted).toContain('forgetGarminAccount');
    for (const table of GARMIN_DATA_TABLES) expect(readFileSync('supabase/functions/_shared/garmin.ts', 'utf8')).toContain(`'${table}'`);
    expect(chat.indexOf('garminAllowedForCoach(gate)')).toBeLessThan(chat.indexOf('buildThumosContext({'));
    expect(voice.indexOf('if (!xaiPersonalDataEnabled')).toBeLessThan(voice.indexOf('garminLinesFor('));
    expect(webhookGate('Bearer secret', null, 'secret')).toEqual({ ok: true });
    expect(webhookGate(null, 'secret', 'secret')).toEqual({ ok: true });
    expect(webhookGate(null, 'no', 'secret')).toMatchObject({ ok: false, status: 401, log: 'garmin-webhook: token rejected' });
    expect(webhookGate(null, null, 'secret')).toMatchObject({ ok: false, status: 401 });
    expect(webhookGate('Bearer secret', null, '')).toMatchObject({ ok: false, status: 503, log: 'garmin-webhook: secret unset' });
    expect(webhookGate('Bearer secret', 'secret', '   ')).toMatchObject({ ok: false, status: 503 });
    expect(config).toContain('[functions.garmin-oauth-callback]\nverify_jwt = false');
    expect(config).toContain('[functions.garmin-webhook]\nverify_jwt = false');
    expect(config).toContain('[functions.garmin-oauth-start]\nverify_jwt = true');
    expect(config).toContain('[functions.garmin-disconnect]\nverify_jwt = true');
    const profile = readFileSync('src/app/(main)/profile.tsx', 'utf8');
    const health = readFileSync('src/app/(main)/health.tsx', 'utf8');
    const row = readFileSync('src/ui/GarminConnectRow.tsx', 'utf8');
    expect(profile).toContain('<GarminConnectRow />');
    expect(row).toContain('GARMIN_CONNECT_BUTTON');
    expect(row).toContain('Disconnect');
    expect(row).toContain('<PlanTick done />');
    expect(row).toContain('Connected');
    expect(health).toContain('<GarminTip />');
    expect(health).not.toContain('GarminReadings');
    expect(health).toContain('useHealthSources');
    expect(readFileSync('supabase/functions/garmin-oauth-callback/index.ts', 'utf8')).toContain('garminAppReturn');
    expect(readFileSync('supabase/functions/_shared/garmin.ts', 'utf8')).toContain("export const GARMIN_APP_SCHEME = 'uk.co.quanticalabs.charioteer'");
    for (const path of [
      'supabase/functions/garmin-oauth-start/index.ts',
      'supabase/functions/garmin-oauth-callback/index.ts',
      'supabase/functions/garmin-webhook/index.ts',
      'supabase/functions/garmin-disconnect/index.ts',
      'supabase/functions/_shared/garmin.ts',
    ]) {
      expect(readFileSync(path, 'utf8'), path).not.toMatch(/console\.(log|error|info|debug)\([^)\n]*(access_token|refresh_token|client_secret|heart rate|sleep)/i);
      expect(readFileSync(path, 'utf8'), path).not.toMatch(/latitude|longitude/);
    }
  });
});

describe('garmin webhook path secret', () => {
  const secret = 'pa/th secret+1';
  const encoded = encodeURIComponent(secret);
  const client = 'garmin-client-1';
  const pathGate = (pathname: string, clientHeader: string | null, clientId: string | null | undefined = client) =>
    webhookGate(null, null, secret, { path: webhookPathSecret(pathname), clientIdHeader: clientHeader, clientId });

  it('reads one URL-decoded segment after garmin-webhook/', () => {
    expect(webhookPathSecret('/garmin-webhook')).toEqual({ kind: 'none' });
    expect(webhookPathSecret('/garmin-webhook/')).toEqual({ kind: 'none' });
    expect(webhookPathSecret('/functions/v1/garmin-webhook')).toEqual({ kind: 'none' });
    expect(webhookPathSecret(`/garmin-webhook/${encoded}`)).toEqual({ kind: 'segment', value: secret });
    expect(webhookPathSecret(`/functions/v1/garmin-webhook/${encoded}`)).toEqual({ kind: 'segment', value: secret });
    expect(webhookPathSecret(`/garmin-webhook/${encoded}/`)).toEqual({ kind: 'invalid' });
    expect(webhookPathSecret(`/garmin-webhook/${encoded}/extra`)).toEqual({ kind: 'invalid' });
    expect(webhookPathSecret('/garmin-webhook//x')).toEqual({ kind: 'invalid' });
    expect(webhookPathSecret('/garmin-webhook/%E0%A4%A')).toEqual({ kind: 'invalid' });
    expect(webhookPathSecret('/something-else/x')).toEqual({ kind: 'invalid' });
  });

  it('accepts the path secret only with the matching garmin-client-id', () => {
    expect(pathGate(`/garmin-webhook/${encoded}`, client)).toEqual({ ok: true });
    expect(pathGate(`/functions/v1/garmin-webhook/${encoded}`, client)).toEqual({ ok: true });
    expect(pathGate(`/garmin-webhook/${encoded}`, null)).toMatchObject({ ok: false, status: 401, log: 'garmin-webhook: token rejected' });
    expect(pathGate(`/garmin-webhook/${encoded}`, 'other-client')).toMatchObject({ ok: false, status: 401 });
    expect(pathGate(`/garmin-webhook/${encoded}`, client, '')).toMatchObject({ ok: false, status: 401 });
    expect(pathGate(`/garmin-webhook/${encoded}`, client, null)).toMatchObject({ ok: false, status: 401 });
    expect(webhookGate(null, null, secret, { path: webhookPathSecret(`/garmin-webhook/${encoded}`), clientIdHeader: client, clientId: undefined })).toMatchObject({ ok: false, status: 401 });
    expect(webhookGate(null, null, secret, { path: webhookPathSecret(`/garmin-webhook/${encoded}`), clientIdHeader: client, clientId: '   ' })).toMatchObject({ ok: false, status: 401 });
    expect(pathGate(`/garmin-webhook/${encoded}`, '', '')).toMatchObject({ ok: false, status: 401 });
    expect(pathGate('/garmin-webhook/wrong', client)).toMatchObject({ ok: false, status: 401 });
    expect(pathGate(`/garmin-webhook/${encoded}/extra`, client)).toMatchObject({ ok: false, status: 401 });
    expect(pathGate(`/garmin-webhook/${secret}`, client)).toMatchObject({ ok: false, status: 401 });
  });

  it('keeps the query and Bearer routes and the 503, without needing a client id', () => {
    const none = webhookPathSecret('/garmin-webhook');
    expect(webhookGate(null, secret, secret, { path: none, clientIdHeader: null, clientId: null })).toEqual({ ok: true });
    expect(webhookGate('Bearer s3', null, 's3', { path: none, clientIdHeader: null, clientId: null })).toEqual({ ok: true });
    expect(webhookGate(null, 'no', secret, { path: none, clientIdHeader: client, clientId: client })).toMatchObject({ ok: false, status: 401 });
    expect(webhookGate(null, null, '', { path: webhookPathSecret('/garmin-webhook/x'), clientIdHeader: client, clientId: client })).toMatchObject({ ok: false, status: 503, log: 'garmin-webhook: secret unset' });
  });

  it('a bad path is refused even when the query token is right', () => {
    expect(webhookGate(null, secret, secret, { path: webhookPathSecret('/garmin-webhook/wrong'), clientIdHeader: client, clientId: client })).toMatchObject({ ok: false, status: 401 });
    expect(webhookGate(null, secret, secret, { path: webhookPathSecret('/garmin-webhook/a/b'), clientIdHeader: client, clientId: client })).toMatchObject({ ok: false, status: 401 });
  });

  it('routes every push type by body, whatever the path suffix', () => {
    const webhook = readFileSync('supabase/functions/garmin-webhook/index.ts', 'utf8');
    expect(webhook).toContain('webhookPathSecret(url.pathname)');
    expect(webhook).toContain("req.headers.get('garmin-client-id')");
    expect(webhook).toContain("Deno.env.get('GARMIN_CLIENT_ID')");
    expect(webhook).not.toMatch(/pathname\.(endsWith|includes|startsWith)\('\/(dailies|activities|sleeps|userMetrics)/);
    const plan = mapGarminPush({
      dailies: [{ userId: 'g1', summaryId: 'd1', calendarDate: '2026-10-23' }],
      activities: [{ userId: 'g1', summaryId: 'a1', startTimeInSeconds: 1792700000, durationInSeconds: 60 }],
      sleeps: [{ userId: 'g1', summaryId: 's1', calendarDate: '2026-10-23', durationInSeconds: 60 }],
      userMetrics: [{ userId: 'g1', summaryId: 'm1', calendarDate: '2026-10-23', vo2Max: 40 }],
      deregistrations: [{ userId: 'g2' }],
      userPermissionsChange: [{ userId: 'g1', permissions: ['HEALTH_EXPORT'] }],
    });
    expect(plan.dailies).toHaveLength(1);
    expect(plan.activities).toHaveLength(1);
    expect(plan.sleep).toHaveLength(1);
    expect(plan.userMetrics).toHaveLength(1);
    expect(plan.deregistered).toEqual(['g2']);
    expect(plan.permissionChanges).toEqual([{ garminUserId: 'g1', permissions: 'HEALTH_EXPORT' }]);
  });
});
