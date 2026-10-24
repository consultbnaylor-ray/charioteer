function wholeNumber(value: unknown, min: number, max: number): number | null {
  const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  if (!Number.isFinite(number)) return null;
  const rounded = Math.round(number);
  if (rounded < min || rounded > max) return null;
  return rounded;
}

/**
 * Mood on a 1–10 scale.
 * A stored mood_10 score is used as it is.
 * A leftover 1–5 score is doubled, so 4 becomes 8.
 * A value already between 6 and 10, with no mood_10, is left alone.
 */
export function moodOnTen(legacy: unknown, storedTen?: unknown): number {
  const ten = wholeNumber(storedTen, 1, 10);
  if (ten != null) return ten;
  const old = wholeNumber(legacy, 1, 5);
  if (old != null) return old * 2;
  const widened = wholeNumber(legacy, 1, 10);
  if (widened != null) return widened;
  return 5;
}
