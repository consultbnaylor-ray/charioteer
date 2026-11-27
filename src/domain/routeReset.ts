import type { RouteDistanceChoice, RouteMode, RouteShape, RouteTimeChoice } from '@/domain/findRoute';
import type { OutdoorPoint } from '@/domain/outdoorRoute';
import { restingMapCamera, type HeldCamera } from '@/ui/mapCamera';

export const RESET_MAP = 'Reset map';

export const PLANNER_MODE: RouteMode = 'walk';
export const PLANNER_SHAPE: RouteShape = 'loop';
export const PLANNER_DISTANCE: RouteDistanceChoice = '5';
export const PLANNER_TIME: RouteTimeChoice = 'none';
export const PLANNER_TITLE = 'My route';

/**
 * What the Find a route card is holding.
 * Prefer footpaths is not here. Reset leaves that switch as it is.
 */
export type PlannerActivity = {
  modeTouched: boolean;
  shapeTouched: boolean;
  distanceId: RouteDistanceChoice;
  timeId: RouteTimeChoice;
  customDistance: string;
  customMinutes: string;
  start: OutdoorPoint | null;
  startName: string;
  end: OutdoorPoint | null;
  endName: string;
  query: string;
  endQuery: string;
  searchOpen: boolean;
  drawing: boolean;
  pencil: number;
  strokes: number;
  snapped: number;
  fromDraw: boolean;
  plan: boolean;
  drawNote: boolean;
  snapMiss: boolean;
  saved: boolean;
  title: string;
  error: boolean;
  pin: boolean;
  rough: boolean;
};

/** True when How, Shape, Distance, a place, a line, or a made route is no longer at the start. */
export function plannerNeedsReset(activity: PlannerActivity): boolean {
  if (activity.modeTouched || activity.shapeTouched) return true;
  if (activity.distanceId !== PLANNER_DISTANCE || activity.timeId !== PLANNER_TIME) return true;
  if (activity.customDistance.trim() !== '' || activity.customMinutes.trim() !== '') return true;
  if (activity.start || activity.startName.trim() || activity.end || activity.endName.trim()) return true;
  if (activity.query.trim() || activity.endQuery.trim() || activity.searchOpen) return true;
  if (activity.drawing || activity.pencil > 0 || activity.strokes > 0 || activity.snapped > 0 || activity.fromDraw) return true;
  if (activity.plan) return true;
  if (activity.drawNote || activity.snapMiss || activity.saved || activity.error || activity.pin || activity.rough) return true;
  const title = activity.title.trim();
  if (title !== '' && title !== PLANNER_TITLE && title !== 'Craving walk') return true;
  return false;
}

export type ResetPlanner = {
  preferPaths: boolean;
  mode: RouteMode;
  modeTouched: false;
  shape: RouteShape;
  shapeTouched: false;
  distanceId: RouteDistanceChoice;
  timeId: RouteTimeChoice;
  customDistance: '';
  customMinutes: '';
  start: null;
  startName: '';
  end: null;
  endName: '';
  query: '';
  endQuery: '';
  drawing: false;
  plan: null;
  title: string;
  camera: HeldCamera;
};

/**
 * The planner card back at its first paint.
 * `preferPaths` is copied through. The camera uses a location already on screen,
 * or the default view. This does not ask for a route or a new location.
 */
export function resetPlanner(input: { preferPaths: boolean; here: OutdoorPoint | null }): ResetPlanner {
  return {
    preferPaths: input.preferPaths,
    mode: PLANNER_MODE,
    modeTouched: false,
    shape: PLANNER_SHAPE,
    shapeTouched: false,
    distanceId: PLANNER_DISTANCE,
    timeId: PLANNER_TIME,
    customDistance: '',
    customMinutes: '',
    start: null,
    startName: '',
    end: null,
    endName: '',
    query: '',
    endQuery: '',
    drawing: false,
    plan: null,
    title: PLANNER_TITLE,
    camera: restingMapCamera(input.here),
  };
}
