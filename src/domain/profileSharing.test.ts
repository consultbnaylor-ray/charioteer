import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  BIO_EXAMPLE,
  defaultProfileSharing,
  moodStreakCount,
  normalizeProfileSharing,
  projectPublicProfile,
  sensitiveTurnedOn,
  sharedReportItems,
  toggleHealthKind,
  toggleShareId,
  type ShareSource,
} from './profileSharing';

const secret = {
  reason: 'I want to be here for my daughter',
  note: 'craving was awful last night',
  town: 'Bristol',
  caption: 'A quiet kitchen',
  diary: 'My daughter laughing at breakfast',
  flag: 'Speak to a GP or NHS 111',
};

function source(overrides: Partial<ShareSource> = {}): ShareSource {
  return {
    now: new Date('2026-10-11T12:00:00.000Z'),
    today: '2026-10-11',
    displayName: 'Alex Hart',
    bio: '',
    town: secret.town,
    stage: 'stopped',
    sobrietyStartedAt: '2026-07-13T09:00:00.000Z',
    weeklySpendGbp: 40,
    weeklyUnits: 20,
    interestLabels: ['Hiking', 'Gym'],
    reasons: [{ body: secret.reason, sortOrder: 0 }, { body: 'Morning walks', sortOrder: 1 }],
    checkIns: [
      { createdAt: '2026-10-11T08:00:00.000Z' },
      { createdAt: '2026-10-10T08:00:00.000Z' },
    ],
    health: [
      { kind: 'steps', value: 8000, recordedOn: '2026-10-11' },
      { kind: 'steps', value: 4000, recordedOn: '2026-10-10' },
      { kind: 'sleep_hours', value: 5, recordedOn: '2026-10-11' },
      { kind: 'resting_heart_rate', value: 110, recordedOn: '2026-10-11' },
    ],
    gratitude: [{ id: 'g1', body: secret.diary, entryDate: '2026-10-11', photos: [{ id: 'gp1', caption: 'Window light' }] }],
    vision: [{ id: 'v1', caption: secret.caption, area: 'Home' }],
    progressPhotos: [
      { id: 'p1', note: 'Out on the canal.', caption: '', takenOn: '2026-08-01', monthIndex: 1, visibility: 'private' },
      { id: 'p2', note: 'Shared day.', caption: 'Morning gym.', takenOn: '2026-09-01', monthIndex: 2, visibility: 'community' },
    ],
    pinnedQuoteId: null,
    ...overrides,
  };
}

describe('public profile projection', () => {
  it('shares name and interests only, until a switch is on', () => {
    const view = projectPublicProfile(source(), defaultProfileSharing());
    expect(view.displayName).toBe('Alex Hart');
    expect(view.interests).toEqual(['Hiking', 'Gym']);
    expect(view.town).toBeNull();
    expect(view.stage).toBeNull();
    expect(view.sober).toBeNull();
    expect(view.reasons).toEqual([]);
    expect(view.savings).toBeNull();
    expect(view.moodStreak).toBeNull();
    expect(view.health).toEqual([]);
    expect(view.gratitude).toEqual([]);
    expect(view.gratitudePhotos).toEqual([]);
    expect(view.vision).toEqual([]);
    expect(view.bio).toBeNull();
    expect(view.progressPhotos).toEqual([{ id: 'p2', caption: 'Morning gym.', takenOn: '2026-09-01', monthIndex: 2 }]);
    const packed = JSON.stringify(view);
    expect(packed).not.toContain(secret.reason);
    expect(packed).not.toContain(secret.note);
    expect(packed).not.toContain(secret.town);
    expect(packed).not.toContain(secret.caption);
    expect(packed).not.toContain(secret.diary);
    expect(packed).not.toContain(secret.flag);
    expect(packed).not.toContain('Out on the canal');
    expect(packed).not.toContain('Shared day.');
    expect(packed).not.toContain('Window light');
    expect(packed).toContain('Morning gym.');
    expect(packed).not.toContain('110');
    expect(packed).not.toContain('weeklySpend');
    expect(packed).not.toContain('storage');
    expect(view.hiddenLabels).toContain('Bio');
    expect(view.hiddenLabels).toContain('Town');
    expect(view.hiddenLabels).toContain('Reasons');
    expect(view.sharedLabels).toEqual(['Name', 'Interests', 'Progress photos']);
  });

  it('returns only the chosen lines, totals, and averages', () => {
    let sharing = defaultProfileSharing();
    sharing = { ...sharing, town: true, stage: true, sober: true, savings: true, moodStreak: true, sensitiveConsentAt: '2026-10-11T00:00:00.000Z' };
    sharing = toggleShareId(sharing, 'reasonBodies', secret.reason, true);
    sharing = toggleHealthKind(sharing, 'steps', true);
    sharing = toggleShareId(sharing, 'gratitudeIds', 'g1', true);
    sharing = toggleShareId(sharing, 'visionIds', 'v1', true);
    const view = projectPublicProfile(source(), sharing);
    expect(view.town).toBe('Bristol');
    expect(view.stage).toBe('I’ve stopped');
    expect(view.sober?.days).toBeGreaterThan(0);
    expect(view.sober?.milestones.length).toBeGreaterThan(0);
    expect(view.reasons).toEqual([secret.reason]);
    expect(view.reasons).not.toContain('Morning walks');
    expect(view.savings?.moneyGbp).toBeGreaterThan(0);
    expect(view.savings?.units).toBeGreaterThan(0);
    expect(JSON.stringify(view.savings)).not.toContain('40');
    expect(view.moodStreak).toBe(2);
    expect(view.health).toEqual(['Steps average 6,000 steps']);
    expect(view.health.join(' ')).not.toMatch(/sleep|bpm|111|GP/i);
    expect(view.gratitude.map((entry) => entry.body)).toEqual([secret.diary]);
    expect(view.gratitudePhotos).toEqual([]);
    expect(view.vision[0]?.caption).toBe(secret.caption);
    const withPhoto = projectPublicProfile(source(), toggleShareId(sharing, 'gratitudePhotoIds', 'gp1', true));
    expect(withPhoto.gratitudePhotos).toEqual([{ id: 'gp1', caption: 'Window light' }]);
    expect(JSON.stringify(withPhoto)).not.toContain('storage');
    expect(JSON.stringify(withPhoto)).not.toContain(secret.note);
  });

  it('hides a line as soon as its switch is off', () => {
    const on = toggleShareId({ ...defaultProfileSharing(), town: true }, 'reasonBodies', secret.reason, true);
    const off = toggleShareId({ ...on, town: false }, 'reasonBodies', secret.reason, false);
    const view = projectPublicProfile(source(), off);
    expect(view.town).toBeNull();
    expect(view.reasons).toEqual([]);
  });

  it('shares a bio by default and never copies a private note', () => {
    const shown = projectPublicProfile(source({ bio: 'Dad of two.' }), defaultProfileSharing());
    expect(shown.bio).toBe('Dad of two.');
    expect(shown.sharedLabels).toContain('Bio');
    const off = projectPublicProfile(source({ bio: 'Dad of two.' }), { ...defaultProfileSharing(), bio: false });
    expect(off.bio).toBeNull();
    expect(JSON.stringify(off)).not.toContain('Dad of two.');
    const items = sharedReportItems(shown);
    expect(items).toContainEqual({ label: 'Bio', summary: 'Dad of two.' });
    expect(items.find((item) => item.label === 'Progress photo')?.summary).toBe('Morning gym.');
    expect(JSON.stringify(items)).not.toContain('Shared day.');
    expect(JSON.stringify(items)).not.toContain('Out on the canal');
    expect(sensitiveTurnedOn({ ...defaultProfileSharing(), bio: false }, defaultProfileSharing())).toBe(false);
  });

  it('asks for consent the first time sobriety or health is shared', () => {
    const before = defaultProfileSharing();
    expect(sensitiveTurnedOn(before, { ...before, town: true })).toBe(false);
    expect(sensitiveTurnedOn(before, { ...before, sober: true })).toBe(true);
    expect(sensitiveTurnedOn(before, toggleHealthKind(before, 'sleep_hours', true))).toBe(true);
    expect(sensitiveTurnedOn(before, toggleShareId(before, 'gratitudeIds', 'g1', true))).toBe(false);
    const consented = { ...before, sober: true, sensitiveConsentAt: '2026-10-11T00:00:00.000Z' };
    expect(sensitiveTurnedOn(consented, { ...consented, stage: true })).toBe(true);
  });

  it('counts check-in days and drops a gap', () => {
    expect(moodStreakCount([{ createdAt: '2026-10-11T08:00:00.000Z' }, { createdAt: '2026-10-09T08:00:00.000Z' }], '2026-10-11')).toBe(1);
    expect(moodStreakCount([{ createdAt: '2026-10-10T08:00:00.000Z' }], '2026-10-11')).toBe(1);
    expect(moodStreakCount([{ createdAt: '2026-10-08T08:00:00.000Z' }], '2026-10-11')).toBe(0);
  });

  it('ignores unknown settings and keeps the defaults off', () => {
    const parsed = normalizeProfileSharing({ town: 'yes', sober: 1, healthKinds: ['steps', 'height', 'steps'], reasonBodies: ['  A  ', 'A', ''] });
    expect(parsed.town).toBe(false);
    expect(parsed.sober).toBe(false);
    expect(parsed.bio).toBe(true);
    expect(normalizeProfileSharing({ bio: false }).bio).toBe(false);
    expect(parsed.healthKinds).toEqual(['steps']);
    expect(parsed.reasonBodies).toEqual(['A']);
  });
});

describe('public_profile database function', () => {
  const sql = readFileSync('supabase/migrations/20261010270000_profile_sharing.sql', 'utf8');

  it('returns shared fields only, through a definer function, and leaves private tables closed', () => {
    expect(sql).toContain('create table public.profile_sharing');
    expect(sql).toContain('user_id = auth.uid()');
    expect(sql).toContain('grant select, insert, update on public.profile_sharing to authenticated');
    expect(sql).not.toMatch(/grant select on public\.(reasons|check_ins|health_samples|gratitude_entries|gratitude_photos|vision_board_items) to authenticated/i);
    expect(sql).toContain('create or replace function public.public_profile(user_id uuid)');
    expect(sql).toContain('security definer');
    expect(sql).toContain('set search_path = public');
    expect(sql).toContain('from public.blocks');
    expect(sql).toContain('community_visible');
    expect(sql).toContain('age_confirmed_18');
    expect(sql).toContain("settings->>'town'");
    expect(sql).toContain("settings->>'sober'");
    expect(sql).toContain('reasonBodies');
    expect(sql).toContain('healthKinds');
    expect(sql).toContain("visibility = 'community'");
    expect(sql).not.toMatch(/storage_path/);
    expect(sql).not.toContain('craving');
    expect(sql).not.toContain('height_cm');
    expect(sql).toContain('revoke all on function public.public_profile(uuid) from public, anon');
    expect(sql).toContain('grant execute on function public.public_profile(uuid) to authenticated');
    expect(sql).toContain('set town = null');
  });

  it('puts a Share on profile switch on every section', () => {
    const home = readFileSync('src/app/(main)/home.tsx', 'utf8');
    const you = readFileSync('src/app/(main)/profile.tsx', 'utf8');
    const checkIn = readFileSync('src/app/(main)/check-in.tsx', 'utf8');
    const health = readFileSync('src/ui/HealthBoard.tsx', 'utf8');
    const diary = readFileSync('src/app/(main)/gratitude.tsx', 'utf8');
    const vision = readFileSync('src/ui/VisionBoard.tsx', 'utf8');
    const photos = readFileSync('src/ui/ProgressPhotos.tsx', 'utf8');
    const card = readFileSync('src/ui/PublicProfileCard.tsx', 'utf8');
    const people = readFileSync('src/ui/CommunityProfile.tsx', 'utf8');
    for (const source of [home, you, checkIn, health, diary, vision, card]) {
      expect(source).toContain('<ShareOnProfile');
    }
    expect(home).toContain('moodStreak');
    expect(home).toContain('healthKinds');
    expect(you).toContain('reasonBodies');
    expect(you).toContain('town: selected');
    expect(diary).toContain('gratitudeIds');
    expect(diary).toContain('gratitudePhotoIds');
    expect(diary).not.toMatch(/Share with community|visibility/);
    expect(vision).toContain('visionIds');
    expect(vision).not.toMatch(/Share with community|visibility/);
    expect(photos).toContain('{SHARE_HINT}');
    expect(photos).toContain('SENSITIVE_SHARE_BODY');
    expect(photos).toContain('{PROGRESS_SHARE_WARNING}');
    expect(card).toContain('hiddenLabels');
    expect(card).toContain('label="Bio"');
    expect(card).toContain('placeholder={BIO_EXAMPLE}');
    expect(card).toContain('{bio.length}/{BIO_LIMIT}');
    expect(card).not.toMatch(/\{photo\.note/);
    expect(people).toContain('photo.caption');
    expect(people).not.toContain('photo.note');
    expect(people).toContain("reason: 'Shared profile'");
    expect(people).toContain('publicProfile');
    expect(readFileSync('src/app/(main)/people.tsx', 'utf8')).not.toMatch(/gratitude/);
  });
});

describe('bio and photo captions', () => {
  const sql = readFileSync('supabase/migrations/20261010290000_profile_bio_captions.sql', 'utf8');
  const profile = sql.slice(sql.indexOf('function public.public_profile'), sql.indexOf('function public.shared_progress_photos'));

  it('adds the columns, shares a bio by default, and leaves the private note out', () => {
    expect(BIO_EXAMPLE).toBe('Dad of two, gym most mornings, 90 days sober and counting.');
    expect(sql).toContain('add column if not exists bio text');
    expect(sql).toContain('grant update (bio) on public.profiles to authenticated');
    expect(sql.toLowerCase()).not.toMatch(/grant update on public\.profiles/i);
    expect(sql.toLowerCase()).not.toMatch(/grant update on public\.progress_photos/i);
    expect(sql.toLowerCase()).not.toMatch(/grant update on public\.gratitude_photos/i);
    expect(sql).toContain('grant update (caption) on public.progress_photos to authenticated');
    expect(sql).toContain('grant select (caption) on public.progress_photos to authenticated');
    expect(sql).toContain('grant update (caption) on public.gratitude_photos to authenticated');
    expect(sql).toContain("coalesce((settings->>'bio')::boolean, true)");
    expect(sql).toContain("coalesce((new.settings->>'bio')::boolean, true)");
    expect(sql).toContain('alter table public.directory');
    expect(sql).toContain('drop policy if exists progress_photos_community_read');
    expect(sql).toContain('create or replace function public.shared_progress_photos');
    expect(sql).not.toContain('p.note');
    expect(profile).toContain("'caption', p.caption");
    expect(profile).toContain("'bio', shown_bio");
    expect(profile).toContain('security definer');
    expect(profile).not.toContain('storage_path');
    expect(profile).not.toContain('height_cm');
  });
});
