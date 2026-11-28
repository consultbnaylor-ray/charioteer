/** The made-route Save button. Once saved it turns green, says so, and cannot save twice. */
export const SAVE_THIS_ROUTE = 'Save this route';
export const ROUTE_SAVED_LABEL = 'Saved ✓';
export const ROUTE_SAVED_SPOKEN = 'Route saved';
/** Under the green button. It says where the route is, not "saved" a second time. */
export const ROUTE_SAVED_WHERE = 'You can find or delete it in Map a Route.';

export type RouteSaveView = {
  label: string;
  spoken: string;
  tone: 'quiet' | 'success';
  disabled: boolean;
};

export function routeSaveView(input: { saved: boolean; pending: boolean; title: string }): RouteSaveView {
  if (input.saved && !input.pending) {
    return { label: ROUTE_SAVED_LABEL, spoken: ROUTE_SAVED_SPOKEN, tone: 'success', disabled: true };
  }
  return {
    label: SAVE_THIS_ROUTE,
    spoken: SAVE_THIS_ROUTE,
    tone: 'quiet',
    disabled: input.pending || input.title.trim().length === 0,
  };
}

/**
 * A change to the name brings the Save button back. Typing the same name does not.
 * (A new or recalculated route already clears the saved state.)
 */
export function savedAfterRename(saved: boolean, before: string, after: string): boolean {
  return saved && before === after;
}
