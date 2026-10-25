import { formatUkCompactWhen } from './dates';

/** First time the sender opens the composer, and again above Send. */
export const SENDER_SAVE_NOTE =
  "Buddies you share with can save this photo to their phone. Deleting it in Charioteer won't remove a copy they've already saved.";

export const ALLOW_SAVE_LABEL = 'Allow buddies to save this photo';

export const AUTO_SAVE_LABEL = 'Automatically save photos I share to my photo library';

export const SCREENSHOT_NOTE = 'A screenshot cannot be stopped.';

export const SHARED_PHOTOS_LABEL = 'Shared Photos';

export const ONLY_CHOSEN_NOTE = 'Only the buddies you choose can see this. Not the Community.';

/**
 * Header camera sheet. Buddy and list stay on one line when the heading wraps.
 * The People card button stays "Share a photo".
 */
export const SHARE_PHOTO_SHEET_TITLE = 'Share a photo with your Buddy\u00A0list';

/** Quick-photo sheet. Off until the person ticks it. */
export const GRATITUDE_DIARY_TICK = 'Also save to my Gratitude diary';

export const GRATITUDE_ONLY_LABEL = 'No one, just save to Gratitude';

export const GRATITUDE_SAVED_LABEL = 'Saved to Gratitude';

/** Send when at least one buddy is included. Save when the photo goes to the diary only. */
export function sharePhotoButtonLabel(buddyCount: number, gratitude: boolean): 'Send' | 'Save' {
  return buddyCount === 0 && gratitude ? 'Save' : 'Send';
}

/** A named album needs a library read on this SDK, so Save does not create one. */
export const ALBUM_HONEST_NOTE =
  'A named Charioteer album cannot be created without reading your photo library. Save adds the photo to your library.';

export const CAMERA_USAGE =
  'Charioteer uses the camera for a private progress photo, or for a photo you choose to send to buddies. A progress photo stays private. A photo you send is shown only to the buddies you pick, not the Community, and it is not sent to the coach.';

export const LIBRARY_USAGE =
  'Charioteer uses your photo library so you can add a private progress photo, or choose a photo to send to buddies. A progress photo stays private. A photo you send is shown only to the buddies you pick, not the Community, and it is not sent to the coach.';

/** iOS add-only purpose. The app asks for this only when someone taps Save. */
export const SAVE_PHOTOS_USAGE =
  'Charioteer adds a photo to your photo library when you tap Save. It cannot create a separate Charioteer album without reading your other photos, so it does not. It never reads your other photos.';

/** 25 Oct 2026, 07:41. UK date, device time zone, 24-hour clock. */
export function sharedPhotoWhen(value: Date | string): string {
  return formatUkCompactWhen(value);
}

export type SharedPhotoCard = {
  id: string;
  mine: boolean;
  caption: string;
  createdAt: string;
  /** Missing means the sender left the default, which is on. */
  allowSave?: boolean;
  /** Sender names the recipients. A recipient names the sender. */
  buddyNames: readonly string[];
  buddyIds?: readonly string[];
  imageUrl?: string | null;
};

export function buddyMaySave(photo: { allowSave?: boolean }): boolean {
  return photo.allowSave !== false;
}

/** The device album is only filled in automatically for a photo this person sent, and only when they opted in. */
export function shouldAutoSaveToAlbum(input: { mine: boolean; autoSaveMine: boolean }): boolean {
  return input.mine === true && input.autoSaveMine === true;
}

function byNewest(a: SharedPhotoCard, b: SharedPhotoCard): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
  return a.id < b.id ? 1 : -1;
}

export function splitSharedPhotos(rows: readonly SharedPhotoCard[]): {
  sent: SharedPhotoCard[];
  received: SharedPhotoCard[];
} {
  const sent = rows.filter((row) => row.mine).slice().sort(byNewest);
  const received = rows.filter((row) => !row.mine).slice().sort(byNewest);
  return { sent, received };
}

/** Null keeps every photo. A name keeps a sent photo that includes that buddy, or a received photo from that buddy. */
export function filterSharedPhotos(rows: readonly SharedPhotoCard[], buddy: string | null): SharedPhotoCard[] {
  if (!buddy) return rows.slice();
  return rows.filter((row) => row.buddyNames.includes(buddy));
}
