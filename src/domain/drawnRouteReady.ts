/**
 * Once a drawing has been snapped to paths, that snapped line is the route. "Make the route"
 * builds a fresh route from the settings instead, so while a drawn route is showing the
 * button says so plainly, rather than silently swapping the drawing for a generated loop.
 */
/**
 * The one "save it" prompt, for any made route: drawn and snapped, recalculated, or from the
 * settings. It sits just under the map and scrolls to the name and Save button when tapped.
 * It replaces the older drawn-only line, so there is one wording, not two.
 */
export const ROUTE_READY_SAVE = 'Route ready. Scroll down to name and save it.';
/** The same prompt on the full-screen map, where the save card is behind the map. */
export const ROUTE_READY_FULL_SCREEN = 'Route ready. Close the map, then scroll down to name and save it.';
export const ROUTE_READY_SAVE_HINT = 'Scrolls down to the route name and the Save button.';
/** Kept for the #140 wording check. It is now the shared prompt. */
export const DRAWN_ROUTE_READY = ROUTE_READY_SAVE;
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

export type SavePrompt = 'save' | 'changed' | null;

/**
 * Which prompt shows under the map. A made route that has not been saved asks to be saved.
 * A drawing changed by the rubber asks for Recalculate first. Saving the route removes the
 * prompt. A failed snap, or no route, shows nothing here.
 */
export function savePrompt(input: { hasPlan: boolean; saved: boolean; stale: boolean; snapFailed: boolean }): SavePrompt {
  if (!input.hasPlan || input.snapFailed) return null;
  if (input.stale) return 'changed';
  if (input.saved) return null;
  return 'save';
}
