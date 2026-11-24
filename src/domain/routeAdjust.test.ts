import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

import {
  fullScreenModalVisible,
  fullScreenShowsNativeMap,
  inlineMapMounted,
  nextFullScreenPhase,
  pageScrollForMapTouch,
} from '@/ui/mapCamera';
import { appendSketchPoint, type OutdoorPoint } from '@/domain/outdoorRoute';
import { ROUTE_OFFLINE, type RoutePlan } from '@/domain/findRoute';
import {
  DRAW_FINGER_HINT,
  DRAW_NO_PATH,
  DRAW_PEN_HINT,
  VIA_POINT_CAP,
  REDRAW_PAUSE_MS,
  adjustControlsOn,
  MIN_LIFT_METRES,
  SAME_POINT_METRES,
  TAP_TO_MOVE,
  TAP_TO_PLACE,
  armPlacement,
  beginDrag,
  commitRedraw,
  countsPhoneRouteRequest,
  createRedrawScheduler,
  finishDrag,
  metresBetween,
  noteRouteRequest,
  placeSearchBody,
  readRouteRequests,
  routePlanBody,
  routeRequestsTodayLine,
  mapPressPoint,
  tapPoint,
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
    expect(viaCountLine(5)).toBe('5 of 5 points.');
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
    expect(fn).toContain('.insert({ user_id: userId, kind })');
    expect(fn).not.toMatch(/insert\(\{[^}]*latitude/);
    expect(fn).toContain("console.error('outdoor-route request failed')");
    expect(fn).not.toMatch(/console\.(log|info|debug|warn|error)\([^)]*(latitude|longitude)/);
    const maker = readFileSync('src/ui/RouteMaker.tsx', 'utf8');
    const save = maker.slice(maker.indexOf('async function save'), maker.indexOf('const mapsUrl'));
    expect(save).toContain('points: plan.points');
    expect(save).not.toContain('via');
    const repo = readFileSync('src/data/supabase-repository.ts', 'utf8');
    const places = repo.slice(repo.indexOf('async searchRoutePlaces'), repo.indexOf('async deleteOutdoorRoute'));
    expect(places).toContain("body: { action: 'search', query, requestId }");
    expect(places).not.toMatch(/latitude|longitude|via/);
  });

  it('counts one phone request after the call, and shows adjust controls after the button', () => {
    expect(countsPhoneRouteRequest(null)).toBe(true);
    expect(countsPhoneRouteRequest('Choose a start point.')).toBe(true);
    expect(countsPhoneRouteRequest(ROUTE_OFFLINE)).toBe(false);

    let adjusting = false;
    const tapAdjust = () => { adjusting = !adjusting; };
    const planOn = { craving: false, hasPlan: true };
    expect(adjustControlsOn({ ...planOn, adjusting })).toBe(false);
    tapAdjust();
    expect(adjusting).toBe(true);
    expect(adjustControlsOn({ ...planOn, adjusting })).toBe(true);
    expect(adjustControlsOn({ craving: true, adjusting, hasPlan: true })).toBe(false);
    expect(viaCountLine(0)).toBe('0 of 5 points');
    tapAdjust();
    expect(adjustControlsOn({ ...planOn, adjusting })).toBe(false);

    const maker = readFileSync('src/ui/RouteMaker.tsx', 'utf8');
    const make = maker.slice(maker.indexOf('async function make'), maker.indexOf('async function save'));
    const redraw = maker.slice(maker.indexOf('sendRef.current = async'), maker.indexOf('function onMapTap'));
    expect(make.indexOf('planOutdoorRoute')).toBeGreaterThan(-1);
    expect(make.indexOf('planOutdoorRoute')).toBeLessThan(make.indexOf('noteRouteRequest'));
    expect(redraw.indexOf('planOutdoorRoute')).toBeLessThan(redraw.indexOf('noteRouteRequest'));
    expect(make.split('noteRouteRequest').length - 1).toBe(2);
    const card = maker.slice(maker.indexOf('label={startLabel'), maker.indexOf('label="Route name"'));
    expect(card.indexOf('label={ADJUST_THE_ROUTE}')).toBeLessThan(card.indexOf('{adjustActions}'));
    expect(card.indexOf('{adjustActions}')).toBeLessThan(card.indexOf('<FootpathMap'));
    expect(maker).toContain('label={UNDO_ADJUST}');
    expect(maker).toContain('label={RESET_ADJUST}');
    expect(maker).toContain('label={ADD_A_POINT}');
    expect(maker).toContain('viaCountLine');
    expect(maker).toContain('vias: shownVias');
    expect(maker).toContain('holdMadeRoute');
    expect(maker).toContain('startLabel');
    expect(maker).not.toMatch(/latitude|longitude/);

    const screen = readFileSync('src/app/(main)/activity.tsx', 'utf8');
    expect(screen).toContain('takeMadeRoute');
    expect(screen).toContain('guideAsRoutes');
    expect(screen).toContain('copyMadeRoute');
    const savedCall = screen.slice(screen.indexOf('summaryFrom('), screen.indexOf('summaryFrom(') + 320);
    expect(savedCall).not.toMatch(/track|latitude|points|splits|bpm/);
    expect(screen).not.toMatch(/planOutdoorRoute|functions\.invoke|supabase/);
  });

  it('arms a tap, places it, selects a nearby point, and moves one closer than 40 m', () => {
    const shift = { latitude: start.latitude + 25 / 111_320, longitude: start.longitude };
    expect(metresBetween(start, shift)).toBeGreaterThan(SAME_POINT_METRES);
    expect(metresBetween(start, shift)).toBeLessThan(MIN_LIFT_METRES);

    expect(armPlacement(0)).toEqual({ kind: 'place' });
    expect(armPlacement(VIA_POINT_CAP)).toEqual({ kind: 'idle' });

    const idleTap = tapPoint({ edit: { kind: 'idle' }, vias: [], point: start });
    expect(idleTap).toEqual({ edit: { kind: 'idle' }, vias: [], send: false });

    const placed = tapPoint({ edit: armPlacement(0), vias: [], point: start });
    expect(placed.send).toBe(true);
    expect(placed.vias).toEqual([start]);
    expect(placed.edit).toEqual({ kind: 'idle' });

    const selected = tapPoint({ edit: { kind: 'idle' }, vias: placed.vias, point: shift });
    expect(selected.send).toBe(false);
    expect(selected.vias).toEqual([start]);
    expect(selected.edit).toEqual({ kind: 'move', index: 0 });

    const stayed = tapPoint({ edit: { kind: 'move', index: 0 }, vias: [start], point: start });
    expect(stayed.send).toBe(false);
    expect(stayed.vias).toEqual([start]);

    const moved = tapPoint({ edit: { kind: 'move', index: 0 }, vias: [start], point: shift });
    expect(moved.send).toBe(true);
    expect(moved.vias).toEqual([shift]);
    expect(moved.edit).toEqual({ kind: 'idle' });

    const beside = tapPoint({ edit: { kind: 'place' }, vias: [start], point: shift });
    expect(beside.send).toBe(true);
    expect(beside.vias).toEqual([start, shift]);

    const missed = tapPoint({ edit: { kind: 'idle' }, vias: [start], point: far });
    expect(missed.send).toBe(false);
    expect(missed.edit).toEqual({ kind: 'idle' });
    expect(missed.vias).toEqual([start]);

    let full: OutdoorPoint[] = [];
    for (let index = 0; index < VIA_POINT_CAP; index += 1) {
      full = withVia(full, { latitude: 51.45 + index / 100, longitude: -2.59 }, null) ?? full;
    }
    const sixth = tapPoint({ edit: { kind: 'place' }, vias: full, point: far });
    expect(sixth.send).toBe(false);
    expect(sixth.vias).toHaveLength(VIA_POINT_CAP);
    expect(sixth.edit).toEqual({ kind: 'idle' });
  });

  it('reads the iPhone press coordinate and places that point', () => {
    const iphone = { nativeEvent: { lngLat: [-2.59, 51.45], point: [120, 80] } };
    const point = mapPressPoint(iphone);
    expect(point).toEqual({ longitude: -2.59, latitude: 51.45 });
    const placed = tapPoint({ edit: { kind: 'place' }, vias: [], point: point ?? start });
    expect(placed.send).toBe(true);
    expect(placed.vias).toEqual([point]);
    expect(mapPressPoint({ geometry: { coordinates: [-2.6, 51.46] } })).toEqual({ longitude: -2.6, latitude: 51.46 });
    expect(mapPressPoint({ coordinates: { latitude: 51.45, longitude: -2.59 } })).toEqual(start);
    expect(mapPressPoint({ nativeEvent: {} })).toBeNull();
    expect(mapPressPoint({ geometry: { coordinates: [Number.NaN, 51] } })).toBeNull();
  });

  it('places a point from one map tap and does not drag an annotation', () => {
    const native = readFileSync('src/ui/FootpathMap.tsx', 'utf8');
    expect(native).not.toContain('ViewAnnotation');
    expect(native).not.toContain('draggable');
    expect(native).not.toContain('onDrag');
    expect(native).not.toContain('onDown');
    expect(native).not.toContain('onMove');
    expect(native).toContain('mapPressPoint(event)');
    expect(native).toContain('adjust.onTap(point)');
    expect(native).toContain('onTouchStart={expanded ? undefined : () => holdPage(true)}');
    expect(native).toContain('onTouchEnd={expanded ? undefined : () => holdPage(false)}');
    expect(native).toContain('onTouchCancel={expanded ? undefined : () => holdPage(false)}');
    expect(native).toContain('pageScrollForMapTouch(expanded, fingerDown)');
    expect(native).toContain('renderMap={({ height: viewHeight, expanded }) => (');
    expect(native).toContain('expanded={expanded}');
    expect(native).not.toContain('minZoom');
    expect(native).not.toContain('maxZoom');
    expect(native).toContain('touchZoom');
    expect(native).toContain('dragPan');
    expect(native).toContain('flyWhenReady');
    expect(native).toContain('viaPointCollection(adjust?.vias ?? [])');
    const chrome = readFileSync('src/ui/MapChrome.tsx', 'utf8');
    expect(chrome).toContain('animationType="none"');
    expect(chrome).toContain('nextFullScreenPhase');
    expect(chrome).toContain('fullScreenShowsNativeMap');
    expect(chrome).toContain('inlineMapMounted');
    expect(chrome).toContain('requestAnimationFrame');
    expect(chrome).not.toContain('<Modal visible={open}');
    expect(chrome).not.toContain("pointerEvents={open ? 'none' : 'auto'}");
    expect(chrome).not.toContain('pointerEvents="box-only"');
    expect(chrome).not.toContain('pointerEvents="none"');
    expect(nextFullScreenPhase('closed', 'expand')).toBe('opening');
    expect(nextFullScreenPhase('opening', 'mount-map')).toBe('open');
    expect(nextFullScreenPhase('open', 'unmount-map')).toBe('closing');
    expect(nextFullScreenPhase('opening', 'unmount-map')).toBe('closing');
    expect(nextFullScreenPhase('closing', 'hide-modal')).toBe('closed');
    expect(nextFullScreenPhase('open', 'expand')).toBe('open');
    expect(fullScreenModalVisible('opening')).toBe(true);
    expect(fullScreenModalVisible('closing')).toBe(true);
    expect(fullScreenModalVisible('closed')).toBe(false);
    expect(fullScreenShowsNativeMap('open')).toBe(true);
    expect(fullScreenShowsNativeMap('opening')).toBe(false);
    expect(fullScreenShowsNativeMap('closing')).toBe(false);
    expect(inlineMapMounted('closed')).toBe(true);
    expect(inlineMapMounted('open')).toBe(false);
    expect(inlineMapMounted('closing')).toBe(false);
    expect(pageScrollForMapTouch(false, true)).toBe(false);
    expect(pageScrollForMapTouch(false, false)).toBe(true);
    expect(pageScrollForMapTouch(true, true)).toBeNull();
    expect(pageScrollForMapTouch(true, false)).toBeNull();
    const screen = readFileSync('src/ui/ui.tsx', 'utf8');
    expect(screen).toContain('setScrollEnabled');
    expect(screen).toContain('scrollEnabled={pageScroll}');
    const web = readFileSync('src/ui/FootpathMap.web.tsx', 'utf8');
    expect(web).toContain("map.on('click', tap)");
    expect(web).toContain('current.onTap(point)');
    expect(web).not.toContain('mousedown');
    expect(web).not.toContain('dragPan');
    const maker = readFileSync('src/ui/RouteMaker.tsx', 'utf8');
    const saved = readFileSync('src/ui/SavedRouteAdjust.tsx', 'utf8');
    for (const source of [maker, saved]) {
      expect(source).toContain('armPlacement');
      expect(source).toContain('tapPoint');
      expect(source).toContain(`<T>{TAP_TO_PLACE}</T>`);
      expect(source).toContain(`<T>{TAP_TO_MOVE}</T>`);
      expect(source).toContain('onTap: onMapTap');
      expect(source).not.toContain('lineMidpoint');
      expect(source).not.toContain('beginDrag');
      expect(source).not.toContain('onDown');
    }
    expect(TAP_TO_PLACE).toBe('Tap the map to place this point.');
    expect(TAP_TO_MOVE).toBe('Tap the map to move this point.');
  });

  it('keeps a short finger step and draws it on the map in place', () => {
    const step = { latitude: start.latitude + 5 / 111_320, longitude: start.longitude };
    expect(metresBetween(start, step)).toBeGreaterThan(2);
    expect(metresBetween(start, step)).toBeLessThan(12);
    expect(appendSketchPoint([start], step, 2)).toHaveLength(2);
    expect(appendSketchPoint([start], step, 12)).toHaveLength(1);
    expect(DRAW_FINGER_HINT).toBe('Draw your route, then tap the green tick to snap it to the nearest paths');
    expect(DRAW_NO_PATH).toBe('No path matched that line.');

    const maker = readFileSync('src/ui/RouteMaker.tsx', 'utf8');
    expect(maker).not.toContain('label="Start here"');
    expect(maker).not.toContain('label="Go here"');
    expect(maker).toContain("void whereIAm('start')");
    expect(maker).toContain("void whereIAm('end')");
    const placeSearch = maker.slice(maker.indexOf('async function search'), maker.indexOf('async function make'));
    expect(placeSearch).toContain('repo.searchRoutePlaces(query)');
    expect(placeSearch).not.toContain('noteRouteRequest');
    expect(maker).toContain('onToggleDraw={craving ? undefined : toggleDraw}');
    expect(maker).toContain('DRAW_NO_PATH');
    expect(maker).not.toContain('Search sets the start');
    expect(maker).not.toContain('label="Search"');
    expect(maker).not.toContain("position: 'absolute'");

    const map = readFileSync('src/app/(main)/outside-map.tsx', 'utf8');
    expect(map).not.toContain('/find-route?draw=1');
    expect(map).not.toContain("position: 'absolute'");
    expect(map).toContain('label="Start here"');
    expect(map).toContain('label="Go here"');
    expect(map).not.toContain('planOutdoorRoute');

    const native = readFileSync('src/ui/FootpathMap.tsx', 'utf8');
    const web = readFileSync('src/ui/FootpathMap.web.tsx', 'utf8');
    for (const source of [native, web]) {
      expect(source).toContain('setScrollEnabled?.(false)');
      expect(source).toContain('pencilColour');
      expect(source).toContain("'line-width': 7");
      expect(source).toContain("'line-width': 6");
      expect(source).not.toContain('line-dasharray');
    }
    expect(native).toContain('attribution={false}');
    expect(web).toContain('attributionControl: false');
    expect(web).toContain('holdMapGestures');
    const capture = readFileSync('src/ui/DrawCapture.tsx', 'utf8');
    expect(capture).toContain('applyDrawPointers');
    expect(capture).toContain('twoFingerView');
    expect(capture).toContain('onStartShouldSetResponderCapture={() => true}');
    expect(capture).toContain('onMoveShouldSetResponderCapture={() => true}');
    const chrome = readFileSync('src/ui/MapChrome.tsx', 'utf8');
    expect(chrome).toContain('MAP_CREDIT');
    expect(chrome).toContain('OSM_CONTRIBUTORS');
    expect(chrome).not.toContain('ORS_CREDIT');
    expect(chrome).toContain('DRAW_FINGER_HINT');
    expect(chrome).toContain('CONFIRM_DRAW');
    expect(chrome).toContain('DRAW_TICK_GREEN');
    expect(chrome).toContain('DRAW_SNAPPED');
    expect(chrome).toContain('canConfirmDraw');
    expect(chrome.match(/<T[^>]*>\{MAP_CREDIT\}/g)).toBeNull();
  });

  it('snaps when the green tick is tapped and leaves drawing on until then', () => {
    expect(DRAW_PEN_HINT).toBe('Use the pen symbol to draw where you want to go and the line will snap to the nearest paths');
    const maker = readFileSync('src/ui/RouteMaker.tsx', 'utf8');
    const snap = maker.slice(maker.indexOf('async function snapDrawn'), maker.indexOf('function undoDraw'));
    expect(maker).toContain('function holdStroke');
    expect(maker).toContain('commitDrawStroke');
    expect(maker).toContain('onEnd: (points) => { holdStroke(points); }');
    expect(snap).toContain('combineDrawStrokes');
    expect(snap).not.toContain('setDrawing(false)');
    expect(snap).not.toContain('commitDrawStroke');
    const confirm = maker.slice(maker.indexOf('async function confirmDraw'), maker.indexOf('const mapHeight'));
    expect(confirm).toContain('holdStroke(pencilRef.current)');
    expect(confirm).toContain('await snapDrawn()');
    expect(confirm).toContain('if (snapped) setDrawing(false)');
    expect(snap).toContain('setDrawNote(DRAW_SNAP_FAILED)');
    expect(snap).toContain('setSnapMiss(line)');
    const failedSnap = snap.slice(snap.indexOf('} catch'));
    expect(failedSnap).toContain('return false');
    expect(failedSnap).not.toContain('setSnappedCount');
    expect(maker).toContain('DRAW_SNAP_FAILED');
    expect(maker).toContain('DRAW_SNAP_TRY_AGAIN');
    expect(maker).toContain('RouteSnapSummary');
    expect(maker).toContain('sketchDistanceLabel(pathMetres(rawLine))');
    expect(maker).toContain('pencil={rawLine}');
    expect(maker).toContain('statusNote={snapMiss ? DRAW_SNAP_FAILED : drawing ? null : drawNote}');
    const chrome = readFileSync('src/ui/MapChrome.tsx', 'utf8');
    expect(chrome).toContain('DRAW_SNAP_FAILED');
    expect(chrome).toContain('theme.colors.danger');
    expect(chrome).toContain('statusNote === DRAW_SNAPPED');
    expect(chrome).toContain('DRAW_TICK_GREEN');
    expect(maker).toContain('undoDrawStroke');
    expect(maker).toContain('clearDrawStrokes');
    expect(maker).toContain('snappedDrawLine');
    expect(maker).toContain('rawDrawLine');
    expect(maker).toContain('onConfirmDraw');
    expect(maker).toContain('DRAW_SNAPPED');
    expect(maker).toContain('continuationEnd');
    const native = readFileSync('src/ui/FootpathMap.tsx', 'utf8');
    const web = readFileSync('src/ui/FootpathMap.web.tsx', 'utf8');
    for (const source of [native, web]) {
      expect(source).toContain('useFootpathStyle(scheme, styleUrl)');
      expect(source).toContain('openFreeMapStyle(scheme)');
      expect(source).not.toContain('line-dasharray');
    }
  });
});
