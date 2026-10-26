import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { claimLive, releaseLive, resetLiveClaim } from '@/activity/oneSession';
import { APP_STORE_SPEECH_DUCK_GATE_PASSED, TESTFLIGHT_SPEECH_ON } from '@/activity/speakLine';
import { backgroundModesForBuild, speechOnForProfile } from '@/config/speechProfile';
import { parseActivityUpdates } from '@/activity/updateDefaults';
import { LOCATION_WHEN_IN_USE } from '@/domain/outdoorRoute';
import { followCamera } from '@/ui/mapCamera';
import {
  ACTIVITY_LOCATION_LINE,
  AUDIO_DUCK_LINE,
  FINISH_LINE,
  HEART_HIGH_LINE,
  HR_HIGH_BPM,
  HR_STALE_MS,
  LIVE_INTRO,
  MAX_ACCURACY_M,
  MIN_PACE_DISTANCE_M,
  NO_HEART_SOURCE,
  OUTING_IN_PROGRESS_LINE,
  OUTING_TIME_LIMIT_MS,
  SPEED_CAP_MPS,
  TIME_LIMIT_LINE,
  activityLine,
  applyFix,
  averagePaceSecPerKm,
  beforeStartLine,
  currentSplitLabel,
  extendTrack,
  outingTimedOut,
  paceLabel,
  parseActivitySummary,
  shownEnergy,
  shownHeart,
  splitRow,
  splitsForDistance,
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

  it('keeps the outing on the phone, draws the line, and does not ask for Always', () => {
    const screen = readFileSync('src/app/(main)/activity.tsx', 'utf8');
    const fix = readFileSync('src/location/activityFix.ts', 'utf8');
    const speech = readFileSync('src/activity/speakLine.ts', 'utf8');
    const outside = readFileSync('src/app/(main)/outside.tsx', 'utf8');
    const profile = readFileSync('src/app/(main)/profile.tsx', 'utf8');
    const workouts = readFileSync('src/app/(main)/workouts.tsx', 'utf8');
    const gym = readFileSync('src/app/(main)/gym-session.tsx', 'utf8');
    expect(screen).not.toContain("next !== 'background'");
    expect(screen).not.toContain('expo-speech');
    expect(screen).toContain('speakIfGated');
    expect(screen).toContain('label="Stop"');
    expect(screen).toContain('expo-keep-awake');
    expect(screen).toContain('updatesDue');
    expect(screen).toContain('applyFix');
    expect(screen).toContain('extendTrack');
    expect(screen).toContain('ensureActivityWatch');
    expect(screen).toContain('<FootpathMap');
    expect(screen).toContain('onRecentre={() => setFollowing(true)}');
    expect(screen).toContain('onUserMove={() => setFollowing(false)}');
    expect(screen).toContain('follow={following}');
    expect(screen).toContain('footer=');
    const savedCall = screen.slice(screen.indexOf('summaryFrom('), screen.indexOf('summaryFrom(') + 320);
    expect(savedCall).not.toMatch(/track|latitude|points|splits|bpm/);
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
    expect(screen).not.toMatch(/startLocationUpdates|requestBackground|planOutdoorRoute|UIBackgroundModes|enableBackgroundDelivery/);
    expect(fix).toContain('watchPositionAsync');
    expect(fix).toContain('Location.Accuracy.High');
    expect(fix).toContain('Location.ActivityType.Fitness');
    expect(fix).toContain('requestForegroundPermissionsAsync');
    expect(fix).toContain('expireIfDue');
    expect(fix).toContain('subscribeForeground');
    expect(fix).not.toMatch(/getCurrentPositionAsync|requestBackground|startLocationUpdates|BestForNavigation|NSLocationAlways|TaskManager/);
    expect(TESTFLIGHT_SPEECH_ON).toBe(true);
    expect(APP_STORE_SPEECH_DUCK_GATE_PASSED).toBe(false);
    expect(speech).toContain('speechOnForProfile');
    expect(speech).toContain('EXPO_PUBLIC_BUILD_PROFILE');
    expect(speech).toContain('APP_STORE_SPEECH_DUCK_GATE_PASSED = false');
    expect(speechOnForProfile(undefined, false)).toBe(true);
    expect(speechOnForProfile('testflight', false)).toBe(true);
    expect(speechOnForProfile('store', false)).toBe(false);
    expect(speechOnForProfile('app-store', false)).toBe(false);
    expect(speechOnForProfile('production', false)).toBe(false);
    expect(speechOnForProfile('store', true)).toBe(true);
    expect(backgroundModesForBuild('testflight', ['location', 'audio'], false)).toEqual(['location', 'audio']);
    expect(backgroundModesForBuild('store', ['location', 'audio'], false)).toEqual(['location']);
    expect(backgroundModesForBuild('store', ['location', 'audio'], true)).toEqual(['location', 'audio']);
    expect(readFileSync('app.config.ts', 'utf8')).toContain('EXPO_PUBLIC_BUILD_PROFILE');
    expect(readFileSync('app.config.ts', 'utf8')).toContain('backgroundModesForBuild');
    expect(speech).toContain('useApplicationAudioSession: false');
    expect(speech).not.toContain('setAudioModeAsync');
    expect(speech).not.toMatch(/Sound\.create|silent:\s*true/);
    const speakBody = speech.slice(speech.indexOf('export function speakIfGated'));
    expect(speakBody.indexOf('if (!spoken || !TESTFLIGHT_SPEECH_ON) return')).toBeLessThan(speakBody.indexOf("import('expo-speech')"));
    const pauseCalls = screen.match(/pauseActivityWatch\(\)/g) ?? [];
    expect(pauseCalls).toHaveLength(1);
    const pauseFn = screen.slice(screen.indexOf('function pauseOrResume'), screen.indexOf('async function done'));
    expect(pauseFn).toContain('pauseActivityWatch()');
    expect(screen).toContain('ensureOutingClock');
    expect(screen).toContain('stopActivityWatch()');
    expect(readFileSync('src/ui/ActivityGoodToKnow.tsx', 'utf8')).toContain('BATTERY_NOTE');
    const gate = 'App Store submission is blocked until a real phone shows music ducks, then returns to full volume after each line, with no leftover audio session, including a phone call and Bluetooth headphones.';
    expect(readFileSync('docs/start-activity-decisions.md', 'utf8')).toContain(gate);
    expect(readFileSync('docs/app-store-activity-review.md', 'utf8')).toContain(gate);
    expect(outside.indexOf('label="Find a route"')).toBeLessThan(outside.indexOf('label="Start a walk"'));
    expect(outside.indexOf('label="Start a walk"')).toBeLessThan(outside.indexOf('label="Start a run"'));
    expect(outside.indexOf('label="Start a run"')).toBeLessThan(outside.indexOf('label="Start a cycle"'));
    expect(outside.indexOf('label="Start a cycle"')).toBeLessThan(outside.indexOf('label="Open the map"'));
    expect(outside).toContain('SUMMARIES_HINT');
    expect(outside).toContain('<OutingInProgressBanner />');
    expect(readFileSync('src/app/(main)/home.tsx', 'utf8')).toContain('<OutingInProgressBanner />');
    expect(OUTING_IN_PROGRESS_LINE).toBe('Outing in progress. Measuring is still on. Open it to see the map, or tap Stop to end it.');
    expect(readFileSync('src/ui/OutingInProgressBanner.tsx', 'utf8')).toContain('OUTING_IN_PROGRESS_LINE');
    expect(readFileSync('src/ui/OutingInProgressBanner.tsx', 'utf8')).toContain('label="Stop"');
    expect(profile.indexOf('<ActivityUpdatesCard />')).toBeGreaterThan(profile.indexOf('Appearance'));
    expect(profile.indexOf('<ActivityUpdatesCard />')).toBeLessThan(profile.indexOf('>Notifications<'));
    expect(readFileSync('src/ui/ActivityUpdatesCard.tsx', 'utf8')).toContain('Activity updates');
    expect(workouts).toContain('Start live session');
    expect(workouts).toContain('WorkoutList');
    expect(gym).toContain('NO_HEART_SOURCE');
    expect(gym).toContain('Active energy');
    expect(gym).not.toMatch(/latitude|longitude|watchPosition|requestBackground/);
    expect(LIVE_INTRO).toBe('You can lock the phone. Measuring continues until you tap Stop.');
    expect(beforeStartLine()).toContain('six hours');
    expect(ACTIVITY_LOCATION_LINE).toContain('six hours');
    expect(ACTIVITY_LOCATION_LINE).toContain('The outing path is not sent.');
    expect(AUDIO_DUCK_LINE).toBe('A spoken line lowers your music for a moment, then lets it return. The phone speaks. Nothing is recorded.');
    expect(LOCATION_WHEN_IN_USE).toContain('A route is sent to the route service only if you turn route finding on');
    expect(LOCATION_WHEN_IN_USE).not.toContain('NSLocationAlways');
    const held = { longitude: -2.5, latitude: 51.4, zoom: 14 };
    const framed = { longitude: -2.6, latitude: 51.5, zoom: 15 };
    expect(followCamera(held, framed, false)).toBeNull();
    expect(followCamera(held, framed, true)).toEqual({ longitude: -2.6, latitude: 51.5, zoom: 14 });
    expect(followCamera(held, framed, undefined)).toEqual(framed);
  });

  it('records kilometre splits, a stale heart rate, and the unconfirmed time limit', () => {
    expect(OUTING_TIME_LIMIT_MS).toBe(6 * 60 * 60 * 1000);
    expect(outingTimedOut(1_000, 1_000 + OUTING_TIME_LIMIT_MS - 1)).toBe(false);
    expect(outingTimedOut(1_000, 1_000 + OUTING_TIME_LIMIT_MS)).toBe(true);
    expect(TIME_LIMIT_LINE).toContain('time limit');
    const one = splitsForDistance(1000, 6 * 60_000 + 12_000, []);
    expect(one).toEqual([{ kilometre: 1, movingMs: 372_000 }]);
    const two = splitsForDistance(2500, 20 * 60_000, one);
    expect(two).toHaveLength(2);
    expect(two[1]).toEqual({ kilometre: 2, movingMs: 20 * 60_000 });
    expect(splitRow(one[0], 0)).toContain('1 km');
    expect(currentSplitLabel(1420)).toBe('This kilometre · 0.42 km');
    expect(JSON.stringify(two)).not.toMatch(/latitude|longitude/);
    expect(shownHeart(null, null, 10_000).label).toBe(NO_HEART_SOURCE);
    expect(shownHeart(142, 10_000, 10_000 + HR_STALE_MS + 1).label).toBe(NO_HEART_SOURCE);
    expect(shownHeart(142, 10_000, 30_000)).toEqual({ label: '142 bpm', warning: null, age: '20s ago' });
    expect(shownHeart(HR_HIGH_BPM, 10_000, 10_000).warning).toBe(HEART_HIGH_LINE);
    expect(shownEnergy(null)).toBe('Active energy not available yet');
    expect(shownEnergy(86)).toBe('86 kcal');
    expect(parseActivityUpdates(null)).toEqual({ enabled: false, intervalMin: 5, spoken: false });
    expect(parseActivityUpdates(JSON.stringify({ enabled: true, intervalMin: 3, spoken: true }))).toEqual({
      enabled: true,
      intervalMin: 3,
      spoken: true,
    });
    resetLiveClaim();
    expect(claimLive('outing')).toEqual({ ok: true });
    expect(claimLive('gym')).toEqual({ ok: false, busy: 'outing' });
    releaseLive('outing');
    expect(claimLive('gym')).toEqual({ ok: true });
    resetLiveClaim();
    expect(FINISH_LINE).toBe('You went out. That counts.');
  });
});
