import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { applyErase, recalculateKeepsLoop, rubbedSinceSnap, type DrawUndoEntry } from '@/domain/drawErase';
import { routeKind } from '@/domain/findRoute';
import {
  DRAWN_ROUTE_KIND_LABEL,
  metresBetween,
  outdoorRouteFromRow,
  outdoorRouteInsert,
  routeFrame,
  routeKindLabel,
  type OutdoorPoint,
  type OutdoorRoute,
} from '@/domain/outdoorRoute';
import { LINE_NOT_KEPT } from '@/domain/savedRoute';
import {
  SAVED_LINE_POINT_CAP,
  savedLineGeometry,
  savedLineRejected,
  savedRouteHasLine,
  withSavedLine,
  withoutSavedLine,
} from '@/domain/savedRouteLine';

// Made-up points near Borrowash. 0.0001 degrees of latitude is about 11 m.
const BASE = { latitude: 52.905, longitude: -1.38 };
function at(northM: number, eastM = 0): OutdoorPoint {
  return {
    latitude: BASE.latitude + northM / 111_195,
    longitude: BASE.longitude + eastM / (111_195 * Math.cos((BASE.latitude * Math.PI) / 180)),
  };
}
function line(fromM: number, toM: number, eastM = 0, stepM = 2): OutdoorPoint[] {
  const out: OutdoorPoint[] = [];
  for (let m = fromM; m <= toM; m += stepM) out.push(at(m, eastM));
  return out;
}
function nearest(point: OutdoorPoint, path: readonly OutdoorPoint[]): number {
  return Math.min(...path.map((other) => metresBetween(point, other)));
}

describe('rubber: a small touch on a snapped route (Ben, t1132u/t1133u)', () => {
  // Three hand strokes, wobbling 40 m east of where the paths are (the thick black pencil).
  const raw = [line(0, 300, 40), line(300, 600, 40), line(600, 900, 40)];
  // The snapped green line follows the real path.
  const green = line(0, 900, 0, 5);
  const touch = [at(450)];

  const result = applyErase({ strokes: raw, snappedLine: green, erasedSnap: null, snappedCount: 3, path: touch, radiusM: 10 });

  it('removes only the points under the finger and leaves a real gap', () => {
    expect(result.changed).toBe(true);
    expect(result.strokes).toHaveLength(2);
    const kept = result.strokes.flat();
    expect(kept.every((point) => metresBetween(point, at(450)) > 9.5)).toBe(true);
    const removed = green.filter((point) => nearest(point, kept) > 0.01);
    expect(removed.length).toBeGreaterThan(0);
    expect(removed.every((point) => metresBetween(point, at(450)) <= 15)).toBe(true);
  });

  it('does not bring back the black sketch: every point left is on the green line', () => {
    const kept = result.strokes.flat();
    // Green vertices are 5 m apart, so a point on the green line is within 2.5 m of one.
    expect(kept.every((point) => nearest(point, green) < 3)).toBe(true);
    expect(kept.some((point) => nearest(point, raw.flat()) < 1)).toBe(false);
    expect(result.snappedCount).toBe(2);
    expect(result.erasedSnap).toEqual(result.strokes);
  });

  it('adds no point and no joining line, and the wipe hides the dashed gap hint', () => {
    const [first, second] = result.strokes;
    expect(metresBetween(first[first.length - 1], second[0])).toBeGreaterThan(15);
    const stack: DrawUndoEntry[] = result.entry ? [result.entry] : [];
    expect(rubbedSinceSnap(stack)).toBe(true);
  });

  it('Undo gives back the exact strokes, and a wiped loop recalculates as a loop', () => {
    expect(result.entry).toMatchObject({ kind: 'erase', strokes: raw, snappedCount: 3, erasedSnap: null });
    expect(recalculateKeepsLoop({ wiped: true, previousShape: 'loop' })).toBe(true);
    expect(recalculateKeepsLoop({ wiped: false, previousShape: 'loop' })).toBe(false);
  });
});

describe('saved route type (Ben, t1136u)', () => {
  it('a drawn route is saved as drawn and labelled Your drawn route', () => {
    expect(routeKind('loop', false, true)).toBe('drawn');
    expect(routeKind('a_to_b', false, true)).toBe('drawn');
    expect(routeKind('loop', false)).toBe('loop');
    expect(routeKind('a_to_b', false)).toBe('point_to_point');
    expect(routeKind('loop', true, true)).toBe('craving_walk');
    expect(DRAWN_ROUTE_KIND_LABEL).toBe('Your drawn route');
    expect(routeKindLabel('drawn')).toBe('Your drawn route');
    expect(routeKindLabel('loop')).toBe('Loop');
  });

  it('RouteMaker passes whether the route was drawn, and the list and card use the label', () => {
    const maker = readFileSync('src/ui/RouteMaker.tsx', 'utf8');
    expect(maker).toContain('kind: routeKind(plan.shape, craving, fromDraw)');
    expect(readFileSync('src/ui/SavedRouteCard.tsx', 'utf8')).toContain('routeKindLabel(route.kind)');
    expect(readFileSync('src/app/(main)/saved-route.tsx', 'utf8')).toContain('routeKindLabel(route.kind)');
  });
});

describe('saved route line (Ben, t1135u)', () => {
  const loop = [...line(0, 2000, 0, 3), ...line(0, 2000, 300, 3).reverse()];

  it('keeps a cut-down, rounded copy of the snapped line', () => {
    const geometry = savedLineGeometry(loop);
    expect(geometry).not.toBeNull();
    expect(geometry!.length).toBeLessThanOrEqual(SAVED_LINE_POINT_CAP);
    expect(geometry![0]).toEqual({
      latitude: Math.round(loop[0].latitude * 1e5) / 1e5,
      longitude: Math.round(loop[0].longitude * 1e5) / 1e5,
    });
    expect(metresBetween(geometry![geometry!.length - 1], loop[loop.length - 1])).toBeLessThan(2);
    expect(savedLineGeometry([at(0)])).toBeNull();
  });

  it('adds the line to the row, and can take it off again when the grant is missing', () => {
    const row = outdoorRouteInsert('user-1', 'route-1', { title: 'Elvo 5k', kind: 'drawn', points: loop });
    expect(row).not.toHaveProperty('geometry');
    const lined = withSavedLine(row!, loop);
    expect(Array.isArray(lined.geometry)).toBe(true);
    expect(Object.keys(lined)).not.toContain('user_id_changed');
    expect(withoutSavedLine(lined)).toEqual(row);
    expect(savedLineRejected('permission denied for table outdoor_routes', lined)).toBe(true);
    expect(savedLineRejected('new row violates check constraint "outdoor_routes_geometry_line"', lined)).toBe(true);
    expect(savedLineRejected('permission denied for table outdoor_routes', row!)).toBe(false);
    const read = outdoorRouteFromRow({ ...lined, created_at: '2026-11-27T00:00:00.000Z' });
    expect(savedRouteHasLine(read!.points)).toBe(true);
  });

  it('frames the whole route, centred, instead of a fixed close zoom', () => {
    const route = { id: 'r', title: 'Elvo 5k', kind: 'drawn', distanceM: 5600, durationMinutes: 68, points: loop, createdAt: '' } as OutdoorRoute;
    const frame = routeFrame([route])!;
    expect(frame.latitude).toBeCloseTo(at(1000).latitude, 3);
    expect(frame.longitude).toBeCloseTo(at(0, 150).longitude, 3);
    expect(frame.zoom).toBeLessThan(15);
    expect(frame.zoom).toBeGreaterThanOrEqual(12);
    expect(routeFrame([{ ...route, points: [] }])).toBeNull();
    const camera = readFileSync('src/ui/mapCamera.ts', 'utf8');
    expect(camera).toContain('routeFrame(routes)');
  });

  it('an older route with no line says so and shows no map', () => {
    expect(LINE_NOT_KEPT).toBe('Line not saved for this older route.');
    const screen = readFileSync('src/app/(main)/saved-route.tsx', 'utf8');
    const noLine = screen.indexOf('!savedRouteHasLine(route.points) ? <T variant="muted">{LINE_NOT_KEPT}</T> : (');
    expect(noLine).toBeGreaterThan(-1);
    expect(screen.indexOf('<FootpathMap')).toBeGreaterThan(noLine);
    const old = outdoorRouteFromRow({ id: 'r', title: 'Elvo 5k', kind: 'loop', distance_m: 5600, duration_minutes: 68, created_at: '' });
    expect(savedRouteHasLine(old!.points)).toBe(false);
  });

  it('the repository writes and reads the line, and falls back without it', () => {
    const repo = readFileSync('src/data/supabase-repository.ts', 'utf8');
    expect(repo).toContain('withSavedLine(bare, input.points)');
    expect(repo).toContain("'id, title, kind, distance_m, duration_minutes, ascent_m, geometry, created_at'");
    expect(repo).toContain('savedLineRejected(error.message ?? \'\', row)');
    expect(repo).toContain('withSavedLine(outdoorRouteReplace(');
  });

  it('the migration is owner-only, unapplied, checked, and never logs a position', () => {
    const sql = readFileSync('supabase/migrations/20261127173856_outdoor_routes_keep_line.sql', 'utf8');
    expect(sql.startsWith('-- Not applied.')).toBe(true);
    expect(sql).toContain('grant select (geometry) on table public.outdoor_routes to authenticated;');
    expect(sql).toContain('grant insert (geometry) on table public.outdoor_routes to authenticated;');
    expect(sql).toContain('grant update (geometry) on table public.outdoor_routes to authenticated;');
    expect(sql).toContain('add constraint outdoor_routes_geometry_line check');
    expect(sql).not.toMatch(/^grant[^\n]*\bto (anon|public)\b/m);
    expect(sql).not.toMatch(/create or replace function public\.export_my_data/);
    const source = readFileSync('src/domain/savedRouteLine.ts', 'utf8');
    expect(source).not.toMatch(/console\.|fetch\(|functions\.invoke/);
  });
});
