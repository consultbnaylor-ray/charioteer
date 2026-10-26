import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mem = vi.hoisted(() => new Map<string, string>());

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (key: string) => mem.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      mem.set(key, value);
    },
    removeItem: async (key: string) => {
      mem.delete(key);
    },
  },
}));

import { metresBetween } from '@/domain/outdoorRoute';
import {
  DROP_ENDS,
  FEWER_POINTS,
  KEEP_WHOLE_LINE,
  LINE_TOO_SHORT,
  ON_THIS_PHONE,
  PHONE_LINE_DELETE,
  SAVE_ON_PHONE,
  WALKED_LINES_KEY,
  WALKED_TRIM_M,
  deleteWalkedLine,
  fewerPoints,
  loadWalkedLines,
  prepareWalkedLine,
  saveWalkedLine,
  suggestWalkedName,
  trimEnds,
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

describe('a walked line kept on the phone', () => {
  beforeEach(() => {
    mem.clear();
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
    expect(mem.get(WALKED_LINES_KEY)).not.toContain('"id":"one"');
    await deleteWalkedLine('two');
    expect(mem.has(WALKED_LINES_KEY)).toBe(false);
    expect(await loadWalkedLines()).toEqual([]);
    await saveWalkedLine({ id: 'bad', name: '   ', activity: 'walk', date: '2026-10-26', points });
    expect(mem.has(WALKED_LINES_KEY)).toBe(false);
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
    expect(screen).toContain('{ON_THIS_PHONE}');
    expect(screen).toContain('{PHONE_LINE_DELETE}');
    expect(store).toContain(DROP_ENDS);
    expect(store).toContain(KEEP_WHOLE_LINE);
    expect(store).toContain(FEWER_POINTS);
    expect(store).toContain(LINE_TOO_SHORT);
    expect(store).toContain(SAVE_ON_PHONE);
    expect(store).toContain(ON_THIS_PHONE);
    expect(store).toContain(PHONE_LINE_DELETE);
    expect(screen).toContain('label="Save this route"');
    expect(screen).toContain('track={prepared.points}');
    expect(screen).toContain('copyGuide({ title: phone.name, points: phone.points })');
    expect(screen).not.toMatch(/supabase|functions\.invoke|planOutdoorRoute|console\.(log|info|debug|warn|error)/);
    const done = screen.slice(screen.indexOf('async function done'), screen.indexOf('async function keepLine'));
    expect(done).not.toContain('deleteWalkedLine');
    expect(done).toContain('pendingFinish = null');
    const discard = screen.slice(screen.indexOf('async function discard'), screen.indexOf('const moving = live'));
    expect(discard.indexOf('deleteWalkedLine')).toBeLessThan(discard.indexOf('deleteActivitySummary'));
    expect(store).not.toMatch(/supabase|functions\.invoke|console\.|fetch\(|export_my_data/);
    expect(summaries).not.toContain(WALKED_LINES_KEY);
    expect(readFileSync('src/data/supabase-repository.ts', 'utf8')).not.toContain(WALKED_LINES_KEY);
    expect(readFileSync('src/domain/activitySession.ts', 'utf8')).not.toContain(WALKED_LINES_KEY);
  });
});
