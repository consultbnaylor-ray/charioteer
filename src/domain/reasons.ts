/** Matches the reasons.body check. A longer line is refused before it is saved. */
export const REASON_MAX_LENGTH = 280;

/**
 * Trim blanks, drop empty lines, and keep the first of each case-insensitive reason.
 * Order is the order the person typed. This does not throw: the save checks length.
 */
export function planReasons(bodies: readonly string[]): string[] {
  const planned: string[] = [];
  const seen = new Set<string>();
  for (const body of bodies) {
    const clean = body.trim();
    if (!clean) continue;
    const key = clean.toLocaleLowerCase('en-GB');
    if (seen.has(key)) continue;
    seen.add(key);
    planned.push(clean);
  }
  return planned;
}

export function reasonOverLimit(bodies: readonly string[]): boolean {
  return planReasons(bodies).some((body) => body.length > REASON_MAX_LENGTH);
}

/** Grey examples only. Nothing here is saved unless the person types it. */
export const REASON_PLACEHOLDERS = [
  'e.g. I want to be as healthy as I can be',
  'e.g. I want to be present for my family',
  'e.g. I want to wake up with a clear head',
] as const;

export function reasonPlaceholder(index: number): string {
  return REASON_PLACEHOLDERS[index] ?? 'e.g. In your own words';
}
