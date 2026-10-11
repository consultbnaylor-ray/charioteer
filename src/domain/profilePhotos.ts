import { progressStoragePath } from './progressPhotos';

export const PROFILE_PHOTO_BUCKET = 'profile-photos';
export const PROFILE_GALLERY_LIMIT = 6;
export const PROFILE_GALLERY_LIMIT_MESSAGE = 'Six profile photos is the limit.';
export const PROFILE_SIGNED_URL_SECONDS = 600;
/** Other people only receive a URL this short. Turning Community off stops new ones. */
export const PROFILE_SHARED_URL_SECONDS = 60;

/** Shown in Edit profile and in the community consent. */
export const PROFILE_PHOTO_WORDING =
  'A profile picture and profile gallery are shown to signed-in community members while Community is on. They can report a photo.';

export type ProfilePhotoRole = 'avatar' | 'gallery';

/** Centre square, in source pixels. An already-square photo needs no crop. */
export function profileSquareCrop(
  width: number,
  height: number,
): { originX: number; originY: number; width: number; height: number } | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 2 || height < 2) return null;
  const side = Math.floor(Math.min(width, height));
  if (side < 1 || width === height) return null;
  return {
    originX: Math.floor((width - side) / 2),
    originY: Math.floor((height - side) / 2),
    width: side,
    height: side,
  };
}

/** Two letters from the name. A missing name is a question mark. */
export function profileInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  const first = parts[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1] ?? '') : '';
  const letters = (last ? `${first.slice(0, 1)}${last.slice(0, 1)}` : first.slice(0, 2)).toUpperCase();
  return letters || '?';
}

/** Owner folder only. The file name is the photo id. */
export function profileStoragePath(userId: string, photoId: string): string {
  return progressStoragePath(userId, photoId);
}

export function sortProfilePhotos<T extends { role: string; position: number; createdAt?: string }>(photos: readonly T[]): T[] {
  return [...photos].sort((a, b) => {
    const role = (a.role === 'avatar' ? 0 : 1) - (b.role === 'avatar' ? 0 : 1);
    if (role !== 0) return role;
    if (a.position !== b.position) return a.position - b.position;
    return (a.createdAt ?? '').localeCompare(b.createdAt ?? '');
  });
}

/** Swap a gallery photo with its neighbour and renumber from zero. Null when it cannot move. */
export function nextGalleryPositions(
  photos: readonly { id: string; position: number }[],
  id: string,
  direction: 'up' | 'down',
): { id: string; position: number }[] | null {
  const ordered = [...photos].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  const index = ordered.findIndex((photo) => photo.id === id);
  if (index < 0) return null;
  const swap = direction === 'up' ? index - 1 : index + 1;
  if (swap < 0 || swap >= ordered.length) return null;
  const next = ordered.slice();
  const current = next[index];
  const neighbor = next[swap];
  if (!current || !neighbor) return null;
  next[index] = neighbor;
  next[swap] = current;
  return next.map((photo, position) => ({ id: photo.id, position }));
}
