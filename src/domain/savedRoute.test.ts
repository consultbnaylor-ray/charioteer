import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { LOCATION_WHEN_IN_USE, outdoorRouteRename, outdoorRouteReplace, routeTitleOf, sampleCanalLoop } from '@/domain/outdoorRoute';
import { routePlanBody } from '@/domain/routeAdjust';
import { summaryFrom } from '@/domain/activitySession';
import {
  ADJUST_SENDS,
  ADJUST_THIS_ROUTE,
  CANCEL,
  DELETE_REMOVES,
  LINE_NOT_KEPT,
  DELETE_THIS_ROUTE,
  RENAME,
  ROUTE_NAME_FIELD,
  ROUTE_NEEDS_NAME,
  SAVE_NAME,
  SAVED_LINE_ON_MAP,
  SAVED_ROUTE_MAP_LABEL,
  USE_THIS_ROUTE,
  adjustPlanInput,
  canAdjustSavedRoute,
  copyGuide,
  guideForStart,
  guideLine,
  holdMadeGuide,
  readMadeGuide,
  kindAfterAdjust,
  openLabel,
} from '@/domain/savedRoute';

const RENAME_SQL = 'supabase/migrations/20261026170000_outdoor_routes_rename.sql';
const UPDATE_SQL = 'supabase/migrations/20261026171000_outdoor_routes_update.sql';

function grantOf(source: string): string {
  return source.slice(source.toLowerCase().indexOf('grant update ('));
}

describe('saved routes in build 75', () => {
  it('uses the wording Ben approved on 26 October 2026', () => {
    expect(USE_THIS_ROUTE).toBe('Use this route');
    expect(RENAME).toBe('Rename');
    expect(SAVE_NAME).toBe('Save name');
    expect(CANCEL).toBe('Cancel');
    expect(SAVED_LINE_ON_MAP).toBe('The saved line is drawn on the map. Turns are not spoken.');
    expect(guideLine('Canal loop')).toBe('Guide: Canal loop. The line stays on this phone. Turns are not spoken.');
    expect(ROUTE_NEEDS_NAME).toBe('A route needs a name.');
    expect(ADJUST_THIS_ROUTE).toBe('Adjust this route');
    expect(ADJUST_SENDS).toBe('Adjusting sends the start, the destination, and any points you add. It does not send the whole saved line.');
    expect(DELETE_THIS_ROUTE).toBe('Delete this route?');
    expect(DELETE_REMOVES).toBe('This removes the saved route from your account.');
    expect(LINE_NOT_KEPT).toBe('The line is not kept. The name, distance, and time stay on your account.');
    expect(openLabel('Canal loop')).toBe('Open Canal loop');
    expect(SAVED_ROUTE_MAP_LABEL).toBe('Map with the saved route');
    expect(ROUTE_NAME_FIELD).toBe('Route name');
    const sheet = readFileSync('docs/saved-routes-decisions.md', 'utf8');
    expect(sheet).toContain('Approve open, use and rename plus Adjust this route in the next build, with the wording as written');
    expect(sheet).toContain('export_my_data');
    expect(readFileSync('docs/dpia-location.md', 'utf8')).toContain('Approve open, use and rename plus Adjust this route in the next build, with the wording as written');
  });

  it('refuses an empty name and still allows two routes to share one', () => {
    expect(routeTitleOf('  ')).toBeNull();
    expect(routeTitleOf('  Canal loop  ')).toBe('Canal loop');
    expect(routeTitleOf('a'.repeat(90))?.length).toBe(80);
    expect(outdoorRouteRename('   ', '2026-10-26T12:00:00.000Z')).toBeNull();
    const renameSql = readFileSync(RENAME_SQL, 'utf8');
    const updateSql = readFileSync(UPDATE_SQL, 'utf8');
    expect(renameSql).toContain('Not applied');
    expect(updateSql).toContain('Not applied');
    expect(grantOf(renameSql)).toBe('grant update (title, updated_at) on table public.outdoor_routes to authenticated;\n');
    expect(grantOf(updateSql)).toContain('title');
    expect(grantOf(updateSql)).toContain('kind');
    expect(grantOf(updateSql)).toContain('distance_m');
    expect(grantOf(updateSql)).toContain('duration_minutes');
    expect(grantOf(updateSql)).toContain('geometry');
    expect(grantOf(updateSql)).toContain('ascent_m');
    expect(grantOf(updateSql)).toContain('updated_at');
    expect(grantOf(renameSql)).not.toContain('user_id');
    expect(grantOf(updateSql)).not.toContain('user_id');
    expect(grantOf(renameSql).toLowerCase()).not.toMatch(/to anon|to public/);
    expect(grantOf(updateSql).toLowerCase()).not.toMatch(/to anon|to public/);
    expect(renameSql.toLowerCase()).not.toContain('unique');
    expect(updateSql.toLowerCase()).not.toContain('unique');
    expect(renameSql).toContain('export_my_data');
    expect(updateSql).toContain('export_my_data');
    const app = readFileSync('src/data/supabase-repository.ts', 'utf8') + readFileSync('src/app/(main)/saved-route.tsx', 'utf8');
    expect(app).not.toContain('20261026170000');
    expect(app).not.toContain('20261026171000');
  });

  it('copies the guide at Start and leaves it out of the summary', () => {
    const route = sampleCanalLoop();
    const guide = copyGuide(route);
    route.points[0] = { latitude: 0, longitude: 0 };
    expect(guide?.points[0]).toEqual({ latitude: 51.449, longitude: -2.597 });
    expect(guide?.title).toBe('Canal loop');
    const summary = summaryFrom({
      id: 'outing-1',
      activity: 'walk',
      date: '2026-10-26',
      distanceM: 1200,
      movingMs: 600_000,
    });
    expect(JSON.stringify(summary)).not.toMatch(/latitude|longitude|guide|points/);
    const screen = readFileSync('src/app/(main)/activity.tsx', 'utf8');
    expect(screen).toContain('guideForStart(saved, madeGuide, useMade && routeId == null)');
    expect(screen).toContain('guide: copied?.points ?? []');
    expect(screen).toContain('guideRoute(');
    expect(screen).not.toContain('routes.filter((item) => item.id === live.routeId)');
    expect(screen).toContain('SAVED_LINE_ON_MAP');
    expect(screen).toContain('guideLine(live.routeTitle)');
    expect(screen).toContain('askedRoute');
    const savedCall = screen.slice(screen.indexOf('summaryFrom('), screen.indexOf('summaryFrom(') + 400);
    expect(savedCall).not.toMatch(/guide|latitude|points/);
  });

  it('sends the ends and added points, and replaces the same row', () => {
    const route = sampleCanalLoop();
    const via = { latitude: 51.452, longitude: -2.59 };
    const input = adjustPlanInput(route, 'run', [via]);
    expect(input).toMatchObject({
      mode: 'run',
      shape: 'a_to_b',
      start: route.points[0],
      end: route.points[route.points.length - 1],
      via: [via],
    });
    expect(input?.distanceM).toBeUndefined();
    expect(input?.minutes).toBeUndefined();
    const body = routePlanBody(input!);
    expect(body.via).toEqual([via]);
    expect(JSON.stringify(body)).not.toContain('round_trip');
    expect(JSON.stringify(body)).not.toContain(route.title);
    expect(JSON.stringify(body)).not.toContain('user_id');
    const middle = route.points[2];
    expect(body.via.some((point) => point.latitude === middle.latitude && point.longitude === middle.longitude)).toBe(false);
    expect(body.start).not.toEqual(middle);
    expect(canAdjustSavedRoute('craving_walk')).toBe(false);
    expect(canAdjustSavedRoute('drawn')).toBe(true);
    expect(kindAfterAdjust([{ latitude: 1, longitude: 1 }, { latitude: 2, longitude: 2 }, { latitude: 1, longitude: 1 }])).toBe('loop');
    expect(kindAfterAdjust([{ latitude: 1, longitude: 1 }, { latitude: 2, longitude: 2 }])).toBe('point_to_point');
    const replaced = outdoorRouteReplace(
      { ...route, kind: 'loop' },
      40,
      '2026-10-26T18:00:00.000Z',
    );
    expect(Object.keys(replaced)).not.toContain('user_id');
    expect(replaced.ascent_m).toBe(40);
    expect(replaced).not.toHaveProperty('geometry');
    const adjust = readFileSync('src/ui/SavedRouteAdjust.tsx', 'utf8');
    expect(adjust).toContain('adjustPlanInput(');
    expect(adjust).toContain('replaceOutdoorRoute');
    expect(adjust).not.toContain('saveOutdoorRoute');
    expect(adjust).toContain('!consent.allowed');
    expect(adjust).toContain('ADJUST_SENDS');
    const open = readFileSync('src/app/(main)/saved-route.tsx', 'utf8');
    expect(open).toContain('canAdjustSavedRoute');
    expect(open).toContain('OTHER_SESSION_LINE');
    expect(open).not.toContain('USE_THIS_ROUTE');
    expect(open.indexOf('mapLabel={SAVED_ROUTE_MAP_LABEL}')).toBeLessThan(open.indexOf("startLabel('walk')"));
    expect(open.indexOf("startLabel('walk')")).toBeLessThan(open.indexOf("startLabel('run')"));
    expect(open.indexOf("startLabel('run')")).toBeLessThan(open.indexOf("startLabel('cycle')"));
    expect(open).toContain('tone="quiet"');
    expect(open).toContain('`/activity?kind=${kind}&route=${route!.id}`');
    expect(open).not.toContain('kind=walk&route=');
    expect(open).toContain('mapLabel={SAVED_ROUTE_MAP_LABEL}');
    expect(open).toContain('narrow ? 180 : 260');
    const card = readFileSync('src/ui/SavedRouteCard.tsx', 'utf8');
    expect(card).toContain('openLabel');
    expect(card).not.toContain('label="Open"');
    expect(card.indexOf('label={CANCEL}')).toBeLessThan(card.indexOf('label="Delete"'));
    expect(card).toContain('disabledReason={empty ? ROUTE_NEEDS_NAME : undefined}');
    expect(readFileSync('app.json', 'utf8')).toContain(LOCATION_WHEN_IN_USE);
    expect(readFileSync('app.json', 'utf8')).toContain('"buildNumber": "72"');
  });

  it('starts from the line on the card or the saved row, and does not redraw it', () => {
    const route = sampleCanalLoop();
    const cardPoints = route.points.map((point) => ({ latitude: point.latitude, longitude: point.longitude }));
    const made = holdMadeGuide({ title: 'Walk loop', points: cardPoints });
    cardPoints[0] = { latitude: 0, longitude: 0 };
    expect(readMadeGuide()?.points[0]).toEqual(route.points[0]);
    expect(readMadeGuide()?.title).toBe('Walk loop');
    expect(guideForStart(route, made, true)?.title).toBe(route.title);
    expect(guideForStart(route, made, true)?.points[0]).toEqual(route.points[0]);
    expect(guideForStart(null, made, true)?.points).toEqual(made?.points);
    expect(guideForStart(null, made, false)).toBeNull();
    const summary = summaryFrom({
      id: 'outing-cycle',
      activity: 'cycle',
      date: '2026-10-27',
      distanceM: 1200,
      movingMs: 400_000,
    });
    expect(summary.activity).toBe('cycle');
    expect(summary.distanceM).toBe(1200);
    expect(JSON.stringify(summary)).not.toMatch(/7700|92|latitude|Walk loop/);

    const maker = readFileSync('src/ui/RouteMaker.tsx', 'utf8');
    const card = maker.slice(maker.indexOf("variant=\"title\">{craving"));
    expect(card.indexOf('formatClimb(plan.ascentM)')).toBeLessThan(card.indexOf("startLabel('walk')"));
    expect(card.indexOf("startLabel('walk')")).toBeLessThan(card.indexOf("startLabel('run')"));
    expect(card.indexOf("startLabel('run')")).toBeLessThan(card.indexOf("startLabel('cycle')"));
    expect(card.indexOf("startLabel('cycle')")).toBeLessThan(card.indexOf('{ADJUST_THE_ROUTE}'));
    expect(maker).toContain('!craving && plan.points.length >= 2');
    expect(maker).toContain("holdMadeRoute({ title: title.trim() || 'My route', kind, points: line.points })");
    expect(maker).toContain('`/activity?kind=${kind}&made=${Date.now()}`');
    const outing = maker.slice(maker.indexOf('function beginOuting'), maker.indexOf('const mapHeight'));
    expect(outing).toContain('line.points');
    expect(outing).toContain('OTHER_SESSION_LINE');
    expect(outing).not.toContain('shownVias');
    expect(outing).not.toContain('saveOutdoorRoute');
    expect(outing).not.toContain('save()');
    expect(maker).not.toContain('This line was made for a walk');
    const open = readFileSync('src/app/(main)/saved-route.tsx', 'utf8');
    expect(open.indexOf('adjusting ?')).toBeLessThan(open.indexOf("startLabel('walk')"));
    expect(readFileSync('src/ui/SavedRouteAdjust.tsx', 'utf8')).not.toContain('startLabel');
    expect(readFileSync('src/app/(main)/activity.tsx', 'utf8')).not.toContain('This line was made for a walk');
    expect(readFileSync('app.json', 'utf8')).toContain('"buildNumber": "72"');
  });
});
