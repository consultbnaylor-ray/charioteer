import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  copyMadeRoute,
  holdMadeRoute,
  resetMadeRouteGuide,
  takeMadeRoute,
} from '@/activity/madeRouteGuide';
import type { ActivityKind } from '@/domain/activitySession';
import { guideForStart } from '@/domain/savedRoute';
import { sampleCanalLoop, type OutdoorPoint } from '@/domain/outdoorRoute';
import { flyWhenReady, type HeldCamera } from '@/ui/mapCamera';

const loop: OutdoorPoint[] = [
  { latitude: 51.45, longitude: -2.59 },
  { latitude: 51.452, longitude: -2.588 },
  { latitude: 51.449, longitude: -2.586 },
  { latitude: 51.45, longitude: -2.59 },
];

const via: OutdoorPoint = { latitude: 51.46, longitude: -2.6 };

/** The same handoff the activity screen uses after Start a walk, run, or cycle. */
function guideAfterStart(input: {
  made: { title: string; kind: ActivityKind; points: OutdoorPoint[] } | null;
  saved: { title: string; points: OutdoorPoint[] } | null;
  useMade: boolean;
  token: string;
}) {
  resetMadeRouteGuide();
  if (input.made) holdMadeRoute(input.made);
  const taken = input.made ? copyMadeRoute(takeMadeRoute(input.token)) : null;
  return guideForStart(input.saved, taken, input.useMade && input.saved == null);
}

describe('start from a route', () => {
  it('starts from a just-made line, with or without climb and via points', () => {
    const noClimb = guideAfterStart({
      made: { title: 'My route', kind: 'walk', points: loop },
      saved: null,
      useMade: true,
      token: 'made-flat',
    });
    expect(noClimb?.title).toBe('My route');
    expect(noClimb?.points).toEqual(loop);
    expect(JSON.stringify(noClimb)).not.toMatch(/ascent|via/);

    const redrawn = [loop[0], via, loop[loop.length - 1]];
    const withClimb = guideAfterStart({
      made: { title: 'Hill loop', kind: 'run', points: redrawn },
      saved: null,
      useMade: true,
      token: 'made-hill',
    });
    expect(withClimb?.points).toEqual(redrawn);
    expect(withClimb?.title).toBe('Hill loop');

    const maker = readFileSync('src/ui/RouteMaker.tsx', 'utf8');
    const outing = maker.slice(maker.indexOf('function beginOuting'), maker.indexOf('const mapsUrl'));
    expect(outing).toContain("holdMadeRoute({ title: title.trim() || 'My route', kind, points: line.points })");
    expect(outing).toContain('`/activity?kind=${kind}&made=${Date.now()}`');
    expect(outing).not.toMatch(/ascent|via|geometry/);
  });

  it('starts from a saved row, including one with no climb', () => {
    const saved = { ...sampleCanalLoop(), ascentM: null as number | null };
    const guide = guideAfterStart({
      made: { title: 'My route', kind: 'cycle', points: loop },
      saved: { title: saved.title, points: saved.points },
      useMade: false,
      token: 'saved',
    });
    expect(guide?.title).toBe(saved.title);
    expect(guide?.points).toEqual(saved.points);
    expect(JSON.stringify(guide)).not.toMatch(/ascent/);

    const screen = readFileSync('src/app/(main)/saved-route.tsx', 'utf8');
    const start = screen.slice(screen.indexOf('function startKind'), screen.indexOf('async function saveName'));
    expect(start).toContain('`/activity?kind=${kind}&route=${route!.id}`');
    expect(start).not.toMatch(/points|latitude|longitude|geometry|ascent/);

    const activity = readFileSync('src/app/(main)/activity.tsx', 'utf8');
    const press = activity.slice(activity.indexOf('function start()'), activity.indexOf('function pauseOrResume'));
    expect(press).toContain('guideForStart(saved, madeGuide, useMade && routeId == null)');
    expect(press).toContain('copyGuide({ title: phone.name, points: phone.points })');
    expect(press).not.toMatch(/ascentM|via/);
  });

  it('does not let an early map move kill the outing screen', () => {
    const place: HeldCamera = { longitude: -2.59, latitude: 51.45, zoom: 15 };
    const notReady = {
      flyTo() {
        throw new Error('NativeCameraComponent ref is null, wait for the map being initialized');
      },
    };
    expect(flyWhenReady(notReady, place)).toBe(false);
    expect(flyWhenReady(null, place)).toBe(false);
    expect(flyWhenReady(notReady, { longitude: Number.NaN, latitude: 51.45, zoom: 15 })).toBe(false);

    let centre: [number, number] | null = null;
    expect(flyWhenReady({
      flyTo(options) {
        centre = options.center;
      },
    }, place)).toBe(true);
    expect(centre).toEqual([-2.59, 51.45]);

    const map = readFileSync('src/ui/FootpathMap.tsx', 'utf8');
    expect(map).toContain('flyWhenReady(camera.current, place)');
    expect(map).toContain('flyWhenReady(camera.current, held.current)');
    expect(map).not.toContain('camera.current?.flyTo');
  });
});
