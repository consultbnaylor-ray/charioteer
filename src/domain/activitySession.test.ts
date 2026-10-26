import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { LOCATION_WHEN_IN_USE } from '@/domain/outdoorRoute';
import { followCamera } from '@/ui/mapCamera';
import {
  ACTIVITY_LOCATION_LINE,
  FINISH_LINE,
  LOCK_PAUSE_NOTE,
  MAX_ACCURACY_M,
  MIN_PACE_DISTANCE_M,
  SPEED_CAP_MPS,
  activityLine,
  applyFix,
  averagePaceSecPerKm,
  extendTrack,
  paceLabel,
  parseActivitySummary,
  summaryFrom,
  timePhrase,
  updatesDue,
  type ActivityFix,
} from '@/domain/activitySession';

const HERE: ActivityFix = { latitude: 51.45, longitude: -2.5945, accuracyM: 8, atMs: 1_000 };
const NORTH: ActivityFix = { latitude: 51.4509, longitude: -2.5945, accuracyM: 8, atMs: 61_000 };

describe('activity session', () => {
  it('fills a local line with the time and the pace, and leaves the pace out when it is not ready', () => {
    const paced = activityLine('walk', 18 * 60_000, '13:10 /km', 1);
    expect(paced).toContain('18 minutes');
    expect(paced).toContain('13:10 /km');
    expect(paced).not.toMatch(/\{|latitude|longitude/);
    const early = activityLine('run', 20_000, null, 0);
    expect(early).toContain(timePhrase(20_000));
    expect(early).not.toContain('per kilometre');
    expect(early).not.toMatch(/\{/);
    const again = activityLine('cycle', 10 * 60_000, '4:00 /km', 1);
    expect(again).toContain('10 minutes');
    expect(again).toContain('4:00 /km');
    expect(again).not.toBe(activityLine('cycle', 10 * 60_000, null, 0));
    expect(FINISH_LINE).toBe('You went out. That counts.');
    const source = readFileSync('src/domain/activitySession.ts', 'utf8');
    expect(source).not.toMatch(/fetch\(|supabase|functions\.invoke|xai|openai/i);
  });

  it('speaks on the interval and stays quiet when updates are off', () => {
    expect(updatesDue(3 * 60_000 - 1, 3, 0)).toBe(0);
    expect(updatesDue(3 * 60_000, 3, 0)).toBe(1);
    expect(updatesDue(6 * 60_000, 3, 1)).toBe(1);
    expect(updatesDue(9 * 60_000, 3, 3)).toBe(0);
    expect(updatesDue(5 * 60_000, 5, 0)).toBe(1);
    expect(updatesDue(10 * 60_000, 10, 0)).toBe(1);
    expect(updatesDue(60 * 60_000, 0, 0)).toBe(0);
    expect(updatesDue(0, 3, 0)).toBe(0);
  });

  it('drops a poor fix and an impossible jump, and hides the pace until 50 metres', () => {
    const first = applyFix('walk', null, HERE);
    expect(first.addedM).toBe(0);
    expect(first.previous).toEqual(HERE);
    const step = applyFix('walk', HERE, NORTH);
    expect(step.addedM).toBeGreaterThan(90);
    expect(step.addedM).toBeLessThan(120);
    expect(step.previous).toEqual(NORTH);
    const poor = applyFix('walk', HERE, { ...NORTH, accuracyM: MAX_ACCURACY_M + 10 });
    expect(poor).toEqual({ previous: HERE, addedM: 0 });
    const unknown = applyFix('walk', HERE, { ...NORTH, accuracyM: null });
    expect(unknown.addedM).toBe(0);
    expect(unknown.previous).toEqual(HERE);
    const spike = applyFix('walk', HERE, { ...NORTH, atMs: HERE.atMs + 1000 });
    expect(spike.addedM).toBe(0);
    expect(spike.previous).toEqual(HERE);
    const ride = applyFix('cycle', HERE, { ...NORTH, atMs: HERE.atMs + 8000 });
    expect(ride.addedM).toBeGreaterThan(90);
    expect(SPEED_CAP_MPS.walk).toBeCloseTo(15 / 3.6);
    expect(averagePaceSecPerKm(MIN_PACE_DISTANCE_M - 1, 60_000)).toBeNull();
    expect(paceLabel(averagePaceSecPerKm(1000, 13 * 60_000 + 10_000))).toBe('13:10 /km');
    const summary = summaryFrom({
      id: 'a',
      activity: 'walk',
      date: '2026-10-26',
      distanceM: 1420,
      movingMs: 18 * 60_000 + 42_000,
    });
    const parsed = parseActivitySummary({ ...summary, latitude: 51.45, longitude: -2.59, points: [HERE] });
    expect(parsed).toEqual(summary);
    expect(JSON.stringify(parsed)).not.toMatch(/latitude|longitude|points/);
    const started = extendTrack([], null, applyFix('walk', null, HERE));
    expect(started).toEqual([{ latitude: HERE.latitude, longitude: HERE.longitude }]);
    const walked = extendTrack(started, HERE, applyFix('walk', HERE, { ...NORTH, atMs: HERE.atMs + 60_000 }));
    expect(walked).toHaveLength(2);
    const spiked = applyFix('walk', NORTH, { ...NORTH, latitude: NORTH.latitude + 0.02, atMs: NORTH.atMs + 1000 });
    expect(extendTrack(walked, NORTH, spiked)).toEqual(walked);
    const muddy = applyFix('walk', HERE, { ...NORTH, accuracyM: 80, atMs: HERE.atMs + 4000 });
    expect(extendTrack(started, HERE, muddy)).toEqual(started);
    expect(JSON.stringify(summary)).not.toMatch(/latitude|longitude|points|track/);
  });

  it('keeps the outing on the phone, speaks with the phone voice, and pauses when the phone locks', () => {
    const screen = readFileSync('src/app/(main)/activity.tsx', 'utf8');
    const fix = readFileSync('src/location/activityFix.ts', 'utf8');
    const outside = readFileSync('src/app/(main)/outside.tsx', 'utf8');
    expect(screen).toContain('LOCK_PAUSE_NOTE');
    expect(screen).toContain("next !== 'background'");
    expect(screen).toContain('expo-speech');
    expect(screen).toContain('expo-keep-awake');
    expect(screen).toContain('updatesDue');
    expect(screen).toContain('applyFix');
    expect(screen).toContain('extendTrack');
    expect(screen).toContain('<FootpathMap');
    expect(screen).toContain('onRecentre={() => setFollowing(true)}');
    expect(screen).toContain('onUserMove={() => setFollowing(false)}');
    expect(screen).toContain('follow={following}');
    expect(screen).toContain('footer=');
    const savedCall = screen.slice(screen.indexOf('summaryFrom('), screen.indexOf('summaryFrom(') + 320);
    expect(savedCall).not.toMatch(/track|latitude|points/);
    expect(screen).toContain('GRATITUDE_DIARY_TICK');
    for (const path of ['src/ui/FootpathMap.tsx', 'src/ui/FootpathMap.web.tsx']) {
      const map = readFileSync(path, 'utf8');
      expect(map).toContain('trackLineCollection');
      expect(map).toContain('trackLineColour');
      expect(map).toContain('openFreeMapStyle(scheme)');
      expect(map).not.toContain('trackUserLocation');
    }
    expect(readFileSync('src/ui/MapChrome.tsx', 'utf8')).toContain("export const RECENTRE_MAP = 'Re-centre'");
    expect(readFileSync('src/activity/summaries.ts', 'utf8')).not.toContain('track');
    expect(screen).not.toContain('Apple Health');
    expect(screen).not.toMatch(/watchPosition|requestBackground|startLocationUpdates|planOutdoorRoute|UIBackgroundModes/);
    expect(fix).toContain('Location.Accuracy.Balanced');
    expect(fix).toContain('requestForegroundPermissionsAsync');
    expect(fix).not.toMatch(/watchPosition|requestBackground|startLocationUpdates|NSLocationAlways/);
    expect(outside.indexOf('label="Find a route"')).toBeLessThan(outside.indexOf('label="Start a walk"'));
    expect(outside.indexOf('label="Start a walk"')).toBeLessThan(outside.indexOf('label="Start a run"'));
    expect(outside.indexOf('label="Start a run"')).toBeLessThan(outside.indexOf('label="Start a cycle"'));
    expect(outside.indexOf('label="Start a cycle"')).toBeLessThan(outside.indexOf('label="Open the map"'));
    expect(outside).toContain('SUMMARIES_HINT');
    expect(LOCK_PAUSE_NOTE).toBe('Locking the phone paused the time and the distance.');
    const held = { longitude: -2.5, latitude: 51.4, zoom: 14 };
    const framed = { longitude: -2.6, latitude: 51.5, zoom: 15 };
    expect(followCamera(held, framed, false)).toBeNull();
    expect(followCamera(held, framed, true)).toEqual({ longitude: -2.6, latitude: 51.5, zoom: 14 });
    expect(followCamera(held, framed, undefined)).toEqual(framed);
    expect(ACTIVITY_LOCATION_LINE).toContain('only while this screen is open');
    expect(LOCATION_WHEN_IN_USE).toContain('A route is sent to the route service only if you turn route finding on.');
    expect(LOCATION_WHEN_IN_USE).toContain('Locking the phone pauses it.');
    expect(LOCATION_WHEN_IN_USE).not.toContain('NSLocationAlways');
  });
});
