import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { captureDayFromExif, planProgressPhoto, progressMonthIndex, progressPhotoLabel, progressResize, progressStoragePath, progressVisibility, PROGRESS_SHARE_WARNING, PROGRESS_SHARED_URL_SECONDS } from './progressPhotos';

describe('progress photo months', () => {
  const anchor = new Date(2026, 10, 2);

  it('labels the anchor month as Month 1', () => {
    const plan = planProgressPhoto({
      takenOn: '2026-11-18',
      startingPoint: false,
      note: '',
      anchor,
      today: '2026-11-18',
    });
    expect(plan).toMatchObject({ ok: true, monthIndex: 1, label: 'Month 1 · Nov 2026' });
    expect(progressMonthIndex(anchor, '2026-11-02', false)).toBe(1);
  });

  it('counts later months from that same anchor', () => {
    const january = new Date(2026, 0, 15);
    expect(progressMonthIndex(january, '2026-11-18', false)).toBe(11);
    expect(progressPhotoLabel(11, '2026-11-18')).toBe('Month 11 · Nov 2026');
  });

  it('treats a photo from before the anchor month as a starting point', () => {
    expect(progressMonthIndex(anchor, '2026-10-01', false)).toBe(0);
    expect(progressPhotoLabel(0, '2026-10-01')).toBe('Starting point');
  });

  it('keeps an explicit starting point at month 0 even when it is later', () => {
    const plan = planProgressPhoto({
      takenOn: '2026-12-01',
      startingPoint: true,
      note: '  hello   there ',
      anchor,
      today: '2026-12-01',
    });
    expect(plan).toMatchObject({ ok: true, monthIndex: 0, note: 'hello there', label: 'Starting point' });
  });

  it('refuses a future day and a long note', () => {
    const future = planProgressPhoto({ takenOn: '2026-12-02', startingPoint: false, note: '', anchor, today: '2026-12-01' });
    expect(future).toMatchObject({ ok: false, message: 'Choose today or an earlier day.' });
    const long = planProgressPhoto({ takenOn: '2026-12-01', startingPoint: false, note: 'a'.repeat(281), anchor, today: '2026-12-01' });
    expect(long.ok).toBe(false);
  });
});

describe('capture day', () => {
  it('reads the camera date and ignores a future or missing one', () => {
    expect(captureDayFromExif({ DateTimeOriginal: '2026:10:11 09:17:14' }, '2026-10-11')).toBe('2026-10-11');
    expect(captureDayFromExif({ DateTime: '2026-09-01 00:00:00' }, '2026-10-11')).toBe('2026-09-01');
    expect(captureDayFromExif({ DateTimeOriginal: '2026:12:01 00:00:00' }, '2026-10-11')).toBeNull();
    expect(captureDayFromExif(null, '2026-10-11')).toBeNull();
    expect(captureDayFromExif({ GPSLatitude: 51.5 }, '2026-10-11')).toBeNull();
  });
});

describe('progress photo files', () => {
  it('downscales the long edge to 1600 and leaves a small photo alone', () => {
    expect(progressResize(4000, 3000)).toEqual({ width: 1600 });
    expect(progressResize(800, 600)).toBeNull();
    expect(progressResize(1000, 4000)).toEqual({ height: 1600 });
  });

  it('stores the file under the owner id', () => {
    const user = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
    const photo = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
    expect(progressStoragePath(user, photo)).toBe(`${user}/${photo}.jpg`);
    expect(() => progressStoragePath('not-a-uuid', photo)).toThrow(/store/);
  });
});

describe('progress photo sharing', () => {
  it('treats every value except community as private', () => {
    expect(progressVisibility('community')).toBe('community');
    expect(progressVisibility('private')).toBe('private');
    expect(progressVisibility(undefined)).toBe('private');
    expect(progressVisibility('public')).toBe('private');
    expect(PROGRESS_SHARE_WARNING).toBe('Anyone in the Charioteer community will be able to see this photo');
    expect(PROGRESS_SHARED_URL_SECONDS).toBeLessThanOrEqual(60);
  });
});

describe('progress photos stay private', () => {
  const quiet = [
    'src/app/(main)/thumos.tsx',
    'src/voice/briefing.ts',
    'src/voice/call.ts',
    'supabase/functions/thumos-chat/index.ts',
    'supabase/functions/thumos-voice-token/index.ts',
    'supabase/functions/thumos-voice-turn/index.ts',
    'supabase/functions/_shared/thumos.ts',
    'supabase/functions/_shared/voice.ts',
  ];

  it('is absent from Thumos and voice', () => {
    for (const path of quiet) {
      const source = readFileSync(path, 'utf8');
      expect(source).not.toMatch(/progress_photos|progressPhotos|progress-photos/);
    }
  });

  it('shows a shared photo on a community profile and reports it through the existing queue', () => {
    const people = readFileSync('src/app/(main)/people.tsx', 'utf8');
    const profile = readFileSync('src/ui/CommunityProfile.tsx', 'utf8');
    const you = readFileSync('src/ui/ProgressPhotos.tsx', 'utf8');
    expect(people).toContain('<CommunityProfile');
    expect(people).not.toMatch(/thumos|xai|progress-photos/i);
    expect(profile).toContain('reportUser');
    expect(profile).toContain('Message privately');
    expect(profile).toContain('openPrivateChat');
    expect(profile).not.toMatch(/comment/i);
    expect(profile).toContain('Shared progress photo');
    expect(profile).toContain('Shared');
    expect(profile).not.toMatch(/thumos|xai|progress-photos/i);
    expect(you).toContain('{PROGRESS_SHARE_WARNING}');
    expect(you).toContain('Only me');
    expect(you).toContain('Share with community');
    expect(you).toContain('>Shared<');
    expect(you).toContain('Photo saved');
    expect(you).toContain('Try again');
    expect(you).toContain('Save note');
    expect(you).not.toContain('Save this photo');
    expect(you).not.toMatch(/comment/i);
  });

  it('selects only the granted columns and does not send a photo to Thumos', () => {
    const repo = readFileSync('src/data/supabase-repository.ts', 'utf8');
    const refresh = repo.slice(repo.indexOf('private async refresh'), repo.indexOf('private async userId'));
    expect(refresh).toContain(".from('progress_photos').select('id, user_id, taken_on, month_index, note, storage_path, created_at, visibility')");
    expect(refresh.indexOf("from('consents')")).toBeLessThan(refresh.indexOf("from('progress_photos')"));
    const add = repo.slice(repo.indexOf('async addProgressPhoto'), repo.indexOf('async deleteProgressPhoto'));
    expect(add).toContain(".from('progress_photos').insert");
    expect(add).toContain('PROGRESS_BUCKET');
    expect(add).toContain('.upload(');
    expect(add).not.toMatch(/thumos|xai/i);
    const remove = repo.slice(repo.indexOf('async deleteAccount'), repo.indexOf('private async attachProgressLinks'));
    expect(remove.indexOf('removeOwnProgressPhotos')).toBeLessThan(remove.indexOf("rpc('delete_my_account')"));
  });

  it('signs export links and deletes storage objects before the auth user', () => {
    const exported = readFileSync('supabase/functions/account-export/index.ts', 'utf8');
    const deleted = readFileSync('supabase/functions/account-delete/index.ts', 'utf8');
    expect(exported).toContain('createSignedUrl');
    expect(exported).toContain('progress-photos');
    expect(exported).not.toMatch(/base64/);
    expect(deleted).toContain('progress-photos');
    const handler = deleted.slice(0, deleted.indexOf('async function removeProgressPhotos'));
    expect(handler.indexOf('removeProgressPhotos')).toBeLessThan(handler.indexOf('deleteUser'));
    expect(deleted).toContain('.remove(');
    expect(deleted).toContain('bucket not found');
  });

  it('signs a shared photo only after the visibility check, and leaves storage owner-only', () => {
    const signer = readFileSync('supabase/functions/progress-photo-url/index.ts', 'utf8');
    const migration = readFileSync('supabase/migrations/20261010190000_progress_photo_visibility.sql', 'utf8');
    expect(signer.indexOf(".select('id, user_id, storage_path, visibility')")).toBeLessThan(signer.indexOf('createSignedUrl'));
    expect(signer).toContain("row.visibility === 'community'");
    expect(signer).toContain('SHARED_SECONDS = 60');
    expect(signer).not.toMatch(/thumos|xai/i);
    expect(migration).toContain("visibility in ('private', 'community')");
    expect(migration).toContain("default 'private'");
    expect(migration).toContain('progress_photos_community_read');
    expect(migration).toContain("using (visibility = 'community')");
    expect(migration).toContain('grant select (visibility) on public.progress_photos to authenticated');
    expect(migration).toContain('grant update (visibility) on public.progress_photos to authenticated');
    expect(migration).not.toMatch(/grant update on public\.progress_photos/i);
    expect(migration).not.toContain('storage.objects');
  });

  it('lets the owner update the note, date, and month without a table-level grant', () => {
    const details = readFileSync('supabase/migrations/20261010220000_progress_photo_details.sql', 'utf8');
    const repo = readFileSync('src/data/supabase-repository.ts', 'utf8');
    expect(details).toContain('grant update (note, taken_on, month_index) on public.progress_photos to authenticated');
    expect(details).not.toMatch(/grant update on public\.progress_photos/i);
    expect(details.toLowerCase()).not.toContain('comment');
    const update = repo.slice(repo.indexOf('async updateProgressPhoto'), repo.indexOf('async setProgressPhotoVisibility'));
    expect(update).toContain('taken_on');
    expect(update).toContain('month_index');
    expect(update).toContain('note');
  });
});
