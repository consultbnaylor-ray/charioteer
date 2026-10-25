import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  NOT_NOW_ROUTE_FINDING,
  ROUTE_CONSENT_CITATION,
  ROUTE_CONSENT_LINES,
  ROUTE_CONSENT_VERSION,
  ROUTE_RETENTION_LINE,
  ROUTE_RETENTION_NOTE,
  ROUTE_SEND_LINE,
  TURN_ON_ROUTE_FINDING,
  parseRouteConsent,
  routeFindingAllowed,
} from '@/domain/routeConsent';
import {
  appleMapsUrl,
  mockRoute,
  parseRoutePlan,
  routeKind,
  targetLengthM,
} from '@/domain/findRoute';
import {
  liveKind,
  liveOutdoorRouteInsert,
  outdoorRouteInsert,
  routeShapeRejected,
  routeTableMissing,
  simplifyLine,
} from '@/domain/outdoorRoute';
import {
  GLOBAL_ROUTE_DAILY_CAP,
  ORS_FREE_DIRECTIONS_PER_DAY,
  buildDirectionsBody,
  orsRequestHeaders,
  parseDirections,
  parseGeocode,
  routeLengthM,
  withinGlobalRouteLimit,
  withinRouteLimit,
} from '../../supabase/functions/_shared/orsRoute';

const start = { latitude: 51.4504, longitude: -2.5945 };

describe('route finding', () => {
  it('stays off until this wording is accepted', () => {
    expect(routeFindingAllowed(null)).toBe(false);
    expect(routeFindingAllowed(parseRouteConsent('not json'))).toBe(false);
    const older = parseRouteConsent({ granted: true, at: '2026-10-01T00:00:00.000Z', version: '2026-10-01' });
    expect(older?.granted).toBe(true);
    expect(routeFindingAllowed(older)).toBe(false);
    const on = parseRouteConsent({ granted: true, at: '2026-10-25T12:00:00.000Z', version: ROUTE_CONSENT_VERSION });
    expect(routeFindingAllowed(on)).toBe(true);
    const off = parseRouteConsent({ granted: false, at: '2026-10-25T12:00:00.000Z', version: ROUTE_CONSENT_VERSION });
    expect(routeFindingAllowed(off)).toBe(false);
    const card = readFileSync('src/ui/RouteConsentCard.tsx', 'utf8');
    expect(TURN_ON_ROUTE_FINDING).toBe('Turn on route finding');
    expect(NOT_NOW_ROUTE_FINDING).toBe('Not now');
    expect(card).toContain('TURN_ON_ROUTE_FINDING');
    expect(card).toContain('NOT_NOW_ROUTE_FINDING');
    expect(card).toContain('grantRouteFinding');
    expect(card).not.toContain('withdrawRouteFinding');
    expect(card).toContain('OSM_LICENCE_LINE');
    expect(card).not.toMatch(/agree to OpenStreetMap|OpenStreetMap's terms/i);
    const profile = readFileSync('src/ui/RouteFindingSwitch.tsx', 'utf8');
    expect(profile).toContain('grantRouteFinding');
    expect(profile).toContain('withdrawRouteFinding');
    expect(profile).toContain('ROUTE_CONSENT_LINES');
    expect(readFileSync('src/app/(main)/profile.tsx', 'utf8')).toContain('<RouteFindingSwitch');
    expect(readFileSync('src/data/routeConsentStore.ts', 'utf8')).toContain('AsyncStorage');
    expect(readFileSync('src/data/routeConsentStore.ts', 'utf8')).toContain('assertRouteFindingAllowed');
    const sql = readFileSync('supabase/migrations/20261025210000_outdoor_route_detail.sql', 'utf8');
    expect(sql).toContain('Not applied');
    expect(sql).not.toMatch(/latitude|longitude|consent/i);
    expect(sql).toContain("'loop', 'point_to_point'");
    expect(sql).toContain('ascent_m');
    expect(sql).toContain('outdoor_route_requests');
    expect(sql).toContain('revoke all on table public.outdoor_route_requests');
  });

  it('asks the route function only after the check, and keeps the host out of the phone', () => {
    const repo = readFileSync('src/data/supabase-repository.ts', 'utf8');
    const plan = repo.slice(repo.indexOf('async planOutdoorRoute'), repo.indexOf('async searchRoutePlaces'));
    const search = repo.slice(repo.indexOf('async searchRoutePlaces'), repo.indexOf('async deleteOutdoorRoute'));
    expect(plan.indexOf('assertRouteFindingAllowed')).toBeGreaterThan(-1);
    expect(plan.indexOf('assertRouteFindingAllowed')).toBeLessThan(plan.indexOf("functions.invoke('outdoor-route'"));
    expect(search.indexOf('assertRouteFindingAllowed')).toBeLessThan(search.indexOf("functions.invoke('outdoor-route'"));
    expect(repo).not.toContain('callEdge(\'outdoor-route\'');
    const demo = readFileSync('src/data/demo-repository.ts', 'utf8');
    const demoPlan = demo.slice(demo.indexOf('async planOutdoorRoute'), demo.indexOf('async searchRoutePlaces'));
    expect(demoPlan.indexOf('assertRouteFindingAllowed')).toBeLessThan(demoPlan.indexOf('mockRoute'));
    const fn = readFileSync('supabase/functions/outdoor-route/index.ts', 'utf8');
    expect(fn).toContain('ORS_API_KEY');
    expect(fn).toContain('getUser()');
    expect(fn).toContain("console.error('outdoor-route request failed')");
    expect(fn).not.toMatch(/console\.(log|error|info)\([^)]*body/);
  });

  it('builds a loop from a distance or a time and labels a sample line', () => {
    expect(targetLengthM({ mode: 'walk', distanceM: 5000, minutes: 15 })).toBe(5000);
    expect(targetLengthM({ mode: 'walk', minutes: 15 })).toBe(1200);
    expect(routeLengthM({ mode: 'walk', distanceM: null, minutes: 15 })).toBe(1200);
    expect(routeKind('loop', true)).toBe('craving_walk');
    expect(routeKind('a_to_b', false)).toBe('point_to_point');
    const sample = mockRoute({ mode: 'walk', shape: 'loop', start, distanceM: 5000 });
    expect(sample?.mocked).toBe(true);
    expect(sample?.points[0]).toEqual(sample?.points[sample.points.length - 1]);
    expect(sample?.ascentM).toBeNull();
    expect(sample && parseRoutePlan({ ok: true, ...sample })?.distanceM).toBe(5000);
    const walkUrl = appleMapsUrl(sample?.points ?? [], 'walk');
    const cycleUrl = appleMapsUrl(sample?.points ?? [], 'cycle');
    expect(walkUrl).toContain('maps.apple.com');
    expect(walkUrl).toContain('dirflg=w');
    expect(cycleUrl).not.toContain('dirflg=');
    const body = buildDirectionsBody({ mode: 'walk', shape: 'loop', start, lengthM: 5000 });
    expect(body?.options).toEqual({ round_trip: { length: 5000, points: 5 } });
    expect(Array.isArray(body?.coordinates) && (body?.coordinates as unknown[]).length).toBe(1);
  });

  it('reads a route line and shortens it for the live table', () => {
    const parsed = parseDirections({
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: { summary: { distance: 4820.2, duration: 3600, ascent: 42.4 } },
        geometry: {
          coordinates: [
            [-2.59, 51.45, 10],
            [-2.58, 51.451, 12],
            [-2.57, 51.452, 20],
          ],
        },
      }],
    }, 'walk', 'loop');
    expect(parsed).toMatchObject({ distanceM: 4820, durationMinutes: 60, ascentM: 42, profile: 'foot-walking' });
    expect(parsed?.points).toHaveLength(3);
    expect(parseGeocode({
      features: [{ geometry: { coordinates: [-2.59, 51.45] }, properties: { label: 'Queen Square', gid: 'qs' } }],
    })[0]).toMatchObject({ name: 'Queen Square', id: 'qs' });
    const many = Array.from({ length: 100 }, (_, index) => ({ latitude: 51.45 + index / 10000, longitude: -2.59 }));
    const short = simplifyLine(many);
    expect(short).toHaveLength(64);
    expect(short[0]).toEqual(many[0]);
    expect(short[short.length - 1]).toEqual(many[many.length - 1]);
    expect(liveKind('loop')).toBe('drawn');
    expect(liveKind('craving_walk')).toBe('craving_walk');
    const full = outdoorRouteInsert('user-1', 'route-1', {
      title: 'Park loop',
      kind: 'loop',
      points: many,
      durationMinutes: 40,
      distanceM: 8000,
      ascentM: 42,
    });
    expect(full?.kind).toBe('loop');
    expect(full?.distance_m).toBe(8000);
    expect(full?.ascent_m).toBe(42);
    expect((full?.geometry as unknown[]).length).toBe(100);
    const live = liveOutdoorRouteInsert('user-1', 'route-1', {
      title: 'Park loop',
      kind: 'loop',
      points: many,
      durationMinutes: 40,
      distanceM: 8000,
      ascentM: 42,
    });
    expect(live?.kind).toBe('drawn');
    expect(live?.distance_m).toBe(8000);
    expect(live).not.toHaveProperty('ascent_m');
    expect((live?.geometry as unknown[]).length).toBe(64);
    expect(routeShapeRejected('new row violates check constraint "outdoor_routes_kind_check"')).toBe(true);
    expect(routeShapeRejected('Could not find the ascent_m column of outdoor_routes in the schema cache')).toBe(true);
    expect(routeTableMissing('relation "public.outdoor_routes" does not exist')).toBe(true);
    expect(routeShapeRejected('relation "public.outdoor_routes" does not exist')).toBe(false);
    const now = 1_000_000_000_000;
    const stamps = Array.from({ length: 12 }, (_, index) => now - index * 1000);
    expect(withinRouteLimit(stamps, now).ok).toBe(false);
    expect(withinRouteLimit([now - 86_400_000 - 1], now).ok).toBe(true);
  });

  it('states the published retention and stays under the free daily quota', () => {
    expect(ROUTE_CONSENT_VERSION).toBe('2026-10-25-2');
    expect(ROUTE_RETENTION_LINE).toContain('7 days');
    expect(ROUTE_RETENTION_LINE).toContain('about 1 km');
    expect(ROUTE_RETENTION_LINE).toContain('voluntary');
    expect(ROUTE_SEND_LINE).toContain("server's address");
    expect(ROUTE_SEND_LINE).toContain('words you type');
    expect(ROUTE_CONSENT_LINES.join(' ')).toContain(ROUTE_RETENTION_LINE);
    expect(ROUTE_CONSENT_CITATION).toContain('https://account.heigit.org/info/transparency-statement');
    expect(ROUTE_RETENTION_NOTE).toContain('https://heigit.org/privacy-policy/');
    expect(ROUTE_RETENTION_NOTE).toContain('https://account.heigit.org/info/tos');
    expect(ROUTE_RETENTION_NOTE).toContain('do not restate the 7 days');
    const joined = [
      ROUTE_RETENTION_LINE,
      readFileSync('docs/privacy.md', 'utf8'),
      readFileSync('docs/privacy.html', 'utf8'),
      readFileSync('docs/dpia-location.md', 'utf8'),
      readFileSync('docs/store-privacy-labels.md', 'utf8'),
    ].join('\n');
    expect(joined).not.toContain('does not publish a fixed number of days');
    expect(joined).toContain('https://account.heigit.org/info/transparency-statement');
    expect(readFileSync('docs/dpia-location.md', 'utf8')).toContain('HeiGIT gGmbH');
    expect(readFileSync('docs/dpia-location.md', 'utf8')).toContain('self-host OpenRouteService in the EU');
    expect(GLOBAL_ROUTE_DAILY_CAP).toBe(1500);
    expect(GLOBAL_ROUTE_DAILY_CAP).toBeLessThan(ORS_FREE_DIRECTIONS_PER_DAY);
    expect(ORS_FREE_DIRECTIONS_PER_DAY).toBe(2000);
    const now = 1_000_000_000_000;
    const day = Array.from({ length: GLOBAL_ROUTE_DAILY_CAP }, (_, index) => now - index);
    expect(withinGlobalRouteLimit(day, now).ok).toBe(false);
    expect(withinGlobalRouteLimit(day.slice(1), now).ok).toBe(true);
    expect(Object.keys(orsRequestHeaders('secret-key', 'application/json')).sort()).toEqual(['Accept', 'Authorization']);
    const fn = readFileSync('supabase/functions/outdoor-route/index.ts', 'utf8');
    expect(fn).toContain('GLOBAL_ROUTE_DAILY_CAP');
    expect(fn).toContain('orsRequestHeaders');
    expect(fn).not.toContain('X-Forwarded-For');
    expect(fn).not.toContain('console.error(error');
    expect(fn).not.toMatch(/console\.(log|error|info|warn)\([^)]*ORS_API_KEY/);
    expect(fn).not.toMatch(/console\.(log|error|info|warn)\([^)]*key/);
  });
});
