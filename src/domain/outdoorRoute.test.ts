import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { APP_SECTIONS, TAB_SECTIONS, menuSectionActive } from '@/domain/sections';
import {
  LOCATION_WHEN_IN_USE,
  MAP_CREDIT,
  ROUTE_SAFETY_LINE,
  SKETCH_LINE,
  cravingSketch,
  outdoorRouteFromDraft,
  outdoorRouteInsert,
  pathMetres,
  sampleCanalLoop,
} from '@/domain/outdoorRoute';

describe('Get Outside phase 1', () => {
  it('puts Get Outside in Tools under Workouts and keeps six tabs', () => {
    const labels = APP_SECTIONS.map((section) => section.label);
    const outside = APP_SECTIONS.find((section) => section.id === 'outside');
    expect(outside).toMatchObject({
      label: 'Get Outside',
      href: '/outside',
      icon: 'path',
      group: 'tools',
    });
    expect(outside?.tab).toBeUndefined();
    expect(labels.indexOf('Get Outside')).toBe(labels.indexOf('Workouts') + 1);
    expect(labels.indexOf('Progress photos')).toBe(labels.indexOf('Get Outside') + 1);
    expect(TAB_SECTIONS).toHaveLength(6);
    expect(TAB_SECTIONS.map((section) => section.label)).not.toContain('Get Outside');
    expect(menuSectionActive('/outside', '/outside')).toBe(true);
    expect(menuSectionActive('/outside-map', '/outside')).toBe(false);
    expect(menuSectionActive('/craving-walk', '/outside')).toBe(false);
    expect(readFileSync('src/ui/menuIcons.tsx', 'utf8')).toContain("name === 'path'");
  });

  it('draws a craving ring on the phone and does not call a router', () => {
    const centre = { latitude: 51.45, longitude: -2.59 };
    const ring = cravingSketch(centre, 15);
    expect(ring.length).toBe(17);
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    expect(pathMetres(ring)).toBeGreaterThan(1000);
    expect(pathMetres(ring)).toBeLessThan(1400);
    const short = cravingSketch(centre, 10);
    const long = cravingSketch(centre, 20);
    expect(pathMetres(short)).toBeLessThan(pathMetres(ring));
    expect(pathMetres(long)).toBeGreaterThan(pathMetres(ring));
    const saved = outdoorRouteFromDraft('route-1', { title: ' Craving walk ', kind: 'craving_walk', points: ring, durationMinutes: 15 });
    expect(saved?.kind).toBe('craving_walk');
    expect(saved?.title).toBe('Craving walk');
    expect(outdoorRouteFromDraft('route-1', { title: ' ', kind: 'drawn', points: ring })).toBeNull();
    expect(outdoorRouteFromDraft('route-1', { title: 'Too short', kind: 'drawn', points: [centre] })).toBeNull();
    const source = [
      'src/domain/outdoorRoute.ts',
      'src/app/(main)/craving-walk.tsx',
      'src/app/(main)/outside-map.tsx',
      'src/location/whileUsing.ts',
    ].map((path) => readFileSync(path, 'utf8')).join('\n');
    expect(source).not.toMatch(/openrouteservice|api\.heigit|ors\.|graphhopper/i);
    expect(source).toContain(SKETCH_LINE);
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

  it('asks for while-in-use location only and sets build 69', () => {
    const app = JSON.parse(readFileSync('app.json', 'utf8')) as {
      expo: { ios: { buildNumber: string; infoPlist?: Record<string, unknown> }; android?: { permissions?: string[] }; plugins: unknown[] };
    };
    expect(app.expo.ios.buildNumber).toBe('69');
    const location = app.expo.plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === 'expo-location') as
      | [string, Record<string, unknown>]
      | undefined;
    expect(location?.[1]).toEqual({
      locationWhenInUsePermission: LOCATION_WHEN_IN_USE,
      locationAlwaysAndWhenInUsePermission: false,
      locationAlwaysPermission: false,
      motionUsagePermission: false,
      isIosBackgroundLocationEnabled: false,
      isAndroidBackgroundLocationEnabled: false,
      isAndroidForegroundServiceEnabled: false,
      isAndroidMotionActivityEnabled: false,
    });
    expect(JSON.stringify(app)).not.toMatch(/NSLocationAlways|ACCESS_BACKGROUND_LOCATION|FOREGROUND_SERVICE_LOCATION|expo-media-library|NSPhotoLibraryAddUsageDescription/);
    expect(app.expo.android?.permissions ?? []).not.toContain('android.permission.ACCESS_BACKGROUND_LOCATION');
    expect(app.expo.android?.permissions ?? []).not.toContain('android.permission.FOREGROUND_SERVICE_LOCATION');
    const reader = readFileSync('src/location/whileUsing.ts', 'utf8');
    expect(reader).toContain('requestForegroundPermissionsAsync');
    expect(reader).toContain('getCurrentPositionAsync');
    expect(reader).not.toMatch(/requestBackground|startLocationUpdates|watchPosition|ActivityRecognition|getMotionActivity/);
    const screens = ['src/app/(main)/home.tsx', 'src/app/(main)/breathe.tsx', 'src/ui/WalkThisOff.tsx'].map((path) => readFileSync(path, 'utf8')).join('\n');
    expect(screens).toContain('Walk this off');
    expect(screens).toContain('OUTSIDE_SAFETY_LINE');
    expect(readFileSync('src/domain/outdoorRoute.ts', 'utf8')).toContain('Not medical advice');
    expect(readFileSync('src/domain/outdoorRoute.ts', 'utf8')).toContain('116 123');
    expect(readFileSync('src/ui/FootpathMap.tsx', 'utf8')).toContain('MAP_CREDIT');
    expect(readFileSync('src/ui/FootpathMap.web.tsx', 'utf8')).toContain('MAP_CREDIT');
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
  });
});
