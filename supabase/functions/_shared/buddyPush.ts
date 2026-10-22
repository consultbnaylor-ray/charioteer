import { pushSenderName } from './messagePush.ts';

export const GENERIC_BUDDY_ALERT = 'New buddy request on Charioteer';

export type BuddyPushSkip = 'self' | 'closed' | 'blocked' | 'age' | 'notifications';

export type BuddyPushInput = {
  ownerId: string;
  buddyId: string;
  inviteId: string;
  pending: boolean;
  blocked: boolean;
  ownerAdult: boolean;
  buddyAdult: boolean;
  notificationsOn: boolean;
  showSenderName: boolean;
  senderName: string;
};

export type BuddyPush =
  | { ok: false; reason: BuddyPushSkip }
  | { ok: true; title: string; body: string; data: { buddyInviteId: string } };

/**
 * The alert for one buddy invite.
 * Community is not required. The scope is never copied into the alert.
 */
export function buddyInviteAlert(input: BuddyPushInput): BuddyPush {
  if (input.ownerId === input.buddyId) return { ok: false, reason: 'self' };
  if (!input.pending) return { ok: false, reason: 'closed' };
  if (input.blocked) return { ok: false, reason: 'blocked' };
  if (!input.ownerAdult || !input.buddyAdult) return { ok: false, reason: 'age' };
  if (!input.notificationsOn) return { ok: false, reason: 'notifications' };
  const name = pushSenderName(input.senderName);
  const body = input.showSenderName && name ? `Buddy request from ${name}` : GENERIC_BUDDY_ALERT;
  return {
    ok: true,
    title: 'Charioteer',
    body,
    data: { buddyInviteId: input.inviteId },
  };
}

const INVITE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function buddyInviteIdFrom(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const value = (data as { buddyInviteId?: unknown }).buddyInviteId;
  return typeof value === 'string' && INVITE_ID.test(value) ? value : null;
}
