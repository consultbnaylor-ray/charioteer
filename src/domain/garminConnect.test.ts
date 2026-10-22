import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { buildThumosContext } from '../../supabase/functions/_shared/thumos';
import {
  GARMIN_DATA_TABLES,
  GARMIN_REDIRECT_URI,
  activityRowsFor,
  applyGarminPush,
  dailyRowsFor,
  garminAllowedForCoach,
  garminAppReturn,
  garminAuthorizeUrl,
  garminCoachLines,
  garminFigures,
  garminRefreshForm,
  garminReturnFromUrl,
  garminTokenForm,
  mapGarminPush,
  pkceChallenge,
  pkceRecord,
  pkceVerifier,
  readTokenResponse,
  sleepRowsFor,
  takePkceState,
  webhookAuthorised,
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

  it('upserts on the summary key and removes that person on deregistration', () => {
    const store: GarminStore = {
      connections: [
        { userId: 'user-1', garminUserId: 'garmin1', accessToken: 'kept-secret' },
        { userId: 'user-2', garminUserId: 'other', accessToken: 'other-secret' },
      ],
      dailies: [{ userId: 'user-1', calendarDate: '2026-10-21' }],
      activities: [{ userId: 'user-1', summaryId: 'run1' }, { userId: 'user-2', summaryId: 'ride' }],
      sleep: [],
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
    expect(view).not.toMatch(/select[\s\S]*ciphertext/i);
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
    const board = readFileSync('src/ui/GarminReadings.tsx', 'utf8');
    expect(profile).toContain('<GarminConnectRow />');
    expect(row).toContain('Connect');
    expect(row).toContain('Disconnect');
    expect(row).toContain('<PlanTick done />');
    expect(row).toContain('Connected');
    expect(health.indexOf('<GarminTip />')).toBeLessThan(health.indexOf('<GarminReadings />'));
    expect(board).toContain('oldest on the left');
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
