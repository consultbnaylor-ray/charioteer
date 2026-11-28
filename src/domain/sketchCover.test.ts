import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  attachStrokeToRoute,
  continueFromRoute,
  drawReadyToSnap,
  stitchRoute,
} from '@/domain/drawStroke';
import {
  appendUncoveredSketchTail,
  pathLengthM,
  uncoveredSketchTail,
} from '@/domain/routeLengthLimit';
import { DRAW_SNAP_KEPT_LINE, KEEP_DRAWING } from '@/domain/routeAdjust';
import { pathMetres, removeRouteSpurs, type OutdoorPoint } from '@/domain/outdoorRoute';

const origin: OutdoorPoint = { latitude: 52.9, longitude: -1.4 };

function offset(eastM: number, northM: number, from: OutdoorPoint = origin): OutdoorPoint {
  const cos = Math.cos((from.latitude * Math.PI) / 180);
  return { latitude: from.latitude + northM / 111_320, longitude: from.longitude + eastM / (111_320 * cos) };
}

function dense(corners: readonly OutdoorPoint[], stepM = 20): OutdoorPoint[] {
  const out: OutdoorPoint[] = [];
  for (let index = 1; index < corners.length; index += 1) {
    const from = corners[index - 1]!;
    const to = corners[index]!;
    const pieces = Math.max(1, Math.round(pathMetres([from, to]) / stepM));
    for (let part = 0; part < pieces; part += 1) {
      const t = part / pieces;
      out.push({
        latitude: from.latitude + (to.latitude - from.latitude) * t,
        longitude: from.longitude + (to.longitude - from.longitude) * t,
      });
    }
  }
  out.push({ ...corners[corners.length - 1]! });
  return out;
}

function nearest(line: readonly OutdoorPoint[], point: OutdoorPoint): number {
  return Math.min(...line.map((item) => pathMetres([item, point])));
}

describe('a dropped end of a drawing is put back', () => {
  it('appends the loop when the snapped line stops at the stub', () => {
    const stub = offset(0, -6000);
    const far = offset(-400, -400, stub);
    const sketch = dense([origin, stub, offset(-400, 0, stub), far, offset(0, -400, stub), stub]);
    const routed = dense([origin, stub]);
    expect(pathLengthM(uncoveredSketchTail(sketch, routed))).toBeGreaterThan(800);
    const filled = appendUncoveredSketchTail(routed, sketch);
    expect(filled.keptDrawn).toBe(true);
    expect(nearest(filled.points, far)).toBeLessThan(30);
    expect(pathLengthM(filled.points)).toBeGreaterThan(pathLengthM(routed) + 800);
  });

  it('does not replace a mid-route detour when the later drawing is still on the route', () => {
    const mid = offset(0, -2000);
    const end = offset(0, -4000);
    const river = offset(-500, 0, mid);
    const sketch = dense([origin, mid, river, mid, end]);
    const routed = dense([origin, offset(300, -2000), end]);
    expect(uncoveredSketchTail(sketch, routed)).toHaveLength(0);
    expect(appendUncoveredSketchTail(routed, sketch).keptDrawn).toBe(false);
  });

  it('keeps a large drawn lollipop when spur removal is tempted to cut it', () => {
    const stub = offset(0, -6000);
    const far = offset(-400, -400, stub);
    const lolly = dense([origin, stub, offset(-400, 0, stub), far, offset(0, -400, stub), stub]);
    const kept = removeRouteSpurs(lolly, undefined, undefined, lolly);
    expect(nearest(kept, far)).toBeLessThan(30);
  });
});

describe('Keep drawing joins a kept route', () => {
  const end = offset(0, -500);
  const route = [origin, end];

  it('continues from the end, or from a nearby point on the line', () => {
    const fromEnd = continueFromRoute(route, offset(10, 0, end));
    expect(fromEnd?.atEnd).toBe(true);
    const mid = offset(0, -250);
    const fromMid = continueFromRoute(route, offset(20, 0, mid));
    expect(fromMid?.atEnd).toBe(false);
    expect(fromMid).not.toBeNull();
    expect(continueFromRoute(route, offset(400, 0))).toBeNull();
  });

  it('attaches a new stroke at the join, and stitches without a straight gap', () => {
    const stroke = [offset(40, 0, end), offset(40, -200, end)];
    const attached = attachStrokeToRoute(route, stroke);
    expect(pathMetres([attached[0]!, end])).toBeLessThan(1);
    const joined = stitchRoute(route, attached);
    expect(joined[0]).toEqual(origin);
    expect(nearest(joined, stroke[1]!)).toBeLessThan(1);
  });

  it('is not ready to snap again until a new stroke is added', () => {
    const kept = [[origin, end]];
    expect(drawReadyToSnap(kept, [], 1)).toBe(false);
    expect(drawReadyToSnap([...kept, [end, offset(0, -700)]], [], 1)).toBe(true);
    expect(drawReadyToSnap(kept, [end, offset(0, -700)], 1)).toBe(true);
  });
});

describe('Keep drawing wording and wiring', () => {
  it('uses a clear button name and keeps the line when a part could not be snapped', () => {
    expect(KEEP_DRAWING).toBe('Keep drawing');
    expect(DRAW_SNAP_KEPT_LINE).toBe(
      'Snapped to paths. Part of your line could not be snapped, so that part follows your drawing.',
    );
    const maker = readFileSync(join(__dirname, '../ui/RouteMaker.tsx'), 'utf8');
    expect(maker).toContain('onKeepDrawing={craving ? undefined : keepDrawing}');
    expect(maker).toContain('canKeepDrawing={!craving && fromDraw && plan != null}');
    expect(maker).toContain('attachStrokeToRoute');
    expect(maker).toContain('stitchRoute(previous.points, added.points)');
    expect(maker).toContain('drawReadyToSnap(strokes, pencil, snappedCount)');
    const chrome = readFileSync(join(__dirname, '../ui/MapChrome.tsx'), 'utf8');
    expect(chrome).toContain('{KEEP_DRAWING}');
    expect(chrome).toContain('canKeepDrawing && onKeepDrawing && !drawing');
  });
});
