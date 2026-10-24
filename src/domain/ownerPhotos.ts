/** Owner signed links for progress, profile, gratitude, vision, and meal photos. */
export const OWNER_PHOTO_URL_SECONDS = 3600;
/** Re-sign while a session stays open, well before a one-hour link can fail. */
export const OWNER_PHOTO_RESIGN_MS = 8 * 60 * 1000;
/**
 * Foreground and the eight-minute timer wait this long after a sign.
 * An image error does not use this gap. It asks for a fresh link on its own backoff.
 */
export const OWNER_PHOTO_RESIGN_GAP_MS = 15_000;
/** Waits before each fresh link after an image error, then the automatic tries stop. */
export const OWNER_PHOTO_ERROR_BACKOFF_MS = [1_000, 3_000, 8_000] as const;

/** Shown when a private photo still will not load. */
export const PHOTO_UNAVAILABLE = 'Photo unavailable';
/** Starts the fresh-link tries again after they have stopped. */
export const PHOTO_RETRY = 'Tap to retry';

/** True when the last owner sign is missing or more than about eight minutes ago. */
export function ownerPhotoUrlsStale(signedAt: number | null | undefined, now = Date.now()): boolean {
  if (signedAt == null || !Number.isFinite(signedAt)) return true;
  return now - signedAt > OWNER_PHOTO_RESIGN_MS;
}

/** True when a routine re-sign should wait because one just finished. Image errors skip this. */
export function ownerPhotoResignCooling(signedAt: number | null | undefined, now = Date.now()): boolean {
  if (signedAt == null || !Number.isFinite(signedAt)) return false;
  return now - signedAt < OWNER_PHOTO_RESIGN_GAP_MS;
}

/** Delay before the next fresh link, or null when the automatic tries are used. */
export function ownerPhotoErrorDelay(attempt: number): number | null {
  if (!Number.isInteger(attempt) || attempt < 0 || attempt >= OWNER_PHOTO_ERROR_BACKOFF_MS.length) return null;
  return OWNER_PHOTO_ERROR_BACKOFF_MS[attempt] ?? null;
}

/** The photo without its signed query, so a new token is still the same picture. */
export function ownerPhotoIdentity(uri: string | null | undefined): string {
  if (!uri) return '';
  const query = uri.indexOf('?');
  return query === -1 ? uri : uri.slice(0, query);
}

type FoodPreview = { id: string; userId: string; previewUrl: string | null };

/** Meal photos are stored as the account id, the meal id, and .jpg. */
export function foodPhotoStoragePath(userId: string, id: string): string {
  return `${userId}/${id}.jpg`;
}

/** New meal photo links. A meal with no photo is left as it is. */
export function withSignedFoodPhotos<T extends FoodPreview>(logs: readonly T[], signed: ReadonlyMap<string, string>): T[] {
  let changed = false;
  const next = logs.map((log) => {
    if (!log.previewUrl) return log;
    const url = signed.get(foodPhotoStoragePath(log.userId, log.id));
    if (!url || url === log.previewUrl) return log;
    changed = true;
    return { ...log, previewUrl: url };
  });
  return changed ? next : (logs as T[]);
}

type SignedPhoto = { storagePath: string; previewUrl: string | null };

/** New preview URLs by storage path. The same array comes back when nothing changed. */
export function withSignedPreviewUrls<T extends SignedPhoto>(items: readonly T[], signed: ReadonlyMap<string, string>): T[] {
  let changed = false;
  const next = items.map((item) => {
    const url = signed.get(item.storagePath);
    if (!url || url === item.previewUrl) return item;
    changed = true;
    return { ...item, previewUrl: url };
  });
  return changed ? next : (items as T[]);
}

type EntryWithPhotos = { photos: readonly SignedPhoto[] };

/** Patches photo links on diary lines and leaves every other field as it is. */
export function withSignedGratitudePhotos<T extends EntryWithPhotos>(entries: readonly T[], signed: ReadonlyMap<string, string>): T[] {
  let changed = false;
  const next = entries.map((entry) => {
    const photos = withSignedPreviewUrls(entry.photos, signed);
    if (photos === entry.photos) return entry;
    changed = true;
    return { ...entry, photos };
  });
  return changed ? next : (entries as T[]);
}
