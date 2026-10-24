/** This person has already seen the one-time message-notification explanation. */
export function messagePromptSeenIn(raw: string | null, userId: string): boolean {
  if (!raw || !userId) return false;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) && parsed.some((id) => id === userId);
  } catch {
    return false;
  }
}

export function withMessagePromptSeen(raw: string | null, userId: string): string {
  const seen = new Set<string>();
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        for (const id of parsed) {
          if (typeof id === 'string' && id) seen.add(id);
        }
      }
    } catch {
      // A damaged note starts again from this person.
    }
  }
  seen.add(userId);
  return JSON.stringify([...seen].slice(-40));
}
