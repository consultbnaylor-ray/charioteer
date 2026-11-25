import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  DRAW_ZOOM_MAX,
  DRAW_ZOOM_MIN,
  FINGER_GAP_M,
  PAN_VIEW_FRACTION,
  appendFingerPoint,
  applyDrawPointers,
  clearDrawStrokes,
  combineDrawStrokes,
  buildDrawSnapRequests,
  commitDrawStroke,
  continuationEnd,
  drawEnd,
  drawGapLines,
  finishDrawSession,
  joinStroke,
  panViewport,
  pinchZoom,
  sliderFraction,
  startDrawSession,
  stitchRoute,
  thinFingerLine,
  twoFingerView,
  zoomFromSlider,
  drawReadyToSnap,
  rawDrawLine,
  rawStrokeLines,
  resampleDrawnPath,
  SNAP_CHUNK_CAP,
  SNAP_SPACING_M,
  snapDrawnStrokes,
  snappedDrawLine,
  undoDrawStroke,
  visibleDrawLine,
} from '@/domain/drawStroke';
import { metresBetween, viewToPoint, type OutdoorPoint } from '@/domain/outdoorRoute';

const a: OutdoorPoint = { latitude: 51.45, longitude: -2.59 };
const b: OutdoorPoint = { latitude: 51.452, longitude: -2.588 };
const c: OutdoorPoint = { latitude: 51.454, longitude: -2.586 };
const away: OutdoorPoint = { latitude: 51.453, longitude: -2.584 };
const snappedEnd: OutdoorPoint = { latitude: 51.4524, longitude: -2.5876 };

describe('draw strokes', () => {
  it('keeps a new stroke at the finger and does not prepend the previous end', () => {
    expect(joinStroke(null, [a, b])).toEqual([a, b]);
    expect(joinStroke(b, [b, c])).toEqual([b, c]);
    expect(joinStroke(b, [away, c])).toEqual([away, c]);
    expect(joinStroke(b, [])).toEqual([]);

    const first = commitDrawStroke([], [a, b]);
    expect(first).toEqual([[a, b]]);
    expect(drawEnd(first)).toEqual(b);
    const second = commitDrawStroke(first, [away, c]);
    expect(second).toEqual([[a, b], [away, c]]);
    expect(rawStrokeLines(second, 0)).toEqual([[a, b], [away, c]]);
    expect(drawGapLines(second, null, 0)).toEqual([[b, away]]);
    expect(combineDrawStrokes(second)).toEqual([a, b, away, c]);
    expect(commitDrawStroke(first, [b])).toEqual(first);
    expect(commitDrawStroke([], [a])).toEqual([]);
  });

  it('continues from the snapped end once every stroke has a route, and from the raw end until then', () => {
    const strokes = [[a, b]];
    expect(continuationEnd([], [a, snappedEnd], 0)).toBeNull();
    expect(continuationEnd(strokes, [a, snappedEnd], 1)).toEqual(snappedEnd);
    expect(continuationEnd([...strokes, [snappedEnd, c]], [a, snappedEnd], 1)).toEqual(c);
  });

  it('undo removes only the last stroke and clear removes every stroke', () => {
    const strokes = commitDrawStroke(commitDrawStroke([], [a, b]), [away, c]);
    const undone = undoDrawStroke(strokes);
    expect(undone).toEqual([[a, b]]);
    expect(combineDrawStrokes(undone)).toEqual([a, b]);
    expect(undoDrawStroke(undone)).toEqual([]);
    expect(undoDrawStroke([])).toEqual([]);
    expect(clearDrawStrokes()).toEqual([]);
    expect(strokes).toHaveLength(2);
  });

  it('keeps earlier snapped points when a later stroke has not snapped yet', () => {
    const routed = [a, { latitude: 51.451, longitude: -2.589 }, snappedEnd];
    const strokes = [[a, b], [snappedEnd, away, c]];
    expect(visibleDrawLine(routed, strokes, 1)).toEqual([...routed, away, c]);
    expect(visibleDrawLine(routed, [[a, b]], 1)).toEqual(routed);
    expect(visibleDrawLine(routed, [], 0)).toEqual(routed);
    expect(visibleDrawLine(null, [[a, b], [b, c]], 0)).toEqual([a, b, c]);
    expect(snappedDrawLine(routed, strokes, 1)).toEqual(routed);
    expect(snappedDrawLine(routed, [], 0)).toEqual(routed);
    expect(snappedDrawLine(routed, strokes, 0)).toEqual([]);
    expect(rawDrawLine(strokes, 1)).toEqual([snappedEnd, away, c]);
    expect(rawDrawLine([[a, b]], 0, [b, c])).toEqual([a, b, c]);
    expect(rawDrawLine([[a, b]], 1)).toEqual([]);
    expect(drawReadyToSnap([], [])).toBe(false);
    expect(drawReadyToSnap([], [a])).toBe(false);
    expect(drawReadyToSnap([], [a, b])).toBe(true);
    expect(drawReadyToSnap([[a, b]], [])).toBe(true);
    expect(stitchRoute(routed, [snappedEnd, c])).toEqual([...routed, c]);
    expect(stitchRoute(routed, [])).toEqual(routed);
    expect(stitchRoute([], [a, b])).toEqual([a, b]);
  });

  it('a second finger adds no points and drops the stroke that was in progress', () => {
    let session = startDrawSession();
    session = applyDrawPointers(session, 1, a);
    session = applyDrawPointers(session, 1, b);
    expect(session.cancelled).toBe(false);
    expect(session.points.length).toBeGreaterThanOrEqual(2);
    session = applyDrawPointers(session, 2, c);
    expect(session.cancelled).toBe(true);
    expect(session.points).toEqual([]);
    session = applyDrawPointers(session, 1, away);
    expect(session.points).toEqual([]);
    expect(finishDrawSession(session)).toEqual([]);

    expect(finishDrawSession(applyDrawPointers(startDrawSession(), 2, a))).toEqual([]);
    expect(pinchZoom(14, 2)).toBe(15);
    expect(pinchZoom(14, 0.5)).toBe(13);
    const wider = twoFingerView({
      startZoom: 14,
      startCentre: a,
      width: 200,
      height: 200,
      startSpan: 40,
      span: 80,
      startMidX: 100,
      startMidY: 100,
      midX: 100,
      midY: 100,
    });
    expect(wider?.zoom).toBe(15);
    expect(wider?.centre.latitude).toBeCloseTo(a.latitude, 4);
    expect(wider?.centre.longitude).toBeCloseTo(a.longitude, 4);
  });

  it('keeps a bend in the finger path and does not replace it with a chord', () => {
    const origin: OutdoorPoint = { latitude: 51.45, longitude: -2.59 };
    const east = (metres: number, from: OutdoorPoint = origin): OutdoorPoint => {
      const cos = Math.cos((from.latitude * Math.PI) / 180);
      return { latitude: from.latitude, longitude: from.longitude + metres / (111_320 * cos) };
    };
    const north = (metres: number, from: OutdoorPoint): OutdoorPoint => ({
      latitude: from.latitude + metres / 111_320,
      longitude: from.longitude,
    });
    const straight = Array.from({ length: 401 }, (_, index) => east(index * 3));
    const base = straight[200] ?? origin;
    const tip = north(120, base);
    const spiked = straight.map((point, index) => (index === 200 ? tip : point));
    const thin = thinFingerLine(spiked, 6);
    expect(thin.length).toBeLessThanOrEqual(6);
    expect(thin.some((point) => metresBetween(point, tip) < 2)).toBe(true);
    expect(metresBetween(thin[0] ?? origin, straight[0] ?? origin)).toBeLessThan(1);
    expect(metresBetween(thin[thin.length - 1] ?? origin, straight[straight.length - 1] ?? origin)).toBeLessThan(1);

    expect(appendFingerPoint([origin], east(1), FINGER_GAP_M)).toEqual([origin]);
    expect(appendFingerPoint([origin], east(3), FINGER_GAP_M)).toHaveLength(2);
    let finger: OutdoorPoint[] = [];
    for (let metres = 0; metres <= 1600; metres += 2) {
      const along = east(metres);
      finger = appendFingerPoint(finger, metres === 800 ? tip : along);
    }
    expect(finger.some((point) => metresBetween(point, tip) < 3)).toBe(true);

    const stroke = readFileSync('src/domain/drawStroke.ts', 'utf8');
    const apply = stroke.slice(stroke.indexOf('export function applyDrawPointers'), stroke.indexOf('export function finishDrawSession'));
    expect(apply).toContain('appendFingerPoint');
    expect(apply).not.toContain('simplifyLine');
    expect(apply).not.toContain('simplifySketch');
    expect(apply).not.toContain('sketchWaypoints');
    expect(apply).not.toContain('planOutdoorRoute');
    expect(stroke).not.toContain('appendSketchPoint');
  });

  it('does not snap or request a route while the finger is down', () => {
    const maker = readFileSync('src/ui/RouteMaker.tsx', 'utf8');
    const change = maker.slice(maker.indexOf('onChange: (points)'), maker.indexOf('onEnd:'));
    expect(change).not.toMatch(/planOutdoorRoute|matchDrawnSketch|sketchWaypoints|simplifySketch|simplifyLine|noteRouteRequest/);
    const hold = maker.slice(maker.indexOf('function holdStroke'), maker.indexOf('async function snapDrawn'));
    expect(hold).not.toMatch(/planOutdoorRoute|matchDrawnSketch|sketchWaypoints|noteRouteRequest/);
    const snap = maker.slice(maker.indexOf('async function snapDrawn'), maker.indexOf('function undoDraw'));
    expect(snap).toContain('snapDrawnStrokes');
    expect(snap).toContain('planOutdoorRoute');
    expect(snap).not.toContain('joinStroke');
    expect(readFileSync('src/domain/drawStroke.ts', 'utf8')).toContain('matchDrawnSketch');

    const native = readFileSync('src/ui/FootpathMap.tsx', 'utf8');
    const web = readFileSync('src/ui/FootpathMap.web.tsx', 'utf8');
    expect(native).toContain('id="guide" tolerance={0}');
    expect(web).toContain('tolerance: 0');
    expect(native.indexOf('<DrawCapture')).toBeLessThan(native.indexOf('<DrawViewControls'));
    expect(web.indexOf('<DrawCapture')).toBeLessThan(web.indexOf('<DrawViewControls'));
  });

  it('zooms from a slider and pans by about a third of the view', () => {
    expect(PAN_VIEW_FRACTION).toBeCloseTo(1 / 3);
    expect(zoomFromSlider(0)).toBe(DRAW_ZOOM_MIN);
    expect(zoomFromSlider(1)).toBe(DRAW_ZOOM_MAX);
    expect(zoomFromSlider(0.5)).toBe((DRAW_ZOOM_MIN + DRAW_ZOOM_MAX) / 2);
    expect(sliderFraction(DRAW_ZOOM_MIN)).toBe(0);
    expect(sliderFraction(DRAW_ZOOM_MAX)).toBe(1);
    expect(zoomFromSlider(sliderFraction(16))).toBeCloseTo(16, 5);

    const centre = a;
    const width = 300;
    const height = 240;
    const zoom = 15;
    const frame = { centre, zoom, width, height };
    const east = panViewport({ ...frame, direction: 'east' });
    const expected = viewToPoint({ centre, zoom, width, height, x: width / 2 + width / 3, y: height / 2 });
    expect(east?.latitude).toBeCloseTo(expected?.latitude ?? 0, 6);
    expect(east?.longitude).toBeCloseTo(expected?.longitude ?? 0, 6);
    expect(panViewport({ ...frame, direction: 'north' })?.latitude).toBeGreaterThan(centre.latitude);
    expect(panViewport({ ...frame, direction: 'south' })?.latitude).toBeLessThan(centre.latitude);
    expect(panViewport({ ...frame, direction: 'west' })?.longitude).toBeLessThan(centre.longitude);
    expect(panViewport({ centre, zoom, width: 0, height, direction: 'east' })).toBeNull();

    const capture = readFileSync('src/ui/DrawCapture.tsx', 'utf8');
    expect(capture).toContain('accessibilityLabel="Zoom in"');
    expect(capture).toContain('accessibilityLabel="Zoom out"');
    expect(capture).toContain('accessibilityLabel="Zoom level"');
    expect(capture).toContain('accessibilityLabel={`Pan ${direction}`}');
    expect(capture).toContain('onPressIn={start}');
    expect(capture).toContain('onPressOut={stop}');
    expect(capture).toContain('setInterval');
    expect(capture).toContain('PAN_HOLD_REPEAT_MS');
    expect(capture).toContain('onStartShouldSetResponder={claimTouch}');
    const native = readFileSync('src/ui/FootpathMap.tsx', 'utf8');
    const web = readFileSync('src/ui/FootpathMap.web.tsx', 'utf8');
    expect(native).toContain('drawing && expanded ? <DrawViewControls');
    expect(web).toContain('draw?.enabled && expanded ? <DrawViewControls');
  });

  it('starts a stroke at the finger and routes the gap instead of drawing it', async () => {
    const here = { latitude: a.latitude + 0.002, longitude: a.longitude };
    const strokes = commitDrawStroke(commitDrawStroke([], [a, b]), [away, c]);
    expect(strokes).toEqual([[a, b], [away, c]]);
    expect(strokes[0]?.[0]).toEqual(a);
    expect(rawStrokeLines(strokes, 0)).toEqual([[a, b], [away, c]]);
    expect(JSON.stringify(rawStrokeLines(strokes, 0))).not.toContain(String(here.latitude));
    expect(drawGapLines(strokes, null, 0)).toEqual([[b, away]]);
    expect(JSON.stringify(drawGapLines(strokes, null, 0))).not.toContain(String(here.latitude));

    const plain = buildDrawSnapRequests(strokes, null);
    expect(plain.limit).toBe(false);
    expect(plain.requests[0]?.waypoints[0]).toEqual(a);
    expect(plain.requests.some((request) => request.waypoints.some((point) => point.latitude === here.latitude))).toBe(false);
    const gap = plain.requests.find((request) => request.routedGap);
    expect(gap?.waypoints).toEqual([b, away]);
    expect(gap?.waypoints).toHaveLength(2);

    const anchored = buildDrawSnapRequests(strokes, here);
    const lead = anchored.requests.find((request) => request.routedGap && request.waypoints[0]?.latitude === here.latitude);
    expect(lead?.waypoints).toEqual([here, a]);
    expect(rawStrokeLines(strokes, 0).flat()).not.toContainEqual(here);

    const far = { latitude: a.latitude + 2, longitude: a.longitude };
    const tooLong = buildDrawSnapRequests([[a, b], [far, { latitude: far.latitude + 0.01, longitude: far.longitude }]], null);
    expect(tooLong.limit).toBe(true);
    expect(tooLong.requests).toEqual([]);

    const dense = Array.from({ length: 4001 }, (_, index) => ({
      latitude: a.latitude + index * (2 / 111_320),
      longitude: a.longitude,
    }));
    const resampled = resampleDrawnPath(dense);
    expect(resampled.length).toBeGreaterThan(2);
    expect(resampled.length).toBeLessThan(dense.length / 10);
    expect(resampled[0]).toEqual(dense[0]);
    expect(resampled[resampled.length - 1]).toEqual(dense[dense.length - 1]);
    for (let index = 1; index < resampled.length; index += 1) {
      const step = Math.abs(resampled[index]!.latitude - resampled[index - 1]!.latitude) * 111_320;
      expect(step).toBeLessThanOrEqual(SNAP_SPACING_M * 1.5);
    }
    const capped = buildDrawSnapRequests([dense], null);
    expect(capped.limit).toBe(false);
    expect(capped.requests.length).toBeGreaterThan(1);
    expect(capped.requests.every((request) => request.waypoints.length <= SNAP_CHUNK_CAP && request.waypoints.length > 1)).toBe(true);

    const sent: { latitude: number; longitude: number }[][] = [];
    let calls = 0;
    const result = await snapDrawnStrokes({
      strokes,
      anchor: null,
      send: async (waypoints) => {
        calls += 1;
        sent.push(waypoints.map((point) => ({ ...point })));
        return {
          mocked: false,
          mode: 'walk',
          shape: 'a_to_b',
          profile: 'foot-walking',
          distanceM: 100,
          durationMinutes: 2,
          ascentM: null,
          points: waypoints.map((point) => ({ ...point })),
          snappedStart: null,
          snapDistanceM: null,
        };
      },
    });
    expect(result.ok).toBe(true);
    expect(sent).toContainEqual([b, away]);
    expect(calls).toBe(plain.requests.length);

    let limitedCalls = 0;
    const refused = await snapDrawnStrokes({
      strokes: [[a, b], [far, { latitude: far.latitude + 0.01, longitude: far.longitude }]],
      anchor: null,
      send: async () => {
        limitedCalls += 1;
        throw new Error('should not send');
      },
    });
    expect(refused).toEqual({ ok: false, limit: true });
    expect(limitedCalls).toBe(0);
  });
});
