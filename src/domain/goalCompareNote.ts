/** Shown once, the first time a stats page names the goal the comparisons use. */
export const GOAL_COMPARE_NOTE = 'Comparisons use the goal you picked.';

export function goalCompareNoteSeenIn(raw: string | null, userId: string): boolean {
  if (!raw || !userId) return false;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return parsed?.[userId] === true;
  } catch {
    return false;
  }
}

export function withGoalCompareNoteSeen(raw: string | null, userId: string): string {
  let parsed: Record<string, boolean> = {};
  if (raw) {
    try {
      const value = JSON.parse(raw) as Record<string, boolean>;
      if (value && typeof value === 'object' && !Array.isArray(value)) parsed = value;
    } catch {
      parsed = {};
    }
  }
  if (userId) parsed[userId] = true;
  return JSON.stringify(parsed);
}
