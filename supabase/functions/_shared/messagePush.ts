/** Shown when the recipient has not chosen to include the sender's name. */
export const GENERIC_MESSAGE_ALERT = 'New message on Charioteer';

/** Edit Profile. On means the stored message_notifications preference is off. */
export const TURN_OFF_MESSAGE_NOTIFICATIONS = 'Turn off Message Notifications (messages from other users)';

/** The Edit Profile switch and the Notifications switch write the same column. */
export function notificationsOnFromTurnOff(turnedOff: boolean): boolean {
  return !turnedOff;
}

export type MessagePushSkip = 'self' | 'blocked' | 'community' | 'notifications' | 'closed';

export type MessagePushInput = {
  senderId: string;
  recipientId: string;
  connectionId: string;
  connectionAccepted: boolean;
  /** Kept on the input so a test can prove the alert never copies it. */
  messageBody: string;
  recipientCommunityOn: boolean;
  senderCommunityOn: boolean;
  blocked: boolean;
  notificationsOn: boolean;
  showSenderName: boolean;
  senderName: string;
};

export type MessagePush =
  | { ok: false; reason: MessagePushSkip }
  | { ok: true; title: string; body: string; data: { connectionId: string } };

/** Community is on only when the profile is visible and the person is 18. */
export function communityOn(visible: boolean, adult: boolean): boolean {
  return visible && adult;
}

/** Drops line breaks so a name cannot carry another line of text. */
export function pushSenderName(name: string): string {
  return name.replace(/[\r\n\t]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
}

/**
 * The alert for one new private message.
 * The message text is never copied into the title, the body, or the data.
 */
export function messageAlert(input: MessagePushInput): MessagePush {
  if (input.senderId === input.recipientId) return { ok: false, reason: 'self' };
  if (!input.connectionAccepted) return { ok: false, reason: 'closed' };
  if (input.blocked) return { ok: false, reason: 'blocked' };
  if (!input.recipientCommunityOn || !input.senderCommunityOn) return { ok: false, reason: 'community' };
  if (!input.notificationsOn) return { ok: false, reason: 'notifications' };
  const name = pushSenderName(input.senderName);
  const body = input.showSenderName && name ? `New message from ${name}` : GENERIC_MESSAGE_ALERT;
  return {
    ok: true,
    title: 'Charioteer',
    body,
    data: { connectionId: input.connectionId },
  };
}

const CONNECTION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The chat id carried on a notification tap. Anything else is ignored. */
export function connectionIdFrom(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const value = (data as { connectionId?: unknown }).connectionId;
  return typeof value === 'string' && CONNECTION_ID.test(value) ? value : null;
}
