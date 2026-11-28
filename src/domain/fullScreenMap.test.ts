import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  FULL_SCREEN_PANEL_GAP,
  fullScreenControlLift,
  fullScreenMapHeight,
  fullScreenPanelMaxHeight,
} from '@/domain/fullScreenMap';
import { placeSearchEmptyShown } from '@/domain/findRoute';

describe('full screen map layout', () => {
  it('fills the whole screen between the safe-area insets', () => {
    // iPhone 15 Pro: 852pt tall, 59pt top inset, 34pt home indicator.
    expect(fullScreenMapHeight(852, 59, 34)).toBe(759);
    expect(fullScreenMapHeight(200, 59, 34)).toBe(240);
  });

  it('caps the floating route panel so most of the map stays visible', () => {
    expect(fullScreenPanelMaxHeight(759)).toBeLessThan(759 / 2);
    expect(fullScreenPanelMaxHeight(759)).toBeGreaterThanOrEqual(120);
    expect(fullScreenPanelMaxHeight(240)).toBe(120);
  });

  it('lifts the bottom controls above the panel only once it is measured', () => {
    expect(fullScreenControlLift(false, 120)).toBe(0);
    expect(fullScreenControlLift(true, 0)).toBe(0);
    expect(fullScreenControlLift(true, 96.4)).toBe(96 + FULL_SCREEN_PANEL_GAP);
  });

  it('no longer shortens the full screen map to make room for a band underneath', () => {
    const chrome = readFileSync('src/ui/MapChrome.tsx', 'utf8');
    expect(chrome).not.toContain('fullHeight - 260');
    expect(chrome).not.toContain('fullMapHeight');
    expect(chrome).toContain('fullScreenMapHeight(window.height, insets.top, insets.bottom)');
    expect(chrome).toContain('shell(true, fullHeight, showNativeMap, showNativeMap ? bar : null)');
    // The figures float on the map with a solid background, and the light/dark
    // button, credit and tick move up above them.
    expect(chrome).toContain('panel={panel}');
    expect(chrome).toContain('backgroundColor: theme.colors.surface');
    expect(chrome).toContain('bottom={8 + lift}');
    expect(chrome).toContain('<MapCredit scheme={scheme} lift={lift} />');
    expect(chrome).toContain('bottom: 72 + lift');
  });

  it('keeps the draw capture filling exactly the map view', () => {
    const capture = readFileSync('src/ui/DrawCapture.tsx', 'utf8');
    expect(capture).toContain("style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 2 }}");
    const native = readFileSync('src/ui/FootpathMap.tsx', 'utf8');
    expect(native).toContain('renderMap={({ height: viewHeight, expanded }) => (');
    expect(native).toContain('height={viewHeight}');
  });
});

describe('route maker layout and place search', () => {
  it('puts start, destination and the paths switch between the drawing hint and the map', () => {
    const maker = readFileSync('src/ui/RouteMaker.tsx', 'utf8');
    const hint = maker.indexOf('{DRAW_PEN_HINT}');
    const startLabel = maker.indexOf('<T variant="label">Start</T>');
    const destination = maker.indexOf('<T variant="label">Destination</T>');
    const paths = maker.indexOf('<T style={{ flex: 1 }}>{PREFER_PATHS_LABEL}</T>');
    const map = maker.indexOf('<FootpathMap', hint);
    const make = maker.indexOf("label={craving ? 'Make this walk' : 'Make the route'}");
    expect(hint).toBeGreaterThan(0);
    expect(startLabel).toBeGreaterThan(hint);
    expect(destination).toBeGreaterThan(startLabel);
    expect(paths).toBeGreaterThan(destination);
    expect(map).toBeGreaterThan(paths);
    expect(make).toBeGreaterThan(map);
  });

  it('clears the empty-search state when a place is picked', () => {
    const maker = readFileSync('src/ui/RouteMaker.tsx', 'utf8');
    const start = maker.slice(maker.indexOf('function choosePlace'), maker.indexOf('function onSearchText'));
    const end = maker.slice(maker.indexOf('function chooseEndPlace'), maker.indexOf('function onEndSearchText'));
    expect(start).toContain('setSearched(false)');
    expect(end).toContain('setEndSearched(false)');
    expect(maker).not.toContain('searched && results.length === 0 ?');
    expect(maker).not.toContain('endSearched && endResults.length === 0 ?');
  });
});

describe('placeSearchEmptyShown', () => {
  it('only says no place matched when a search really came back empty', () => {
    expect(placeSearchEmptyShown(true, 0, 'zzqx', null)).toBe(true);
    expect(placeSearchEmptyShown(false, 0, 'zzqx', null)).toBe(false);
    expect(placeSearchEmptyShown(true, 1, 'Bleaklow', null)).toBe(false);
    const picked = 'Bleaklow Head, Charlesworth, England, United Kingdom';
    expect(placeSearchEmptyShown(true, 0, picked, picked)).toBe(false);
    expect(placeSearchEmptyShown(true, 0, 'Kinder', picked)).toBe(true);
  });
});
