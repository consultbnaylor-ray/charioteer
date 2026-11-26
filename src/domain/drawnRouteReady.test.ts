import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { DRAWN_ROUTE_READY, REPLACE_DRAWN_ROUTE, drawnRouteShowing } from '@/domain/drawnRouteReady';

const base = { craving: false, fromDraw: true, hasPlan: true, snapFailed: false };

describe('Make the route after a drawn route has snapped', () => {
  it('treats a snapped drawing as the route', () => {
    expect(drawnRouteShowing(base)).toBe(true);
  });

  it('keeps the plain Make the route button when there is no drawn route', () => {
    expect(drawnRouteShowing({ ...base, fromDraw: false })).toBe(false);
    expect(drawnRouteShowing({ ...base, hasPlan: false })).toBe(false);
    expect(drawnRouteShowing({ ...base, snapFailed: true })).toBe(false);
    expect(drawnRouteShowing({ ...base, craving: true })).toBe(false);
  });

  it('says plainly that the settings button replaces the drawn route', () => {
    expect(DRAWN_ROUTE_READY).toBe('Your drawn route is ready. Name and save it below.');
    expect(REPLACE_DRAWN_ROUTE).toBe('Replace it with a route from the settings');
    const maker = readFileSync('src/ui/RouteMaker.tsx', 'utf8');
    const ready = maker.indexOf('{drawnReady ? (');
    const replace = maker.indexOf('label={REPLACE_DRAWN_ROUTE}');
    const make = maker.indexOf("label={craving ? 'Make this walk' : 'Make the route'}");
    expect(ready).toBeGreaterThan(-1);
    expect(replace).toBeGreaterThan(ready);
    expect(make).toBeGreaterThan(replace);
    expect(maker.slice(ready, replace)).toContain('{DRAWN_ROUTE_READY}');
    expect(maker.slice(replace - 80, make)).toContain('tone="quiet"');
    expect(maker).toContain('drawnRouteShowing({ craving, fromDraw, hasPlan: plan != null, snapFailed: snapMiss != null })');
  });

  it('closing full screen keeps the snapped route', () => {
    const maker = readFileSync('src/ui/RouteMaker.tsx', 'utf8');
    const exit = maker.slice(maker.indexOf('function exitDraw'), maker.indexOf('async function confirmDraw'));
    expect(exit).toContain("nextDrawMode(on, 'collapse')");
    expect(exit).not.toContain('setPlan');
    expect(exit).not.toContain('clearDraw');
  });
});
