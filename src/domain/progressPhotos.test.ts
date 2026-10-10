import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { planProgressPhoto, progressMonthIndex, progressPhotoLabel, progressResize, progressStoragePath } from './progressPhotos';

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

describe('progress photos stay private', () => {
  const quiet = [
    'src/app/(main)/thumos.tsx',
    'src/app/(main)/people.tsx',
    'src/voice/openVoice.ts',
    'supabase/functions/thumos-chat/index.ts',
    'supabase/functions/_shared/thumos.ts',
  ];

  it('is absent from the directory, Thumos, and voice', () => {
    for (const path of quiet) {
      const source = readFileSync(path, 'utf8');
      expect(source).not.toMatch(/progress_photos|progressPhotos|progress-photos/);
    }
  });

  it('selects only the granted columns and does not send a photo to Thumos', () => {
    const repo = readFileSync('src/data/supabase-repository.ts', 'utf8');
    const refresh = repo.slice(repo.indexOf('private async refresh'), repo.indexOf('private async userId'));
    expect(refresh).toContain(".from('progress_photos').select('id, taken_on, month_index, note, storage_path, created_at')");
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
});
