/** Owner signed links for progress, profile, gratitude, and vision photos. */
export const OWNER_PHOTO_URL_SECONDS = 3600;
/** Re-sign while a session stays open, well before a one-hour link can fail. */
export const OWNER_PHOTO_RESIGN_MS = 8 * 60 * 1000;
/**
 * A failed image asks for a new link at once. Ignore a second request this soon
 * after the last sign, so a missing file cannot sign in a loop.
 */
export const OWNER_PHOTO_RESIGN_GAP_MS = 15_000;

/** True when the last owner sign is missing or more than about eight minutes ago. */
export function ownerPhotoUrlsStale(signedAt: number | null | undefined, now = Date.now()): boolean {
  if (signedAt == null || !Number.isFinite(signedAt)) return true;
  return now - signedAt > OWNER_PHOTO_RESIGN_MS;
}

/** True when a forced re-sign should wait because one just finished. */
export function ownerPhotoResignCooling(signedAt: number | null | undefined, now = Date.now()): boolean {
  if (signedAt == null || !Number.isFinite(signedAt)) return false;
  return now - signedAt < OWNER_PHOTO_RESIGN_GAP_MS;
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
