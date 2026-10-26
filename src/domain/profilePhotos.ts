import { progressStoragePath } from './progressPhotos';

export const PROFILE_PHOTO_BUCKET = 'profile-photos';
/**
 * How many gallery photos the public profile front shows.
 * This is a display slice. Storage has no count limit.
 */
export const PUBLIC_PROFILE_FRONT_COUNT = 6;
/** Thumbs loaded at one time in the library and in Edit profile. */
export const PROFILE_GALLERY_PAGE = 12;
export const SEE_ALL_PHOTOS = 'See all photos';
export const LOAD_MORE_PHOTOS = 'Load more';
export const PROFILE_LIBRARY_TITLE = 'Public photos';
export const PROFILE_GALLERY_HINT =
  'Add as many as you like. Your public profile shows the first photos, in this order. See all photos opens the rest.';
export const PROFILE_LIBRARY_INTRO =
  'These photos are on your public profile, in the order you set. Any Charioteer community member can see them while Community is on.';
export const PROFILE_LIBRARY_CLOSED =
  'Community is off, so other people cannot see these yet.';
/** Owner links. Other people still receive the short shared lifetime below. */
export const PROFILE_SIGNED_URL_SECONDS = 3600;
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

/** One letter from the name, so it can sit centred in the circle. A missing name is a question mark. */
export function profileInitials(name: string): string {
  const first = name.trim().split(/\s+/).filter(Boolean)[0] ?? '';
  const letter = first.slice(0, 1).toUpperCase();
  return letter || '?';
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

/** Gallery photos in the order the owner set. A new photo is placed at the front. */
export function galleryInChosenOrder<T extends { role: string; position: number; createdAt?: string }>(photos: readonly T[]): T[] {
  return sortProfilePhotos(photos).filter((photo) => photo.role === 'gallery');
}

/** The photos drawn on the public profile itself. The rest stay behind See all photos. */
export function profileFrontPhotos<T extends { role: string; position: number; createdAt?: string }>(photos: readonly T[]): T[] {
  return galleryInChosenOrder(photos).slice(0, PUBLIC_PROFILE_FRONT_COUNT);
}

/** True only when the front cannot show every gallery photo. */
export function profileGalleryNeedsLibrary(count: number): boolean {
  return count > PUBLIC_PROFILE_FRONT_COUNT;
}

/** Two columns on a narrow phone, three when there is room. */
export function galleryColumnCount(windowWidth: number): number {
  return windowWidth < 360 ? 2 : 3;
}

/**
 * Paths to sign now. The profile picture and the first library page always qualify.
 * A photo that already has a link is signed again. The rest wait until they are opened.
 */
export function profilePhotoSignPaths<T extends { role: string; position: number; createdAt?: string; storagePath: string; previewUrl: string | null }>(
  photos: readonly T[],
): string[] {
  const ordered = sortProfilePhotos(photos);
  const chosen = new Set<T>();
  for (const photo of ordered) {
    if (photo.role === 'avatar') chosen.add(photo);
  }
  const gallery = ordered.filter((photo) => photo.role === 'gallery');
  for (const photo of gallery.slice(0, PROFILE_GALLERY_PAGE)) chosen.add(photo);
  for (const photo of gallery) {
    if (photo.previewUrl) chosen.add(photo);
  }
  const paths: string[] = [];
  for (const photo of chosen) {
    if (!photo.storagePath || photo.storagePath.includes('..') || paths.includes(photo.storagePath)) continue;
    paths.push(photo.storagePath);
  }
  return paths;
}

/**
 * A new gallery photo takes the front. The photos already there move back one place.
 * Nothing is removed.
 */
export function galleryPositionsAfterAdd(
  gallery: readonly { id: string; position: number }[],
): { id: string; position: number }[] {
  return [...gallery]
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
    .map((photo, index) => ({ id: photo.id, position: index + 1 }));
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
