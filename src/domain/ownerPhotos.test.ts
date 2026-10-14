import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { GRATITUDE_SIGNED_URL_SECONDS } from './gratitudePhotos';
import {
  OWNER_PHOTO_RESIGN_GAP_MS,
  OWNER_PHOTO_RESIGN_MS,
  OWNER_PHOTO_URL_SECONDS,
  ownerPhotoResignCooling,
  ownerPhotoUrlsStale,
  withSignedGratitudePhotos,
  withSignedPreviewUrls,
} from './ownerPhotos';
import { PROFILE_SHARED_URL_SECONDS, PROFILE_SIGNED_URL_SECONDS } from './profilePhotos';
import { PROGRESS_SHARED_URL_SECONDS, PROGRESS_SIGNED_URL_SECONDS } from './progressPhotos';
import { VISION_SIGNED_URL_SECONDS } from './visionBoard';

const signedAt = 1_700_000_000_000;

describe('owner photo lifetimes', () => {
  it('keeps owner links for an hour and shared links for a minute', () => {
    expect(OWNER_PHOTO_URL_SECONDS).toBe(3600);
    expect(PROGRESS_SIGNED_URL_SECONDS).toBe(3600);
    expect(PROFILE_SIGNED_URL_SECONDS).toBe(3600);
    expect(GRATITUDE_SIGNED_URL_SECONDS).toBe(3600);
    expect(VISION_SIGNED_URL_SECONDS).toBe(3600);
    expect(PROGRESS_SHARED_URL_SECONDS).toBe(60);
    expect(PROFILE_SHARED_URL_SECONDS).toBe(60);
    expect(readFileSync('supabase/functions/profile-photo-url/index.ts', 'utf8')).toContain('SHARED_SECONDS = 60');
    expect(readFileSync('supabase/functions/progress-photo-url/index.ts', 'utf8')).toContain('SHARED_SECONDS = 60');
  });

  it('treats a sign as stale only after about eight minutes', () => {
    expect(ownerPhotoUrlsStale(null)).toBe(true);
    expect(ownerPhotoUrlsStale(undefined)).toBe(true);
    expect(ownerPhotoUrlsStale(Number.NaN)).toBe(true);
    expect(ownerPhotoUrlsStale(signedAt, signedAt + OWNER_PHOTO_RESIGN_MS - 1)).toBe(false);
    expect(ownerPhotoUrlsStale(signedAt, signedAt + OWNER_PHOTO_RESIGN_MS)).toBe(false);
    expect(ownerPhotoUrlsStale(signedAt, signedAt + OWNER_PHOTO_RESIGN_MS + 1)).toBe(true);
  });

  it('waits a few seconds before signing again after a failure', () => {
    expect(ownerPhotoResignCooling(null)).toBe(false);
    expect(ownerPhotoResignCooling(undefined)).toBe(false);
    expect(ownerPhotoResignCooling(signedAt, signedAt + OWNER_PHOTO_RESIGN_GAP_MS - 1)).toBe(true);
    expect(ownerPhotoResignCooling(signedAt, signedAt + OWNER_PHOTO_RESIGN_GAP_MS)).toBe(false);
  });

  it('replaces preview URLs and leaves the rest of the photo in place', () => {
    const photos = [
      { id: 'a', storagePath: 'u/a.jpg', previewUrl: 'old-a', note: 'private' },
      { id: 'b', storagePath: 'u/b.jpg', previewUrl: 'old-b', note: 'keep' },
    ];
    const same = withSignedPreviewUrls(photos, new Map([['u/a.jpg', 'old-a']]));
    expect(same).toBe(photos);
    const next = withSignedPreviewUrls(photos, new Map([['u/a.jpg', 'new-a'], ['missing', 'nope']]));
    expect(next).not.toBe(photos);
    expect(next[0]).toEqual({ id: 'a', storagePath: 'u/a.jpg', previewUrl: 'new-a', note: 'private' });
    expect(next[1]).toBe(photos[1]);
    expect(withSignedPreviewUrls(photos, new Map([['u/a.jpg', '']]))).toBe(photos);
  });

  it('patches gratitude photos without rewriting the diary line', () => {
    const entries = [
      { id: 'line', body: 'Breakfast', photos: [{ storagePath: 'u/g.jpg', previewUrl: 'old' }] },
      { id: 'plain', body: 'A walk', photos: [] as { storagePath: string; previewUrl: string | null }[] },
    ];
    expect(withSignedGratitudePhotos(entries, new Map())).toBe(entries);
    const next = withSignedGratitudePhotos(entries, new Map([['u/g.jpg', 'new']]));
    expect(next[0]?.body).toBe('Breakfast');
    expect(next[0]?.photos[0]?.previewUrl).toBe('new');
    expect(next[1]).toBe(entries[1]);
  });
});

describe('owner photo refresh', () => {
  const profile = readFileSync('src/app/(main)/profile.tsx', 'utf8');
  const photos = readFileSync('src/app/(main)/photos.tsx', 'utf8');
  const layout = readFileSync('src/app/_layout.tsx', 'utf8');
  const repo = readFileSync('src/data/supabase-repository.ts', 'utf8');
  const avatar = readFileSync('src/ui/MemberAvatar.tsx', 'utf8');
  const ownerPhoto = readFileSync('src/ui/OwnerPhoto.tsx', 'utf8');

  it('reloads You and progress photos when those screens open', () => {
    expect(profile).toContain('useFocusEffect');
    expect(profile).toContain('repo.reload()');
    expect(photos).toContain('useFocusEffect');
    expect(photos).toContain('repo.reload()');
    const profileHook = profile.slice(profile.indexOf('useFocusEffect'), profile.indexOf('if (!profile)'));
    expect(profileHook).toContain('repo.reload()');
  });

  it('re-signs on foreground and when the last sign is old, without a full reload', () => {
    expect(layout).toContain('AppState');
    expect(layout).toContain('reloadMessages');
    expect(layout).toContain('resignOwnerPhotos');
    expect(layout).toContain('refreshOwnerPhotosIfStale');
    const resign = repo.slice(repo.indexOf('async resignOwnerPhotos'), repo.indexOf('async reloadMessages'));
    expect(resign).toContain('ownerPhotoResignCooling');
    expect(resign).not.toContain('this.refresh');
    const again = repo.slice(repo.indexOf('private async resignOwnerPhotosNow'), repo.indexOf('private async signedUrlMap'));
    expect(again).toContain('withSignedPreviewUrls');
    expect(again).toContain('withSignedGratitudePhotos');
    expect(again).toContain('PROGRESS_SIGNED_URL_SECONDS');
    expect(again).toContain('PROFILE_SIGNED_URL_SECONDS');
    expect(again).toContain('GRATITUDE_SIGNED_URL_SECONDS');
    expect(again).toContain('VISION_SIGNED_URL_SECONDS');
    expect(again).not.toContain('this.refresh(');
    expect(repo).toContain('this.ownerPhotosSignedAt = Date.now()');
  });

  it('asks for a new link when an image fails instead of keeping the broken picture', () => {
    expect(avatar).toContain('onError');
    expect(avatar).toContain('resignOwnerPhotos');
    expect(avatar).toContain('setFailed(false)');
    expect(ownerPhoto).toContain('onError');
    expect(ownerPhoto).toContain('resignOwnerPhotos');
    expect(ownerPhoto).toContain('setFailed(false)');
    for (const file of [
      'src/ui/ProgressPhotos.tsx',
      'src/ui/VisionBoard.tsx',
      'src/app/(main)/gratitude.tsx',
      'src/app/(main)/home.tsx',
      'src/ui/ProfilePhotoEditor.tsx',
      'src/ui/PublicProfileCard.tsx',
    ]) {
      expect(readFileSync(file, 'utf8')).toContain('OwnerPhoto');
    }
  });
});
