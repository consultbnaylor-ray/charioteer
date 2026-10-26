import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  BIO_EXAMPLE,
  applyWeightAndBodyShare,
  defaultProfileSharing,
  healthShareLabel,
  moodStreakCount,
  normalizeProfileSharing,
  parsePublicProfile,
  projectPublicProfile,
  SHARE_HINT,
  shownList,
  sensitiveShareConfirm,
  sensitiveTurnedOn,
  sharedReportItems,
  toggleHealthKind,
  toggleShareId,
  type ShareSource,
} from './profileSharing';

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

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
    expect(view.milestones).toEqual([]);
    expect(view.reasons).toEqual([]);
    expect(view.moneySaved).toBeNull();
    expect(view.unitsAvoided).toBeNull();
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
    expect(view.hiddenLabels).toContain('Days sober');
    expect(view.hiddenLabels).toContain('Money saved');
    expect(view.hiddenLabels).toContain('Units avoided');
    expect(view.sharedLabels).toEqual(['Name', 'Interests', 'Progress photos']);
  });

  it('returns only the chosen lines, totals, and averages', () => {
    let sharing = defaultProfileSharing();
    sharing = {
      ...sharing,
      town: true,
      stage: true,
      soberDays: true,
      milestones: true,
      moneySaved: true,
      unitsAvoided: true,
      moodStreak: true,
      sensitiveConsentAt: '2026-10-11T00:00:00.000Z',
    };
    sharing = toggleShareId(sharing, 'reasonBodies', secret.reason, true);
    sharing = toggleHealthKind(sharing, 'steps', true);
    sharing = toggleShareId(sharing, 'gratitudeIds', 'g1', true);
    sharing = toggleShareId(sharing, 'visionIds', 'v1', true);
    const view = projectPublicProfile(source(), sharing);
    expect(view.town).toBe('Bristol');
    expect(view.stage).toBe('I’ve stopped');
    expect(view.sober?.days).toBeGreaterThan(0);
    expect(view.sober?.since).toBe('2026-07-13');
    expect(view.milestones.length).toBeGreaterThan(0);
    expect(view.reasons).toEqual([secret.reason]);
    expect(view.reasons).not.toContain('Morning walks');
    expect(view.moneySaved).toBeGreaterThan(0);
    expect(view.unitsAvoided).toBeGreaterThan(0);
    expect(JSON.stringify({ money: view.moneySaved, units: view.unitsAvoided })).not.toContain('40');
    expect(view.moodStreak).toBe(2);
    expect(view.health).toEqual(['Steps average 6,000 steps']);
    expect(view.health.join(' ')).not.toMatch(/sleep|bpm|111|GP/i);
    expect(view.gratitude.map((entry) => entry.body)).toEqual([secret.diary]);
    expect(view.gratitudePhotos).toEqual([]);
    expect(view.vision[0]?.caption).toBe(secret.caption);
    const photoOnly = projectPublicProfile(source(), toggleShareId(defaultProfileSharing(), 'gratitudePhotoIds', 'gp1', true));
    expect(photoOnly.gratitudePhotos).toEqual([]);
    const withPhoto = projectPublicProfile(source(), toggleShareId(sharing, 'gratitudePhotoIds', 'gp1', true));
    expect(withPhoto.gratitudePhotos).toEqual([{
      id: 'gp1',
      entryId: 'g1',
      caption: 'Window light',
      storagePath: '',
      previewUrl: null,
    }]);
    expect(JSON.stringify(withPhoto)).not.toContain(secret.note);
  });

  it('returns a shared gratitude photo path and drops a path that was not switched on', () => {
    const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
    const line = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
    const sharedId = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1';
    const hiddenId = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1';
    const otherLine = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1';
    const sharedPath = `${owner}/${sharedId}.jpg`;
    const hiddenPath = `${owner}/${hiddenId}.jpg`;
    const preview = 'data:image/jpeg;base64,abc';
    let sharing = toggleShareId(defaultProfileSharing(), 'gratitudeIds', line, true);
    sharing = toggleShareId(sharing, 'gratitudePhotoIds', sharedId, true);
    const view = projectPublicProfile(source({
      gratitude: [
        {
          id: line,
          body: 'Window light',
          entryDate: '2026-10-11',
          photos: [
            { id: sharedId, caption: 'The sash', storagePath: sharedPath, previewUrl: preview },
            { id: hiddenId, caption: 'Left private', storagePath: hiddenPath, previewUrl: 'https://photos.example/hidden.jpg' },
            { id: 'not-a-uuid', caption: 'Bad path', storagePath: '../secret.jpg', previewUrl: 'javascript:alert(1)' },
          ],
        },
        {
          id: otherLine,
          body: 'Not on the profile',
          entryDate: '2026-10-10',
          photos: [{ id: hiddenId, caption: 'Other line', storagePath: `${owner}/${otherLine}.jpg` }],
        },
      ],
    }), sharing);
    expect(view.gratitudePhotos).toEqual([{
      id: sharedId,
      entryId: line,
      caption: 'The sash',
      storagePath: sharedPath,
      previewUrl: preview,
    }]);
    const packed = JSON.stringify(view);
    expect(packed).not.toContain(hiddenPath);
    expect(packed).not.toContain('../secret.jpg');
    expect(packed).not.toContain('javascript:');
    expect(packed).not.toContain('Not on the profile');
    expect(sharedReportItems(view).find((item) => item.label === 'Gratitude photo')?.summary).toBe('The sash');
    const parsed = parsePublicProfile({
      displayName: 'Alex',
      gratitude: [{ id: line, body: 'Window light', entryDate: '2026-10-11' }],
      gratitudePhotos: [
        { id: sharedId, entryId: line, caption: 'The sash', storagePath: sharedPath, previewUrl: 'https://photos.example/ok.jpg' },
        { id: hiddenId, entryId: line, caption: 'Dropped path', storagePath: '../secret.jpg', previewUrl: 'http://photos.example/plain.jpg' },
      ],
    });
    expect(parsed?.gratitudePhotos).toEqual([
      { id: sharedId, entryId: line, caption: 'The sash', storagePath: sharedPath, previewUrl: 'https://photos.example/ok.jpg' },
      { id: hiddenId, entryId: line, caption: 'Dropped path', storagePath: '', previewUrl: null },
    ]);
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

  it('shares days sober without the rest of the old bundle', () => {
    const daysOnly = projectPublicProfile(source(), { ...defaultProfileSharing(), soberDays: true });
    expect(daysOnly.sober?.days).toBeGreaterThan(0);
    expect(daysOnly.sober?.since).toBe('2026-07-13');
    expect(daysOnly.milestones).toEqual([]);
    expect(daysOnly.stage).toBeNull();
    expect(daysOnly.reasons).toEqual([]);
    expect(daysOnly.moneySaved).toBeNull();
    expect(daysOnly.unitsAvoided).toBeNull();
    expect(daysOnly.moodStreak).toBeNull();
    expect(daysOnly.health).toEqual([]);
    const packed = JSON.stringify(daysOnly);
    expect(packed).not.toContain(secret.reason);
    expect(packed).not.toContain('40');
    expect(packed).not.toContain('I’ve stopped');
    expect(packed).not.toContain('Steps average');
    const moneyOnly = projectPublicProfile(source(), { ...defaultProfileSharing(), moneySaved: true });
    expect(moneyOnly.moneySaved).toBeGreaterThan(0);
    expect(moneyOnly.unitsAvoided).toBeNull();
    expect(moneyOnly.sober).toBeNull();
    expect(String(moneyOnly.moneySaved)).not.toContain('40');
  });

  it('maps an old section that was on to each of its items', () => {
    const legacy = normalizeProfileSharing({ sober: true, savings: true });
    expect(legacy.soberDays).toBe(true);
    expect(legacy.milestones).toBe(true);
    expect(legacy.moneySaved).toBe(true);
    expect(legacy.unitsAvoided).toBe(true);
    const explicit = normalizeProfileSharing({
      sober: true,
      savings: true,
      soberDays: true,
      milestones: false,
      moneySaved: false,
      unitsAvoided: true,
    });
    expect(explicit.soberDays).toBe(true);
    expect(explicit.milestones).toBe(false);
    expect(explicit.moneySaved).toBe(false);
    expect(explicit.unitsAvoided).toBe(true);
    const view = projectPublicProfile(source(), legacy);
    expect(view.sober?.since).toBe('2026-07-13');
    expect(view.milestones.length).toBeGreaterThan(0);
    expect(view.moneySaved).toBeGreaterThan(0);
    expect(view.unitsAvoided).toBeGreaterThan(0);
  });

  it('asks for consent the first time sobriety or health is shared', () => {
    const before = defaultProfileSharing();
    expect(sensitiveTurnedOn(before, { ...before, town: true })).toBe(false);
    expect(sensitiveTurnedOn(before, { ...before, soberDays: true })).toBe(true);
    expect(sensitiveTurnedOn(before, { ...before, healthPlan: true })).toBe(true);
    expect(sensitiveTurnedOn(before, { ...before, moneySaved: true })).toBe(true);
    expect(sensitiveTurnedOn(before, toggleHealthKind(before, 'sleep_hours', true))).toBe(true);
    expect(sensitiveTurnedOn(before, toggleShareId(before, 'gratitudeIds', 'g1', true))).toBe(false);
    const consented = { ...before, soberDays: true, sensitiveConsentAt: '2026-10-11T00:00:00.000Z' };
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
    expect(parsed.soberDays).toBe(false);
    expect(parsed.bio).toBe(true);
    expect(normalizeProfileSharing({ bio: false }).bio).toBe(false);
    expect(parsed.healthKinds).toEqual(['steps']);
    expect(parsed.reasonBodies).toEqual(['A']);
    expect(parsed.shareNewGratitude).toBe(false);
    expect(parsed.healthPlan).toBe(false);
    expect(defaultProfileSharing().healthPlan).toBe(false);
    expect(defaultProfileSharing().shareBodyFigures).toBe(false);
    expect(defaultProfileSharing().shareNewGratitude).toBe(false);
    const figures = applyWeightAndBodyShare(defaultProfileSharing(), true);
    expect(figures.shareBodyFigures).toBe(true);
    expect(figures.healthKinds).toEqual(['weight_kg']);
    expect(applyWeightAndBodyShare(figures, false)).toMatchObject({ shareBodyFigures: false, healthKinds: [] });
    expect(sensitiveTurnedOn(defaultProfileSharing(), figures)).toBe(true);
    expect(normalizeProfileSharing({ shareNewGratitude: true }).shareNewGratitude).toBe(true);
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

  it('adds one key per box and keeps an old section that was on', () => {
    const names = readdirSync('supabase/migrations').filter((name) => name.endsWith('.sql')).sort();
    const definers = names.filter((name) => readFileSync(`supabase/migrations/${name}`, 'utf8').includes('function public.public_profile'));
    expect(definers[definers.length - 1]).toBe('20261010340000_gratitude_include_photo.sql');
    const shareItems = readFileSync('supabase/migrations/20261010320000_profile_share_items.sql', 'utf8');
    const latest = readFileSync('supabase/migrations/20261010340000_gratitude_include_photo.sql', 'utf8');
    const profile = latest.slice(latest.indexOf('function public.public_profile'));
    expect(shareItems).toContain("jsonb_build_object('soberDays', true)");
    expect(shareItems).toContain("jsonb_build_object('milestones', true)");
    expect(shareItems).toContain("jsonb_build_object('moneySaved', true)");
    expect(shareItems).toContain("jsonb_build_object('unitsAvoided', true)");
    expect(shareItems).toContain('not (settings ? \'soberDays\')');
    expect(profile).toContain('gp.entry_id = any(gratitude_ids)');
    expect(profile).toContain("coalesce((settings->>'soberDays')::boolean, (settings->>'sober')::boolean, false)");
    expect(profile).toContain("coalesce((settings->>'milestones')::boolean, (settings->>'sober')::boolean, false)");
    expect(profile).toContain("coalesce((settings->>'moneySaved')::boolean, (settings->>'savings')::boolean, false)");
    expect(profile).toContain("coalesce((settings->>'unitsAvoided')::boolean, (settings->>'savings')::boolean, false)");
    expect(profile).toContain("'since', to_char(person.sobriety_started_at at time zone 'Europe/London', 'YYYY-MM-DD')");
    expect(profile).toContain('I’ve stopped');
    expect(profile).toContain("'Days sober'::text");
    expect(profile).toContain("'Milestones'::text");
    expect(profile).toContain("'Money saved'::text");
    expect(profile).toContain("'Units avoided'::text");
    expect(profile).toContain("'moneySaved', shown_money");
    expect(profile).toContain("'unitsAvoided', shown_units");
    expect(profile).not.toContain("'Days sober and milestones'");
    expect(profile).not.toContain("'Money saved and units avoided'");
    expect(profile).not.toContain('storage_path');
    expect(profile).not.toContain('height_cm');
    expect(profile).toContain('security definer');
    expect(profile).toContain("'position', ph.position");
    const soberObject = profile.slice(profile.indexOf("shown_sober :="), profile.indexOf('shared_labels := shared_labels || \'Days sober\'::text'));
    expect(soberObject).toContain("'days', days");
    expect(soberObject).not.toContain('milestones');
  });

  it('puts one labelled switch under each box, and on Today only for days sober', () => {
    const home = readFileSync('src/app/(main)/home.tsx', 'utf8');
    const you = readFileSync('src/app/(main)/profile.tsx', 'utf8');
    const checkIn = readFileSync('src/app/(main)/check-in.tsx', 'utf8');
    const quotes = readFileSync('src/app/(main)/quotes.tsx', 'utf8');
    const sharing = readFileSync('src/app/(main)/sharing.tsx', 'utf8');
    const health = readFileSync('src/ui/HealthBoard.tsx', 'utf8');
    const diary = readFileSync('src/app/(main)/gratitude.tsx', 'utf8');
    const vision = readFileSync('src/ui/VisionBoard.tsx', 'utf8');
    const photos = readFileSync('src/ui/ProgressPhotos.tsx', 'utf8');
    const card = readFileSync('src/ui/PublicProfileCard.tsx', 'utf8');
    const people = readFileSync('src/ui/CommunityProfile.tsx', 'utf8');
    const peopleScreen = readFileSync('src/app/(main)/people.tsx', 'utf8');
    const soberToggle = home.slice(home.indexOf('Correct the sober start date'), home.indexOf('Quote of the day'));
    expect(soberToggle).toContain('label="Share days sober"');
    expect(soberToggle).toContain('soberDays: selected');
    expect(soberToggle).not.toContain('moneySaved');
    expect(soberToggle).not.toContain('milestones: selected');
    expect(home.slice(home.indexOf('Quote of the day'))).not.toContain('<ShareOnProfile');
    expect(home.match(/<ShareOnProfile/g)).toHaveLength(1);
    expect(quotes).not.toContain('<ShareOnProfile');
    expect(checkIn).toContain('label="Share mood streak"');
    expect(checkIn).toContain('moodStreak: selected');
    expect(sharing).toContain('What I share');
    expect(sharing).toContain('label="Share bio"');
    expect(sharing).toContain('label="Share town"');
    expect(sharing).toContain('label="Share stage"');
    expect(sharing).toContain('label="Share days sober"');
    expect(sharing).toContain('label="Share milestones"');
    expect(sharing).toContain('label="Share money saved"');
    expect(sharing).toContain('label="Share units avoided"');
    expect(sharing).toContain('label="Share mood streak"');
    expect(sharing).toContain('label="Share pinned quote"');
    expect(sharing).not.toContain('Share days sober and milestones');
    expect(sharing).not.toContain('Share money saved and units avoided');
    expect(you).toContain('label="Share stage"');
    expect(you).toContain('label="Share town"');
    expect(you).toContain('label="Share pinned quote"');
    expect(you).toContain('reasonBodies');
    expect(you).toContain('What I share');
    expect(you).not.toContain('<SharingGroup');
    expect(peopleScreen).toContain('What I share');
    expect(health).not.toContain('<SharingGroup');
    expect(health).toContain('healthShareLabel');
    const metricCard = health.slice(health.indexOf('function MetricCard'), health.indexOf('function Readings'));
    expect(metricCard).toContain('<ShareOnProfile');
    expect(metricCard).toContain('healthShareLabel(label)');
    const weekSummary = health.slice(health.indexOf('Your health this week'), health.indexOf('metrics.map'));
    expect(weekSummary).not.toContain('<ShareOnProfile');
    expect(healthShareLabel('Steps')).toBe('Share steps average');
    expect(healthShareLabel('Sleep')).toBe('Share sleep average');
    expect(sensitiveShareConfirm('Days sober')).toBe('Days sober is health data under UK GDPR. Other members will see it. Share?');
    expect(diary).not.toContain('<SharingGroup');
    expect(diary).toContain('gratitudeIds');
    expect(diary).toContain('gratitudePhotoIds');
    expect(diary).toContain('label="Include photo"');
    expect(diary).toContain('label="Share on profile"');
    expect(diary).not.toContain('Share photo');
    expect(diary).not.toMatch(/Share with community|visibility/);
    expect(vision).not.toContain('<SharingGroup');
    expect(vision).toContain('visionIds');
    expect(vision).not.toMatch(/Share with community|visibility/);
    expect(SHARE_HINT).toBe('Profile is visible to other community members');
    expect(photos).toContain('{SHARE_HINT}');
    expect(photos).toContain("sensitiveShareConfirm('This progress photo')");
    expect(photos).toContain("sensitiveShareConfirm('This comparison')");
    expect(photos).not.toContain('SENSITIVE_SHARE_BODY');
    expect(photos).toContain('{PROGRESS_SHARE_WARNING}');
    expect(card).toContain('hiddenLabels');
    expect(card).toContain('label="Bio"');
    expect(card).toContain('label="Share bio"');
    expect(card).toContain('placeholder={BIO_EXAMPLE}');
    expect(card).toContain('{bio.length}/{BIO_LIMIT}');
    expect(card).not.toMatch(/\{photo\.note/);
    expect(people).toContain('photo.caption');
    expect(people).not.toContain('photo.note');
    expect(people).toContain("reason: 'Shared profile'");
    expect(people).toContain('Report this profile');
    expect(people).toContain('label="Reason"');
    expect(people).toContain('⋯');
    expect(people).toContain('privateMessageFailure');
    expect(people).toContain('label="Try again"');
    expect(people).not.toContain('`Report ${item.label}`');
    expect(people).not.toContain('label="Report photo"');
    expect(people).not.toContain('label="Report profile"');
    expect(people).toContain('publicProfile');
    expect(people).toContain('formatSoberShare');
    expect(peopleScreen).not.toMatch(/gratitude/);
    const control = readFileSync('src/ui/ShareOnProfile.tsx', 'utf8');
    expect(control).toContain('sensitiveShareConfirm(item)');
    expect(control).not.toContain('Share this');
    expect(control).not.toContain('SENSITIVE_SHARE_BODY');
    expect(control).not.toContain('>Sharing<');
    const allowed = [
      'src/ui/ShareOnProfile.tsx',
      'src/app/(main)/sharing.tsx',
      'src/app/(main)/home.tsx',
      'src/app/(main)/check-in.tsx',
      'src/ui/HealthBoard.tsx',
      'src/app/(main)/gratitude.tsx',
      'src/ui/VisionBoard.tsx',
      'src/app/(main)/profile.tsx',
      'src/ui/PublicProfileCard.tsx',
      'src/app/(main)/health-plan.tsx',
    ];
    const found = filesUnder('src')
      .filter((path) => !/\.test\.tsx?$/.test(path))
      .filter((path) => {
        const source = readFileSync(path, 'utf8');
        return source.includes('<ShareOnProfile') || source.includes('export function ShareOnProfile');
      })
      .map((path) => path.split('\\').join('/'))
      .sort();
    expect(found).toEqual([...allowed].sort());
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

  it('reads a null public profile without throwing', () => {
    const parsed = parsePublicProfile({
      displayName: 'Jordan Ellis',
      gratitudePhotos: null,
      vision: null,
      gratitude: null,
      profilePhotos: null,
      progressPhotos: null,
      interests: null,
      milestones: null,
      reasons: null,
      health: null,
      foodDiary: null,
      quality: null,
      goal: null,
      calories: null,
      progress: null,
      wagon: null,
      bodyComposition: null,
    });
    expect(parsed?.gratitudePhotos).toEqual([]);
    expect(parsed?.vision).toEqual([]);
    expect(parsed?.gratitude).toEqual([]);
    expect(parsed?.profilePhotos).toEqual([]);
    expect(parsed?.progressPhotos).toEqual([]);
    expect(parsed?.interests).toEqual([]);
    expect(parsed?.foodDiary).toBeNull();
    expect(parsed?.quality).toBeNull();
    expect(parsed?.goal).toBeNull();
    expect(sharedReportItems(parsed!)).toEqual([]);
    expect(shownList(null)).toEqual([]);
    expect(JSON.stringify(parsed)).not.toContain('bodyComposition');
    const facts = readFileSync('src/ui/CommunityProfile.tsx', 'utf8');
    const nutritionUi = readFileSync('src/ui/NutritionShare.tsx', 'utf8');
    expect(facts).toContain('shownList(');
    expect(nutritionUi).toContain('Array.isArray(meals)');
  });
});
