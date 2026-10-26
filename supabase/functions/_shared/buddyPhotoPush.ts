/** Lock-screen line for a buddy photo. No name, no caption, no preview. */
export const GENERIC_PHOTO_ALERT = 'New photo on Charioteer';

/** Shown next to the existing message-notification switch. There is no separate photo switch. */
export const PHOTO_ALERT_NOTE = `A buddy photo says ${GENERIC_PHOTO_ALERT}, with no name and no picture.`;

/** The sender-name switch is for a message. A photo alert never uses it. */
export const PHOTO_NAME_NOTE = 'Showing a name applies to a message. A photo alert never includes a name.';

/** Later photos for the same person fold into the alert already sent. */
export const PHOTO_PUSH_WINDOW_MS = 3 * 60 * 1000;

export type BuddyPhotoPushSkip = 'self' | 'blocked' | 'notifications' | 'unpublished' | 'closed' | 'age';

export type BuddyPhotoPushInput = {
  ownerId: string;
  recipientId: string;
  published: boolean;
  /** Accepted buddy pair, and the recipient has not hidden the photo. */
  stillBuddies: boolean;
  blocked: boolean;
  notificationsOn: boolean;
  ownerAdult: boolean;
  recipientAdult: boolean;
  /**
   * Kept on the input so a test can prove the alert never copies it.
   * The edge function passes an empty string and does not read the stored text.
   */
  caption: string;
  /** Kept on the input so a test can prove the alert never copies it. */
  senderName: string;
};

export type BuddyPhotoPush =
  | { ok: false; reason: BuddyPhotoPushSkip }
  | { ok: true; title: string; body: string; data: { sharedPhotos: true } };

/**
 * The alert for one published photo shared with one buddy.
 * The photo text and the sender's name are never copied into the title, the body, or the data.
 * The data flag only opens Shared Photos. It does not name a photo.
 */
export function buddyPhotoAlert(input: BuddyPhotoPushInput): BuddyPhotoPush {
  void input.caption;
  void input.senderName;
  if (input.ownerId === input.recipientId) return { ok: false, reason: 'self' };
  if (!input.published) return { ok: false, reason: 'unpublished' };
  if (!input.ownerAdult || !input.recipientAdult) return { ok: false, reason: 'age' };
  if (!input.stillBuddies) return { ok: false, reason: 'closed' };
  if (input.blocked) return { ok: false, reason: 'blocked' };
  if (!input.notificationsOn) return { ok: false, reason: 'notifications' };
  return {
    ok: true,
    title: 'Charioteer',
    body: GENERIC_PHOTO_ALERT,
    data: { sharedPhotos: true },
  };
}

/**
 * True when a non-folded alert was sent to this person inside the window.
 * The window is measured from that send. A folded row does not start a new window.
 */
export function photoPushCoalesced(lastSentAt: string | null, now: number): boolean {
  if (!lastSentAt) return false;
  const at = Date.parse(lastSentAt);
  if (Number.isNaN(at)) return false;
  return now - at < PHOTO_PUSH_WINDOW_MS;
}

/** A photo notification tap. Anything other than the boolean flag is ignored. */
export function sharedPhotosFrom(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  return (data as { sharedPhotos?: unknown }).sharedPhotos === true;
}
