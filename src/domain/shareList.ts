/** How many rows a collapsed share list reveals each time it is asked for more. */
export const SHARE_LIST_PAGE = 10;

/** Collapsed row. The chevron stays on the end, including before the list is opened. */
export function shareListLabel(title: string, shared: number, total: number): string {
  return `${title} — ${shared} shared of ${total}  ›`;
}

/** Newest stamp first. Equal stamps fall back to id so the order stays stable. */
export function compareNewest(a: { stamp: string; id: string }, b: { stamp: string; id: string }): number {
  if (a.stamp !== b.stamp) return a.stamp < b.stamp ? 1 : -1;
  return a.id < b.id ? 1 : -1;
}

export function visibleShareCount(shown: number, total: number, page = SHARE_LIST_PAGE): number {
  const start = Math.min(page, Math.max(0, total));
  return Math.min(Math.max(0, total), Math.max(start, shown));
}

export function shareListHasMore(shown: number, total: number): boolean {
  return shown < total;
}
