/** How many messages the Thumos screen shows before “Show earlier messages”. */
export const THUMOS_VISIBLE = 6;

/** One tap reveals the rest of the thread. */
export const THUMOS_EXPANDED = Number.MAX_SAFE_INTEGER;

/** A bubble past this many lines is truncated until More. */
export const THUMOS_LINE_CAP = 6;

/**
 * Rough line count for a bubble about 80% of a phone width at 15px.
 * 32 characters is a narrow phone, so a message that is long there is long everywhere.
 */
export function messageNeedsMore(text: string, charsPerLine = 32): boolean {
  if (!text.trim()) return false;
  let lines = 0;
  for (const paragraph of text.split('\n')) {
    const length = paragraph.trim().length;
    lines += length === 0 ? 1 : Math.ceil(length / charsPerLine);
  }
  return lines > THUMOS_LINE_CAP;
}

export function latestThumos<T>(messages: readonly T[], limit: number): { visible: T[]; earlier: number } {
  const cap = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : THUMOS_VISIBLE;
  if (messages.length <= cap) return { visible: [...messages], earlier: 0 };
  return {
    visible: messages.slice(messages.length - cap),
    earlier: messages.length - cap,
  };
}
