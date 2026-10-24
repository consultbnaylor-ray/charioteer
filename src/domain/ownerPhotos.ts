/** Owner signed links for progress, profile, gratitude, vision, and meal photos. */
export const OWNER_PHOTO_URL_SECONDS = 3600;
/** Re-sign while a session stays open, well before a one-hour link can fail. */
export const OWNER_PHOTO_RESIGN_MS = 8 * 60 * 1000;
/**
 * Foreground and the eight-minute timer wait this long after a sign.
 * An image error does not use this gap. It asks for a fresh link on its own backoff.
 */
export const OWNER_PHOTO_RESIGN_GAP_MS = 15_000;
/**
 * Waits before the second and third load. Three tries, about ten seconds, then the automatic tries stop.
 * The first failure is the only one that asks for a new signed URL.
 */
export const OWNER_PHOTO_ERROR_BACKOFF_MS = [2_000, 8_000] as const;

/** How many ids one profile-photo-url call accepts. Owner storage signs use the same size. */
export const SIGNED_URL_BATCH = 24;

/** Shown while a link or the file is still on its way. */
export const PHOTO_LOADING = 'Loading photo…';
/** Shown when a private photo still will not load after the automatic tries. */
export const PHOTO_UNAVAILABLE = "Couldn't load this photo yet";
/** Starts the fresh-link tries again after they have stopped. */
export const PHOTO_RETRY = 'Tap to retry';

/** Refresh the signed URL on the first failure only. Later tries reuse that link. */
export function shouldRefreshSignedUrl(attempt: number): boolean {
  return attempt === 0;
}

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

/** Delay before the next load, or null when the three tries are used up. */
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

const SIGNED_OBJECT = /\/object\/sign\/([^/?]+)\/([^?]+)/;

/** Bucket and object path inside a Supabase signed URL. A data URL has neither. */
export function signedStorageRef(uri: string | null | undefined): { bucket: string; path: string } | null {
  if (!uri || uri.startsWith('data:')) return null;
  const match = SIGNED_OBJECT.exec(uri);
  if (!match?.[1] || !match[2]) return null;
  let bucket = match[1];
  let path = match[2];
  try {
    bucket = decodeURIComponent(bucket);
    path = decodeURIComponent(path);
  } catch {
    return null;
  }
  if (!bucket || !path || path.includes('..')) return null;
  return { bucket, path };
}

/**
 * Stable image cache key. A photo id wins. Otherwise the object path, which does not include the token.
 */
export function signedPhotoCacheKey(uri: string | null | undefined, photoId?: string | null): string {
  const id = photoId?.trim();
  if (id) return id;
  const ref = signedStorageRef(uri);
  if (ref) return `${ref.bucket}/${ref.path}`;
  return ownerPhotoIdentity(uri) || 'photo';
}

function decodeBase64Url(value: string): string {
  const pad = value.length % 4 === 0 ? '' : '='.repeat(4 - (value.length % 4));
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/') + pad;
  if (typeof globalThis.atob !== 'function') return '';
  try {
    return globalThis.atob(base64);
  } catch {
    return '';
  }
}

/** Expiry of a signed URL, in milliseconds, when the token says when it ends. */
export function signedUrlExpiryMs(uri: string | null | undefined): number | null {
  if (!uri || uri.startsWith('data:')) return null;
  const token = /[?&]token=([^&]+)/.exec(uri)?.[1] ?? '';
  const payload = token.split('.')[1] ?? '';
  if (!payload) return null;
  try {
    const parsed = JSON.parse(decodeBase64Url(payload)) as { exp?: unknown };
    return typeof parsed.exp === 'number' && Number.isFinite(parsed.exp) ? parsed.exp * 1000 : null;
  } catch {
    return null;
  }
}

/**
 * True when this link can still be shown. A data URL is already the picture.
 * An unreadable token is treated as finished, so it is signed again.
 */
export function signedUrlStillValid(uri: string | null | undefined, now = Date.now()): boolean {
  if (!uri) return false;
  if (uri.startsWith('data:')) return true;
  const expiry = signedUrlExpiryMs(uri);
  if (expiry == null) return false;
  return expiry - now > 60_000;
}

/** Paths whose link is missing or due to expire. A live link is left as it is. */
export function storagePathsToSign<T extends { storagePath: string; previewUrl: string | null }>(
  items: readonly T[],
  now = Date.now(),
): string[] {
  const paths: string[] = [];
  for (const item of items) {
    if (!item.storagePath || item.storagePath.includes('..')) continue;
    if (signedUrlStillValid(item.previewUrl, now)) continue;
    paths.push(item.storagePath);
  }
  return [...new Set(paths)];
}

/** Groups ids so one failed call cannot drop the rest. */
export function chunkList<T>(items: readonly T[], size = SIGNED_URL_BATCH): T[][] {
  const count = Number.isInteger(size) && size > 0 ? size : SIGNED_URL_BATCH;
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += count) chunks.push(items.slice(index, index + count));
  return chunks;
}

/**
 * Keeps links that a failed batch did not return.
 * A successful URL replaces the one already held for that id.
 */
export function mergeSignedUrls(
  kept: ReadonlyMap<string, string>,
  fetched: ReadonlyMap<string, string> | null,
): Map<string, string> {
  const next = new Map(kept);
  if (!fetched) return next;
  for (const [key, url] of fetched) {
    if (key && url) next.set(key, url);
  }
  return next;
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
