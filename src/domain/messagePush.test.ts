import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { messagePromptSeenIn, withMessagePromptSeen } from './messagePrompt';
import {
  GENERIC_MESSAGE_ALERT,
  TURN_OFF_MESSAGE_NOTIFICATIONS,
  communityOn,
  connectionIdFrom,
  iconBadgeCount,
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
  it('uses the generic line unless the recipient opts in to the sender name', () => {
    const alert = messageAlert(input());
    expect(alert).toEqual({
      ok: true,
      title: 'Charioteer',
      body: GENERIC_MESSAGE_ALERT,
      data: { connectionId: CONNECTION },
    });
    expect(JSON.stringify(alert)).not.toContain(SECRET);
    expect(JSON.stringify(alert)).not.toContain('side door');
    expect(JSON.stringify(alert)).not.toContain('Alex');
    expect(alert.ok && alert.body).toBe('New message on Charioteer');
    const fn = readFileSync('supabase/functions/notify-direct-message/index.ts', 'utf8');
    expect(fn).toContain('showSenderName: Boolean(recipient.notify_sender_name)');
    expect(fn).not.toContain('showSenderName: true');
    expect(fn).not.toContain('New message from');
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

  it('counts unread messages for the icon badge and ignores other alerts', () => {
    const rows = [
      { connectionId: CONNECTION, senderId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', createdAt: '2026-10-13T09:00:00.000Z' },
      { connectionId: CONNECTION, senderId: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1', createdAt: '2026-10-13T10:00:00.000Z' },
      { connectionId: CONNECTION, senderId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', createdAt: '2026-10-13T11:00:00.000Z' },
    ];
    expect(iconBadgeCount(rows, 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1', {})).toBe(1);
    expect(iconBadgeCount(rows, 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1', { [CONNECTION]: '2026-10-13T09:00:00.000Z' })).toBe(1);
    expect(iconBadgeCount(rows, 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1', { [CONNECTION]: '2026-10-13T11:00:00.000Z' })).toBe(0);
    expect(iconBadgeCount(Array.from({ length: 120 }, (_, index) => ({
      connectionId: CONNECTION,
      senderId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
      createdAt: new Date(Date.UTC(2026, 9, 13, 0, 0, index)).toISOString(),
    })), 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1', {})).toBe(99);
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
    expect(app).toMatch(/"buildNumber": "\d+"/);
    expect(app).toContain('expo-notifications');
    expect(layout).toContain('listenForMessageOpens');
    expect(layout).toContain('navigationReady.current = snap.ready');
    expect(layout).toContain('navigationReady.current && stackMounted.current');
    expect(layout).toContain('<NoteStackMounted');
    expect(layout).toContain("console.error('message open', error)");
    const openChat = layout.slice(layout.indexOf('listenForMessageOpens((connectionId)'), layout.indexOf('}, () => navigationReady'));
    expect(openChat).toContain('try {');
    expect(openChat).toContain('router.push');
    expect(layout).not.toContain('offerMessageNotifications');
    expect(layout).not.toContain('requestPermissionsAsync');
    expect(layout).toContain('bindNotificationErrorLog');
    expect(chat).not.toContain('offerMessageNotifications');
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
    expect(screen).toContain('<IosNotificationOffRow');
    expect(you).toContain('<IosNotificationOffRow');
    const off = readFileSync('src/ui/IosNotificationOffRow.tsx', 'utf8');
    expect(off).toContain("existing.status === 'denied'");
    expect(off).toContain('Linking.openSettings()');
    expect(off).toContain('Notifications are off for Charioteer — Open Settings');
    expect(fn).toContain('recipient.message_notifications !== false');
    expect(fn).toContain('messageAlert(');
    expect(fn).toContain("select('id, connection_id, sender_id')");
    expect(fn).not.toContain('record.body');
    expect(fn).not.toContain('message.body');
    expect(fn).toContain('decision.body');
    expect(fn).not.toContain(SECRET);
    expect(readFileSync('supabase/migrations/20261016010000_push_tickets.sql', 'utf8')).toContain('tickets jsonb');
    expect(fn).toContain('tickets:');
    expect(fn).toContain('iconBadgeCount');
    expect(fn).toContain("select('connection_id, sender_id, created_at')");
    expect(fn).toContain('...(badge == null ? {} : { badge })');
    expect(fn).not.toContain('record.body');
    const register = readFileSync('src/notifications/register.ts', 'utf8');
    const icon = register.slice(register.indexOf('export async function setAppIconBadge'));
    expect(icon).toContain('setBadgeCountAsync');
    expect(icon).toContain("Platform.OS !== 'ios'");
    expect(icon).toContain('lastBadge');
    expect(icon).toContain('setTimeout');
    expect(icon).toContain('reportNotificationFailure');
    const arrival = register.slice(register.indexOf('export function listenForIncomingMessages'), register.indexOf('export async function setAppIconBadge'));
    expect(arrival).toContain('addNotificationReceivedListener');
    expect(arrival).toContain('connectionIdFrom');
    expect(arrival).not.toContain('requestPermissionsAsync');
    expect(register).toContain('shouldSetBadge: false');
  });

  it('refreshes a granted token on launch and foreground, and explains the ask once before the system sheet', () => {
    const layout = readFileSync('src/app/_layout.tsx', 'utf8');
    const main = readFileSync('src/app/(main)/_layout.tsx', 'utf8');
    const chat = readFileSync('src/app/(main)/chat/[id].tsx', 'utf8');
    const register = readFileSync('src/notifications/register.ts', 'utf8');
    const prompt = readFileSync('src/ui/MessageNotificationPrompt.tsx', 'utf8');
    expect(layout).toContain('retryMessageNotifications');
    expect(layout).toContain('cancelScheduledNotifications()');
    expect(layout).not.toContain('offerMessageNotifications');
    expect(layout).not.toContain('requestPermissionsAsync');
    expect(layout).not.toContain('scheduleNotificationAsync');
    const registerPhone = layout.slice(layout.indexOf('const registerPhone'), layout.indexOf('const timer'));
    expect(registerPhone.match(/registerPhone\(\)/g)?.length).toBe(2);
    expect(registerPhone).toContain("if (next !== 'active') return");
    expect(chat).not.toContain('offerMessageNotifications');
    expect(chat).not.toContain('notifyAttempt');
    expect(chat).not.toContain('}, [repo, connection]');
    expect(register).toContain('tokenSaved');
    expect(register).toContain('permissionChecked');
    expect(register).toContain('reportNotificationFailure');
    expect(register).not.toContain("console.error('message notifications', error)");
    expect(register).toContain("Couldn't register for message notifications – Try again");
    const retry = register.slice(register.indexOf('export async function retryMessageNotifications'), register.indexOf('export async function cancelScheduledNotifications'));
    expect(retry).not.toContain('requestPermissionsAsync');
    expect(retry).toContain('getPermissionsAsync');
    expect(retry).toContain("existing.status !== 'granted'");
    const cancel = register.slice(register.indexOf('export async function cancelScheduledNotifications'), register.indexOf('export function listenForMessageOpens'));
    expect(cancel).toContain('cancelAllScheduledNotificationsAsync');
    expect(cancel).not.toContain('requestPermissionsAsync');
    expect(register).not.toContain('scheduleNotificationAsync');
    const opens = register.slice(register.indexOf('export function listenForMessageOpens'));
    expect(opens).toContain('isReady');
    expect(opens).toContain('clearLastNotificationResponseAsync');
    expect(opens).toContain("console.error('message open', error)");
    expect(opens).toContain('queued.push(data)');
    expect(readFileSync('src/app/(main)/notifications.tsx', 'utf8')).not.toContain('Movement reminder');
    const offer = register.slice(register.indexOf('export async function offerMessageNotifications'), register.indexOf('export async function retryMessageNotifications'));
    expect(offer).toContain('requestPermissionsAsync');
    expect(offer).not.toContain('return undefined');
    expect(main).toContain('<MessageNotificationPrompt');
    expect(prompt).toContain('GENERIC_MESSAGE_ALERT');
    expect(prompt).toContain('does not include what they wrote');
    expect(prompt).toContain('Allow notifications');
    expect(prompt).toContain('Not now');
    expect(prompt).toContain('offerMessageNotifications(repo)');
    expect(prompt).not.toContain('requestPermissionsAsync');
    expect(prompt).toContain('markMessagePromptSeen');
  });

  it('keeps a failed token registration from rejecting at launch or on a switch', () => {
    const layout = readFileSync('src/app/_layout.tsx', 'utf8');
    const registerPhone = layout.slice(layout.indexOf('const registerPhone'), layout.indexOf('registerPhone();'));
    expect(registerPhone).toContain('retryMessageNotifications(repo).then');
    expect(registerPhone).toContain(".catch((error: unknown) => console.error('message notifications', error))");
    expect(layout).not.toContain('offerMessageNotifications');
    expect(readFileSync('src/app/(main)/chat/[id].tsx', 'utf8')).not.toContain('offerMessageNotifications');
    for (const path of [
      'src/ui/PublicProfileCard.tsx',
      'src/app/(main)/profile.tsx',
      'src/app/onboarding.tsx',
      'src/app/(main)/notifications.tsx',
      'src/app/(main)/privacy.tsx',
      'src/app/consent.tsx',
      'src/ui/MessageNotificationPrompt.tsx',
    ]) {
      const source = readFileSync(path, 'utf8');
      expect(source).toContain('offerMessageNotifications(repo)');
      expect(source).toMatch(/offerMessageNotifications\(repo\)[\s\S]{0,240}\.catch/);
    }
  });

  it('asks only once, and logs a failed push without the message', () => {
    const user = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1';
    expect(messagePromptSeenIn(null, user)).toBe(false);
    const stored = withMessagePromptSeen(null, user);
    expect(messagePromptSeenIn(stored, user)).toBe(true);
    expect(messagePromptSeenIn(stored, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1')).toBe(false);
    expect(messagePromptSeenIn('not-json', user)).toBe(false);
    const repo = readFileSync('src/data/supabase-repository.ts', 'utf8');
    const send = repo.slice(repo.indexOf('async sendDirectMessage'), repo.indexOf('async loadChatReads'));
    const notify = send.slice(send.indexOf("invoke('notify-direct-message'"));
    expect(notify).toContain('rememberEdgeFailure');
    expect(notify).toContain('Push send failed');
    expect(notify).not.toContain('.catch(() => undefined)');
    expect(notify).not.toContain('text');
    expect(notify).not.toContain(SECRET);
    const save = repo.slice(repo.indexOf('async saveDeviceToken'), repo.indexOf('async blockUser'));
    expect(save).toContain('updated_at: new Date().toISOString()');
  });
});
