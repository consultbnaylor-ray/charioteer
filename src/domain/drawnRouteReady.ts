/**
 * Once a drawing has been snapped to paths, that snapped line is the route. "Make the route"
 * builds a fresh route from the settings instead, so while a drawn route is showing the
 * button says so plainly, rather than silently swapping the drawing for a generated loop.
 */
export const DRAWN_ROUTE_READY = 'Your drawn route is ready. Name and save it below.';
export const REPLACE_DRAWN_ROUTE = 'Replace it with a route from the settings';

export function drawnRouteShowing(input: {
  craving: boolean;
  fromDraw: boolean;
  hasPlan: boolean;
  snapFailed: boolean;
}): boolean {
  return !input.craving && input.fromDraw && input.hasPlan && !input.snapFailed;
}

/** After the rubber, until Recalculate. The Make route button still offers to replace, never silently. */
export const DRAWN_ROUTE_CHANGED = 'You have changed your drawing. Tap Recalculate route on the map to snap it again.';

export function drawnRouteLine(stale: boolean): string {
  return stale ? DRAWN_ROUTE_CHANGED : DRAWN_ROUTE_READY;
}
