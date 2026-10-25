import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  ALLOW_SAVE_LABEL,
  AUTO_SAVE_LABEL,
  SCREENSHOT_NOTE,
  SENDER_SAVE_NOTE,
  CAMERA_USAGE,
  LIBRARY_USAGE,
  SAVE_PHOTOS_USAGE,
  SHARED_PHOTOS_LABEL,
  buddyMaySave,
  filterSharedPhotos,
  sharedPhotoWhen,
  shouldAutoSaveToAlbum,
  splitSharedPhotos,
  type SharedPhotoCard,
} from './sharedPhotos';

const sent: SharedPhotoCard = {
  id: 'sent-later',
  mine: true,
  caption: 'Morning light',
  createdAt: '2026-10-25T07:41:00.000Z',
  allowSave: true,
  buddyNames: ['Catherine', 'Paul'],
};

const sentEarlier: SharedPhotoCard = {
  id: 'sent-earlier',
  mine: true,
  caption: 'Gate',
  createdAt: '2026-10-24T18:05:00.000Z',
  buddyNames: ['Emma'],
};

const received: SharedPhotoCard = {
  id: 'received',
  mine: false,
  caption: 'The lane',
  createdAt: '2026-10-25T06:02:00.000Z',
  allowSave: false,
  buddyNames: ['Ceri'],
};

describe('Shared Photos folder', () => {
  it('prints the date and time in UK form on the device clock', () => {
    expect(sharedPhotoWhen(new Date(2026, 9, 25, 7, 41))).toBe('25 Oct 2026, 07:41');
    expect(SENDER_SAVE_NOTE).toBe(
      "Buddies you share with can save this photo to their phone. Deleting it in Charioteer won't remove a copy they've already saved.",
    );
    expect(ALLOW_SAVE_LABEL).toBe('Allow buddies to save this photo');
    expect(AUTO_SAVE_LABEL).toBe('Automatically save photos I share to my photo library');
    expect(SCREENSHOT_NOTE).toBe('A screenshot cannot be stopped.');
    expect(SHARED_PHOTOS_LABEL).toBe('Shared Photos');
    expect(SAVE_PHOTOS_USAGE).toContain('never reads your other photos');
    expect(SAVE_PHOTOS_USAGE).toContain('does not');
  });

  it('splits sent and received, newest first, and can filter by one buddy', () => {
    const split = splitSharedPhotos([received, sentEarlier, sent]);
    expect(split.sent.map((row) => row.id)).toEqual(['sent-later', 'sent-earlier']);
    expect(split.received.map((row) => row.id)).toEqual(['received']);
    expect(filterSharedPhotos(split.sent, 'Catherine').map((row) => row.id)).toEqual(['sent-later']);
    expect(filterSharedPhotos(split.sent, 'Emma').map((row) => row.id)).toEqual(['sent-earlier']);
    expect(filterSharedPhotos([sent, received], null)).toHaveLength(2);
  });

  it('lets a buddy save only when the sender allowed it, and never saves a received photo on its own', () => {
    expect(buddyMaySave({ allowSave: true })).toBe(true);
    expect(buddyMaySave({})).toBe(true);
    expect(buddyMaySave({ allowSave: false })).toBe(false);
    expect(shouldAutoSaveToAlbum({ mine: true, autoSaveMine: false })).toBe(false);
    expect(shouldAutoSaveToAlbum({ mine: true, autoSaveMine: true })).toBe(true);
    expect(shouldAutoSaveToAlbum({ mine: false, autoSaveMine: true })).toBe(false);
  });

  it('stores the save choice on the photo and asks for add-only access on Save', () => {
    const sql = readFileSync('supabase/migrations/20261025120000_buddy_photos.sql', 'utf8');
    expect(sql).toContain('allow_save boolean not null default true');
    expect(sql).toContain("'allowSave', p.allow_save");
    expect(sql).toContain("values ('buddy-photos', 'buddy-photos', false, 2097152");
    expect(sql).not.toMatch(/grant select on table public\.buddy_photos/i);

    const app = JSON.parse(readFileSync('app.json', 'utf8')) as {
      expo: {
        ios: { infoPlist: Record<string, string> };
        android: { blockedPermissions: string[]; permissions: string[] };
        plugins: unknown[];
      };
    };
    expect(app.expo.ios.infoPlist.NSPhotoLibraryAddUsageDescription).toBe(SAVE_PHOTOS_USAGE);
    expect(app.expo.ios.infoPlist.NSPhotoLibraryUsageDescription).toBe(LIBRARY_USAGE);
    expect(app.expo.ios.infoPlist.NSCameraUsageDescription).toBe(CAMERA_USAGE);
    const media = app.expo.plugins.find(
      (entry) => Array.isArray(entry) && entry[0] === 'expo-media-library',
    ) as [string, { photosPermission: string; savePhotosPermission: string; isAccessMediaLocationEnabled: boolean; granularPermissions: string[] }];
    expect(media[1].savePhotosPermission).toBe(SAVE_PHOTOS_USAGE);
    expect(media[1].photosPermission).toBe(app.expo.ios.infoPlist.NSPhotoLibraryUsageDescription);
    expect(media[1].isAccessMediaLocationEnabled).toBe(false);
    expect(media[1].granularPermissions).toEqual([]);
    const stripAt = app.expo.plugins.indexOf('./plugins/withAddOnlyPhotoSave.js');
    const mediaAt = app.expo.plugins.findIndex((entry) => Array.isArray(entry) && entry[0] === 'expo-media-library');
    expect(stripAt).toBeGreaterThan(-1);
    expect(stripAt).toBeLessThan(mediaAt);
    expect(app.expo.android.blockedPermissions).toEqual(
      expect.arrayContaining([
        'android.permission.READ_EXTERNAL_STORAGE',
        'android.permission.READ_MEDIA_IMAGES',
        'android.permission.READ_MEDIA_VIDEO',
        'android.permission.READ_MEDIA_AUDIO',
        'android.permission.READ_MEDIA_VISUAL_USER_SELECTED',
        'android.permission.ACCESS_MEDIA_LOCATION',
      ]),
    );
    expect(app.expo.android.blockedPermissions.join(' ')).not.toContain('WRITE_EXTERNAL_STORAGE');
    expect(app.expo.android.permissions).toEqual(['android.permission.RECORD_AUDIO']);
    expect(readFileSync('package.json', 'utf8')).toContain('expo-media-library');
    expect(readFileSync('plugins/withAddOnlyPhotoSave.js', 'utf8')).toContain('requestLegacyExternalStorage');

    const save = readFileSync('src/ui/saveSharedPhoto.ts', 'utf8');
    expect(save).toContain('requestPermissionsAsync(true)');
    expect(save).not.toMatch(/Album\.(create|get)|getAssets|requestPermissionsAsync\(false\)|granularPermissions/);
    const screens = readFileSync('src/app/_layout.tsx', 'utf8');
    expect(screens).not.toMatch(/expo-media-library|requestAddOnlyPhotoSave/);
  });
});
