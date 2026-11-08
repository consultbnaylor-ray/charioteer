import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const esbuild = require('/tmp/esbuild-tool/node_modules/esbuild');

const snapshot = '/home/ubuntu/.cursor/projects/agent-repos-charioteer/uploads/garmin-live-20261108.tar_a232.gz';
const repoGarmin = readFileSync('/agent/repos/charioteer/supabase/functions/_shared/garmin.ts', 'utf8');
const repoCallback = readFileSync('/agent/repos/charioteer/supabase/functions/garmin-oauth-callback/index.ts', 'utf8');
const out = '/opt/cursor/artifacts/garmin-min-deploy';
const external = ['https://esm.sh/@supabase/supabase-js@2.117.3'];
const helperStart = '/**\n * A second callback for a code that was already claimed.';
const helperEnd = 'export function garminReturnFromUrl';

function helperBlock(source) {
  const start = source.indexOf(helperStart);
  const end = source.indexOf(helperEnd);
  if (start < 0 || end < start) throw new Error('helper block missing');
  return source.slice(start, end);
}

function wrap(source, marker, replacement, exportsLine) {
  const start = 'Deno.serve(async (req) => {';
  if (source.split(start).length !== 2) throw new Error('Expected one Deno.serve');
  if (!source.includes(marker)) throw new Error(`Missing ${marker}`);
  const body = source.replace(start, 'export async function handle(req) {').replace(marker, replacement);
  return `${exportsLine}\n${body}\nif (typeof Deno !== "undefined" && typeof Deno.serve === "function") Deno.serve(handle);\n`;
}

const extract = join(tmpdir(), 'garmin-min-bundle');
rmSync(extract, { recursive: true, force: true });
mkdirSync(extract, { recursive: true });
execFileSync('tar', ['-xzf', snapshot, '-C', extract]);
const live = join(extract, 'garmin-live-20261108');
const callbackSrc = join(extract, 'callback');
const refreshSrc = join(extract, 'refresh');
mkdirSync(join(callbackSrc, 'functions/garmin-oauth-callback'), { recursive: true });
mkdirSync(join(callbackSrc, 'functions/_shared'), { recursive: true });
mkdirSync(join(refreshSrc, 'functions/garmin-refresh'), { recursive: true });
cpSync(join(live, 'garmin-refresh/source/functions/_shared'), join(refreshSrc, 'functions/_shared'), { recursive: true });
cpSync(join(live, 'garmin-refresh/source/functions/garmin-refresh/index.ts'), join(refreshSrc, 'functions/garmin-refresh/index.ts'));

const liveCallbackGarmin = readFileSync(join(live, 'garmin-oauth-callback/source/functions/_shared/garmin.ts'), 'utf8');
const helpers = helperBlock(repoGarmin);
const anchor = 'export function garminReturnFromUrl';
const at = liveCallbackGarmin.indexOf(anchor);
if (at < 0 || liveCallbackGarmin.includes('export function garminDuplicateReturn')) throw new Error('callback baseline');
writeFileSync(join(callbackSrc, 'functions/_shared/garmin.ts'), `${liveCallbackGarmin.slice(0, at)}${helpers}${liveCallbackGarmin.slice(at)}`);
writeFileSync(join(callbackSrc, 'functions/garmin-oauth-callback/index.ts'), wrap(
  repoCallback,
  '});\n\nfunction redirect',
  '}\n\nfunction redirect',
  `export { readDeletedOauthState, garminOauthLog, garminDuplicateReturn, isGarminRefreshLockState, garminAppReturn } from '../_shared/garmin.ts';`,
));
writeFileSync(join(refreshSrc, 'functions/_shared/garmin.ts'), repoGarmin);
writeFileSync(join(refreshSrc, 'functions/garmin-refresh/index.ts'), wrap(
  readFileSync(join(refreshSrc, 'functions/garmin-refresh/index.ts'), 'utf8'),
  '});\n\nfunction refreshAsksPermissions',
  '}\n\nfunction refreshAsksPermissions',
  `export { rotateGarminAccess, garminRefreshLockState, refreshLockBusy } from '../_shared/garmin.ts';`,
));

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

async function bundle(dir, entry, outfile) {
  await esbuild.build({
    absWorkingDir: dir,
    entryPoints: [entry],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    minify: true,
    treeShaking: true,
    legalComments: 'none',
    outfile,
    external,
  });
  const bytes = readFileSync(outfile);
  return { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
}

const callback = await bundle(callbackSrc, 'functions/garmin-oauth-callback/index.ts', join(out, 'garmin-oauth-callback.js'));
const refresh = await bundle(refreshSrc, 'functions/garmin-refresh/index.ts', join(out, 'garmin-refresh.js'));
const manifest = {
  tool: 'esbuild@0.25.11',
  command: 'node scripts/bundle-garmin-min.mjs',
  external,
  callback: {
    file: 'garmin-oauth-callback.js',
    entrypoint_path: 'garmin-oauth-callback.js',
    verify_jwt: false,
    import_map: false,
    baseline: 'live callback v9 plus claim helpers only',
    ...callback,
  },
  refresh: {
    file: 'garmin-refresh.js',
    entrypoint_path: 'garmin-refresh.js',
    verify_jwt: true,
    import_map: false,
    baseline: 'live refresh v15 plus refresh lock only',
    ...refresh,
  },
};
writeFileSync(join(out, 'MANIFEST.json'), `${JSON.stringify(manifest, null, 2)}\n`);
if (callback.bytes >= 40_000 || refresh.bytes >= 40_000) {
  throw new Error(`Bundle over 40KB: callback ${callback.bytes}, refresh ${refresh.bytes}`);
}
console.log(JSON.stringify(manifest, null, 2));
