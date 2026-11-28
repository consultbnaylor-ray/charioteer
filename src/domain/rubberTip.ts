/**
 * A one-time tip pointing at the rubber, shown on the map the first time a drawn route
 * is snapped. It goes once tapped or once the rubber is used, and never comes back on
 * this phone. Nothing here holds a position.
 */
export const RUBBER_TIP = 'Wrong bit? Use the rubber to wipe it out';
export const RUBBER_TIP_DISMISS = 'Dismiss tip';

/** The visible word under the rubber icon. */
export const RUBBER_WORD = 'Rubber';

export const RUBBER_TIP_KEY = 'charioteer.route.rubberTip.seen.v1';

export type RubberTipState = {
  /** The stored flag has been read. Until then the tip stays hidden, so it cannot flash for someone who has seen it. */
  loaded: boolean;
  /** Tapped away or the rubber used, now or on an earlier visit. */
  seen: boolean;
  /** A drawn route has snapped on this screen. */
  snapped: boolean;
};

export type RubberTipEvent =
  | { kind: 'loaded'; seen: boolean }
  | { kind: 'snapped' }
  | { kind: 'dismiss' }
  | { kind: 'rubber' };

export function freshRubberTip(): RubberTipState {
  return { loaded: false, seen: false, snapped: false };
}

export function nextRubberTip(state: RubberTipState, event: RubberTipEvent): RubberTipState {
  switch (event.kind) {
    case 'loaded':
      // A dismissal made before the read finished still counts.
      return { ...state, loaded: true, seen: state.seen || event.seen };
    case 'snapped':
      return { ...state, snapped: true };
    case 'dismiss':
    case 'rubber':
      return { ...state, seen: true };
    default:
      return state;
  }
}

/** True when this event should write the seen flag to the phone. */
export function rubberTipShouldPersist(before: RubberTipState, event: RubberTipEvent): boolean {
  return (event.kind === 'dismiss' || event.kind === 'rubber') && !before.seen;
}

/**
 * The tip shows after a drawn route has snapped, while that drawn route is on the map
 * and the rubber button is showing, until it has been seen. It is not shown while the
 * rubber is already on, or while a snap has just failed.
 */
export function rubberTipVisible(
  state: RubberTipState,
  screen: { craving: boolean; fromDraw: boolean; hasPlan: boolean; rubberOn: boolean; snapFailed: boolean },
): boolean {
  if (!state.loaded || state.seen || !state.snapped) return false;
  if (screen.craving || !screen.fromDraw || !screen.hasPlan) return false;
  if (screen.rubberOn || screen.snapFailed) return false;
  return true;
}

export function rubberTipSeenIn(raw: string | null): boolean {
  return raw === '1';
}
