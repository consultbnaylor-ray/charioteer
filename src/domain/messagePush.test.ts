import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  GENERIC_MESSAGE_ALERT,
  TURN_OFF_MESSAGE_NOTIFICATIONS,
  communityOn,
  connectionIdFrom,
  messageAlert,
  notificationsOnFromTurnOff,
  type MessagePushInput,
} from '../../supabase/functions/_shared/messagePush';

const SECRET = 'Meet me at the side door at nine, and do not tell anyone.';
const CONNECTION = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';

function input(overrides: Partial<MessagePushInput> = {}): MessagePushInput {
  return {
    senderId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
    recipientId: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
    connectionId: CONNECTION,
    connectionAccepted: true,
    messageBody: SECRET,
    recipientCommunityOn: true,
    senderCommunityOn: true,
    blocked: false,
    notificationsOn: true,
    showSenderName: false,
    senderName: 'Alex Hart',
    ...overrides,
  };
}

describe('private message push', () => {
  it('uses the generic line and never the message text', () => {
    const alert = messageAlert(input());
    expect(alert).toEqual({
      ok: true,
      title: 'Charioteer',
      body: GENERIC_MESSAGE_ALERT,
      data: { connectionId: CONNECTION },
    });
    expect(JSON.stringify(alert)).not.toContain(SECRET);
    expect(JSON.stringify(alert)).not.toContain('side door');
  });

  it('can name the sender and still leaves the message out', () => {
    const alert = messageAlert(input({ showSenderName: true, senderName: 'Alex\nHart' }));
    expect(alert.ok).toBe(true);
    if (!alert.ok) return;
    expect(alert.body).toBe('New message from Alex Hart');
    expect(alert.body).not.toContain(SECRET);
    expect(messageAlert(input({ showSenderName: true, senderName: '   ' })).ok && true).toBe(true);
    const blank = messageAlert(input({ showSenderName: true, senderName: '   ' }));
    expect(blank.ok && blank.body).toBe(GENERIC_MESSAGE_ALERT);
  });

  it('skips a block, a closed chat, community off, and the notifications switch', () => {
    expect(messageAlert(input({ blocked: true }))).toEqual({ ok: false, reason: 'blocked' });
    expect(messageAlert(input({ connectionAccepted: false }))).toEqual({ ok: false, reason: 'closed' });
    expect(messageAlert(input({ recipientCommunityOn: false }))).toEqual({ ok: false, reason: 'community' });
    expect(messageAlert(input({ senderCommunityOn: false }))).toEqual({ ok: false, reason: 'community' });
    expect(messageAlert(input({ notificationsOn: false }))).toEqual({ ok: false, reason: 'notifications' });
    expect(messageAlert(input({ senderId: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1', recipientId: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1' }))).toEqual({ ok: false, reason: 'self' });
    expect(communityOn(true, false)).toBe(false);
    expect(communityOn(false, true)).toBe(false);
    expect(communityOn(true, true)).toBe(true);
  });

  it('opens only the chat id carried on the notification', () => {
    expect(connectionIdFrom({ connectionId: CONNECTION })).toBe(CONNECTION);
    expect(connectionIdFrom({ connectionId: SECRET })).toBeNull();
    expect(connectionIdFrom({ body: SECRET })).toBeNull();
    expect(connectionIdFrom(null)).toBeNull();
  });

  it('stores tokens with owner-only access and asks away from launch', () => {
    const sql = readFileSync('supabase/migrations/20261010350000_message_push.sql', 'utf8');
    const app = readFileSync('app.json', 'utf8');
    const layout = readFileSync('src/app/_layout.tsx', 'utf8');
    const chat = readFileSync('src/app/(main)/chat/[id].tsx', 'utf8');
    const you = readFileSync('src/app/(main)/profile.tsx', 'utf8');
    const card = readFileSync('src/ui/PublicProfileCard.tsx', 'utf8');
    const fn = readFileSync('supabase/functions/notify-direct-message/index.ts', 'utf8');
    expect(sql).toContain('create table public.device_tokens');
    expect(sql).toContain('enable row level security');
    expect(sql).toContain('user_id = auth.uid()');
    expect(sql).toContain('message_notifications boolean not null default true');
    expect(sql).toContain('notify_sender_name boolean not null default false');
    expect(sql).toContain('grant update (message_notifications, notify_sender_name)');
    expect(sql).not.toContain('grant select on public.message_push_log');
    expect(app).toContain('"aps-environment": "production"');
    expect(app).toContain('"buildNumber": "13"');
    expect(app).toContain('expo-notifications');
    expect(layout).toContain('listenForMessageOpens');
    expect(layout).not.toContain('offerMessageNotifications');
    expect(layout).not.toContain('requestPermissionsAsync');
    expect(chat).toContain('offerMessageNotifications');
    expect(card).toContain('offerMessageNotifications');
    expect(you).toContain('accessibilityLabel="Notifications"');
    expect(you).toContain('accessibilityLabel="Show the sender\'s name"');
    expect(you).toContain('messageNotifications: value');
    expect(you).toContain('notifySenderName: value');
    expect(TURN_OFF_MESSAGE_NOTIFICATIONS).toBe('Turn off Message Notifications (messages from other users)');
    expect(notificationsOnFromTurnOff(true)).toBe(false);
    expect(notificationsOnFromTurnOff(false)).toBe(true);
    expect(card).toContain('{TURN_OFF_MESSAGE_NOTIFICATIONS}');
    expect(card).toContain('accessibilityLabel={TURN_OFF_MESSAGE_NOTIFICATIONS}');
    expect(card).toContain('messageNotifications: on');
    expect(card).toContain('notificationsOnFromTurnOff(turnedOff)');
    expect(card).toContain('value={!me.messageNotifications}');
    const menu = readFileSync('src/domain/sections.ts', 'utf8');
    const screen = readFileSync('src/app/(main)/notifications.tsx', 'utf8');
    expect(menu).toContain("label: 'Notifications'");
    expect(menu).toContain("href: '/notifications'");
    expect(menu).toContain("icon: 'bell'");
    expect(menu).toContain("group: 'account'");
    expect(readFileSync('src/ui/menuIcons.tsx', 'utf8')).toContain("name === 'bell'");
    expect(screen).toContain('accessibilityLabel="Message notifications"');
    expect(screen).toContain('messageNotifications: value');
    expect(screen).toContain("Show sender's name");
    expect(screen).toContain('notifySenderName: value');
    expect(screen).toContain("existing.status === 'denied'");
    expect(screen).toContain('Linking.openSettings()');
    expect(screen).toContain('Open iOS Settings');
    expect(fn).toContain('recipient.message_notifications !== false');
    expect(fn).toContain('messageAlert(');
    expect(fn).toContain("select('id, connection_id, sender_id')");
    expect(fn).not.toContain('record.body');
    expect(fn).not.toContain('message.body');
    expect(fn).toContain('decision.body');
    expect(fn).not.toContain(SECRET);
  });
});
