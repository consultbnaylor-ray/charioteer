/** How many messages the Thumos screen shows before “Show earlier”. */
export const THUMOS_VISIBLE = 20;

export function latestThumos<T>(messages: readonly T[], limit: number): { visible: T[]; earlier: number } {
  const cap = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : THUMOS_VISIBLE;
  if (messages.length <= cap) return { visible: [...messages], earlier: 0 };
  return {
    visible: messages.slice(messages.length - cap),
    earlier: messages.length - cap,
  };
}
