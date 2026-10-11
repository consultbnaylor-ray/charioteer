import type { DirectoryCard, Profile } from '@/data/types';

/** Next selected ids. Adding or removing an id that is already in that state returns a copy. */
export function nextInterestIds(current: readonly string[], interestId: string, selected: boolean): string[] {
  const has = current.includes(interestId);
  if (selected) return has ? [...current] : [...current, interestId];
  return has ? current.filter((id) => id !== interestId) : [...current];
}

/** Same members, ignoring order. Used to decide whether a failed save may roll back. */
export function interestSelectionUnchanged(current: readonly string[], expected: readonly string[]): boolean {
  if (current.length !== expected.length) return false;
  const seen = new Set(current);
  return expected.every((id) => seen.has(id));
}

/**
 * Restore the previous selection only when nothing newer has replaced the optimistic one.
 * A later tap keeps its own ids.
 */
export function rolledBackInterestIds(
  current: readonly string[],
  optimistic: readonly string[],
  previous: readonly string[],
): string[] {
  return interestSelectionUnchanged(current, optimistic) ? [...previous] : [...current];
}

/** Recompute “in common” and put the closest matches first, the same order People uses. */
export function directoryWithOwnInterests(directory: readonly DirectoryCard[], ownIds: readonly string[]): DirectoryCard[] {
  const mine = new Set(ownIds);
  return directory
    .map((card) => ({
      ...card,
      sharedInterestIds: card.interestIds.filter((id) => mine.has(id)),
    }))
    .sort((a, b) => b.sharedInterestIds.length - a.sharedInterestIds.length || a.displayName.localeCompare(b.displayName));
}

type InterestSnapshot = {
  profile: Profile | null;
  directory: DirectoryCard[];
};

/** Profile selection plus People matching, without waiting for a full reload. */
export function snapshotWithOwnInterests<T extends InterestSnapshot>(snapshot: T, interestIds: readonly string[]): T {
  const ids = [...interestIds];
  return {
    ...snapshot,
    profile: snapshot.profile ? { ...snapshot.profile, interestIds: ids } : null,
    directory: directoryWithOwnInterests(snapshot.directory, ids),
  };
}
