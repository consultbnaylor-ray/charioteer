/**
 * Opening, using, renaming, and adjusting a saved route.
 * Wording approved by Ben on 26 October 2026.
 * The guide copy stays on the phone. Adjust sends only the ends and added points.
 */

import type { RouteMode, RoutePlanInput } from '@/domain/findRoute';
import { metresBetween, type OutdoorKind, type OutdoorPoint, type OutdoorRoute } from '@/domain/outdoorRoute';
import { VIA_POINT_CAP, routePlanBody } from '@/domain/routeAdjust';

export const USE_THIS_ROUTE = 'Use this route';
export const RENAME = 'Rename';
export const SAVE_NAME = 'Save name';
export const CANCEL = 'Cancel';
export const SAVED_LINE_ON_MAP = 'The saved line is drawn on the map. Turns are not spoken.';
export const ROUTE_NEEDS_NAME = 'A route needs a name.';
export const ADJUST_THIS_ROUTE = 'Adjust this route';
export const ADJUST_SENDS = 'Adjusting sends the start, the destination, and any points you add. It does not send the whole saved line.';
export const DELETE_THIS_ROUTE = 'Delete this route?';
export const DELETE_REMOVES = 'This removes the saved line from your account.';
export const SAVED_ROUTE_MAP_LABEL = 'Map with the saved route';
export const ROUTE_NAME_FIELD = 'Route name';

export const ROUTE_UPDATE_GRANT_LINE =
  'Saving that change needs an update grant, and that change has not been applied yet.';

export function openLabel(title: string): string {
  return `Open ${title}`;
}

export function guideLine(name: string): string {
  return `Guide: ${name}. The line stays on this phone. Turns are not spoken.`;
}

export type HeldGuide = {
  title: string;
  points: OutdoorPoint[];
};

/** Points and name taken at Start. Later edits to the saved row do not change this copy. */
export function copyGuide(route: Pick<OutdoorRoute, 'title' | 'points'> | null | undefined): HeldGuide | null {
  if (!route || route.points.length < 2) return null;
  return {
    title: route.title,
    points: route.points.map((point) => ({ latitude: point.latitude, longitude: point.longitude })),
  };
}

/** A made route that has not been saved. It lives in memory until the app is closed. */
let madeGuide: HeldGuide | null = null;

export function holdMadeGuide(route: { title: string; points: readonly OutdoorPoint[] } | null): HeldGuide | null {
  madeGuide = copyGuide(route);
  return madeGuide;
}

export function readMadeGuide(): HeldGuide | null {
  return madeGuide ? copyGuide(madeGuide) : null;
}

/**
 * A saved row wins. An unsaved redraw is not the guide.
 * A made route is used only when the person kept that choice and no row is selected.
 */
export function guideForStart(
  saved: Pick<OutdoorRoute, 'title' | 'points'> | null,
  made: HeldGuide | null,
  useMade: boolean,
): HeldGuide | null {
  if (saved) return copyGuide(saved);
  if (!useMade) return null;
  return copyGuide(made);
}

/** The guide drawn on the live map. It is not a second saved route. */
export function guideRoute(guide: HeldGuide | null): OutdoorRoute[] {
  if (!guide || guide.points.length < 2) return [];
  return [{
    id: 'guide',
    title: guide.title,
    kind: 'drawn',
    distanceM: 0,
    durationMinutes: 0,
    points: guide.points,
    createdAt: '',
  }];
}

/** A craving walk was drawn on the phone. It is not sent back to be redrawn. */
export function canAdjustSavedRoute(kind: OutdoorKind): boolean {
  return kind !== 'craving_walk';
}

export function savedRouteEnds(points: readonly OutdoorPoint[]): { start: OutdoorPoint; end: OutdoorPoint } | null {
  if (points.length < 2) return null;
  const first = points[0];
  const last = points[points.length - 1];
  return {
    start: { latitude: first.latitude, longitude: first.longitude },
    end: { latitude: last.latitude, longitude: last.longitude },
  };
}

/**
 * Start, destination, added points, and travel type.
 * The destination of a loop is the start again. Round-trip is not part of this input.
 * The stored corners between the ends are not included.
 */
export function adjustPlanInput(
  route: Pick<OutdoorRoute, 'points'>,
  mode: RouteMode,
  vias: readonly OutdoorPoint[],
): RoutePlanInput | null {
  const ends = savedRouteEnds(route.points);
  if (!ends) return null;
  return {
    mode,
    shape: 'a_to_b',
    start: ends.start,
    end: ends.end,
    via: vias.slice(0, VIA_POINT_CAP).map((point) => ({ latitude: point.latitude, longitude: point.longitude })),
  };
}

/** What the phone would send. No name, no account, no round-trip, no stored middle points. */
export function adjustRequestBody(input: RoutePlanInput) {
  return routePlanBody(input);
}

/** A closed line is a loop. Anything else is A to B. Travel type is not the kind. */
export function kindAfterAdjust(points: readonly OutdoorPoint[]): 'loop' | 'point_to_point' {
  if (points.length < 2) return 'point_to_point';
  const first = points[0];
  const last = points[points.length - 1];
  if (first.latitude === last.latitude && first.longitude === last.longitude) return 'loop';
  if (metresBetween(first, last) < 40) return 'loop';
  return 'point_to_point';
}
