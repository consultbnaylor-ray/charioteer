import { isoDay, parseIsoDay, startOfLocalDay } from './dates';

export const PROGRESS_BUCKET = 'progress-photos';
export const PROGRESS_MAX_EDGE = 1600;
export const PROGRESS_JPEG_QUALITY = 0.8;
export const PROGRESS_MAX_BYTES = 2_097_152;
export const PROGRESS_NOTE_LIMIT = 280;
export const PROGRESS_SIGNED_URL_SECONDS = 600;
/** Other people only ever receive a URL this short. Unsharing or deletion stops new ones at once. */
export const PROGRESS_SHARED_URL_SECONDS = 60;
export const PROGRESS_SHARE_WARNING = 'Anyone in the Charioteer community will be able to see this photo';

export type ProgressVisibility = 'private' | 'community';

/** Anything other than an explicit community share stays private. */
export function progressVisibility(value: unknown): ProgressVisibility {
  return value === 'community' ? 'community' : 'private';
}

export type ProgressPlan =
  | { ok: true; takenOn: string; monthIndex: number; note: string; label: string }
  | { ok: false; message: string };

/** The sober date when there is one, otherwise the day the account was created. */
export function progressAnchor(sobrietyStartedAt: string | null, createdAt: string | null, now = new Date()): Date {
  if (sobrietyStartedAt) return new Date(sobrietyStartedAt);
  if (createdAt) return new Date(createdAt);
  return now;
}

/**
 * Month 1 is the calendar month of the anchor. A starting-point photo, and any
 * photo taken before that month, is month 0.
 */
export function progressMonthIndex(anchor: Date, takenOn: string, startingPoint: boolean): number {
  if (startingPoint) return 0;
  const taken = parseIsoDay(takenOn);
  const start = startOfLocalDay(anchor);
  const months = (taken.getFullYear() - start.getFullYear()) * 12 + (taken.getMonth() - start.getMonth()) + 1;
  return months < 1 ? 0 : months;
}

export function progressPhotoLabel(monthIndex: number, takenOn: string): string {
  if (monthIndex <= 0) return 'Starting point';
  const date = parseIsoDay(takenOn);
  const month = date.toLocaleDateString('en-GB', { month: 'short' });
  const year = date.toLocaleDateString('en-GB', { year: 'numeric' });
  return `Month ${monthIndex} · ${month} ${year}`;
}

export function planProgressPhoto(input: {
  takenOn: string;
  startingPoint: boolean;
  note: string;
  anchor: Date;
  today?: string;
}): ProgressPlan {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.takenOn)) return { ok: false, message: 'Choose a date for the photo.' };
  const today = input.today ?? isoDay(new Date());
  if (input.takenOn > today) return { ok: false, message: 'Choose today or an earlier day.' };
  const note = input.note.trim().replace(/\s+/g, ' ');
  if (note.length > PROGRESS_NOTE_LIMIT) return { ok: false, message: 'Keep the note to 280 characters.' };
  const monthIndex = progressMonthIndex(input.anchor, input.takenOn, input.startingPoint);
  return { ok: true, takenOn: input.takenOn, monthIndex, note, label: progressPhotoLabel(monthIndex, input.takenOn) };
}

/** Downscale only. A shorter edge stays as it is so a small photo is not enlarged. */
export function progressResize(width: number, height: number): { width: number } | { height: number } | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  if (Math.max(width, height) <= PROGRESS_MAX_EDGE) return null;
  return width >= height ? { width: PROGRESS_MAX_EDGE } : { height: PROGRESS_MAX_EDGE };
}

/** Owner folder only. The file name is the photo id, so one row cannot point at another person's object. */
export function progressStoragePath(userId: string, photoId: string): string {
  const id = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!id.test(userId) || !id.test(photoId)) throw new Error('Could not store that photo.');
  return `${userId}/${photoId}.jpg`;
}
