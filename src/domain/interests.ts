import type { DirectoryCard, Profile } from '@/data/types';

/** Catalogue chips, alphabetical. Fitness stays, alongside nights in, films, and travel. */
export const DEFAULT_INTERESTS = [
  { slug: 'comedy', label: 'Comedy' },
  { slug: 'cozy-nights-in', label: 'Cozy Nights In' },
  { slug: 'exercise', label: 'Exercise' },
  { slug: 'films', label: 'Films' },
  { slug: 'gym', label: 'Gym' },
  { slug: 'health-and-fitness', label: 'Health and Fitness' },
  { slug: 'hiking', label: 'Hiking' },
  { slug: 'sober-nights-out', label: 'Sober Nights Out' },
  { slug: 'travel', label: 'Travel' },
  { slug: 'tv-series', label: 'TV Series' },
] as const;

export function normaliseInterestName(label: string): string {
  return label.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** A catalogue name, including a custom row Ben already created with the same name or slug. */
export function isDefaultInterest(interest: { slug: string; label: string }): boolean {
  const name = normaliseInterestName(interest.label);
  return DEFAULT_INTERESTS.some((item) => item.slug === interest.slug || normaliseInterestName(item.label) === name);
}

/** Defaults stay on the list. Anything else is shown only while the person has chosen it. */
export function interestChipVisible(interest: { slug: string; label: string }, selected: boolean): boolean {
  return isDefaultInterest(interest) || selected;
}

/** The × is for a person’s own interest. A default chip toggles and stays available. */
export function interestChipRemovable(interest: { slug: string; label: string; custom: boolean }): boolean {
  return interest.custom && !isDefaultInterest(interest);
}

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
