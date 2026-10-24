import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async () => null,
    setItem: async () => undefined,
    removeItem: async () => undefined,
  },
}));

import { DemoRepository } from '@/data/demo-repository';
import { DEMO_PASSWORD, PEOPLE } from '@/data/demo-seed';
import type { Connection, ConnectionCard, DirectoryCard } from '@/data/types';
import {
  avatarPhotoIdFromPath,
  buddyCount,
  communitySearch,
  discoverAction,
  foldedRows,
  incomingRequestCount,
  memberAvatarSources,
  memberDisplayName,
  peopleLists,
  peopleTabAccessibilityLabel,
  peopleTabBadgeCount,
  requestBadgeText,
} from './connections';

const me = 'me';
const other = 'other';

function link(status: Connection['status'], requesterId = other, addresseeId = me, id = 'c1'): Connection {
  return { id, requesterId, addresseeId, status, createdAt: '2026-10-01T00:00:00.000Z' };
}

describe('discover connection actions', () => {
  it('asks when there is no live link', () => {
    expect(discoverAction([], me, other)).toEqual({ kind: 'ask' });
    expect(discoverAction([link('declined')], me, other)).toEqual({ kind: 'ask' });
  });

  it('offers accept and decline when the other person sent the request', () => {
    expect(discoverAction([link('pending', other, me, 'req')], me, other)).toEqual({ kind: 'incoming', connectionId: 'req' });
  });

  it('says the request was sent when I am waiting', () => {
    expect(discoverAction([link('pending', me, other)], me, other)).toEqual({ kind: 'sent' });
  });

  it('opens the chat once both have agreed', () => {
    expect(discoverAction([link('accepted', me, other, 'chat')], me, other)).toEqual({ kind: 'message', connectionId: 'chat' });
    expect(discoverAction([link('accepted', other, me, 'chat')], me, other)).toEqual({ kind: 'message', connectionId: 'chat' });
  });

  it('counts only requests addressed to me', () => {
    const rows = [
      link('pending', other, me, 'in'),
      link('pending', 'third', me, 'in2'),
      link('pending', me, other, 'out'),
      link('accepted', other, me, 'done'),
      link('declined', 'fourth', me, 'no'),
    ];
    expect(incomingRequestCount(rows, me)).toBe(2);
    expect(incomingRequestCount(rows, 'nobody')).toBe(0);
  });

  it('names the People tab for one request, many, or none', () => {
    expect(peopleTabAccessibilityLabel(0)).toBe('People');
    expect(peopleTabAccessibilityLabel(1)).toBe('People, 1 request');
    expect(peopleTabAccessibilityLabel(4)).toBe('People, 4 requests');
    expect(peopleTabAccessibilityLabel(0, 1)).toBe('People, 1 new message');
    expect(peopleTabAccessibilityLabel(0, 3)).toBe('People, 3 new messages');
    expect(peopleTabAccessibilityLabel(2, 1)).toBe('People, 2 requests, 1 new message');
    expect(peopleTabBadgeCount(1, 2)).toBe(3);
    expect(peopleTabBadgeCount(0, 0)).toBe(0);
    expect(requestBadgeText(0)).toBeNull();
    expect(requestBadgeText(1)).toBe('1');
    expect(requestBadgeText(100)).toBe('99+');
  });

  it('puts those actions on the Discover card and a badge on the People tab', () => {
    const people = readFileSync('src/app/(main)/people.tsx', 'utf8');
    const layout = readFileSync('src/app/(main)/_layout.tsx', 'utf8');
    expect(people).toContain('Accept request');
    expect(people).toContain('Decline');
    expect(people).toContain('Request sent');
    expect(people).toContain('Message');
    expect(people).toContain('Ask to connect');
    expect(people).toContain('discoverAction');
    expect(people).not.toContain('Already in touch');
    expect(people).not.toMatch(/gratitude/);
    expect(people).not.toMatch(/thumos|xai|progress-photos/i);
    expect(layout).toContain('incomingRequestCount');
    expect(layout).toContain('peopleTabAccessibilityLabel');
    expect(layout).toContain('peopleTabBadgeCount');
    expect(layout).toContain('requestBadgeText');
    expect(layout).toContain('messageUnreadTotal');
    expect(layout).toContain('href === \'/people\'');
    expect(people).toContain("tone={incoming.length > 0 ? 'alert' : 'default'}");
    const choice = readFileSync('src/ui/ui.tsx', 'utf8');
    expect(choice).toContain("tone === 'alert'");
    expect(choice).toContain('alert ? theme.colors.danger');
    expect(layout).toContain('theme.colors.dangerFill');
    expect(layout).toContain('theme.colors.dangerInk');
  });
});

function card(id: string): DirectoryCard {
  return { id, displayName: id, town: null, interestIds: [], sharedInterestIds: [], avatarUrl: null };
}

describe('people lists', () => {
  it('keeps an accepted person on Buddies when the directory row is missing', () => {
    const lists = peopleLists(
      [card('sam'), card(me)],
      [
        link('accepted', me, 'paul', 'accepted'),
        link('pending', 'sam', me, 'incoming'),
        link('pending', me, 'out', 'outgoing'),
        link('declined', me, 'sam', 'old'),
      ],
      me,
    );
    expect(lists.accepted.map((row) => row.id)).toEqual(['accepted']);
    expect(lists.incoming.map((row) => row.id)).toEqual(['incoming']);
    expect(lists.outgoing.map((row) => row.id)).toEqual(['outgoing']);
    expect(lists.community.map((row) => row.id)).toEqual([]);
    expect(buddyCount(lists)).toBe(3);
    const back = peopleLists(
      [card('sam'), card('paul')],
      [link('declined', me, 'paul', 'declined')],
      me,
    );
    expect(back.community.map((row) => row.id).sort()).toEqual(['paul', 'sam']);
    expect(back.accepted).toEqual([]);
    expect(foldedRows([1, 2, 3, 4, 5, 6], false).hidden).toBe(1);
  });

  it('uses the directory name, then the connection card, then Member', () => {
    const directory = [{ ...card('sam'), displayName: 'Sam' }];
    const hidden: ConnectionCard = {
      id: 'paul',
      displayName: 'Paul',
      avatarPath: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2/e7e7e7e7-e7e7-4e7e-8e7e-e7e7e7e7e7e4.jpg',
      avatarUrl: null,
      avatarPhotoId: 'e7e7e7e7-e7e7-4e7e-8e7e-e7e7e7e7e7e4',
    };
    const samePerson: ConnectionCard = { ...hidden, id: 'sam', displayName: 'Not Sam' };
    expect(memberDisplayName('sam', directory, [samePerson])).toBe('Sam');
    expect(memberDisplayName('paul', directory, [hidden])).toBe('Paul');
    expect(memberDisplayName('paul', directory, [{ ...hidden, displayName: '  ' }])).toBe('Member');
    expect(memberDisplayName('paul', directory, [])).toBe('Member');
    expect(avatarPhotoIdFromPath(hidden.avatarPath)).toBe('e7e7e7e7-e7e7-4e7e-8e7e-e7e7e7e7e7e4');
    expect(avatarPhotoIdFromPath('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2/../secret.jpg')).toBeNull();
    expect(avatarPhotoIdFromPath('not-a-path')).toBeNull();
    const sources = memberAvatarSources(directory, [hidden, samePerson]);
    expect(sources.map((row) => row.id)).toEqual(['sam', 'paul']);
    expect(sources.find((row) => row.id === 'paul')?.town).toBeNull();
    expect(sources.find((row) => row.id === 'paul')?.interestIds).toEqual([]);
    expect(sources.find((row) => row.id === 'sam')?.displayName).toBe('Sam');
  });

  it('never puts a hidden person in search results or Community', () => {
    const directory = [card('sam'), card('alex')];
    const hidden: ConnectionCard = {
      id: 'paul',
      displayName: 'Paul',
      avatarPath: null,
      avatarUrl: null,
      avatarPhotoId: null,
    };
    const stranger = peopleLists(directory, [], me);
    expect(stranger.community.map((row) => row.id)).not.toContain('paul');
    expect(communitySearch(directory, 'Paul').map((row) => row.id)).not.toContain('paul');
    expect(communitySearch(directory, '').map((row) => row.id)).not.toContain('paul');
    expect(communitySearch(directory, 'sam').map((row) => row.id)).toEqual(['sam']);
    const connected = peopleLists(directory, [link('accepted', me, 'paul', 'accepted')], me);
    expect(connected.community.map((row) => row.id)).not.toContain('paul');
    expect(connected.accepted.map((row) => row.addresseeId)).toEqual(['paul']);
    expect(communitySearch(directory, 'Paul')).toEqual([]);
    expect(memberDisplayName('paul', directory, [hidden])).toBe('Paul');
  });
});

describe('hidden members stay out of the directory', () => {
  it('keeps directory.visible as the Community and search filter', () => {
    const init = readFileSync('supabase/migrations/20261010120000_init.sql', 'utf8');
    const policy = init.slice(init.indexOf('create policy directory_select'), init.indexOf('create policy consents_own'));
    expect(policy).toContain('user_id = auth.uid()');
    expect(policy).toContain('visible');
    expect(policy).toContain('age_confirmed_18');
    const sql = readFileSync('supabase/migrations/20261024100000_buddy_names.sql', 'utf8');
    expect(sql).toContain('function public.my_connection_cards()');
    expect(sql).toContain('security definer');
    expect(sql).toContain('set search_path = public');
    expect(sql).toContain('stable');
    expect(sql).toContain("c.status = 'accepted'");
    expect(sql).not.toContain('pending');
    expect(sql).toContain('auth.uid() is not null');
    expect(sql).toContain('not public.is_blocked(auth.uid(), other.user_id)');
    expect(sql).toContain('revoke all on function public.my_connection_cards() from public, anon, authenticated');
    expect(sql).toContain('grant execute on function public.my_connection_cards() to authenticated');
    expect(sql).not.toMatch(/create policy|alter policy|drop policy/i);
    expect(sql).not.toMatch(/\bbio\b|\btown\b|\bstage\b|sobriety/i);
    expect(sql).not.toMatch(/grant\s+(insert|update|delete)/i);
    const signer = readFileSync('supabase/functions/profile-photo-url/index.ts', 'utf8');
    expect(signer.indexOf("rpc('shared_profile_photos'")).toBeLessThan(signer.indexOf("rpc('my_connection_cards'"));
    expect(signer.indexOf("rpc('my_connection_cards'")).toBeLessThan(signer.indexOf('createSignedUrl'));

    const people = readFileSync('src/app/(main)/people.tsx', 'utf8');
    expect(people.match(/peopleLists\([^)]*\)/)?.[0]).toBe('peopleLists(snap.directory, snap.connections ?? [], me.id)');
    expect(people).toContain('memberDisplayName');
    expect(people).toContain('memberAvatarSources(snap.directory, snap.connectionCards)');
    expect(people).toContain('lists.community.slice');
    const chat = readFileSync('src/app/(main)/chat/[id].tsx', 'utf8');
    expect(chat).toContain('memberDisplayName(otherId, snap.directory, snap.connectionCards)');
    expect(readFileSync('src/app/(main)/buddies.tsx', 'utf8')).toContain('memberDisplayName(inviteId, snap.directory, snap.connectionCards)');

    const supabase = readFileSync('src/data/supabase-repository.ts', 'utf8');
    const open = supabase.slice(supabase.indexOf('async openPrivateChat'), supabase.indexOf('async requestConnection'));
    expect(open).not.toContain('communityVisible');
    expect(open).toContain('ageConfirmed18');
    expect(supabase).toContain("rpc('my_connection_cards')");
    const demo = readFileSync('src/data/demo-repository.ts', 'utf8');
    const demoOpen = demo.slice(demo.indexOf('async openPrivateChat'), demo.indexOf('async requestConnection'));
    const demoRequest = demo.slice(demo.indexOf('async requestConnection'), demo.indexOf('async respondConnection'));
    expect(demoOpen).not.toContain('communityVisible');
    expect(demoRequest).not.toContain('communityVisible');
    expect(demoRequest).toContain('ageConfirmed18');
    expect(demo).toContain('other.profile.communityVisible && other.profile.ageConfirmed18');
    const cardsFor = demo.slice(demo.indexOf('function connectionCardsFor'), demo.indexOf('export class DemoRepository'));
    expect(cardsFor).toContain("connection.status !== 'accepted'");
    expect(cardsFor).not.toContain('pending');
    const photoUrls = demo.slice(demo.indexOf('async profilePhotoUrls'), demo.indexOf('async deleteProgressPhoto'));
    expect(photoUrls).toContain("connection.status !== 'accepted'");
    expect(photoUrls).not.toContain('pending');
  });

  it('hides a non-connected person from search and Community, and keeps name and photo for a connection', async () => {
    const repo = new DemoRepository();
    await new Promise<void>((resolve) => {
      if (repo.getSnapshot().ready) {
        resolve();
        return;
      }
      const stop = repo.subscribe(() => {
        if (!repo.getSnapshot().ready) return;
        stop();
        resolve();
      });
    });
    await repo.signIn('jordan.ellis@example.com', DEMO_PASSWORD);
    await repo.updateProfile({ communityVisible: false });
    await repo.signOut();
    await repo.signIn('sam.okonkwo@example.com', DEMO_PASSWORD);
    await repo.updateProfile({ communityVisible: false });
    await repo.signOut();

    await repo.signIn('priya.shah@example.com', DEMO_PASSWORD);
    const priya = repo.getSnapshot();
    expect(priya.directory.some((card) => card.id === PEOPLE.jordan)).toBe(false);
    expect(priya.connectionCards.some((card) => card.id === PEOPLE.jordan)).toBe(false);
    const priyaLists = peopleLists(priya.directory, priya.connections, priya.profile!.id);
    expect(priyaLists.community.some((card) => card.id === PEOPLE.jordan)).toBe(false);
    expect(communitySearch(priya.directory, 'Jordan')).toEqual([]);
    expect(communitySearch(priya.directory, '').some((card) => card.id === PEOPLE.jordan)).toBe(false);
    expect(await repo.profilePhotoUrls(['e7e7e7e7-e7e7-4e7e-8e7e-e7e7e7e7e7e4'])).toEqual([]);
    await repo.signOut();

    await repo.signIn('alex.hart@example.com', DEMO_PASSWORD);
    const alex = repo.getSnapshot();
    expect(alex.directory.some((card) => card.id === PEOPLE.jordan)).toBe(false);
    expect(communitySearch(alex.directory, 'Jordan')).toEqual([]);
    const alexLists = peopleLists(alex.directory, alex.connections, alex.profile!.id);
    expect(alexLists.community.some((card) => card.id === PEOPLE.jordan)).toBe(false);
    expect(alexLists.accepted.some((row) => row.requesterId === PEOPLE.jordan || row.addresseeId === PEOPLE.jordan)).toBe(true);
    expect(alex.connectionCards.find((card) => card.id === PEOPLE.jordan)?.displayName).toBe('Jordan Ellis');
    expect(alex.connectionCards.find((card) => card.id === PEOPLE.jordan)?.avatarPhotoId).toBe('e7e7e7e7-e7e7-4e7e-8e7e-e7e7e7e7e7e4');
    expect(memberDisplayName(PEOPLE.jordan, alex.directory, alex.connectionCards)).toBe('Jordan Ellis');
    expect(alex.directory.some((card) => card.id === PEOPLE.sam)).toBe(false);
    expect(alex.connectionCards.some((card) => card.id === PEOPLE.sam)).toBe(false);
    expect(memberDisplayName(PEOPLE.sam, alex.directory, alex.connectionCards)).toBe('Member');
    expect(alexLists.incoming.some((row) => row.requesterId === PEOPLE.sam)).toBe(true);
    const signed = await repo.profilePhotoUrls(['e7e7e7e7-e7e7-4e7e-8e7e-e7e7e7e7e7e4']);
    expect(signed.map((row) => row.id)).toEqual(['e7e7e7e7-e7e7-4e7e-8e7e-e7e7e7e7e7e4']);

    await repo.updateProfile({ communityVisible: false });
    const hidden = repo.getSnapshot();
    expect(hidden.directory.some((card) => card.displayName === 'Priya Shah')).toBe(true);
    expect(communitySearch(hidden.directory, 'Priya').map((card) => card.displayName)).toContain('Priya Shah');
    expect(hidden.directory.some((card) => card.id === PEOPLE.jordan)).toBe(false);
    expect(await repo.openPrivateChat(PEOPLE.jordan)).toEqual({ status: 'open', connectionId: expect.any(String) });
    await repo.requestConnection(PEOPLE.priya, '11111111-1111-4111-8111-111111111111');
    expect(repo.getSnapshot().connections.some((row) => row.addresseeId === PEOPLE.priya && row.requesterId === PEOPLE.alex && row.status === 'pending')).toBe(true);
    expect(repo.getSnapshot().connectionCards.some((card) => card.id === PEOPLE.priya)).toBe(false);
    await repo.signOut();

    await repo.signIn('priya.shah@example.com', DEMO_PASSWORD);
    const waiting = repo.getSnapshot();
    expect(waiting.directory.some((card) => card.id === PEOPLE.alex)).toBe(false);
    expect(waiting.connectionCards.some((card) => card.id === PEOPLE.alex)).toBe(false);
    expect(memberDisplayName(PEOPLE.alex, waiting.directory, waiting.connectionCards)).toBe('Member');
    expect(communitySearch(waiting.directory, 'Alex')).toEqual([]);
    const waitingLists = peopleLists(waiting.directory, waiting.connections, waiting.profile!.id);
    expect(waitingLists.community.some((card) => card.id === PEOPLE.alex)).toBe(false);
    expect(waitingLists.incoming.some((row) => row.requesterId === PEOPLE.alex)).toBe(true);
    expect(await repo.profilePhotoUrls(['e7e7e7e7-e7e7-4e7e-8e7e-e7e7e7e7e7e1'])).toEqual([]);
  });
});
