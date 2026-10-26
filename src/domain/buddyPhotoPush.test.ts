import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  GENERIC_PHOTO_ALERT,
  PHOTO_ALERT_NOTE,
  PHOTO_NAME_NOTE,
  PHOTO_PUSH_WINDOW_MS,
  buddyPhotoAlert,
  photoPushCoalesced,
  sharedPhotosFrom,
  type BuddyPhotoPushInput,
} from '../../supabase/functions/_shared/buddyPhotoPush';
import { TURN_OFF_MESSAGE_NOTIFICATIONS } from '../../supabase/functions/_shared/messagePush';

const SECRET = 'Day 40 sober. Heart rate 180. Meet at the side gate. Do not tell anyone.';
const OWNER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
const RECIPIENT = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1';

function input(overrides: Partial<BuddyPhotoPushInput> = {}): BuddyPhotoPushInput {
  return {
    ownerId: OWNER,
    recipientId: RECIPIENT,
    published: true,
    stillBuddies: true,
    blocked: false,
    notificationsOn: true,
    ownerAdult: true,
    recipientAdult: true,
    caption: SECRET,
    senderName: 'Alex Hart',
    ...overrides,
  };
}

describe('buddy photo push', () => {
  it('uses one generic line and copies nothing else onto the lock screen', () => {
    const alert = buddyPhotoAlert(input());
    expect(alert).toEqual({
      ok: true,
      title: 'Charioteer',
      body: GENERIC_PHOTO_ALERT,
      data: { sharedPhotos: true },
    });
    expect(alert.ok && alert.body).toBe('New photo on Charioteer');
    const packed = JSON.stringify(alert);
    expect(packed).not.toContain('Alex');
    expect(packed).not.toContain('sober');
    expect(packed).not.toContain('Heart');
    expect(packed).not.toContain('gate');
    expect(packed).not.toContain(SECRET);
    expect(packed).not.toContain(OWNER);
    expect(packed).not.toContain(RECIPIENT);
    if (!alert.ok) return;
    expect(Object.keys(alert.data)).toEqual(['sharedPhotos']);
  });

  it('skips the sender, a block, a turned-off switch, an unpublished photo, and a broken pair', () => {
    expect(buddyPhotoAlert(input({ recipientId: OWNER }))).toEqual({ ok: false, reason: 'self' });
    expect(buddyPhotoAlert(input({ blocked: true }))).toEqual({ ok: false, reason: 'blocked' });
    expect(buddyPhotoAlert(input({ notificationsOn: false }))).toEqual({ ok: false, reason: 'notifications' });
    expect(buddyPhotoAlert(input({ published: false }))).toEqual({ ok: false, reason: 'unpublished' });
    expect(buddyPhotoAlert(input({ stillBuddies: false }))).toEqual({ ok: false, reason: 'closed' });
    expect(buddyPhotoAlert(input({ ownerAdult: false }))).toEqual({ ok: false, reason: 'age' });
    expect(buddyPhotoAlert(input({ recipientAdult: false }))).toEqual({ ok: false, reason: 'age' });
  });

  it('folds a later photo into the one sent inside three minutes', () => {
    const start = Date.parse('2026-10-26T08:36:00.000Z');
    expect(PHOTO_PUSH_WINDOW_MS).toBe(3 * 60 * 1000);
    expect(photoPushCoalesced(null, start)).toBe(false);
    expect(photoPushCoalesced('not-a-time', start)).toBe(false);
    expect(photoPushCoalesced(new Date(start).toISOString(), start + 1)).toBe(true);
    expect(photoPushCoalesced(new Date(start).toISOString(), start + PHOTO_PUSH_WINDOW_MS - 1)).toBe(true);
    expect(photoPushCoalesced(new Date(start).toISOString(), start + PHOTO_PUSH_WINDOW_MS)).toBe(false);
  });

  it('opens Shared Photos only from the boolean flag', () => {
    expect(sharedPhotosFrom({ sharedPhotos: true })).toBe(true);
    expect(sharedPhotosFrom({ sharedPhotos: true, caption: SECRET })).toBe(true);
    expect(sharedPhotosFrom({ sharedPhotos: 'true' })).toBe(false);
    expect(sharedPhotosFrom({ connectionId: RECIPIENT })).toBe(false);
    expect(sharedPhotosFrom({ buddyInviteId: RECIPIENT })).toBe(false);
    expect(sharedPhotosFrom(null)).toBe(false);
    expect(sharedPhotosFrom(SECRET)).toBe(false);
  });

  it('follows the existing message switch and does not add another', () => {
    expect(TURN_OFF_MESSAGE_NOTIFICATIONS).toBe('Turn off Message Notifications (messages from other users)');
    expect(PHOTO_ALERT_NOTE).toBe('A buddy photo says New photo on Charioteer, with no name and no picture.');
    expect(PHOTO_NAME_NOTE).toContain('never includes a name');
    expect(PHOTO_ALERT_NOTE).not.toContain('Alex');
    const consent = readFileSync('src/ui/ConsentChoices.tsx', 'utf8');
    const prompt = readFileSync('src/ui/MessageNotificationPrompt.tsx', 'utf8');
    const screen = readFileSync('src/app/(main)/notifications.tsx', 'utf8');
    const profile = readFileSync('src/app/(main)/profile.tsx', 'utf8');
    const card = readFileSync('src/ui/PublicProfileCard.tsx', 'utf8');
    for (const source of [consent, prompt, screen, profile, card]) {
      expect(source).toContain('PHOTO_ALERT_NOTE');
    }
    expect(screen).toContain('PHOTO_NAME_NOTE');
    expect(profile).toContain('PHOTO_NAME_NOTE');
    expect(card).toContain('This switch covers that alert as well.');
    expect(card).toContain('{TURN_OFF_MESSAGE_NOTIFICATIONS}');
    const sql = readFileSync('supabase/migrations/20261026120000_buddy_photo_push.sql', 'utf8');
    expect(sql).toContain('NOT APPLIED');
    expect(sql).toContain('create table public.buddy_photo_push_log');
    expect(sql).toContain('primary key (photo_id, recipient_id)');
    expect(sql).toContain('coalesced boolean not null default false');
    expect(sql).toContain('references public.buddy_photos (id) on delete cascade');
    expect(sql).toContain('where coalesced = false');
    expect(sql).toContain('revoke all on table public.buddy_photo_push_log from public, anon, authenticated');
    expect(sql).toContain('enable row level security');
    expect(sql).toContain('message_notifications');
    expect(sql).toContain(TURN_OFF_MESSAGE_NOTIFICATIONS);
    expect(sql).not.toMatch(/alter table public\.profiles/i);
    expect(sql).not.toMatch(/photo_notifications/);
    expect(sql).not.toMatch(/create policy/i);
    expect(sql).not.toMatch(/grant\s+(select|insert|update|delete)/i);
    expect(sql).not.toMatch(/create trigger/i);
    expect(sql).not.toContain('pg_net');
    expect(sql).not.toContain('caption');
    expect(sql.toLowerCase()).not.toContain('display_name');

    const config = readFileSync('supabase/config.toml', 'utf8');
    expect(config).toContain('[functions.notify-buddy-photo]\nverify_jwt = true');
  });

  it('sends from the published photo only, and never reads the photo text', () => {
    const fn = readFileSync('supabase/functions/notify-buddy-photo/index.ts', 'utf8');
    expect(fn).toContain("select('id, owner_id, published_at')");
    expect(fn).toContain("select('id, message_notifications, age_confirmed_18')");
    expect(fn).toContain("select('buddy_id, hidden_at')");
    expect(fn).toContain('recipient.message_notifications !== false');
    expect(fn).toContain('buddyPhotoAlert(');
    expect(fn).toContain("caption: ''");
    expect(fn).toContain("senderName: ''");
    expect(fn).toContain('photoPushCoalesced(');
    expect(fn).toContain('PHOTO_PUSH_WINDOW_MS');
    expect(fn).toContain('data: decision.data');
    expect(fn).toContain(EXPO);
    expect(fn).not.toContain('display_name');
    expect(fn).not.toContain('notify_sender_name');
    expect(fn).not.toContain('storage_path');
    expect(fn).not.toContain('badge');
    expect(fn).not.toContain('console.');
    expect(fn.match(/caption/g)).toEqual(['caption']);
    expect(fn).not.toContain(SECRET);
    expect(fn).toContain('NOT DEPLOYED');

    const invite = readFileSync('supabase/functions/notify-buddy-invite/index.ts', 'utf8');
    expect(invite).toContain("skipped: 'messages-only'");
    expect(invite).not.toContain('exp.host');
    expect(invite).not.toContain('buddyPhotoAlert');
  });

  it('asks for the push only after publish, and a Gratitude-only save does not', () => {
    const repo = readFileSync('src/data/supabase-repository.ts', 'utf8');
    const send = repo.slice(repo.indexOf('async sendSharedPhoto'), repo.indexOf('async deleteSharedPhoto'));
    const publishAt = send.indexOf("rpc('publish_buddy_photo'");
    const invokeAt = send.indexOf("invoke('notify-buddy-photo'");
    expect(publishAt).toBeGreaterThan(-1);
    expect(invokeAt).toBeGreaterThan(publishAt);
    const notify = send.slice(invokeAt);
    expect(notify).toContain('body: { photoId }');
    expect(notify).toContain("rememberEdgeFailure('notify-buddy-photo'");
    expect(notify).toContain('Push send failed');
    expect(notify).not.toContain('caption');
    expect(notify).not.toContain(SECRET);
    expect(send.slice(0, publishAt)).not.toContain('notify-buddy-photo');

    const sheet = readFileSync('src/ui/SharePhotoCard.tsx', 'utf8');
    const submitStart = sheet.indexOf('async function submit');
    const submit = sheet.slice(submitStart, sheet.indexOf('return (', submitStart));
    const sendAt = submit.indexOf('sendSharedPhoto');
    const guardAt = submit.lastIndexOf('selected.length > 0', sendAt);
    expect(guardAt).toBeGreaterThan(-1);
    expect(submit.slice(guardAt, sendAt)).not.toContain('saveGratitude');
    const gratitude = sheet.slice(sheet.indexOf('async function saveGratitude'), sheet.indexOf('async function submit'));
    expect(gratitude).toContain('addGratitudeEntry');
    expect(gratitude).toContain('addGratitudePhoto');
    expect(gratitude).not.toContain('sendSharedPhoto');
    expect(gratitude).not.toContain('notify-buddy-photo');
    expect(sheet).not.toContain('notify-buddy-photo');

    const demo = readFileSync('src/data/demo-repository.ts', 'utf8');
    const demoSend = demo.slice(demo.indexOf('async sendSharedPhoto'), demo.indexOf('async deleteSharedPhoto'));
    expect(demoSend).not.toContain('notify-buddy-photo');
    expect(demoSend).not.toContain('functions.invoke');
  });

  it('opens Shared Photos from a tap and does not treat the alert as a message', () => {
    const register = readFileSync('src/notifications/register.ts', 'utf8');
    const opens = register.slice(
      register.indexOf('export function listenForMessageOpens'),
      register.indexOf('export function listenForIncomingMessages'),
    );
    expect(opens).toContain('sharedPhotosFrom');
    expect(opens).toContain('openSharedPhotos');
    expect(opens).toContain('connectionIdFrom');
    const arrival = register.slice(
      register.indexOf('export function listenForIncomingMessages'),
      register.indexOf('export async function setAppIconBadge'),
    );
    expect(arrival).toContain('connectionIdFrom');
    expect(arrival).not.toContain('sharedPhotosFrom');

    const layout = readFileSync('src/app/_layout.tsx', 'utf8');
    const tap = layout.slice(layout.indexOf('listenForMessageOpens((connectionId)'));
    expect(tap).toContain("router.push('/shared-photos' as never)");
    expect(tap).toContain("router.push('/buddies' as never)");
    expect(tap).toContain('router.push(`/chat/${connectionId}` as never)');
    const app = readFileSync('app.json', 'utf8');
    expect(app).not.toContain('notify-buddy-photo');
    expect(app).not.toContain('NSUserNotification');
  });
});

const EXPO = 'https://exp.host/--/api/v2/push/send';
