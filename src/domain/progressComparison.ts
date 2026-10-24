export type ComparisonChoice = {
  beforeId: string;
  nowId: string;
};

export type ComparisonPhoto = {
  id: string;
  monthIndex: number;
  takenOn: string;
  createdAt: string;
};

export function sortProgressPhotos<T extends ComparisonPhoto>(photos: T[]): T[] {
  return [...photos].sort((a, b) => a.monthIndex - b.monthIndex || a.takenOn.localeCompare(b.takenOn) || a.createdAt.localeCompare(b.createdAt));
}

/** Before is the starting point, or the earliest photo. Now is the latest. */
export function defaultComparison(photos: ComparisonPhoto[]): ComparisonChoice | null {
  const ordered = sortProgressPhotos(photos);
  if (ordered.length < 2) return null;
  const before = ordered.find((photo) => photo.monthIndex <= 0) ?? ordered[0];
  const now = ordered[ordered.length - 1];
  return { beforeId: before.id, nowId: now.id };
}

/** A stored id is kept only while that photo still exists. */
export function resolveComparison(photos: ComparisonPhoto[], stored: Partial<ComparisonChoice> | null): ComparisonChoice | null {
  const fallback = defaultComparison(photos);
  if (!fallback) return null;
  const ids = new Set(photos.map((photo) => photo.id));
  return {
    beforeId: stored?.beforeId && ids.has(stored.beforeId) ? stored.beforeId : fallback.beforeId,
    nowId: stored?.nowId && ids.has(stored.nowId) ? stored.nowId : fallback.nowId,
  };
}
