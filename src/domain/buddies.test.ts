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
import { defaultNutritionSettings, type FoodLog } from '@/domain/nutrition';
import type { HealthPlan } from '@/domain/healthPlan';
import { buddyInviteAlert, GENERIC_BUDDY_ALERT } from '../../supabase/functions/_shared/buddyPush';
import {
  buddyLinkUrl,
  buddySecretFromUrl,
  buddyReminderMessage,
  buddyShareMessage,
  emptyBuddyScope,
  makeBuddyCode,
  parseBuddyList,
  projectBuddyShare,
  scopeFromPreset,
  scopeSummary,
  type BuddyShareSource,
} from './buddies';

const NOTE = 'Check-in note that must stay private.';
const HEIGHT = 191.5;
const WAGON = 'A rough evening. I am still here.';
const THUMOS = 'THUMOS-SECRET private coach line';
const PHOTO = 'progress-photos/private-note.jpg';
const PLAN_KCAL = '2,200 kcal';

const plan: HealthPlan = {
  focus: [
    { id: 'focus-1', text: 'Walk 30 minutes on Monday.', done: true },
    { id: 'focus-2', text: 'Keep three meals at the same times.', done: false },
  ],
  nutrition: { targets: PLAN_KCAL, habits: [], swaps: [] },
  fitness: { intro: '8,689 steps', sessions: [] },
  wellbeing: { habits: [] },
  limits: '',
  disclaimer: 'A plan, not a prescription.',
  updatedAt: '2026-10-15T08:00:00.000Z',
};

const meal: FoodLog = {
  id: 'meal-1',
  userId: 'owner',
  eatenOn: '2026-10-15',
  eatenAt: '2026-10-15T12:00:00.000Z',
  meal: 'dinner',
  source: 'text',
  note: PHOTO,
  items: [{
    name: 'Chicken',
    kcal: 200,
    proteinG: 30,
    carbsG: 0,
    sugarG: 0,
    fibreG: 0,
    unsaturatedG: 2,
    saturatedG: 1,
    transG: 0,
    sodiumMg: 10,
    processed: false,
  }],
  estimated: false,
  portion: 1,
  createdAt: '2026-10-15T12:00:00.000Z',
  previewUrl: PHOTO,
};

function source(): BuddyShareSource {
  return {
    ownerId: 'owner',
    displayName: 'Jordan',
    today: '2026-10-15',
    nutrition: { ...defaultNutritionSettings(), goal: 'maintain', wagonOn: true, wagonVisible: true, wagonNote: WAGON, shareFoodDiary: true },
    foodLogs: [meal],
    checkIns: [{ mood: 7, createdAt: '2026-10-15T08:00:00.000Z', note: NOTE, sleepHours: 4, craving: 9 }],
    gratitude: [{ body: 'The morning was quiet.' }],
    visionStatement: 'A steady year.',
    visionCaptions: ['The canal at dawn.'],
    healthPlan: plan,
    health: [{ kind: 'weight_kg', value: HEIGHT, recordedOn: '2026-10-15' }],
    bodyFatPct: 18,
    leanMassKg: 60,
    waistCm: 80,
    heightCm: HEIGHT,
  };
}

describe('accountability buddy scope', () => {
  it('keeps health data off in every preset', () => {
    for (const id of ['light', 'food', 'picture'] as const) {
      expect(scopeFromPreset(id).healthData).toBe(false);
      expect(scopeFromPreset(id, true).healthData).toBe(true);
      expect(scopeSummary(scopeFromPreset(id))).toContain('Health data stays off.');
    }
    expect(scopeFromPreset('picture').meals).toBe(true);
    expect(scopeFromPreset('light').checkIns).toBe(true);
    expect(scopeFromPreset('light').meals).toBe(false);
  });

  it('shares only the sections that are on, and never the hidden list', () => {
    const hidden = projectBuddyShare(source(), emptyBuddyScope());
    const packed = JSON.stringify(hidden);
    expect(packed).not.toContain(NOTE);
    expect(packed).not.toContain(WAGON);
    expect(packed).not.toContain(THUMOS);
    expect(packed).not.toContain(PHOTO);
    expect(packed).not.toContain(PLAN_KCAL);
    expect(packed).not.toContain('8,689');
    expect(packed).not.toContain(String(HEIGHT));
    expect(hidden.meals).toBeNull();
    expect(hidden.healthData).toBeNull();
    expect(hidden.checkIns).toBeNull();

    const open = projectBuddyShare(source(), scopeFromPreset('picture', true));
    expect(open.meals?.[0]?.detail).toContain('Chicken');
    expect(open.checkIns).toContain('Mood 7');
    expect(open.checkIns).not.toContain(NOTE);
    expect(open.gratitude).toEqual(['The morning was quiet.']);
    expect(open.vision).toContain('A steady year.');
    expect(open.healthPlan?.headline).toBe('Maintain Weight');
    expect(open.healthPlan?.focus.map((item) => item.text).join(' ')).not.toContain('kcal');
    expect(open.healthData?.some((line) => line.startsWith('Weight'))).toBe(true);
    expect(open.healthData?.some((line) => line.startsWith('Body fat'))).toBe(true);
    expect(JSON.stringify(open)).not.toContain(NOTE);
    expect(JSON.stringify(open)).not.toContain(WAGON);
    expect(JSON.stringify(open)).not.toContain(PHOTO);
    expect(JSON.stringify(open.healthData)).not.toContain('191.5 cm');
  });

  it('keeps one buddy’s choices off another buddy’s view', () => {
    const mealsOnly = projectBuddyShare(source(), { ...emptyBuddyScope(), meals: true });
    const moodOnly = projectBuddyShare(source(), { ...emptyBuddyScope(), checkIns: true });
    expect(mealsOnly.meals?.[0]?.detail).toContain('Chicken');
    expect(mealsOnly.checkIns).toBeNull();
    expect(mealsOnly.gratitude).toBeNull();
    expect(moodOnly.meals).toBeNull();
    expect(moodOnly.checkIns).toContain('Mood 7');
    expect(JSON.stringify(moodOnly)).not.toContain('Chicken');
  });
});

describe('buddy links', () => {
  it('reads a code or a token and builds a share the phone can send', () => {
    expect(buddySecretFromUrl('charioteer://buddy?token=0123456789abcdef0123456789abcdef')).toBe('0123456789abcdef0123456789abcdef');
    expect(buddySecretFromUrl('charioteer://buddy?code=ab23cd45')).toBe('AB23CD45');
    expect(buddySecretFromUrl('https://example.com/buddy/AB23CD45')).toBe('AB23CD45');
    expect(buddySecretFromUrl('charioteer://set-password')).toBeNull();
    const code = makeBuddyCode([0, 1, 2, 3, 4, 5, 6, 7]);
    const reminder = buddyReminderMessage('Paul');
    expect(reminder).toContain('Invite sent to Paul.');
    expect(reminder).toContain('There is no new code.');
    expect(reminder).not.toContain('charioteer://');
    const message = buddyShareMessage({ code, url: buddyLinkUrl('0123456789abcdef0123456789abcdef'), expiresAt: '2026-10-22T00:00:00.000Z' });
    expect(message).toContain('charioteer://buddy?token=');
    expect(message).toContain(code);
    expect(message).toContain('uk.co.quanticalabs.charioteer');
    expect(message).toContain('apps.apple.com');
    expect(message).toContain('22 Oct 2026');
  });

  it('does not keep a token on the list a person can read later', () => {
    const list = parseBuddyList({
      sharing: [],
      watching: [],
      links: [{ id: 'link-1', expiresAt: '2026-10-22T00:00:00.000Z', createdAt: '2026-10-15T00:00:00.000Z', scope: scopeFromPreset('light'), token: 'secret-token', code: 'AB23CD45' }],
    });
    expect(JSON.stringify(list)).not.toContain('secret-token');
    expect(JSON.stringify(list)).not.toContain('AB23CD45');
  });
});

describe('buddy invite push', () => {
  const input = {
    ownerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    buddyId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
    inviteId: 'dddddddd-dddd-4ddd-8ddd-ddddddddddd2',
    pending: true,
    blocked: false,
    ownerAdult: true,
    buddyAdult: true,
    notificationsOn: true,
    showSenderName: false,
    senderName: 'Alex',
  };

  it('sends a generic alert without community, and stays quiet when notifications are off', () => {
    expect(buddyInviteAlert(input)).toEqual({
      ok: true,
      title: 'Charioteer',
      body: GENERIC_BUDDY_ALERT,
      data: { buddyInviteId: input.inviteId },
    });
    expect(buddyInviteAlert({ ...input, notificationsOn: false })).toEqual({ ok: false, reason: 'notifications' });
    expect(buddyInviteAlert({ ...input, blocked: true })).toEqual({ ok: false, reason: 'blocked' });
    const named = buddyInviteAlert({ ...input, showSenderName: true, senderName: 'Alex\nMeet at the side door' });
    expect(named.ok && named.body.includes('\n')).toBe(false);
    expect(named.ok && named.body.startsWith('Buddy request from Alex')).toBe(true);
  });
});

describe('buddies screen', () => {
  it('puts waiting invites above the controls and hides empty sections', () => {
    const screen = readFileSync('src/app/(main)/buddies.tsx', 'utf8');
    const waiting = screen.indexOf('Waiting for you');
    const sent = screen.indexOf('Invites you sent');
    const sharing = screen.indexOf('Sharing with you');
    const see = screen.indexOf('Who can see your day');
    const invite = screen.indexOf('label="Invite someone new"');
    expect(waiting).toBeGreaterThan(-1);
    expect(waiting).toBeLessThan(sent);
    expect(sent).toBeLessThan(sharing);
    expect(sharing).toBeLessThan(see);
    expect(see).toBeLessThan(invite);
    expect(screen).toContain('Invite sent to {invite.name}.');
    expect(screen).toContain('Waiting for them to accept.');
    expect(screen).toContain('Send the link again');
    expect(screen).toContain('Cancel invite');
    expect(screen).toContain('buddyReminderMessage');
    expect(screen).toContain('Got a code from someone? Enter it here');
    expect(screen).toContain('This accepts their invite. It does not send a new one.');
    expect(screen).toContain('revokeBuddyLink');
    expect(screen).not.toContain('No requests waiting');
    expect(screen).not.toContain('No one is sharing with you yet');
    expect(screen).not.toContain('You are not sharing with a buddy yet');
    expect(screen).not.toContain('Type a code');
    expect(screen).not.toContain('Invite by link');
    expect(screen).not.toContain("rpc(");
  });
});

describe('buddy share is not the community profile', () => {
  it('reads an accepted invite and does not consult community switches', () => {
    const sql = readFileSync('supabase/migrations/20261015210000_buddy_data_item_fix.sql', 'utf8');
    const fn = sql.slice(sql.indexOf('FUNCTION public.shared_buddy_data'), sql.indexOf('revoke all on function public.shared_buddy_data'));
    expect(fn).toContain("status = 'accepted'");
    expect(fn).toContain('buddy_pair_blocked');
    expect(fn).toContain('buddy_is_adult');
    expect(fn).not.toContain('community_visible');
    expect(fn).not.toContain('viewer_in_community');
    expect(fn).not.toContain('profile_sharing');
    const community = readFileSync('supabase/migrations/20261022200000_shared_health_merge.sql', 'utf8');
    const profile = community.slice(community.indexOf('FUNCTION public.public_profile'), community.indexOf('revoke all on function public.public_profile'));
    expect(profile).toContain('community_visible');
    expect(profile).toContain('viewer_in_community');
    expect(profile).toContain('profile_sharing');
    const demo = readFileSync('src/data/demo-repository.ts', 'utf8');
    const buddy = demo.slice(demo.indexOf('async sharedBuddyData'), demo.indexOf('async sharedHealthPlan'));
    expect(buddy).toContain("status === 'accepted'");
    expect(buddy).not.toContain('communityVisible');
    const pub = demo.slice(demo.indexOf('async publicProfile'), demo.indexOf('async addProfilePhoto'));
    expect(pub).toContain('communityVisible');
  });
});

describe('buddy server', () => {
  const sql = readFileSync('supabase/migrations/20261015160000_accountability_buddies.sql', 'utf8');
  const fn = readFileSync('supabase/functions/notify-buddy-invite/index.ts', 'utf8');

  it('hashes tokens, checks age and blocks, and does not use the community rule', () => {
    expect(sql).toContain('encode(extensions.digest(raw_token, \'sha256\'), \'hex\')');
    expect(sql).toContain('encode(extensions.digest(raw_code, \'sha256\'), \'hex\')');
    expect(sql).not.toContain('viewer_in_community');
    expect(sql).not.toContain('community_visible');
    expect(sql).toContain('buddy_is_adult');
    expect(sql).toContain('buddy_pair_blocked');
    expect(sql).toContain('Too many invites today.');
    expect(sql).toContain('Too many links today.');
    expect(sql).toContain("status = 'revoked'");
    expect(sql).toContain('revoke all on table public.buddy_invites from public, anon, authenticated');
    expect(sql).toContain('revoke all on table public.buddy_links from public, anon, authenticated');
    const shared = sql.slice(sql.indexOf('function public.shared_buddy_data'));
    expect(shared).not.toContain('thumos_messages');
    expect(shared).not.toContain('photo_path');
    expect(shared).not.toContain('height_cm');
    expect(shared).not.toContain('wagon_note');
    expect(shared).not.toContain('c.note');
    const healthAt = shared.indexOf('health_samples');
    expect(healthAt).toBeGreaterThan(shared.indexOf('if share_health then'));
    expect(fn).toContain("skipped: 'messages-only'");
    expect(fn).not.toContain('buddyInviteAlert');
    expect(fn).not.toContain('exp.host');
    expect(fn).not.toContain('community_visible');
    const invite = readFileSync('src/data/supabase-repository.ts', 'utf8');
    const create = invite.slice(invite.indexOf('async createBuddyInvite'), invite.indexOf('async createBuddyLink'));
    expect(create).toContain("rpc('create_buddy_invite'");
    expect(create).not.toContain('notify-buddy-invite');
  });
});

async function signedIn(): Promise<DemoRepository> {
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
  await repo.signIn('alex.hart@example.com', DEMO_PASSWORD);
  return repo;
}

describe('demo buddies', () => {
  it('shows an accepted share without community, and keeps a new link secret off the list', async () => {
    const repo = await signedIn();
    const list = await repo.listBuddies();
    expect(list.watching.some((invite) => invite.name === 'Jordan Ellis' && invite.status === 'accepted')).toBe(true);
    expect(list.watching.some((invite) => invite.name === 'Priya Shah' && invite.status === 'pending')).toBe(true);
    const view = await repo.sharedBuddyData(PEOPLE.jordan);
    expect(view?.meals?.[0]?.detail).toContain('Chicken');
    expect(view?.healthPlan?.headline).toBeTruthy();
    const packed = JSON.stringify(view);
    expect(packed).not.toContain('rough evening');
    expect(packed).not.toContain('2,200');
    expect(packed).not.toContain('Out walking');
    expect(packed).not.toContain('canal');
    expect(view?.healthData).toBeNull();

    const pass = await repo.createBuddyLink(scopeFromPreset('light'));
    const again = await repo.listBuddies();
    expect(JSON.stringify(again)).not.toContain(pass.code);
    expect(JSON.stringify(again)).not.toContain(pass.token);
    await expect(repo.acceptBuddyLink(pass.code)).rejects.toThrow('That invite is not available.');

    const jordan = list.watching.find((invite) => invite.ownerId === PEOPLE.jordan);
    await repo.revokeBuddy(jordan!.id);
    expect(await repo.sharedBuddyData(PEOPLE.jordan)).toBeNull();
  });
});
