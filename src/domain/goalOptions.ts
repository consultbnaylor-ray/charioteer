import { GOAL_LABEL, NUTRITION_GOALS, isNutritionGoal, type NutritionGoal } from './nutrition';

export type GoalOption = {
  id: NutritionGoal;
  label: string;
};

export const GOAL_LOAD_FAILED = 'Could not load the goals. Showing the usual list.';

/** The goals the app always knows. Maintain Weight and the athlete goals are in this list. */
export function defaultGoalOptions(): GoalOption[] {
  return NUTRITION_GOALS.map((id) => ({ id, label: GOAL_LABEL[id] }));
}

function knownOption(value: unknown): GoalOption | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as { id?: unknown; label?: unknown };
  if (typeof row.id !== 'string' || !isNutritionGoal(row.id)) return null;
  const label = typeof row.label === 'string' && row.label.trim()
    ? row.label.trim().slice(0, 80)
    : GOAL_LABEL[row.id];
  return { id: row.id, label };
}

/**
 * An empty, partial, or failed catalogue still shows every built-in goal.
 * The saved goal is a separate field and is left as it is.
 */
export function resolveGoalOptions(
  input: { ok: true; options: unknown } | { ok: false },
): { options: GoalOption[]; failed: boolean } {
  const defaults = defaultGoalOptions();
  if (!input.ok) return { options: defaults, failed: true };
  const raw = Array.isArray(input.options) ? input.options : [];
  const parsed = raw.map(knownOption).filter((item): item is GoalOption => item != null);
  if (parsed.length === 0) return { options: defaults, failed: true };
  const byId = new Map(parsed.map((item) => [item.id, item]));
  return {
    options: defaults.map((item) => byId.get(item.id) ?? item),
    failed: false,
  };
}

/** The list lives in the app. There is no goals table to query. */
export async function loadGoalCatalogue(): Promise<GoalOption[]> {
  return defaultGoalOptions();
}
