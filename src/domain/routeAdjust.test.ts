import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

import type { OutdoorPoint } from '@/domain/outdoorRoute';
import type { RoutePlan } from '@/domain/findRoute';
import {
  VIA_POINT_CAP,
  REDRAW_PAUSE_MS,
  beginDrag,
  commitRedraw,
  createRedrawScheduler,
  finishDrag,
  noteRouteRequest,
  placeSearchBody,
  readRouteRequests,
  routePlanBody,
  routeRequestsTodayLine,
  viaCountLine,
  withVia,
  type DayStore,
} from '@/domain/routeAdjust';

const start: OutdoorPoint = { latitude: 51.45, longitude: -2.59 };
const far: OutdoorPoint = { latitude: 51.456, longitude: -2.6 };
const line: OutdoorPoint[] = [start, { latitude: 51.451, longitude: -2.591 }, { latitude: 51.452, longitude: -2.592 }];

function memoryStore(): DayStore & { raw: string | null } {
  const box = { raw: null as string | null };
  return {
    get raw() { return box.raw; },
    set raw(value: string | null) { box.raw = value; },
    getItem: async () => box.raw,
    setItem: async (_key, value) => { box.raw = value; },
  };
}

function plan(distanceM: number): RoutePlan {
  return {
    mocked: true,
    mode: 'walk',
    shape: 'loop',
    profile: 'foot-walking',
    distanceM,
    durationMinutes: 48,
    ascentM: 40,
    points: line,
    snappedStart: null,
    snapDistanceM: null,
  };
}

describe('route adjusting', () => {
  it('sends one redraw 500 ms after the finger lifts, and a second lift replaces the first', async () => {
    vi.useFakeTimers();
    const sent: OutdoorPoint[][] = [];
    const queue = createRedrawScheduler(async (vias) => { sent.push(vias.map((item) => ({ ...item }))); });
    queue.down();
    await vi.advanceTimersByTimeAsync(REDRAW_PAUSE_MS);
    expect(sent).toHaveLength(0);
    queue.lift([start]);
    await vi.advanceTimersByTimeAsync(200);
    queue.lift([far]);
    await vi.advanceTimersByTimeAsync(REDRAW_PAUSE_MS - 1);
    expect(sent).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(sent).toEqual([[far]]);
    queue.dispose();
    vi.useRealTimers();
  });

  it('keeps only the latest lift while a redraw is in flight', async () => {
    vi.useFakeTimers();
    let release: (() => void) | null = null;
    const sent: number[] = [];
    const queue = createRedrawScheduler(async (vias) => {
      sent.push(vias.length);
      await new Promise<void>((resolve) => { release = resolve; });
    });
    queue.lift([start]);
    await vi.advanceTimersByTimeAsync(REDRAW_PAUSE_MS);
    expect(sent).toEqual([1]);
    queue.lift([start, far]);
    queue.lift([far]);
    release?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(sent).toEqual([1, 1]);
    queue.dispose();
    vi.useRealTimers();
  });

  it('caps via-points at five and ignores a short lift', () => {
    let vias: OutdoorPoint[] = [];
    for (let index = 0; index < VIA_POINT_CAP; index += 1) {
      const next = withVia(vias, { latitude: 51.45 + index / 100, longitude: -2.59 }, null);
      expect(next).not.toBeNull();
      vias = next ?? vias;
    }
    expect(withVia(vias, far, null)).toBeNull();
    expect(viaCountLine(5)).toBe('5 of 5 points. Drag one to move it, or remove one.');
    expect(withVia(vias, far, 1)?.[1]).toEqual(far);
    const drag = beginDrag(vias, line, { ...vias[0] });
    expect(drag?.viaIndex).toBe(0);
    expect(finishDrag(vias, drag && { ...drag, current: { ...drag.origin } }).send).toBe(false);
    expect(finishDrag(vias, drag && { ...drag, current: far }).send).toBe(true);
  });

  it('counts route requests on this phone for today and leaves a place search without coordinates', async () => {
    const store = memoryStore();
    const noon = new Date(2026, 9, 26, 12, 0, 0);
    expect(await readRouteRequests(store, noon)).toBe(0);
    expect(await noteRouteRequest(store, noon)).toBe(1);
    expect(await noteRouteRequest(store, noon)).toBe(2);
    expect(await readRouteRequests(store, new Date(2026, 9, 27, 12, 0, 0))).toBe(0);
    expect(routeRequestsTodayLine(2)).toBe('2 route requests on this phone today.');
    const search = JSON.stringify(placeSearchBody('Queen Square'));
    expect(search).not.toMatch(/latitude|longitude|via/);
    const route = routePlanBody({ mode: 'walk', shape: 'loop', start, via: [far] });
    expect(route.action).toBe('route');
    expect(route.via).toEqual([far]);
    expect(JSON.stringify(placeSearchBody('park'))).not.toContain(String(far.latitude));
  });

  it('keeps the previous route and figures when a redraw fails', async () => {
    const current = { plan: plan(5200), vias: [] as OutdoorPoint[] };
    const failed = await commitRedraw(current, [far], async () => {
      throw new Error('no path');
    });
    expect(failed.failed).toBe(true);
    expect(failed.snapshot.plan.distanceM).toBe(5200);
    expect(failed.snapshot.plan.ascentM).toBe(40);
    expect(failed.snapshot.vias).toEqual([]);
    const next = plan(6100);
    next.ascentM = 55;
    const ok = await commitRedraw(current, [far], async () => next);
    expect(ok.failed).toBe(false);
    expect(ok.snapshot.plan.distanceM).toBe(6100);
    expect(ok.snapshot.vias).toEqual([far]);
  });

  it('keeps coordinates out of a place search, a saved route, and the request row', () => {
    const fn = readFileSync('supabase/functions/outdoor-route/index.ts', 'utf8');
    const search = fn.slice(fn.indexOf("body.action === 'search'"), fn.indexOf('const mode = readMode'));
    expect(search).not.toMatch(/latitude|longitude|via/);
    expect(fn).toContain('.insert({ user_id: userId })');
    expect(fn).not.toMatch(/insert\(\{[^}]*latitude/);
    expect(fn).toContain("console.error('outdoor-route request failed')");
    expect(fn).not.toMatch(/console\.(log|info|debug|warn|error)\([^)]*(latitude|longitude)/);
    const maker = readFileSync('src/ui/RouteMaker.tsx', 'utf8');
    const save = maker.slice(maker.indexOf('async function save'), maker.indexOf('const mapsUrl'));
    expect(save).toContain('points: plan.points');
    expect(save).not.toContain('via');
    const repo = readFileSync('src/data/supabase-repository.ts', 'utf8');
    const places = repo.slice(repo.indexOf('async searchRoutePlaces'), repo.indexOf('async deleteOutdoorRoute'));
    expect(places).toContain("body: { action: 'search', query }");
    expect(places).not.toMatch(/latitude|longitude|via/);
  });
});
