import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  DRAWN_ROUTE_CHANGED,
  DRAWN_ROUTE_READY,
  REPLACE_DRAWN_ROUTE,
  ROUTE_READY_FULL_SCREEN,
  ROUTE_READY_SAVE,
  drawnRouteShowing,
  savePrompt,
} from '@/domain/drawnRouteReady';

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
    // The #140 line is now the shared "Route ready" prompt, so there is one wording.
    expect(DRAWN_ROUTE_READY).toBe(ROUTE_READY_SAVE);
    expect(REPLACE_DRAWN_ROUTE).toBe('Replace it with a route from the settings');
    const maker = readFileSync('src/ui/RouteMaker.tsx', 'utf8');
    const ready = maker.indexOf('{drawnReady ? (');
    const replace = maker.indexOf('label={REPLACE_DRAWN_ROUTE}');
    const make = maker.indexOf("label={craving ? 'Make this walk' : 'Make the route'}");
    expect(ready).toBeGreaterThan(-1);
    expect(replace).toBeGreaterThan(ready);
    expect(make).toBeGreaterThan(replace);
    expect(maker.slice(replace - 80, make)).toContain('tone="quiet"');
    expect(maker).toContain('drawnRouteShowing({ craving, fromDraw, hasPlan: plan != null, snapFailed: snapMiss != null })');
  });

  it('after the rubber, says to recalculate instead of save, and still never replaces silently', () => {
    expect(savePrompt({ hasPlan: true, saved: false, stale: true, snapFailed: false })).toBe('changed');
    expect(DRAWN_ROUTE_CHANGED).toContain('Recalculate route');
    // The #140 rule does not depend on a wipe: a drawn plan keeps the replace wording.
    expect(drawnRouteShowing({ craving: false, fromDraw: true, hasPlan: true, snapFailed: false })).toBe(true);
  });

  it('closing full screen keeps the snapped route', () => {
    const maker = readFileSync('src/ui/RouteMaker.tsx', 'utf8');
    const exit = maker.slice(maker.indexOf('function exitDraw'), maker.indexOf('async function confirmDraw'));
    expect(exit).toContain("nextDrawMode(on, 'collapse')");
    expect(exit).not.toContain('setPlan');
    expect(exit).not.toContain('clearDraw');
  });
});

describe('Route ready: name and save it', () => {
  const made = { hasPlan: true, saved: false, stale: false, snapFailed: false };

  it('asks for a save once any route is made: drawn, recalculated or from the settings', () => {
    expect(ROUTE_READY_SAVE).toBe('Route ready. Scroll down to name and save it.');
    expect(ROUTE_READY_FULL_SCREEN).toBe('Route ready. Close the map, then scroll down to name and save it.');
    expect(savePrompt(made)).toBe('save');
  });

  it('goes once the route is saved', () => {
    expect(savePrompt({ ...made, saved: true })).toBeNull();
  });

  it('shows nothing without a route or after a failed snap, and asks for Recalculate after the rubber', () => {
    expect(savePrompt({ ...made, hasPlan: false })).toBeNull();
    expect(savePrompt({ ...made, snapFailed: true })).toBeNull();
    expect(savePrompt({ ...made, stale: true })).toBe('changed');
    expect(savePrompt({ ...made, stale: true, saved: true })).toBe('changed');
  });

  it('is one prompt just under the map, and on the full-screen map, that scrolls to the save card', () => {
    const maker = readFileSync('src/ui/RouteMaker.tsx', 'utf8');
    const map = maker.indexOf('bar={drawBar}');
    const prompt = maker.indexOf("{prompt === 'save' ? (", map);
    const figures = maker.indexOf('{snapPanel}', map);
    expect(prompt).toBeGreaterThan(map);
    expect(prompt).toBeLessThan(figures);
    expect(maker).toContain('accessibilityLabel={ROUTE_READY_SAVE}');
    expect(maker).toContain('onPress={scrollToSave}');
    expect(maker).toContain('<View ref={saveTarget} collapsable={false}');
    expect(maker.slice(maker.indexOf('const drawBar'), maker.indexOf('const howChoice'))).toContain('{ROUTE_READY_FULL_SCREEN}');
    // One wording: the old drawn-only line is gone.
    expect(maker).not.toContain('drawnRouteLine');
    expect(maker.split('>{ROUTE_READY_SAVE}<').length - 1).toBe(1);
    // A new snap needs saving again; making a route already clears `saved`.
    expect(maker.slice(maker.indexOf("tipEvent({ kind: 'snapped' })"), maker.indexOf('const snapNote'))).toContain('setSaved(false)');
    const make = maker.slice(maker.indexOf('async function make'), maker.indexOf('async function save'));
    expect(make).toContain('setSaved(false)');
  });
});
