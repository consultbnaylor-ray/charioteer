import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { GRATITUDE_SIGNED_URL_SECONDS } from './gratitudePhotos';
import {
  OWNER_PHOTO_ERROR_BACKOFF_MS,
  OWNER_PHOTO_RESIGN_GAP_MS,
  OWNER_PHOTO_RESIGN_MS,
  OWNER_PHOTO_URL_SECONDS,
  PHOTO_RETRY,
  PHOTO_UNAVAILABLE,
  foodPhotoStoragePath,
  ownerPhotoErrorDelay,
  ownerPhotoIdentity,
  ownerPhotoResignCooling,
  ownerPhotoUrlsStale,
  withSignedFoodPhotos,
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

  it('waits 1s, then 3s, then 8s after an image error, and then stops', () => {
    expect(OWNER_PHOTO_ERROR_BACKOFF_MS).toEqual([1_000, 3_000, 8_000]);
    expect(ownerPhotoErrorDelay(0)).toBe(1_000);
    expect(ownerPhotoErrorDelay(1)).toBe(3_000);
    expect(ownerPhotoErrorDelay(2)).toBe(8_000);
    expect(ownerPhotoErrorDelay(3)).toBeNull();
    expect(ownerPhotoErrorDelay(-1)).toBeNull();
    expect(ownerPhotoErrorDelay(1.5)).toBeNull();
  });

  it('treats a new token as the same photo and a new path as a different one', () => {
    const path = 'https://example.test/storage/v1/object/sign/progress-photos/user/a.jpg';
    expect(ownerPhotoIdentity(`${path}?token=one`)).toBe(path);
    expect(ownerPhotoIdentity(`${path}?token=two`)).toBe(ownerPhotoIdentity(`${path}?token=one`));
    expect(ownerPhotoIdentity(`${path.replace('/a.jpg', '/b.jpg')}?token=one`)).not.toBe(path);
    expect(ownerPhotoIdentity(null)).toBe('');
    expect(ownerPhotoIdentity('data:image/jpeg;base64,abc')).toBe('data:image/jpeg;base64,abc');
  });

  it('refreshes a meal photo link and leaves a meal without a photo', () => {
    const logs = [
      { id: 'meal-1', userId: 'user-1', previewUrl: 'old', note: 'Eggs' },
      { id: 'meal-2', userId: 'user-1', previewUrl: null, note: 'Soup' },
    ];
    expect(foodPhotoStoragePath('user-1', 'meal-1')).toBe('user-1/meal-1.jpg');
    expect(withSignedFoodPhotos(logs, new Map())).toBe(logs);
    const next = withSignedFoodPhotos(logs, new Map([['user-1/meal-1.jpg', 'new']]));
    expect(next[0]).toEqual({ id: 'meal-1', userId: 'user-1', previewUrl: 'new', note: 'Eggs' });
    expect(next[1]).toBe(logs[1]);
    expect(PHOTO_UNAVAILABLE).toBe('Photo unavailable');
    expect(PHOTO_RETRY).toBe('Tap to retry');
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
  const retry = readFileSync('src/ui/signedPhotoRetry.ts', 'utf8');

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
    expect(resign).toContain('options?.force');
    expect(resign).toContain('if (!force && ownerPhotoResignCooling');
    expect(resign).not.toContain('this.refresh');
    const again = repo.slice(repo.indexOf('private async resignOwnerPhotosNow'), repo.indexOf('private async signedUrlMap'));
    expect(again).toContain('withSignedPreviewUrls');
    expect(again).toContain('withSignedGratitudePhotos');
    expect(again).toContain('withSignedFoodPhotos');
    expect(again).toContain('FOOD_BUCKET');
    expect(again).toContain('foodPhotoStoragePath');
    expect(again).toContain('PROGRESS_SIGNED_URL_SECONDS');
    expect(again).toContain('PROFILE_SIGNED_URL_SECONDS');
    expect(again).toContain('GRATITUDE_SIGNED_URL_SECONDS');
    expect(again).toContain('VISION_SIGNED_URL_SECONDS');
    expect(again).toContain('OWNER_PHOTO_URL_SECONDS');
    expect(again).not.toContain('this.refresh(');
    expect(repo).toContain('this.ownerPhotosSignedAt = Date.now()');
    expect(layout).toContain('repo.resignOwnerPhotos()');
    expect(layout).not.toContain('resignOwnerPhotos({ force');
  });

  it('asks for a fresh link after an image error and keeps a way to try again', () => {
    expect(retry).toContain('ownerPhotoErrorDelay');
    expect(retry).toContain('resignOwnerPhotos({ force: true })');
    expect(retry).toContain('ownerPhotoIdentity');
    expect(retry).not.toContain('attempt < 1');
    expect(ownerPhoto).toContain('onError');
    expect(ownerPhoto).toContain('useSignedPhotoRetry');
    expect(ownerPhoto).toContain('PHOTO_UNAVAILABLE');
    expect(ownerPhoto).toContain('PHOTO_RETRY');
    expect(ownerPhoto).toContain('retryState.retry');
    expect(ownerPhoto).not.toContain('attempt < 1');
    expect(ownerPhoto).not.toContain('if (!uri || failed) return null');
    expect(avatar).toContain('onError');
    expect(avatar).toContain('useSignedPhotoRetry');
    expect(avatar).toContain('PHOTO_UNAVAILABLE');
    expect(avatar).toContain('PHOTO_RETRY');
    expect(avatar).toContain('retryState.retry');
    expect(avatar).toContain('profileInitials');
    expect(avatar).not.toContain('attempt < 1');
    const meals = readFileSync('src/ui/TodayMeals.tsx', 'utf8');
    const nutrition = readFileSync('src/app/(main)/nutrition.tsx', 'utf8');
    const renderLog = nutrition.slice(nutrition.indexOf('function renderLog'), nutrition.indexOf('function kcalFromField'));
    expect(meals).toContain('<OwnerPhoto');
    expect(meals).toContain('row.previewUrl');
    expect(renderLog).toContain('<OwnerPhoto');
    expect(renderLog).toContain('log.previewUrl');
    const frames = readFileSync('src/ui/ProgressPhotos.tsx', 'utf8');
    expect(frames).toContain('pointerEvents="box-none"');
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
