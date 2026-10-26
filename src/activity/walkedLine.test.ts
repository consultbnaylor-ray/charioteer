import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => ({
  map: new Map<string, string>(),
  removeError: null as Error | null,
  removeFailures: 0,
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (key: string) => storage.map.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      storage.map.set(key, value);
    },
    removeItem: async (key: string) => {
      if (storage.removeError) throw storage.removeError;
      if (storage.removeFailures > 0) {
        storage.removeFailures -= 1;
        throw new Error('disk full');
      }
      storage.map.delete(key);
    },
  },
}));

import { dropFinishOnLeave, readFinishHold, setFinishHold } from '@/activity/finishHold';
import { metresBetween } from '@/domain/outdoorRoute';
import {
  DROP_ENDS,
  FEWER_POINTS,
  KEEP_WHOLE_LINE,
  LINE_DROPPED_MANY,
  LINE_DROPPED_ONE,
  LINE_TOO_SHORT,
  ON_THIS_PHONE,
  PHONE_LINE_DELETE,
  SAVE_ON_PHONE,
  SIGN_OUT_LINES,
  WALKED_LINE_CAP,
  WALKED_LINES_KEY,
  WALKED_POINT_CAP,
  WALKED_TRIM_M,
  clearWalkedLines,
  clearWalkedLinesForSignOut,
  deleteWalkedLine,
  fewerPoints,
  loadWalkedLines,
  prepareWalkedLine,
  saveWalkedLine,
  suggestWalkedName,
  trimEnds,
  type WalkedLine,
  type WalkedPoint,
} from '@/activity/walkedLine';

function northLine(metres: number, stepM: number): WalkedPoint[] {
  const points: WalkedPoint[] = [{ latitude: 51.45, longitude: -2.59 }];
  let walked = 0;
  while (walked < metres - 0.5) {
    const next = Math.min(stepM, metres - walked);
    const prev = points[points.length - 1];
    points.push({ latitude: prev.latitude + next / 111_320, longitude: prev.longitude });
    walked += next;
  }
  return points;
}

function pathLength(points: readonly WalkedPoint[]): number {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) total += metresBetween(points[index - 1], points[index]);
  return total;
}

function storedLine(id: string, count = 2): WalkedLine {
  return {
    id,
    name: `Walk ${id}`,
    activity: 'walk',
    date: '2026-10-26',
    points: Array.from({ length: Math.max(2, count) }, (_, index) => ({
      latitude: 51.45 + index * 0.00002,
      longitude: -2.59,
    })),
  };
}

describe('a walked line kept on the phone', () => {
  beforeEach(() => {
    storage.map.clear();
    storage.removeError = null;
    storage.removeFailures = 0;
    dropFinishOnLeave();
  });

  it('drops the first and last 200 m along the line, and leaves a short line whole', () => {
    const line = northLine(1000, 50);
    const trimmed = trimEnds(line, WALKED_TRIM_M);
    expect(trimmed.trimmed).toBe(true);
    expect(pathLength(trimmed.points)).toBeGreaterThan(590);
    expect(pathLength(trimmed.points)).toBeLessThan(610);
    expect(metresBetween(line[0], trimmed.points[0])).toBeGreaterThan(190);
    expect(metresBetween(line[0], trimmed.points[0])).toBeLessThan(210);
    expect(metresBetween(line[line.length - 1], trimmed.points[trimmed.points.length - 1])).toBeGreaterThan(190);
    const bend = [
      ...northLine(500, 50),
    ];
    const east = bend[bend.length - 1];
    bend.push({ latitude: east.latitude, longitude: east.longitude + 500 / (111_320 * Math.cos((east.latitude * Math.PI) / 180)) });
    const bent = trimEnds(bend);
    expect(bent.trimmed).toBe(true);
    expect(metresBetween(bend[0], bent.points[0])).toBeGreaterThan(190);
    expect(metresBetween(bend[0], bent.points[0])).toBeLessThan(230);

    const short = trimEnds(northLine(300, 50));
    expect(short.trimmed).toBe(false);
    expect(short.points).toHaveLength(northLine(300, 50).length);
    expect(trimEnds([{ latitude: 51.45, longitude: -2.59 }]).trimmed).toBe(false);
  });

  it('uses fewer points only when asked, and that sample keeps the ends', () => {
    const line = northLine(1000, 10);
    const whole = prepareWalkedLine(line, { trim: false, fewer: false });
    expect(whole.trimmed).toBe(false);
    expect(whole.points[0]).toEqual(line[0]);
    expect(whole.points[whole.points.length - 1]).toEqual(line[line.length - 1]);
    expect(whole.points).toHaveLength(line.length);

    const crowded = Array.from({ length: 3000 }, (_, index) => ({
      latitude: 51.45 + index * 0.00001,
      longitude: -2.59,
    }));
    const fewer = fewerPoints(crowded);
    expect(fewer).toHaveLength(2000);
    expect(fewer[0]).toEqual(crowded[0]);
    expect(fewer[fewer.length - 1]).toEqual(crowded[crowded.length - 1]);
    const prepared = prepareWalkedLine(line, { trim: true, fewer: true });
    expect(prepared.trimmed).toBe(true);
    expect(metresBetween(line[0], prepared.points[0])).toBeGreaterThan(190);
    expect(suggestWalkedName('walk', '2026-10-26')).toBe('Walk on 26 Oct');
    expect(suggestWalkedName('run', '2026-01-02')).toBe('Run on 2 Jan');
    expect(suggestWalkedName('cycle', 'nope')).toBe('My route');
  });

  it('saves and deletes only the local record', async () => {
    const points = northLine(1000, 100);
    await saveWalkedLine({
      id: 'one',
      name: 'Walk on 26 Oct',
      activity: 'walk',
      date: '2026-10-26',
      points,
    });
    await saveWalkedLine({
      id: 'two',
      name: '  Run on 2 Jan  ',
      activity: 'run',
      date: '2026-01-02',
      points,
    });
    const stored = await loadWalkedLines();
    expect(stored.map((row) => row.id)).toEqual(['two', 'one']);
    expect(stored[0].name).toBe('Run on 2 Jan');
    expect(JSON.stringify(stored[0])).not.toMatch(/supabase|export_my_data/);
    await deleteWalkedLine('one');
    const left = await loadWalkedLines();
    expect(left.map((row) => row.id)).toEqual(['two']);
    expect(storage.map.get(WALKED_LINES_KEY)).not.toContain('"id":"one"');
    await deleteWalkedLine('two');
    expect(storage.map.has(WALKED_LINES_KEY)).toBe(false);
    expect(await loadWalkedLines()).toEqual([]);
    await saveWalkedLine({ id: 'bad', name: '   ', activity: 'walk', date: '2026-10-26', points });
    expect(storage.map.has(WALKED_LINES_KEY)).toBe(false);
  });

  it('caps the lines, shortens a line over the point ceiling, and does not overwrite a bad read', async () => {
    for (let index = 0; index < WALKED_LINE_CAP; index += 1) {
      const saved = await saveWalkedLine(storedLine(`n${index}`));
      expect(saved.dropped).toBe(0);
    }
    const overflow = await saveWalkedLine(storedLine('newest'));
    expect(overflow.dropped).toBe(1);
    const ids = (await loadWalkedLines()).map((row) => row.id);
    expect(ids).toHaveLength(WALKED_LINE_CAP);
    expect(ids[0]).toBe('newest');
    expect(ids).not.toContain('n0');

    storage.map.clear();
    const long = storedLine('long', WALKED_POINT_CAP + 1);
    const shortened = await saveWalkedLine(long);
    expect(shortened.dropped).toBe(0);
    const kept = (await loadWalkedLines()).find((row) => row.id === 'long');
    expect(kept?.points).toHaveLength(WALKED_POINT_CAP);
    expect(kept?.points[0]).toEqual(long.points[0]);
    expect(kept?.points[kept.points.length - 1]).toEqual(long.points[long.points.length - 1]);

    const short = storedLine('short', 40);
    await saveWalkedLine(short);
    const whole = (await loadWalkedLines()).find((row) => row.id === 'short');
    expect(whole?.points).toHaveLength(40);

    const junk = [1, { bad: true }, storedLine('keep')];
    storage.map.set(WALKED_LINES_KEY, JSON.stringify(junk));
    const added = await saveWalkedLine(storedLine('fresh'));
    expect(added.dropped).toBe(0);
    const raw = JSON.parse(storage.map.get(WALKED_LINES_KEY) ?? '[]') as unknown[];
    expect(raw[0]).toMatchObject({ id: 'fresh' });
    expect(raw).toContainEqual(1);
    expect(raw).toContainEqual({ bad: true });
    expect(raw.some((row) => !!row && typeof row === 'object' && (row as { id?: string }).id === 'keep')).toBe(true);
    await deleteWalkedLine('keep');
    const afterDelete = JSON.parse(storage.map.get(WALKED_LINES_KEY) ?? '[]') as unknown[];
    expect(afterDelete.some((row) => !!row && typeof row === 'object' && (row as { id?: string }).id === 'keep')).toBe(false);
    expect(afterDelete).toContainEqual(1);
    expect(storage.map.has(WALKED_LINES_KEY)).toBe(true);

    storage.map.set(WALKED_LINES_KEY, '{');
    await expect(saveWalkedLine(storedLine('x'))).rejects.toThrow(/Could not read the saved lines/);
    await expect(deleteWalkedLine('x')).rejects.toThrow(/Could not read the saved lines/);
    expect(await loadWalkedLines()).toEqual([]);
    expect(storage.map.get(WALKED_LINES_KEY)).toBe('{');
    storage.map.set(WALKED_LINES_KEY, '{"id":"nope"}');
    await expect(saveWalkedLine(storedLine('y'))).rejects.toThrow(/Could not read the saved lines/);
    expect(storage.map.get(WALKED_LINES_KEY)).toBe('{"id":"nope"}');
  });

  it('clears the one phone key on sign-out and on account deletion', async () => {
    await saveWalkedLine(storedLine('mine'));
    expect(storage.map.has(WALKED_LINES_KEY)).toBe(true);
    await clearWalkedLines();
    expect(storage.map.has(WALKED_LINES_KEY)).toBe(false);
    storage.map.set(WALKED_LINES_KEY, '{');
    await clearWalkedLines();
    expect(storage.map.has(WALKED_LINES_KEY)).toBe(false);

    await saveWalkedLine(storedLine('still'));
    storage.removeError = new ReferenceError('window is not defined');
    await clearWalkedLines();
    expect(storage.map.has(WALKED_LINES_KEY)).toBe(true);
    storage.removeError = new Error('disk full');
    await expect(clearWalkedLines()).rejects.toThrow('disk full');
    await expect(clearWalkedLinesForSignOut()).resolves.toBeUndefined();
    expect(storage.map.has(WALKED_LINES_KEY)).toBe(true);
    storage.removeError = null;
    storage.removeFailures = 1;
    await clearWalkedLinesForSignOut();
    expect(storage.map.has(WALKED_LINES_KEY)).toBe(false);

    const store = readFileSync('src/activity/walkedLine.ts', 'utf8');
    expect(store).toContain("export const WALKED_LINES_KEY = 'charioteer.walked-lines'");
    expect(store).not.toMatch(/userId|user_id/);
    function methodBody(source: string, signature: string): string {
      const start = source.indexOf(signature);
      expect(start, signature).toBeGreaterThan(-1);
      const rest = source.slice(start + signature.length);
      const end = rest.search(/\n  (async |private |public )/);
      return signature + (end === -1 ? rest : rest.slice(0, end));
    }
    const demo = readFileSync('src/data/demo-repository.ts', 'utf8');
    const live = readFileSync('src/data/supabase-repository.ts', 'utf8');
    const demoOut = methodBody(demo, 'async signOut(): Promise<void> {');
    const liveOut = methodBody(live, 'async signOut(): Promise<void> {');
    const demoDelete = methodBody(demo, 'async deleteAccount(): Promise<void> {');
    const liveDelete = methodBody(live, 'async deleteAccount(): Promise<void> {');
    expect(demoOut.indexOf('clearWalkedLinesForSignOut()')).toBeGreaterThan(demoOut.indexOf('this.commit(db)'));
    expect(demoOut).not.toContain('clearWalkedLines()');
    expect(liveOut.indexOf('auth.signOut()')).toBeLessThan(liveOut.indexOf('clearWalkedLinesForSignOut()'));
    expect(liveOut.indexOf('clearWalkedLinesForSignOut()')).toBeLessThan(liveOut.indexOf('this.refresh()'));
    expect(liveOut).not.toContain('clearWalkedLines()');
    expect(demoDelete.indexOf('clearWalkedLinesForSignOut()')).toBeGreaterThan(demoDelete.indexOf('this.commit(db)'));
    expect(demoDelete).not.toContain('clearWalkedLines()');
    expect(liveDelete.indexOf('clearWalkedLinesForSignOut()')).toBeGreaterThan(liveDelete.indexOf("rpc('delete_my_account')"));
    expect(liveDelete.indexOf('clearWalkedLinesForSignOut()')).toBeLessThan(liveDelete.indexOf('auth.signOut()'));
    expect(liveDelete.indexOf('auth.signOut()')).toBeLessThan(liveDelete.indexOf('this.refresh()'));
    expect(liveDelete).not.toContain('clearWalkedLines()');
    const listenerAt = live.indexOf('onAuthStateChange');
    const signedOut = live.slice(listenerAt, live.indexOf('auth.getSession()', listenerAt));
    expect(signedOut).toContain("event === 'SIGNED_OUT'");
    expect(signedOut).toContain('clearWalkedLinesForSignOut()');
    expect(demo).not.toContain(WALKED_LINES_KEY);
    expect(live).not.toContain(WALKED_LINES_KEY);
  });

  it('drops the raw line when Finished is left without Save', () => {
    const line = northLine(800, 40);
    setFinishHold({
      summary: {
        id: 'sum',
        activity: 'walk',
        date: '2026-10-26',
        distanceM: 800,
        movingMs: 400000,
        averagePaceSecPerKm: 500,
      },
      limit: false,
      splits: [{ kilometre: 1, movingMs: 400000 }],
      line,
      savedId: null,
    });
    expect(readFinishHold()?.line).toHaveLength(line.length);
    expect(readFinishHold()?.savedId).toBeNull();
    dropFinishOnLeave();
    expect(readFinishHold()).toBeNull();
    const screen = readFileSync('src/app/(main)/activity.tsx', 'utf8');
    const leave = screen.indexOf('dropFinishOnLeave()');
    const cleanup = screen.slice(screen.lastIndexOf('return () => {', leave), leave + 'dropFinishOnLeave();'.length);
    expect(cleanup).toContain('screenMounted = false');
    expect(cleanup).toContain('dropFinishOnLeave()');
    expect(cleanup).not.toContain('savedId');
  });

  it('keeps the line off the summary, the export, and the network', () => {
    const screen = readFileSync('src/app/(main)/activity.tsx', 'utf8');
    const store = readFileSync('src/activity/walkedLine.ts', 'utf8');
    const summaries = readFileSync('src/activity/summaries.ts', 'utf8');
    const stop = screen.slice(screen.indexOf('export function stopRunningOuting'), screen.indexOf('function publish'));
    const end = screen.slice(screen.indexOf('async function endOuting'), screen.indexOf('useEffect(() => {\n    screenMounted = true'));
    for (const body of [stop, end]) {
      expect(body.indexOf('copyWalkedPoints')).toBeGreaterThan(-1);
      expect(body.indexOf('copyWalkedPoints')).toBeLessThan(body.indexOf('clearPath'));
      expect(body.indexOf('clearPath')).toBeLessThan(body.indexOf('summaryFrom'));
      expect(body).toContain('savedId: null');
    }
    let from = 0;
    while ((from = screen.indexOf('summaryFrom(', from)) !== -1) {
      expect(screen.slice(from, from + 320)).not.toMatch(/track|latitude|points|splits|bpm/);
      from += 12;
    }
    expect(screen).toContain('label={DROP_ENDS}');
    expect(screen).toContain('label={KEEP_WHOLE_LINE}');
    expect(screen).toContain('label={FEWER_POINTS}');
    expect(screen).toContain('{LINE_TOO_SHORT}');
    expect(screen).toContain('{SAVE_ON_PHONE}');
    expect(screen).toContain('{SIGN_OUT_LINES}');
    expect(screen.split('{SIGN_OUT_LINES}').length - 1).toBe(2);
    expect(screen).toContain('{ON_THIS_PHONE}');
    expect(screen).toContain('{PHONE_LINE_DELETE}');
    expect(store).toContain(DROP_ENDS);
    expect(store).toContain(KEEP_WHOLE_LINE);
    expect(store).toContain(FEWER_POINTS);
    expect(store).toContain(LINE_TOO_SHORT);
    expect(store).toContain(SAVE_ON_PHONE);
    expect(store).toContain(SIGN_OUT_LINES);
    expect(SIGN_OUT_LINES).toBe('Signing out removes your saved lines from this phone.');
    expect(store).not.toContain('Signing out removes your saved routes from this phone.');
    expect(readFileSync('src/app/(main)/outside.tsx', 'utf8')).not.toContain('SIGN_OUT_LINES');
    expect(store).toContain(ON_THIS_PHONE);
    expect(store).toContain(PHONE_LINE_DELETE);
    expect(screen).toContain('label="Save this route"');
    expect(screen).toContain('track={prepared.points}');
    expect(screen).toContain('copyGuide({ title: phone.name, points: phone.points })');
    expect(screen).toContain('LINE_DROPPED_ONE');
    expect(screen).toContain('LINE_DROPPED_MANY');
    expect(screen).toContain('roomNote ?');
    expect(store).toContain(LINE_DROPPED_ONE);
    expect(store).toContain(LINE_DROPPED_MANY);
    expect(screen).not.toMatch(/supabase|functions\.invoke|planOutdoorRoute|console\.(log|info|debug|warn|error)/);
    const done = screen.slice(screen.indexOf('async function done'), screen.indexOf('async function keepLine'));
    expect(done).not.toContain('deleteWalkedLine');
    expect(done).toContain('dropFinishOnLeave()');
    const discard = screen.slice(screen.indexOf('async function discard'), screen.indexOf('const moving = live'));
    expect(discard.indexOf('deleteWalkedLine')).toBeLessThan(discard.indexOf('deleteActivitySummary'));
    expect(discard).toContain('readFinishHold()');
    expect(discard).toContain('dropFinishOnLeave()');
    expect(store).not.toMatch(/supabase|functions\.invoke|console\.|fetch\(|export_my_data/);
    expect(summaries).not.toContain(WALKED_LINES_KEY);
    expect(summaries).not.toMatch(/guide/);
    expect(readFileSync('src/data/supabase-repository.ts', 'utf8')).not.toContain(WALKED_LINES_KEY);
    expect(readFileSync('src/domain/activitySession.ts', 'utf8')).not.toContain(WALKED_LINES_KEY);

    const start = screen.slice(screen.indexOf('function start()'), screen.indexOf('function pauseOrResume'));
    expect(start).toContain('copyGuide(');
    expect(start).not.toMatch(/summaryFrom|saveActivitySummary|fetch\(|functions\.invoke|supabase|planOutdoorRoute/);
    let call = 0;
    while ((call = screen.indexOf('summaryFrom(', call)) !== -1) {
      const arg = screen.slice(call, screen.indexOf(');', call));
      expect(arg).not.toMatch(/guide|routeTitle|latitude|points/);
      call += 12;
    }
    call = 0;
    while ((call = screen.indexOf('saveActivitySummary(', call)) !== -1) {
      expect(screen.slice(call, call + 'saveActivitySummary(saved)'.length)).toBe('saveActivitySummary(saved)');
      call += 20;
    }
  });
});
