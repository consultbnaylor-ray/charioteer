/**
 * Layout of the full screen map.
 *
 * The map fills the whole screen between the safe-area insets. The route
 * figures (distance, time, climb, and the adjust buttons) float on the map
 * near the bottom, rather than sitting in a blank band under a shortened map.
 * The controls pinned to the bottom of the map (the light/dark button, the
 * map credit and the green tick) are lifted above that panel.
 */

/** Gap between the panel and the map edges, and between the panel and the lifted controls. */
export const FULL_SCREEN_PANEL_GAP = 8;
/** The panel never takes more than this share of the map; the rest scrolls inside it. */
export const FULL_SCREEN_PANEL_MAX_SHARE = 0.45;

export function fullScreenMapHeight(windowHeight: number, insetTop: number, insetBottom: number): number {
  return Math.max(240, windowHeight - insetTop - insetBottom);
}

export function fullScreenPanelMaxHeight(mapHeight: number): number {
  return Math.max(120, Math.round(mapHeight * FULL_SCREEN_PANEL_MAX_SHARE));
}

/**
 * How far the bottom-pinned map controls move up so they sit above the panel.
 * Nothing moves when there is no panel or it has not been measured yet.
 */
export function fullScreenControlLift(hasPanel: boolean, panelHeight: number): number {
  if (!hasPanel || !(panelHeight > 0)) return 0;
  return Math.round(panelHeight) + FULL_SCREEN_PANEL_GAP;
}
