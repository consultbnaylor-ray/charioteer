import type { GratitudeEntry, GratitudePhoto } from '../../supabase/functions/_shared/gratitude.ts';

/** Private bucket. Objects live at {user_id}/{photo_id}.jpg and are never shared. */
export const GRATITUDE_BUCKET = 'gratitude-photos';
export const GRATITUDE_PHOTO_LIMIT = 4;
export const GRATITUDE_MAX_BYTES = 2_097_152;
/** Owner signed links only. There is no community TTL. */
export const GRATITUDE_SIGNED_URL_SECONDS = 600;

/** Owner folder only. The file name is the photo id. */
export function gratitudeStoragePath(userId: string, photoId: string): string {
  const id = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!id.test(userId) || !id.test(photoId)) throw new Error('Could not store that photo.');
  return `${userId}/${photoId}.jpg`;
}

/** Null when another photo still fits. Four is the limit for one line. */
export function gratitudePhotoLimitMessage(count: number): string | null {
  if (count >= GRATITUDE_PHOTO_LIMIT) return 'Four photos is the limit for one line.';
  return null;
}

export function gratitudePhotosFromRows(rows: unknown): GratitudePhoto[] {
  if (!Array.isArray(rows)) return [];
  const photos: GratitudePhoto[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const record = row as Record<string, unknown>;
    const id = record.id == null ? '' : String(record.id);
    const entryId = record.entry_id == null ? '' : String(record.entry_id);
    const storagePath = typeof record.storage_path === 'string' ? record.storage_path : '';
    if (!id || !entryId || !storagePath || storagePath.includes('..')) continue;
    photos.push({
      id,
      entryId,
      storagePath,
      createdAt: String(record.created_at ?? ''),
      previewUrl: null,
      caption: typeof record.caption === 'string' ? record.caption : '',
    });
  }
  return photos;
}

/** Attaches owner photos. A photo whose line is missing is dropped. */
export function withGratitudePhotos(entries: readonly GratitudeEntry[], photos: readonly GratitudePhoto[]): GratitudeEntry[] {
  const byEntry = new Map<string, GratitudePhoto[]>();
  for (const photo of photos) {
    const list = byEntry.get(photo.entryId) ?? [];
    list.push(photo);
    byEntry.set(photo.entryId, list);
  }
  return entries.map((entry) => ({
    ...entry,
    photos: (byEntry.get(entry.id) ?? []).sort(byPhotoOrder),
  }));
}

function byPhotoOrder(a: GratitudePhoto, b: GratitudePhoto): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return a.id < b.id ? -1 : 1;
}
