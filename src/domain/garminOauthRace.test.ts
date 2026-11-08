import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

import {
  GARMIN_TOKEN_KEY_VERSION,
  garminAppReturn,
  garminDuplicateReturn,
  garminOauthLog,
  garminRefreshLockState,
  garminReturnFromUrl,
  isGarminRefreshLockState,
  readDeletedOauthState,
  rotateGarminAccess,
  sealGarminToken,
} from '../../supabase/functions/_shared/garmin';

const userId = '11111111-1111-4111-8111-111111111111';
const tokenKey = encodeBase64(new Uint8Array(32).fill(4));

type Filter = { col: string; op: 'eq' | 'lt'; value: string };
type Result = { data: unknown; error: { message: string } | null };
type StateRow = { state: string; user_id: string; code_verifier: string; created_at: string; expires_at: string };
type Connection = Record<string, unknown>;

function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** One delete wins. A second caller sees an empty result, which is the duplicate claim. */
function atomicPkce() {
  const rows = new Map<string, StateRow>();
  let chain: Promise<void> = Promise.resolve();
  return {
    rows,
    claim(state: string, now: number) {
      let result: Result = { data: [], error: null };
      const run = chain.then(() => {
        const row = rows.get(state);
        if (!row) {
          result = { data: [], error: null };
          return;
        }
        rows.delete(state);
        result = { data: [row], error: null };
      });
      chain = run.then(() => undefined, () => undefined);
      return run.then(() => readDeletedOauthState(result.data, result.error, now));
    },
  };
}

function writer(run: (filters: Filter[]) => Result) {
  const filters: Filter[] = [];
  const builder = {
    eq(col: string, value: string) {
      filters.push({ col, op: 'eq', value });
      return builder;
    },
    lt(col: string, value: string) {
      filters.push({ col, op: 'lt', value });
      return builder;
    },
    select() {
      return builder;
    },
    then(onFulfilled: (value: Result) => unknown, onRejected?: (reason: unknown) => unknown) {
      return Promise.resolve().then(() => run(filters)).then(onFulfilled, onRejected);
    },
  };
  return builder;
}

function value(filters: Filter[], col: string, op: Filter['op']): string | undefined {
  return filters.find((filter) => filter.col === col && filter.op === op)?.value;
}

function fakeRefreshDb(connection: Connection, failWrite = false) {
  const states = new Map<string, StateRow>();
  let fetches = 0;
  const db = {
    from(table: string) {
      if (table === 'garmin_oauth_states') {
        return {
          delete: () => writer((filters) => {
            const state = value(filters, 'state', 'eq');
            const before = value(filters, 'expires_at', 'lt');
            const row = state ? states.get(state) : undefined;
            if (!row || !state) return { data: [], error: null };
            if (before && row.expires_at >= before) return { data: [], error: null };
            states.delete(state);
            return { data: [row], error: null };
          }),
          insert: (row: StateRow) => {
            if (states.has(row.state)) {
              return Promise.resolve({ data: null, error: { message: 'duplicate key value violates unique constraint' } });
            }
            states.set(row.state, row);
            return Promise.resolve({ data: row, error: null });
          },
        };
      }
      return {
        update: (patch: Connection) => writer((filters) => {
          if (failWrite) throw new Error('refresh-token-secret write failed');
          const sameUser = value(filters, 'user_id', 'eq') === connection.user_id;
          const sameCipher = value(filters, 'refresh_token_ciphertext', 'eq') === connection.refresh_token_ciphertext;
          if (!sameUser || !sameCipher) return { data: [], error: null };
          Object.assign(connection, patch);
          return { data: [{ user_id: userId }], error: null };
        }),
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { ...connection }, error: null }),
          }),
        }),
      };
    },
  };
  return {
    db,
    states,
    fetches: () => fetches,
    fetch: async () => {
      fetches += 1;
      return new Response(JSON.stringify({
        access_token: `access-${fetches}`,
        refresh_token: `refresh-secret-${fetches}`,
        expires_in: 86_400,
      }), { status: 200 });
    },
  };
}

async function sealedConnection(refreshCipher: string): Promise<Connection> {
  const access = await sealGarminToken('old-access', tokenKey, `garmin-token:${userId}:access:1`);
  return {
    user_id: userId,
    token_key_version: GARMIN_TOKEN_KEY_VERSION,
    access_token_ciphertext: access.ciphertext,
    access_token_nonce: access.nonce,
    refresh_token_ciphertext: refreshCipher,
    refresh_token_nonce: 'nonce',
  };
}

describe('Garmin callback claim', () => {
  it('lets one overlapping callback exchange the code', async () => {
    const now = Date.parse('2026-11-08T13:51:29Z');
    const table = atomicPkce();
    const state = 'pkce-state-value';
    table.rows.set(state, {
      state,
      user_id: userId,
      code_verifier: 'verifier-secret',
      created_at: new Date(now).toISOString(),
      expires_at: new Date(now + 60_000).toISOString(),
    });
    const [first, second] = await Promise.all([table.claim(state, now), table.claim(state, now)]);
    const claims = [first, second];
    expect(claims.filter((claim) => claim.ok)).toHaveLength(1);
    const duplicate = claims.find((claim) => !claim.ok);
    expect(duplicate).toEqual({ ok: false, reason: 'duplicate' });
    expect(JSON.stringify(duplicate)).not.toContain('verifier-secret');
    const callback = readFileSync('supabase/functions/garmin-oauth-callback/index.ts', 'utf8');
    expect(callback.indexOf(".delete()")).toBeLessThan(callback.indexOf('fetch(GARMIN_TOKEN_URL'));
    expect(callback.indexOf('readDeletedOauthState')).toBeLessThan(callback.indexOf('fetch(GARMIN_TOKEN_URL'));
    expect(callback.indexOf('isGarminRefreshLockState(state)')).toBeLessThan(callback.indexOf(".delete()"));
  });

  it('keeps a successful hand-back when the duplicate return arrives on the shipped parser', () => {
    const seen = (current: 'connected' | 'cancelled' | null, url: string) => garminReturnFromUrl(url) ?? current;
    expect(seen(null, garminAppReturn(true))).toBe('connected');
    expect(seen('connected', garminDuplicateReturn())).toBe('connected');
    expect(garminReturnFromUrl(garminDuplicateReturn())).toBeNull();
    expect(seen('connected', garminAppReturn(false))).toBe('cancelled');
    const layout = readFileSync('src/app/_layout.tsx', 'utf8');
    const open = layout.slice(layout.indexOf('const garmin = url'), layout.indexOf('if (!url || !url.includes'));
    expect(open).toContain('if (garmin) sendGarminReturn(garmin)');
    expect(readFileSync('src/app/_layout.tsx', 'utf8')).not.toContain('duplicate=1');
  });

  it('logs only a fixed category and drops a code, a token, or a state', () => {
    const secret = 'oauth-code-secret refresh-token-secret pkce-state-secret';
    expect(garminOauthLog(secret)).toBe('garmin-oauth: invalid');
    expect(garminOauthLog('duplicate')).toBe('garmin-oauth: duplicate');
    expect(garminOauthLog('exchange')).toBe('garmin-oauth: exchange');
    expect(isGarminRefreshLockState(`refresh-lock:${userId}`)).toBe(true);
    expect(isGarminRefreshLockState('pkce-state-value')).toBe(false);
    const callback = readFileSync('supabase/functions/garmin-oauth-callback/index.ts', 'utf8');
    expect(callback).toContain('garminOauthLog');
    expect(callback).not.toMatch(/console\.(log|error|info|debug)\([^)\n]*(req\.url|searchParams|code_verifier|access_token|\$\{)/);
    expect(callback).not.toContain(secret);
  });
});

describe('Garmin refresh lock', () => {
  const now = Date.parse('2026-11-08T13:51:29Z');

  async function rotate(store: ReturnType<typeof fakeRefreshDb>, refreshCipher: string) {
    return rotateGarminAccess({
      db: store.db as never,
      userId,
      version: GARMIN_TOKEN_KEY_VERSION,
      bearer: 'old-access',
      refreshToken: 'refresh-token-secret',
      refreshCipher,
      credentials: { clientId: 'client', clientSecret: 'client-secret', tokenKey, now },
      fetchImpl: store.fetch,
    });
  }

  it('uses the shared state table so a second caller does not exchange again', async () => {
    const connection = await sealedConnection('cipher-old');
    const store = fakeRefreshDb(connection);
    const errors: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((message?: unknown) => {
      errors.push(String(message));
    });
    const [first, second] = await Promise.all([
      rotate(store, 'cipher-old'),
      rotate(store, 'cipher-old'),
    ]);
    expect(store.fetches()).toBe(1);
    expect([first, second]).toContain('access-1');
    expect(store.states.size).toBe(0);
    expect(garminRefreshLockState(userId)).toBe(`refresh-lock:${userId}`);
    expect(readFileSync('supabase/functions/_shared/garmin.ts', 'utf8')).not.toMatch(/const locks = new Map|let locks = new Map/);
    expect(errors.join('\n')).not.toMatch(/refresh-token-secret|client-secret|access-1/);
  });

  it('replaces an expired lock, releases it, and does not write a stale ciphertext back', async () => {
    const connection = await sealedConnection('cipher-old');
    const store = fakeRefreshDb(connection);
    const lock = garminRefreshLockState(userId);
    expect(lock).toBeTruthy();
    store.states.set(lock ?? '', {
      state: lock ?? '',
      user_id: userId,
      code_verifier: 'refresh-lock',
      created_at: new Date(now - 60_000).toISOString(),
      expires_at: new Date(now - 1000).toISOString(),
    });
    const first = await rotate(store, 'cipher-old');
    expect(first).toBe('access-1');
    expect(store.states.size).toBe(0);
    const kept = String(connection.refresh_token_ciphertext);
    expect(kept).not.toBe('cipher-old');
    const second = await rotate(store, 'cipher-old');
    expect(second).not.toBe('access-2');
    expect(connection.refresh_token_ciphertext).toBe(kept);
    expect(store.states.size).toBe(0);
    expect(JSON.stringify(connection)).not.toContain('refresh-token-secret');
  });

  it('releases the lock when the write fails', async () => {
    const connection = await sealedConnection('cipher-old');
    const store = fakeRefreshDb(connection, true);
    await expect(rotate(store, 'cipher-old')).rejects.toThrow('write failed');
    expect(store.states.size).toBe(0);
    expect(connection.refresh_token_ciphertext).toBe('cipher-old');
  });
});

describe('Garmin deploy closure', () => {
  const bundle = [
    'supabase/functions/garmin-oauth-callback/index.ts',
    'supabase/functions/garmin-refresh/index.ts',
    'supabase/functions/_shared/http.ts',
    'supabase/functions/_shared/garmin.ts',
    'supabase/functions/_shared/exerciseAnalysis.ts',
    'supabase/functions/_shared/healthInsights.ts',
    'supabase/functions/_shared/garminSummaries.ts',
  ];

  it('stays off the nutrition and stats files, and the lock table already exists', () => {
    for (const file of bundle) {
      expect(readFileSync(file, 'utf8'), file).not.toMatch(/nutrition\.ts|statsAnalysis\.ts/);
    }
    const sql = readFileSync('supabase/migrations/20261022180000_garmin_connect.sql', 'utf8');
    for (const column of ['state', 'user_id', 'code_verifier', 'created_at', 'expires_at']) {
      expect(sql).toContain(column);
    }
    expect(sql).toContain('alter table public.garmin_oauth_states enable row level security');
    expect(sql).toContain('revoke all on table public.garmin_oauth_states from public, anon, authenticated');
    expect(sql).toContain('grant all on table public.garmin_oauth_states to service_role');
    expect(sql).not.toMatch(/create policy garmin_oauth_states/i);
    expect(sql).toContain('access_token_ciphertext');
    expect(sql).toContain('refresh_token_ciphertext');
  });
});
