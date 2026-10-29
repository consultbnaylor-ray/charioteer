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

/** Quick-photo sheet. Starts off every time the sheet opens. It is not remembered. */
export const ALSO_ON_PUBLIC_PROFILE = 'Also show on my public profile';

/** Under that switch. Public is the community, not the buddy list and not the diary. */
export const PUBLIC_PROFILE_MEANS =
  'Public means any Charioteer community member can see this photo. This is separate from the buddies you send it to, and separate from Gratitude.';

export const PUBLIC_PROFILE_CLOSED =
  'Your public profile is off, so this photo cannot be shown there yet.';

export const PUBLIC_PROFILE_TURN_ON = 'Turn on my public profile';

export const PUBLIC_PROFILE_SHOWN = 'Shown on your public profile.';

/** Send when at least one buddy is included. Save when the photo stays with you. */
export function sharePhotoButtonLabel(buddyCount: number, gratitude: boolean, onProfile = false): 'Send' | 'Save' {
  if (buddyCount > 0) return 'Send';
  if (gratitude || onProfile) return 'Save';
  return 'Send';
}

/** True when the sheet has nowhere to put the photo yet. */
export function quickShareNeedsDestination(input: { buddyCount: number; gratitude: boolean; onProfile: boolean }): boolean {
  return input.buddyCount === 0 && !input.gratitude && !input.onProfile;
}

/** Shown once, after Save to Photos succeeds. Not a standing paragraph. */
export const SAVED_TO_LIBRARY = 'Saved to your photo library.';

/** Shown once, after Save to Gratitude copies the file into this person's diary. */
export const SAVED_TO_GRATITUDE = 'Saved to Gratitude.';

/** Used when the shared photo has no caption. A gratitude line cannot be blank. */
export const SAVED_FROM_SHARED_PHOTO = 'Saved from a shared photo.';

/** The diary line. A caption is kept. A blank caption gets the short fallback. */
export function gratitudeLineFromSharedCaption(caption: string): string {
  const text = caption.trim().slice(0, 1000);
  return text || SAVED_FROM_SHARED_PHOTO;
}

export const CAMERA_USAGE =
  'Charioteer uses the camera for a progress photo, a gratitude photo, a vision board photo, a profile or gallery photo, a photo you send to buddies, or a meal photo. A meal photo may be analysed by the AI coach when you ask for a photo estimate.';

export const LIBRARY_USAGE =
  'Charioteer uses your photo library so you can choose a progress photo, a gratitude photo, a vision board photo, a profile or gallery photo, a photo to send to buddies, or a meal photo. A meal photo may be analysed by the AI coach when you ask for a photo estimate.';

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
