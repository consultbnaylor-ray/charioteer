import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { headerCameraTap } from '@/ui/headerCamera';

import {
  ALLOW_SAVE_LABEL,
  AUTO_SAVE_LABEL,
  SAVED_TO_LIBRARY,
  SCREENSHOT_NOTE,
  SENDER_SAVE_NOTE,
  CAMERA_USAGE,
  LIBRARY_USAGE,
  SAVE_PHOTOS_USAGE,
  SHARED_PHOTOS_LABEL,
  ALSO_ON_PUBLIC_PROFILE,
  GRATITUDE_DIARY_TICK,
  PUBLIC_PROFILE_CLOSED,
  PUBLIC_PROFILE_MEANS,
  PUBLIC_PROFILE_SHOWN,
  PUBLIC_PROFILE_TURN_ON,
  SHARE_PHOTO_SHEET_TITLE,
  GRATITUDE_ONLY_LABEL,
  GRATITUDE_SAVED_LABEL,
  quickShareNeedsDestination,
  buddyMaySave,
  filterSharedPhotos,
  sharePhotoButtonLabel,
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
    expect(SAVED_TO_LIBRARY).toBe('Saved to your photo library.');
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

  it('saves to Gratitude on its own and keeps the header camera on the existing photo flow', () => {
    expect(sharePhotoButtonLabel(2, false)).toBe('Send');
    expect(sharePhotoButtonLabel(2, true)).toBe('Send');
    expect(sharePhotoButtonLabel(2, false, true)).toBe('Send');
    expect(sharePhotoButtonLabel(0, true)).toBe('Save');
    expect(sharePhotoButtonLabel(0, false)).toBe('Send');
    expect(sharePhotoButtonLabel(0, false, true)).toBe('Save');
    expect(quickShareNeedsDestination({ buddyCount: 0, gratitude: false, onProfile: false })).toBe(true);
    expect(quickShareNeedsDestination({ buddyCount: 0, gratitude: false, onProfile: true })).toBe(false);
    expect(quickShareNeedsDestination({ buddyCount: 0, gratitude: true, onProfile: false })).toBe(false);
    expect(quickShareNeedsDestination({ buddyCount: 1, gratitude: false, onProfile: false })).toBe(false);
    expect(ALSO_ON_PUBLIC_PROFILE).toBe('Also show on my public profile');
    expect(PUBLIC_PROFILE_MEANS).toContain('any Charioteer community member');
    expect(PUBLIC_PROFILE_MEANS).toContain('separate from the buddies');
    expect(PUBLIC_PROFILE_MEANS).toContain('separate from Gratitude');
    expect(PUBLIC_PROFILE_CLOSED).toContain('public profile is off');
    expect(PUBLIC_PROFILE_TURN_ON).toBe('Turn on my public profile');
    expect(PUBLIC_PROFILE_SHOWN).toBe('Shown on your public profile.');
    expect(SHARE_PHOTO_SHEET_TITLE.replace(/\u00A0/g, ' ')).toBe('Share a photo with your Buddy list');
    expect(GRATITUDE_DIARY_TICK).toBe('Also save to my Gratitude diary');
    expect(GRATITUDE_ONLY_LABEL).toBe('No one, just save to Gratitude');
    expect(GRATITUDE_SAVED_LABEL).toBe('Saved to Gratitude');
    const sheet = readFileSync('src/ui/SharePhotoCard.tsx', 'utf8');
    expect(sheet).toContain('const [diary, setDiary] = useState(false)');
    expect(sheet).toContain('const [onProfile, setOnProfile] = useState(false)');
    expect(sheet).toContain('{GRATITUDE_DIARY_TICK}');
    expect(sheet).toContain('{ALSO_ON_PUBLIC_PROFILE}');
    expect(sheet).toContain('{PUBLIC_PROFILE_MEANS}');
    expect(sheet).toContain('{PUBLIC_PROFILE_CLOSED}');
    expect(sheet).toContain('{PUBLIC_PROFILE_TURN_ON}');
    expect(sheet).not.toContain('GALLERY_FULL_CHOICE');
    expect(sheet).not.toContain('six photos');
    expect(sheet).toContain("router.push('/public-profile' as never)");
    expect(sheet).toContain('addProfilePhoto');
    expect(sheet).not.toContain('charioteer.publicProfile');
    expect(sheet).toContain('{GRATITUDE_ONLY_LABEL}');
    expect(sheet).toContain('{GRATITUDE_SAVED_LABEL}');
    expect(sheet).toContain('addGratitudeEntry');
    expect(sheet).toContain('addGratitudePhoto');
    expect(sheet).toContain('No accepted buddies yet. You can still save this photo to Gratitude, or show it on your public profile.');
    const composer = sheet.slice(sheet.indexOf('function SharePhotoComposer'), sheet.indexOf('export function AutoSaveSwitch'));
    expect(composer).not.toContain('AsyncStorage.setItem');
    const submitStart = sheet.indexOf('async function submit');
    const submit = sheet.slice(submitStart, sheet.indexOf('return (', submitStart));
    const sendAt = submit.indexOf('sendSharedPhoto');
    expect(submit.indexOf('selected.length > 0')).toBeLessThan(sendAt);
    expect(submit.indexOf('addProfilePhoto')).toBeGreaterThan(sendAt);
    expect(submit).not.toContain('replaceId');
    expect(sheet).toContain('accessibilityLabel={SHARE_PHOTO_SHEET_TITLE}');
    expect(sheet).toContain('{SHARE_PHOTO_SHEET_TITLE}');
    expect(sheet).toContain('accessibilityLabel="Share a photo"');
    expect(sheet).toContain('label="Share a photo"');
    expect(sheet).not.toContain('ALBUM_HONEST_NOTE');
    expect(sheet).not.toContain('A named Charioteer album cannot be created');
    const photos = readFileSync('src/ui/SharedPhotos.tsx', 'utf8');
    expect(photos).toContain('setNote(SAVED_TO_LIBRARY)');
    expect(photos).not.toContain('ALBUM_HONEST_NOTE');
    expect(photos).toContain('{SCREENSHOT_NOTE}');
    expect(photos).toContain('{SENDER_SAVE_NOTE}');
    expect(sheet).toContain('HEADER_CAMERA_GLYPH');
    expect(sheet).toContain('headerCameraTap(theme.scale)');
    expect(readFileSync('src/ui/headerCamera.ts', 'utf8')).toContain('export const HEADER_CAMERA_GLYPH = 22');
    expect(sheet).not.toMatch(/NSCameraUsageDescription|NSPhotoLibraryUsageDescription/);
    expect(headerCameraTap(1)).toBe(44);
    expect(headerCameraTap(1.32)).toBe(44);
    const layout = readFileSync('src/app/(main)/_layout.tsx', 'utf8');
    expect(layout).toContain('<HeaderShareButton />');
    expect(layout).toContain('accessibilityLabel="Your profile"');
    expect(layout).toContain('headerCameraTap(theme.scale)');
    expect(layout).toContain("justifyContent: 'center'");
    const header = layout.slice(layout.indexOf('<View style={styles.mobileBrand}>'), layout.indexOf('accessibilityLabel="Your profile"'));
    expect(header).toContain('styles.cameraGap');
    expect(header.indexOf('styles.cameraGap')).toBeGreaterThan(0);
    expect(layout).not.toMatch(/cameraGap:[^}]*margin/);
    const app = readFileSync('app.json', 'utf8');
    expect(app).toContain(CAMERA_USAGE);
    expect(app).toContain(LIBRARY_USAGE);
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
