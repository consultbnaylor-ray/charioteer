import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

const SNAPSHOT = '/home/ubuntu/.cursor/projects/agent-repos-charioteer/uploads/garmin-live-20261108.tar_a232.gz';
const OUT = '/opt/cursor/artifacts/garmin-min-deploy';

describe.skipIf(!existsSync(SNAPSHOT))('minified Garmin deploy files', () => {
  it('builds two distinct bundles under 40KB and runs their exported logic', async () => {
    execFileSync('node', ['scripts/bundle-garmin-min.mjs'], { cwd: '/agent/repos/charioteer', stdio: 'pipe' });
    const manifest = JSON.parse(readFileSync(`${OUT}/MANIFEST.json`, 'utf8'));
    expect(manifest.callback.bytes).toBeLessThan(40_000);
    expect(manifest.refresh.bytes).toBeLessThan(40_000);
    expect(manifest.callback.verify_jwt).toBe(false);
    expect(manifest.refresh.verify_jwt).toBe(true);
    expect(manifest.callback.import_map).toBe(false);
    expect(manifest.refresh.import_map).toBe(false);
    expect(manifest.callback.sha256).not.toBe(manifest.refresh.sha256);

    const callbackText = readFileSync(`${OUT}/garmin-oauth-callback.js`, 'utf8');
    const refreshText = readFileSync(`${OUT}/garmin-refresh.js`, 'utf8');
    for (const text of [callbackText, refreshText]) {
      expect(text).not.toMatch(/\beval\s*\(|new Function\s*\(/);
      expect(text).not.toMatch(/nutrition\.ts|statsAnalysis/);
      expect(text).toContain('from"https://esm.sh/@supabase/supabase-js@2.117.3"');
      expect(text).toContain('Deno.env.get');
      expect(text).toMatch(/Deno\.serve\([A-Za-z0-9_$]+\)/);
      expect(text).toContain('as handle');
    }
    expect(callbackText).toContain('.delete(');
    expect(callbackText).toContain('user_id, code_verifier, expires_at');
    expect(callbackText).not.toContain('garmin-refresh: rotate');
    expect(refreshText).toContain('garmin-refresh: rotate');
    expect(refreshText).toContain('garmin-refresh: lock');
    expect(refreshText).toContain('refresh-lock:');

    const runnable = join(tmpdir(), 'garmin-min-run');
    mkdirSync(runnable, { recursive: true });
    const stub = 'export function createClient(){ return { from(){ throw new Error("supabase unused") } } }\n';
    writeFileSync(join(runnable, 'supabase-stub.mjs'), stub);
    writeFileSync(join(runnable, 'garmin-oauth-callback.js'), callbackText.replace('from"https://esm.sh/@supabase/supabase-js@2.117.3"', 'from"./supabase-stub.mjs"'));
    writeFileSync(join(runnable, 'garmin-refresh.js'), refreshText.replace('from"https://esm.sh/@supabase/supabase-js@2.117.3"', 'from"./supabase-stub.mjs"'));
    const callback = await import(pathToFileURL(join(runnable, 'garmin-oauth-callback.js')).href);
    const refresh = await import(pathToFileURL(join(runnable, 'garmin-refresh.js')).href);
    const now = Date.parse('2026-11-08T13:51:29Z');
    const row = { user_id: '11111111-1111-4111-8111-111111111111', code_verifier: 'verifier-secret', expires_at: new Date(now + 60_000).toISOString() };
    expect(callback.readDeletedOauthState([row], null, now).ok).toBe(true);
    expect(callback.readDeletedOauthState([], null, now)).toEqual({ ok: false, reason: 'duplicate' });
    expect(callback.garminOauthLog('oauth-code-secret')).toBe('garmin-oauth: invalid');
    expect(callback.garminOauthLog('duplicate')).toBe('garmin-oauth: duplicate');
    expect(callback.isGarminRefreshLockState('refresh-lock:11111111-1111-4111-8111-111111111111')).toBe(true);
    expect(callback.garminDuplicateReturn()).toBe('uk.co.quanticalabs.charioteer://garmin?duplicate=1');
    expect(callback.garminAppReturn(true)).toContain('connected=1');

    const missing = await callback.handle(new Request('https://example.test/callback'));
    expect(missing.status).toBe(302);
    expect(missing.headers.get('location')).toContain('connected=0');
    globalThis.Deno = { env: { get: () => 'present' } };
    try {
      const ignored = await callback.handle(new Request('https://example.test/callback?code=abc&state=refresh-lock%3A11111111-1111-4111-8111-111111111111'));
      expect(ignored.status).toBe(302);
      expect(ignored.headers.get('location')).toContain('duplicate=1');
      expect(ignored.headers.get('location')).not.toContain('connected=0');
    } finally {
      delete globalThis.Deno;
    }

    const refused = await refresh.handle(new Request('https://example.test/refresh', { method: 'GET' }));
    expect(refused.status).toBe(405);
    const userId = '11111111-1111-4111-8111-111111111111';
    const tokenKey = btoa(String.fromCharCode(...new Uint8Array(32).fill(4)));
    expect(refresh.garminRefreshLockState(userId)).toBe(`refresh-lock:${userId}`);
    expect(refresh.refreshLockBusy('duplicate key value violates unique constraint')).toBe(true);
    let fetches = 0;
    const states = new Map();
    const chain = () => {
      const list = [];
      const builder = {
        eq(col, value) { list.push([col, value]); return builder; },
        lt(col, value) { list.push([col, value]); return builder; },
        select() { return builder; },
        then(ok, err) {
          const matched = list.some((item) => item[0] === 'refresh_token_ciphertext');
          const result = matched ? { data: [{ user_id: userId }], error: null } : { data: [], error: null };
          return Promise.resolve(result).then(ok, err);
        },
      };
      return builder;
    };
    const db = {
      from(table) {
        if (table === 'garmin_oauth_states') {
          return {
            delete: () => chain(),
            insert: (row) => {
              if (states.has(row.state)) return Promise.resolve({ data: null, error: { message: 'duplicate key value violates unique constraint' } });
              states.set(row.state, row);
              return Promise.resolve({ data: row, error: null });
            },
          };
        }
        return {
          update: () => chain(),
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
        };
      },
    };
    const fetchImpl = async () => {
      fetches += 1;
      return new Response(JSON.stringify({ access_token: 'access-1', refresh_token: 'refresh-1', expires_in: 86400 }), { status: 200 });
    };
    const first = refresh.rotateGarminAccess({
      db,
      userId,
      version: 1,
      bearer: 'old-access',
      refreshToken: 'refresh-plain',
      refreshCipher: 'cipher-old',
      credentials: { clientId: 'client', clientSecret: 'secret', tokenKey, now },
      fetchImpl,
    });
    const second = refresh.rotateGarminAccess({
      db,
      userId,
      version: 1,
      bearer: 'old-access',
      refreshToken: 'refresh-plain',
      refreshCipher: 'cipher-old',
      credentials: { clientId: 'client', clientSecret: 'secret', tokenKey, now },
      fetchImpl,
    });
    await Promise.all([first, second]);
    expect(fetches).toBe(1);
  }, 30_000);
});
