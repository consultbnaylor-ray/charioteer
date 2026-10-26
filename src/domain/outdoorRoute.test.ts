import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { OUTSIDE_SECTION_LABEL, SHOW_WALK_THIS_OFF } from '@/domain/outsideSection';
import { APP_SECTIONS, TAB_SECTIONS, menuSectionActive } from '@/domain/sections';
import {
  LOCATION_WHEN_IN_USE,
  MAP_CREDIT,
  MAP_LINE_DARK,
  MAP_LINE_LIGHT,
  MAP_STYLE_STORAGE_KEY,
  OPENFREEMAP_DARK,
  OPENFREEMAP_HOST,
  OPENFREEMAP_LIGHT,
  ROUTE_SAFETY_LINE,
  SKETCH_LINE,
  cravingSketch,
  mapLineColour,
  trackLineColour,
  trackLineCollection,
  TRACK_LINE_DARK,
  TRACK_LINE_LIGHT,
  openFreeMapStyle,
  outdoorRouteFromDraft,
  parseMapScheme,
  outdoorRouteInsert,
  pathMetres,
  sampleCanalLoop,
} from '@/domain/outdoorRoute';

describe('Outside is Good phase 1', () => {
  it('puts Outside is Good in Tools under Workouts and keeps six tabs', () => {
    const labels = APP_SECTIONS.map((section) => section.label);
    const outside = APP_SECTIONS.find((section) => section.id === 'outside');
    expect(outside).toMatchObject({
      label: 'Outside is Good',
      href: '/outside',
      icon: 'path',
      group: 'tools',
    });
    expect(OUTSIDE_SECTION_LABEL).toBe('Outside is Good');
    expect(outside?.tab).toBeUndefined();
    expect(labels.indexOf('Outside is Good')).toBe(labels.indexOf('Workouts') + 1);
    expect(labels.indexOf('Progress photos')).toBe(labels.indexOf('Outside is Good') + 1);
    expect(TAB_SECTIONS).toHaveLength(6);
    expect(TAB_SECTIONS.map((section) => section.label)).not.toContain('Outside is Good');
    expect(menuSectionActive('/outside', '/outside')).toBe(true);
    expect(menuSectionActive('/outside-map', '/outside')).toBe(false);
    expect(menuSectionActive('/craving-walk', '/outside')).toBe(false);
    expect(readFileSync('src/ui/menuIcons.tsx', 'utf8')).toContain("name === 'path'");
  });

  it('keeps a craving walk on the phone until route finding is turned on', () => {
    const centre = { latitude: 51.45, longitude: -2.59 };
    const ring = cravingSketch(centre, 15);
    expect(ring.length).toBe(17);
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    const saved = outdoorRouteFromDraft('route-1', { title: ' Craving walk ', kind: 'craving_walk', points: ring, durationMinutes: 15 });
    expect(saved?.kind).toBe('craving_walk');
    expect(saved?.title).toBe('Craving walk');
    expect(outdoorRouteFromDraft('route-1', { title: ' ', kind: 'drawn', points: ring })).toBeNull();
    expect(outdoorRouteFromDraft('route-1', { title: 'Too short', kind: 'drawn', points: [centre] })).toBeNull();
    const phone = readAppSource('src');
    expect(phone).not.toMatch(/api\.heigit\.org|api\.openrouteservice\.org|ORS_API_KEY/);
    expect(readFileSync('src/app/(main)/craving-walk.tsx', 'utf8')).toContain('RouteConsentCard');
    expect(readFileSync('src/app/(main)/craving-walk.tsx', 'utf8')).not.toContain('cravingSketch');
    expect(readFileSync('src/app/(main)/craving-walk.tsx', 'utf8')).not.toContain('No routing service');
    expect(readFileSync('src/app/(main)/find-route.tsx', 'utf8')).toContain('RouteConsentCard');
    expect(readFileSync('src/location/whileUsing.ts', 'utf8')).not.toMatch(/openrouteservice|api\.heigit|graphhopper/i);
    expect(readFileSync('src/domain/outdoorRoute.ts', 'utf8')).toContain(SKETCH_LINE);
    expect(readFileSync('supabase/config.toml', 'utf8')).toMatch(/\[functions\.outdoor-route\]\s+verify_jwt = true/);
  });

  it('keeps a saved route private, deletable, and off the share path', () => {
    const sql = readFileSync('supabase/migrations/20261025160000_outdoor_routes.sql', 'utf8');
    expect(sql).toContain('create table public.outdoor_routes');
    expect(sql).toContain('revoke all on table public.outdoor_routes from public, anon, authenticated');
    expect(sql).toContain('grant select (');
    expect(sql).toContain('id, user_id, title, kind, distance_m, duration_minutes, geometry, created_at');
    expect(sql).toContain('grant insert (');
    expect(sql).toContain('id, user_id, title, kind, distance_m, duration_minutes, geometry');
    expect(sql).toContain('grant delete on table public.outdoor_routes to authenticated');
    expect(sql).not.toMatch(/grant update/i);
    expect(sql).not.toMatch(/to anon/);
    expect(sql).toContain('enable row level security');
    expect(sql).toContain('create policy outdoor_routes_own');
    expect(sql).toContain('user_id = auth.uid()');
    expect(sql).toContain('with check (user_id = auth.uid())');
    expect(sql).toContain('does not change export_my_data');
    expect(sql).not.toMatch(/create or replace function public.export_my_data|buddy_invites|public_profile/i);
    expect(sql).not.toMatch(/latitude|longitude/);
    const repo = readFileSync('src/data/supabase-repository.ts', 'utf8');
    expect(repo).toContain(".from('outdoor_routes').insert(row)");
    expect(repo).toContain(".from('outdoor_routes').delete()");
    expect(repo).not.toContain(".from('outdoor_routes').update(");
    const insert = outdoorRouteInsert('user-1', 'route-1', {
      title: 'Canal loop',
      kind: 'drawn',
      points: sampleCanalLoop().points,
    });
    expect(Object.keys(insert ?? {}).sort()).toEqual([
      'distance_m', 'duration_minutes', 'geometry', 'id', 'kind', 'title', 'user_id',
    ]);
    const share = readFileSync('src/domain/sharedPayload.ts', 'utf8') + readFileSync('src/domain/buddies.ts', 'utf8');
    expect(share).not.toContain('outdoor_routes');
    expect(readFileSync('src/app/(main)/outside.tsx', 'utf8')).toContain('Delete');
    const card = readFileSync('src/ui/WalkThisOff.tsx', 'utf8');
    expect(card.indexOf('{ROUTE_SAFETY_LINE}')).toBeGreaterThan(-1);
    expect(card.indexOf('{ROUTE_SAFETY_LINE}')).toBeLessThan(card.indexOf('<MoreInfo'));
    expect(card.slice(card.indexOf('function OutsideFacts'))).toContain('{ROUTE_SAFETY_LINE}');
    expect(readFileSync('src/domain/outdoorRoute.ts', 'utf8')).toContain(ROUTE_SAFETY_LINE);
    expect(readFileSync('src/domain/outdoorRoute.ts', 'utf8')).not.toMatch(/plan only|When it is added|not in this version/i);
  });

  it('asks for while-in-use location only', () => {
    const app = JSON.parse(readFileSync('app.json', 'utf8')) as {
      expo: { ios: { buildNumber: string; infoPlist?: Record<string, unknown> }; android?: { permissions?: string[] }; plugins: unknown[] };
    };
    expect(app.expo.ios.buildNumber).toMatch(/^\d+$/);
    expect(Number(app.expo.ios.buildNumber)).toBeGreaterThanOrEqual(71);
    const location = app.expo.plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === 'expo-location') as
      | [string, Record<string, unknown>]
      | undefined;
    expect(location?.[1]).toEqual({
      locationWhenInUsePermission: LOCATION_WHEN_IN_USE,
      locationAlwaysAndWhenInUsePermission: false,
      locationAlwaysPermission: false,
      motionUsagePermission: "Charioteer does not use your motion or fitness data. The map component in the app can reference motion sensors, so Apple requires this note.",
      isIosBackgroundLocationEnabled: true,
      isAndroidBackgroundLocationEnabled: false,
      isAndroidForegroundServiceEnabled: false,
      isAndroidMotionActivityEnabled: false,
    });
    expect(JSON.stringify(app)).not.toMatch(/NSLocationAlways|ACCESS_BACKGROUND_LOCATION|FOREGROUND_SERVICE_LOCATION/);
    expect(app.expo.ios.infoPlist?.UIBackgroundModes).toEqual(['location', 'audio']);
    expect(app.expo.android?.permissions ?? []).not.toContain('android.permission.ACCESS_BACKGROUND_LOCATION');
    expect(app.expo.android?.permissions ?? []).not.toContain('android.permission.FOREGROUND_SERVICE_LOCATION');
    const reader = readFileSync('src/location/whileUsing.ts', 'utf8');
    expect(reader).toContain('requestForegroundPermissionsAsync');
    expect(reader).toContain('getCurrentPositionAsync');
    expect(reader).not.toMatch(/requestBackground|startLocationUpdates|watchPosition|ActivityRecognition|getMotionActivity|Pedometer|CMMotion|CMPedometer/);
    const appCode = readAppSource('src');
    expect(appCode).not.toMatch(/getMotionActivityAsync|watchMotionActivityAsync|Pedometer|CMPedometer|CMMotionActivity|CMMotionManager|useAnimatedSensor|expo-sensors|startActivityUpdatesAsync|ActivityRecognition/);
    const screens = ['src/app/(main)/home.tsx', 'src/app/(main)/breathe.tsx', 'src/ui/WalkThisOff.tsx'].map((path) => readFileSync(path, 'utf8')).join('\n');
    expect(screens).toContain('Walk this off');
    expect(screens).toContain('OUTSIDE_SAFETY_LINE');
    expect(readFileSync('src/domain/outdoorRoute.ts', 'utf8')).toContain('Not medical advice');
    expect(readFileSync('src/domain/outdoorRoute.ts', 'utf8')).toContain('116 123');
    expect(readFileSync('src/ui/MapChrome.tsx', 'utf8')).toContain('MAP_CREDIT');
    expect(readFileSync('src/domain/outdoorRoute.ts', 'utf8')).toContain('tiles.openfreemap.org');
    expect(MAP_CREDIT).toContain('OpenFreeMap');
    expect(readFileSync('docs/privacy.md', 'utf8')).toContain(LOCATION_WHEN_IN_USE);
    expect(readFileSync('docs/privacy.md', 'utf8')).toContain(ROUTE_SAFETY_LINE);
    expect(readFileSync('docs/privacy.html', 'utf8')).toContain(ROUTE_SAFETY_LINE);
    expect(readFileSync('docs/dpia-location.md', 'utf8')).toContain(ROUTE_SAFETY_LINE);
    expect(readFileSync('docs/privacy.md', 'utf8') + readFileSync('docs/dpia-location.md', 'utf8')).not.toMatch(/Sharing a walk plan|When it is added|plan only/i);
    expect(readFileSync('docs/privacy.html', 'utf8')).toContain('while the map is open');
    expect(readFileSync('docs/dpia-location.md', 'utf8')).toContain('while using');
    expect(readFileSync('docs/store-privacy-labels.md', 'utf8')).toContain('Precise Location');
    const motionNote = "Charioteer does not use your motion or fitness data. The map component in the app can reference motion sensors, so Apple requires this note.";
    expect(readFileSync('docs/privacy.md', 'utf8')).toContain(motionNote);
    expect(readFileSync('docs/store-privacy-labels.md', 'utf8')).toContain(motionNote);
    expect(readFileSync('docs/store-privacy-labels.md', 'utf8')).toContain('never reads motion or fitness-activity data');
  });

  it('keeps the route controls above one quiet footer', () => {
    const home = readFileSync('src/app/(main)/outside.tsx', 'utf8');
    expect(home.indexOf('label="Find a route"')).toBeLessThan(home.indexOf('<OutsideFooter'));
    expect(home.indexOf('label="Walk this off"')).toBeLessThan(home.indexOf('<OutsideFooter'));
    expect(home.indexOf('Saved routes')).toBeLessThan(home.indexOf('<OutsideFooter'));
    expect(home).toContain('kind="full"');
    expect(home).toContain('intro="A walk from the menu."');
    expect(home).not.toContain('<OutsideFacts');

    const find = readFileSync('src/app/(main)/find-route.tsx', 'utf8');
    expect(find).toContain('intro="A loop or a point-to-point line."');
    expect(find).not.toContain('Route finding stays off');
    expect(find.indexOf('<RouteConsentCard')).toBeLessThan(find.indexOf('<OutsideFooter'));
    expect(find.indexOf('<RouteMaker')).toBeLessThan(find.indexOf('<OutsideFooter'));
    expect(find).toContain('kind="short"');
    expect(find).not.toContain('<OutsideFacts');

    const craving = readFileSync('src/app/(main)/craving-walk.tsx', 'utf8');
    expect(craving).toContain('intro="A 10 to 20 minute loop."');
    expect(craving).not.toContain('Route finding stays off');
    expect(craving.indexOf('<RouteMaker')).toBeLessThan(craving.indexOf('<OutsideFooter'));
    expect(craving).toContain('kind="full"');

    const map = readFileSync('src/app/(main)/outside-map.tsx', 'utf8');
    expect(map.indexOf('label="Where I am"')).toBeLessThan(map.indexOf('<OutsideFooter'));
    expect(map).not.toContain('<OutsideFacts');
    expect(map).toContain('kind="full"');

    const maker = readFileSync('src/ui/RouteMaker.tsx', 'utf8');
    expect(maker.indexOf('Make the route')).toBeLessThan(maker.length);
    expect(maker).not.toContain('ROUTE_SERVICE_LINE');
    expect(maker).not.toContain('ROUTE_RETENTION_LINE');
    expect(maker).not.toContain('ROUTE_SEND_LINE');

    const footer = readFileSync('src/ui/OutsideFooter.tsx', 'utf8');
    expect(footer).toContain('Good to know');
    expect(footer).toContain('variant="muted"');
    expect(footer).toContain('OUTSIDE_SAFETY_LINE');
    expect(footer).toContain('OUTSIDE_CRISIS_LINE');
    expect(footer).toContain('ROUTE_SAFETY_LINE');
    expect(footer).toContain('LOCATION_PAGE_LINE');
    expect(footer).toContain('PATH_LINE');
    expect(footer).toContain('ROUTE_SERVICE_LINE');
    expect(footer).not.toContain('MoreInfo');

    const walk = readFileSync('src/ui/WalkThisOff.tsx', 'utf8');
    expect(walk.indexOf('label="Walk this off"')).toBeLessThan(walk.indexOf('<OutsideFacts'));
    expect(readFileSync('src/ui/RouteConsentCard.tsx', 'utf8')).toContain('ROUTE_CONSENT_LINES');
    expect(readFileSync('src/ui/RouteFindingSwitch.tsx', 'utf8')).toContain('ROUTE_CONSENT_LINES');
  });

  it('parks Walk this off behind one flag and renames the live section', () => {
    expect(SHOW_WALK_THIS_OFF).toBe(false);
    const outside = readFileSync('src/app/(main)/outside.tsx', 'utf8');
    expect(outside).toContain('SHOW_WALK_THIS_OFF ?');
    expect(outside).toContain('label="Walk this off"');
    expect(outside).toContain('OUTSIDE_SECTION_LABEL');
    expect(outside).not.toContain('Get Outside');
    const walk = readFileSync('src/ui/WalkThisOff.tsx', 'utf8');
    expect(walk).toContain('if (!SHOW_WALK_THIS_OFF) return null');
    expect(walk).toContain('label="Walk this off"');
    const route = readFileSync('src/app/(main)/craving-walk.tsx', 'utf8');
    expect(route).toContain('if (!SHOW_WALK_THIS_OFF) return <Redirect href="/outside" />');
    expect(route).toContain('<RouteMaker purpose="craving" />');
    expect(route).toContain('RouteConsentCard');
    const home = readFileSync('src/app/(main)/home.tsx', 'utf8');
    const breathe = readFileSync('src/app/(main)/breathe.tsx', 'utf8');
    expect(home).toContain('<WalkThisOff place="today" />');
    expect(breathe).toContain('<WalkThisOff place="breathe" />');
    expect(home).not.toContain("'/craving-walk'");
    expect(breathe).not.toContain("'/craving-walk'");
    const consent = readFileSync('src/domain/routeConsent.ts', 'utf8');
    expect(consent).toContain('Not now leaves Outside is Good, saved routes, and the map working.');
    expect(consent).not.toMatch(/craving walk/i);
    const docs = [
      readFileSync('docs/privacy.md', 'utf8'),
      readFileSync('docs/privacy.html', 'utf8'),
      readFileSync('docs/dpia-location.md', 'utf8'),
    ].join('\n');
    expect(docs).toContain('Outside is Good');
    expect(docs).toMatch(/Walk this off \(the craving walk\) is parked/);
    expect(docs).not.toContain('Get Outside');
    expect(docs).not.toContain('or the craving walk');
  });

  it('opens the map light, remembers a dark choice, and keeps one tile host', () => {
    expect(parseMapScheme(null)).toBe('light');
    expect(parseMapScheme(undefined)).toBe('light');
    expect(parseMapScheme('light')).toBe('light');
    expect(parseMapScheme('nope')).toBe('light');
    expect(parseMapScheme('dark')).toBe('dark');
    expect(MAP_STYLE_STORAGE_KEY).toBe('charioteer.map-style');
    expect(openFreeMapStyle('light')).toBe(OPENFREEMAP_LIGHT);
    expect(openFreeMapStyle('dark')).toBe(OPENFREEMAP_DARK);
    expect(new URL(OPENFREEMAP_LIGHT).host).toBe(OPENFREEMAP_HOST);
    expect(new URL(OPENFREEMAP_DARK).host).toBe(OPENFREEMAP_HOST);
    expect(OPENFREEMAP_LIGHT).toContain('/styles/liberty');
    expect(OPENFREEMAP_DARK).toContain('/styles/dark');
    expect(mapLineColour('light')).toBe(MAP_LINE_LIGHT);
    expect(mapLineColour('dark')).toBe(MAP_LINE_DARK);
    expect(MAP_LINE_LIGHT).toBe('#047857');
    expect(MAP_LINE_DARK).toBe('#2DE0A0');
    expect(trackLineColour('light')).toBe(TRACK_LINE_LIGHT);
    expect(trackLineColour('dark')).toBe(TRACK_LINE_DARK);
    expect(TRACK_LINE_LIGHT).not.toBe(MAP_LINE_LIGHT);
    expect(TRACK_LINE_DARK).not.toBe(MAP_LINE_DARK);
    const line = trackLineCollection([
      { latitude: 51.45, longitude: -2.59 },
      { latitude: 51.451, longitude: -2.59 },
    ]);
    expect(line.features).toHaveLength(1);
    expect(line.features[0]?.geometry.coordinates).toEqual([[-2.59, 51.45], [-2.59, 51.451]]);
    expect(trackLineCollection([{ latitude: 51.45, longitude: -2.59 }]).features).toEqual([]);
    expect(readFileSync('src/ui/MapChrome.tsx', 'utf8')).toContain("export const RECENTRE_MAP = 'Re-centre'");
    const chrome = readFileSync('src/ui/MapChrome.tsx', 'utf8');
    expect(chrome).toContain("export const FULL_SCREEN_MAP = 'Full screen map'");
    expect(chrome).toContain("export const CLOSE_FULL_SCREEN_MAP = 'Close full screen map'");
    expect(chrome).toContain("export const MAP_STYLE_SWITCH = 'Map style: light or dark'");
    expect(chrome).toContain('width: 44');
    expect(chrome).toContain('height: 44');
    expect(chrome).toContain('useSafeAreaInsets');
    expect(chrome).not.toContain('trackUserLocation');
    const store = readFileSync('src/ui/mapStyle.ts', 'utf8');
    expect(store).toContain('AsyncStorage');
    expect(store).toContain('MAP_STYLE_STORAGE_KEY');
    expect(store).toContain("useState<MapScheme>('light')");
    for (const path of ['src/ui/FootpathMap.tsx', 'src/ui/FootpathMap.web.tsx']) {
      const source = readFileSync(path, 'utf8');
      expect(source).toContain('openFreeMapStyle(scheme)');
      expect(source).not.toContain('openFreeMapStyle(theme.scheme)');
      expect(source).toContain('mapLineColour(');
      expect(source).toContain('<MapFrame');
      expect(source).not.toContain('trackUserLocation');
    }
    const notes = [
      readFileSync('docs/privacy.md', 'utf8'),
      readFileSync('docs/privacy.html', 'utf8'),
      readFileSync('docs/dpia-location.md', 'utf8'),
      readFileSync('docs/store-privacy-labels.md', 'utf8'),
    ].join('\n');
    expect(notes).toContain('tiles.openfreemap.org');
    expect(notes).toContain('Liberty');
  });
});

function readAppSource(dir: string): string {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return [readAppSource(path)];
    if (!/\.(ts|tsx)$/.test(name) || name.endsWith('.test.ts') || name.endsWith('.test.tsx')) return [];
    return [readFileSync(path, 'utf8')];
  }).join('\n');
}
