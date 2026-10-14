/** How long Not now hides the People prompt. A later visit can show it again. */
export const COMMUNITY_PROMPT_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

export function communityPromptSnoozed(raw: string | null, userId: string, now: number): boolean {
  if (!raw || !userId) return false;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const until = parsed?.[userId];
    return typeof until === 'number' && Number.isFinite(until) && until > now;
  } catch {
    return false;
  }
}

export function withCommunityPromptSnooze(raw: string | null, userId: string, now: number): string {
  let parsed: Record<string, number> = {};
  if (raw) {
    try {
      const value = JSON.parse(raw) as Record<string, unknown>;
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        for (const [id, until] of Object.entries(value)) {
          if (typeof until === 'number' && Number.isFinite(until)) parsed[id] = until;
        }
      }
    } catch {
      parsed = {};
    }
  }
  parsed[userId] = now + COMMUNITY_PROMPT_SNOOZE_MS;
  return JSON.stringify(parsed);
}
