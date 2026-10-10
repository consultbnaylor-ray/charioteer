/** Grey examples only. Nothing here is saved unless the person types it. */
export const REASON_PLACEHOLDERS = [
  'e.g. I want to be as healthy as I can be',
  'e.g. I want to be present for my family',
  'e.g. I want to wake up with a clear head',
] as const;

export function reasonPlaceholder(index: number): string {
  return REASON_PLACEHOLDERS[index] ?? 'e.g. In your own words';
}
