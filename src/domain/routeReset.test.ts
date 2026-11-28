import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { mapStart, type OutdoorPoint } from '@/domain/outdoorRoute';
import {
  PLANNER_TITLE,
  RESET_MAP,
  plannerNeedsReset,
  resetPlanner,
  type PlannerActivity,
} from '@/domain/routeReset';
import { restingMapCamera } from '@/ui/mapCamera';

const here: OutdoorPoint = { latitude: 53.2, longitude: -1.4 };

function fresh(): PlannerActivity {
  return {
    modeTouched: false,
    shapeTouched: false,
    distanceId: '5',
    timeId: 'none',
    customDistance: '',
    customMinutes: '',
    start: null,
    startName: '',
    end: null,
    endName: '',
    query: '',
    endQuery: '',
    searchOpen: false,
    drawing: false,
    pencil: 0,
    strokes: 0,
    snapped: 0,
    fromDraw: false,
    plan: false,
    drawNote: false,
    snapMiss: false,
    saved: false,
    title: PLANNER_TITLE,
    error: false,
    pin: false,
    rough: false,
  };
}

describe('reset map', () => {
  it('starts clear, and any choice, line, or made route can be reset', () => {
    expect(plannerNeedsReset(fresh())).toBe(false);
    expect(plannerNeedsReset({ ...fresh(), title: 'Craving walk' })).toBe(false);
    expect(plannerNeedsReset({ ...fresh(), modeTouched: true })).toBe(true);
    expect(plannerNeedsReset({ ...fresh(), shapeTouched: true })).toBe(true);
    expect(plannerNeedsReset({ ...fresh(), distanceId: '8' })).toBe(true);
    expect(plannerNeedsReset({ ...fresh(), timeId: '30' })).toBe(true);
    expect(plannerNeedsReset({ ...fresh(), customDistance: '6' })).toBe(true);
    expect(plannerNeedsReset({ ...fresh(), customMinutes: '40' })).toBe(true);
    expect(plannerNeedsReset({ ...fresh(), start: here })).toBe(true);
    expect(plannerNeedsReset({ ...fresh(), startName: 'Where I am' })).toBe(true);
    expect(plannerNeedsReset({ ...fresh(), end: here })).toBe(true);
    expect(plannerNeedsReset({ ...fresh(), endName: 'Queen Square' })).toBe(true);
    expect(plannerNeedsReset({ ...fresh(), query: 'park' })).toBe(true);
    expect(plannerNeedsReset({ ...fresh(), endQuery: 'bath' })).toBe(true);
    expect(plannerNeedsReset({ ...fresh(), searchOpen: true })).toBe(true);
    expect(plannerNeedsReset({ ...fresh(), drawing: true })).toBe(true);
    expect(plannerNeedsReset({ ...fresh(), pencil: 2 })).toBe(true);
    expect(plannerNeedsReset({ ...fresh(), strokes: 1 })).toBe(true);
    expect(plannerNeedsReset({ ...fresh(), snapped: 1 })).toBe(true);
    expect(plannerNeedsReset({ ...fresh(), fromDraw: true })).toBe(true);
    expect(plannerNeedsReset({ ...fresh(), plan: true })).toBe(true);
    expect(plannerNeedsReset({ ...fresh(), drawNote: true })).toBe(true);
    expect(plannerNeedsReset({ ...fresh(), title: 'Walk loop' })).toBe(true);
    expect(plannerNeedsReset({ ...fresh(), error: true })).toBe(true);
    expect(plannerNeedsReset({ ...fresh(), pin: true })).toBe(true);
  });

  it('clears the planner and keeps the footpath preference, without a new location', () => {
    const kept = resetPlanner({ preferPaths: true, here });
    expect(kept.preferPaths).toBe(true);
    expect(kept.mode).toBe('walk');
    expect(kept.modeTouched).toBe(false);
    expect(kept.shape).toBe('loop');
    expect(kept.shapeTouched).toBe(false);
    expect(kept.distanceId).toBe('5');
    expect(kept.timeId).toBe('none');
    expect(kept.customDistance).toBe('');
    expect(kept.customMinutes).toBe('');
    expect(kept.start).toBeNull();
    expect(kept.startName).toBe('');
    expect(kept.end).toBeNull();
    expect(kept.endName).toBe('');
    expect(kept.query).toBe('');
    expect(kept.endQuery).toBe('');
    expect(kept.drawing).toBe(false);
    expect(kept.plan).toBeNull();
    expect(kept.title).toBe('My route');
    expect(kept.camera).toEqual(restingMapCamera(here));
    expect(kept.camera.zoom).toBe(15);
    expect(kept.camera.latitude).toBe(here.latitude);
    expect(kept.camera.longitude).toBe(here.longitude);

    const plain = resetPlanner({ preferPaths: false, here: null });
    expect(plain.preferPaths).toBe(false);
    expect(plain.camera).toEqual(restingMapCamera(null));
    expect(plain.camera.zoom).toBe(12);
    const start = mapStart();
    expect(plain.camera.latitude).toBe(start.latitude);
    expect(plain.camera.longitude).toBe(start.longitude);
    expect(plannerNeedsReset(fresh())).toBe(false);
  });

  it('puts a quiet Reset map under Make the route and does not ask the network', () => {
    expect(RESET_MAP).toBe('Reset map');
    const maker = readFileSync('src/ui/RouteMaker.tsx', 'utf8');
    const makeAt = maker.indexOf("label={craving ? 'Make this walk' : 'Make the route'}");
    const resetAt = maker.indexOf('label={RESET_MAP}');
    expect(makeAt).toBeGreaterThan(-1);
    expect(resetAt).toBeGreaterThan(makeAt);
    const block = maker.slice(makeAt, maker.indexOf('</Card>', makeAt));
    expect(block).toContain('tone="quiet"');
    expect(block).toContain('disabled={!needsReset}');
    expect(block).toContain('onPress={resetMap}');
    expect(block).not.toContain('setPreferPaths');

    const reset = maker.slice(maker.indexOf('function resetMap'), maker.lastIndexOf('return ('));
    expect(reset).toContain('setDrawing(false)');
    expect(reset).toContain('setPlan(null)');
    expect(reset).toContain('setModeTouched(false)');
    expect(reset).toContain('setShapeTouched(false)');
    expect(reset).toContain('setDistanceId(PLANNER_DISTANCE)');
    expect(reset).toContain('setTimeId(PLANNER_TIME)');
    expect(reset).toContain("customSession.distance = ''");
    expect(reset).toContain("customSession.minutes = ''");
    expect(reset).toContain('setQuery(\'\')');
    expect(reset).toContain('setEndQuery(\'\')');
    expect(reset).toContain('setHomeTick');
    expect(reset).toContain('epoch.current += 1');
    expect(reset).toContain('drawGen.current += 1');
    expect(reset).toContain('planRef.current = null');
    expect(reset).toContain("placeSearchRef.current.type('')");
    expect(reset).toContain("endPlaceSearchRef.current.type('')");
    expect(reset).not.toContain('setPreferPaths');
    expect(reset).not.toContain('planOutdoorRoute');
    expect(reset).not.toContain('noteRouteRequest');
    expect(reset).not.toContain('readWhileUsingFix');
    expect(reset).not.toContain('searchRoutePlaces');
    expect(maker).toContain('homeTick={homeTick}');
  });
});
