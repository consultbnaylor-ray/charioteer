import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SNAPSHOT = '/home/ubuntu/.cursor/projects/agent-repos-charioteer/uploads/garmin-live-20261108.tar_a232.gz';
const SNAPSHOT_SHA = 'cdf06feedf40922a5057101e628973e3b9bc43b84a1985850deda7367994b821';
const ARTIFACT = '/opt/cursor/artifacts/garmin-minimal-deploy';
const REPO = '/agent/repos/charioteer/supabase/functions';

const HELPER_START = '/**\n * A second callback for a code that was already claimed.';
const HELPER_END = 'export function garminReturnFromUrl';

function sha256(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function write(path: string, text: string) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

function helperBlock(source: string): string {
  const start = source.indexOf(HELPER_START);
  const end = source.indexOf(HELPER_END);
  if (start < 0 || end < start) throw new Error('helper block missing');
  return source.slice(start, end);
}

function patchCallbackGarmin(live: string, helpers: string): string {
  const anchor = 'export function garminReturnFromUrl';
  const at = live.indexOf(anchor);
  if (at < 0) throw new Error('callback anchor missing');
  if (live.includes('export function garminDuplicateReturn')) throw new Error('callback already patched');
  return `${live.slice(0, at)}${helpers}${live.slice(at)}`;
}

describe.skipIf(!existsSync(SNAPSHOT))('Garmin live minimal patch', () => {
  it('builds callback and refresh bundles from the live snapshots and leaves nutrition out', () => {
    const archive = readFileSync(SNAPSHOT);
    expect(sha256(archive)).toBe(SNAPSHOT_SHA);
    const extract = join(tmpdir(), 'garmin-live-patch-test');
    rmSync(extract, { recursive: true, force: true });
    mkdirSync(extract, { recursive: true });
    execFileSync('tar', ['-xzf', SNAPSHOT, '-C', extract]);
    const root = join(extract, 'garmin-live-20261108');
    const liveCallbackGarmin = readFileSync(join(root, 'garmin-oauth-callback/source/functions/_shared/garmin.ts'), 'utf8');
    const liveCallbackIndex = readFileSync(join(root, 'garmin-oauth-callback/source/functions/garmin-oauth-callback/index.ts'), 'utf8');
    const liveRefreshGarmin = readFileSync(join(root, 'garmin-refresh/source/functions/_shared/garmin.ts'), 'utf8');
    const repoGarmin = readFileSync(join(REPO, '_shared/garmin.ts'), 'utf8');
    const repoCallback = readFileSync(join(REPO, 'garmin-oauth-callback/index.ts'), 'utf8');
    const helpers = helperBlock(repoGarmin);
    expect(helpers).toContain('export function readDeletedOauthState');
    expect(helpers).toContain('export function garminOauthLog');
    expect(helpers).not.toMatch(/nutrition|statsAnalysis/);

    const callbackGarmin = patchCallbackGarmin(liveCallbackGarmin, helpers);
    expect(callbackGarmin).not.toContain("from './exerciseAnalysis.ts'");
    expect(callbackGarmin).not.toContain('rotateGarminAccess');
    expect(repoGarmin.indexOf(helpers)).toBeGreaterThan(0);
    expect(repoGarmin.replace(helpers, '')).not.toBe(liveCallbackGarmin);
    expect(liveRefreshGarmin.includes('rotateGarminAccess')).toBe(false);
    expect(repoGarmin.includes('rotateGarminAccess')).toBe(true);

    const unchanged = [
      'garmin-refresh/source/functions/garmin-refresh/index.ts',
      'garmin-refresh/source/functions/_shared/http.ts',
      'garmin-refresh/source/functions/_shared/exerciseAnalysis.ts',
      'garmin-refresh/source/functions/_shared/healthInsights.ts',
      'garmin-refresh/source/functions/_shared/garminSummaries.ts',
    ];
    for (const relative of unchanged) {
      const live = readFileSync(join(root, relative));
      const repoName = relative.includes('garmin-refresh/index.ts')
        ? join(REPO, 'garmin-refresh/index.ts')
        : join(REPO, '_shared', relative.split('/').pop() ?? '');
      expect(sha256(live)).toBe(sha256(readFileSync(repoName)));
    }

    rmSync(ARTIFACT, { recursive: true, force: true });
    const callbackBase = join(ARTIFACT, 'garmin-oauth-callback/functions');
    const refreshBase = join(ARTIFACT, 'garmin-refresh/functions');
    write(join(callbackBase, 'garmin-oauth-callback/index.ts'), repoCallback);
    write(join(callbackBase, '_shared/garmin.ts'), callbackGarmin);
    write(join(refreshBase, 'garmin-refresh/index.ts'), readFileSync(join(root, 'garmin-refresh/source/functions/garmin-refresh/index.ts'), 'utf8'));
    write(join(refreshBase, '_shared/garmin.ts'), repoGarmin);
    for (const name of ['http.ts', 'exerciseAnalysis.ts', 'healthInsights.ts', 'garminSummaries.ts']) {
      write(join(refreshBase, '_shared', name), readFileSync(join(root, 'garmin-refresh/source/functions/_shared', name), 'utf8'));
    }
    const rollback = join(ARTIFACT, 'rollback');
    write(join(rollback, 'garmin-oauth-callback/functions/garmin-oauth-callback/index.ts'), liveCallbackIndex);
    write(join(rollback, 'garmin-oauth-callback/functions/_shared/garmin.ts'), liveCallbackGarmin);
    write(join(rollback, 'garmin-refresh/functions/garmin-refresh/index.ts'), readFileSync(join(root, 'garmin-refresh/source/functions/garmin-refresh/index.ts'), 'utf8'));
    for (const name of ['garmin.ts', 'http.ts', 'exerciseAnalysis.ts', 'healthInsights.ts', 'garminSummaries.ts']) {
      write(join(rollback, 'garmin-refresh/functions/_shared', name), readFileSync(join(root, 'garmin-refresh/source/functions/_shared', name), 'utf8'));
    }

    const files = [
      ['garmin-oauth-callback', 'functions/garmin-oauth-callback/index.ts', false],
      ['garmin-oauth-callback', 'functions/_shared/garmin.ts', false],
      ['garmin-refresh', 'functions/garmin-refresh/index.ts', true],
      ['garmin-refresh', 'functions/_shared/garmin.ts', true],
      ['garmin-refresh', 'functions/_shared/http.ts', true],
      ['garmin-refresh', 'functions/_shared/exerciseAnalysis.ts', true],
      ['garmin-refresh', 'functions/_shared/healthInsights.ts', true],
      ['garmin-refresh', 'functions/_shared/garminSummaries.ts', true],
    ] as const;
    const payloads = [
      {
        slug: 'garmin-oauth-callback',
        verify_jwt: false,
        import_map: false,
        entrypoint_path: 'functions/garmin-oauth-callback/index.ts',
        files: [] as { name: string; sha256: string }[],
      },
      {
        slug: 'garmin-refresh',
        verify_jwt: true,
        import_map: false,
        entrypoint_path: 'functions/garmin-refresh/index.ts',
        files: [] as { name: string; sha256: string }[],
      },
    ];
    for (const [slug, name] of files) {
      const text = readFileSync(join(ARTIFACT, slug, name), 'utf8');
      expect(text).not.toMatch(/nutrition\.ts|statsAnalysis\.ts/);
      expect(text).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}/);
      const row = payloads.find((item) => item.slug === slug);
      row?.files.push({ name, sha256: sha256(text) });
    }
    const manifest = {
      based_on_archive_sha256: SNAPSHOT_SHA,
      live_callback: { version: 9, verify_jwt: false, import_map: false, updated_at_gmt: '2026-10-23T20:10:27.225000+00:00' },
      live_refresh: { version: 15, verify_jwt: true, import_map: false, updated_at_gmt: '2026-11-02T18:46:00.932000+00:00' },
      schema_in_snapshot: false,
      payloads,
    };
    write(join(ARTIFACT, 'MANIFEST.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    expect(payloads[0]?.verify_jwt).toBe(false);
    expect(payloads[1]?.verify_jwt).toBe(true);
    expect(payloads[0]?.import_map).toBe(false);
    expect(payloads[1]?.import_map).toBe(false);
    expect(readFileSync(join(callbackBase, 'garmin-oauth-callback/index.ts'), 'utf8')).toContain('readDeletedOauthState');
    expect(readFileSync(join(callbackBase, '_shared/garmin.ts'), 'utf8')).toContain('export function readDeletedOauthState');
    expect(readFileSync(join(refreshBase, '_shared/garmin.ts'), 'utf8')).toContain('export async function rotateGarminAccess');
    expect(sha256(readFileSync(join(rollback, 'garmin-oauth-callback/functions/_shared/garmin.ts')))).toBe('0f8044b5d058619b1f676c07d6cbf86e373a3a03a72fd462710841b8c00352e1');
    expect(sha256(readFileSync(join(rollback, 'garmin-refresh/functions/_shared/garmin.ts')))).toBe('7d83b1d2c19689c5c724e46adcce8cd68a14fdd61e26db7440b0e9f22a0be6e7');
  }, 30_000);
});
