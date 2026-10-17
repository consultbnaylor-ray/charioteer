import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { parsePublicProfile, projectPublicProfile, defaultProfileSharing, type ShareSource } from './profileSharing';
import {
  nextGalleryPositions,
  profileInitials,
  profileSquareCrop,
  profileStoragePath,
  PROFILE_GALLERY_LIMIT,
  PROFILE_PHOTO_WORDING,
  PROFILE_SHARED_URL_SECONDS,
} from './profilePhotos';

const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const PHOTO = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb9';

const source = {
  now: new Date('2026-10-11T12:00:00.000Z'),
  today: '2026-10-11',
  displayName: 'Alex Hart',
  bio: '',
  town: null,
  stage: 'exploring',
  sobrietyStartedAt: null,
  weeklySpendGbp: null,
  weeklyUnits: null,
  interestLabels: [],
  reasons: [],
  checkIns: [],
  health: [],
  gratitude: [],
  vision: [],
  progressPhotos: [],
  pinnedQuoteId: null,
} satisfies ShareSource;

describe('profile photos', () => {
  it('crops a profile picture to a centre square and falls back to initials', () => {
    expect(profileSquareCrop(400, 200)).toEqual({ originX: 100, originY: 0, width: 200, height: 200 });
    expect(profileSquareCrop(200, 500)).toEqual({ originX: 0, originY: 150, width: 200, height: 200 });
    expect(profileSquareCrop(200, 200)).toBeNull();
    expect(profileSquareCrop(0, 10)).toBeNull();
    expect(profileInitials('Alex Hart')).toBe('A');
    expect(profileInitials('Sam')).toBe('S');
    expect(profileInitials('Ben')).toBe('B');
    expect(profileInitials('  ')).toBe('?');
    expect(profileStoragePath(USER, PHOTO)).toBe(`${USER}/${PHOTO}.jpg`);
    expect(PROFILE_GALLERY_LIMIT).toBe(6);
    expect(PROFILE_SHARED_URL_SECONDS).toBeLessThanOrEqual(60);
    expect(PROFILE_PHOTO_WORDING).toContain('signed-in community members');
    expect(PROFILE_PHOTO_WORDING).toContain('while Community is on');
    expect(PROFILE_PHOTO_WORDING).toContain('report a photo');
  });

  it('reorders gallery photos and stops at the ends', () => {
    const photos = [
      { id: 'a', position: 0 },
      { id: 'b', position: 1 },
      { id: 'c', position: 2 },
    ];
    expect(nextGalleryPositions(photos, 'b', 'up')).toEqual([
      { id: 'b', position: 0 },
      { id: 'a', position: 1 },
      { id: 'c', position: 2 },
    ]);
    expect(nextGalleryPositions(photos, 'a', 'up')).toBeNull();
    expect(nextGalleryPositions(photos, 'c', 'down')).toBeNull();
  });

  it('shows profile photos whenever Community is on, without a storage path', () => {
    const view = projectPublicProfile(source, defaultProfileSharing());
    expect(view.profilePhotos).toEqual([]);
    expect(view.sharedLabels).not.toContain('Profile photos');
    const shown = projectPublicProfile({
      ...source,
      profilePhotos: [
        { id: PHOTO, role: 'gallery', caption: 'The path after rain.', position: 1 },
        { id: USER, role: 'avatar', caption: 'Morning light.', position: 0 },
      ],
    }, defaultProfileSharing());
    expect(shown.profilePhotos.map((photo) => photo.role)).toEqual(['avatar', 'gallery']);
    expect(shown.sharedLabels).toContain('Profile photos');
    expect(JSON.stringify(shown.profilePhotos)).not.toContain('storage');
    const parsed = parsePublicProfile({
      displayName: 'Jordan Ellis',
      profilePhotos: [{ id: PHOTO, role: 'avatar', caption: 'Out walking.', position: 0, storage_path: `${USER}/${PHOTO}.jpg`, note: 'private note' }],
    });
    expect(parsed?.profilePhotos).toEqual([{ id: PHOTO, role: 'avatar', caption: 'Out walking.', position: 0 }]);
    expect(JSON.stringify(parsed)).not.toContain('private note');
    expect(JSON.stringify(parsed)).not.toContain('storage_path');
  });

  it('keeps the bucket private, grants columns, and signs only after consent and blocks', () => {
    const sql = readFileSync('supabase/migrations/20261010300000_profile_photos.sql', 'utf8');
    const profile = sql.slice(sql.indexOf('function public.public_profile'), sql.indexOf('function public.export_my_data'));
    const shared = sql.slice(sql.indexOf('function public.shared_profile_photos'), sql.indexOf('alter table public.directory'));
    expect(sql).toContain('create table public.profile_photos');
    expect(sql).toContain("role in ('avatar', 'gallery')");
    expect(sql).toContain('profile_photos_one_avatar');
    expect(sql).toContain('Six profile photos is the limit.');
    expect(sql).toContain("values ('profile-photos', 'profile-photos', false, 2097152");
    expect(sql).toContain('set public = false');
    expect(sql).toContain('profile_photos_storage_read');
    expect(sql).toContain('profile_photos_storage_insert');
    expect(sql).toContain('profile_photos_storage_delete');
    expect(sql).toContain("(storage.foldername(name))[1] = auth.uid()::text");
    expect(sql).toContain('grant select (id, user_id, role, caption, position, storage_path, created_at) on public.profile_photos to authenticated');
    expect(sql).toContain('grant insert (id, user_id, role, caption, position, storage_path) on public.profile_photos to authenticated');
    expect(sql).toContain('grant update (caption, position) on public.profile_photos to authenticated');
    expect(sql).toContain('grant delete on public.profile_photos to authenticated');
    expect(sql.toLowerCase()).not.toMatch(/grant update on public\.profile_photos/i);
    expect(sql).not.toMatch(/grant .* to anon/i);
    expect(sql).toContain('avatar_photo_id');
    expect(shared).toContain('community_visible is true');
    expect(shared).toContain('age_confirmed_18 is true');
    expect(shared).toContain('public.blocks');
    expect(profile).toContain("'profilePhotos', shown_profile_photos");
    expect(profile).toContain('I’ve stopped');
    expect(profile).not.toContain('storage_path');
    expect(profile).not.toContain('p.note');
    expect(sql).toContain("'profile_photos'");
    expect(sql).toContain("'user_quotes'");

    const signer = readFileSync('supabase/functions/profile-photo-url/index.ts', 'utf8');
    expect(signer.indexOf("rpc('shared_profile_photos'")).toBeLessThan(signer.indexOf('createSignedUrl'));
    expect(signer).toContain('SHARED_SECONDS = 60');
    expect(signer).toContain("path !== `${ownerId}/${id}.jpg`");
    expect(signer).toContain('profile-photos');
    expect(signer).not.toMatch(/thumos|xai/i);

    const exported = readFileSync('supabase/functions/account-export/index.ts', 'utf8');
    const deleted = readFileSync('supabase/functions/account-delete/index.ts', 'utf8');
    expect(exported).toContain('profile-photos');
    expect(exported).toContain('profile_photos');
    expect(deleted).toContain('profile-photos');
    const handler = deleted.slice(0, deleted.indexOf('async function removeProgressPhotos'));
    expect(handler.indexOf('removeProfilePhotos')).toBeLessThan(handler.indexOf('deleteUser'));

    const repo = readFileSync('src/data/supabase-repository.ts', 'utf8');
    expect(repo).toContain(".from('profile_photos').select('id, user_id, role, caption, position, storage_path, created_at')");
    const add = repo.slice(repo.indexOf('async addProfilePhoto'), repo.indexOf('async updateProfilePhoto'));
    expect(add).toContain('PROFILE_PHOTO_BUCKET');
    expect(add).toContain('.upload(');
    expect(add).toContain(".from('profile_photos').insert");
    expect(add.indexOf('.upload(')).toBeLessThan(add.indexOf(".from('profile_photos').insert"));
    expect(add).toContain('.remove(');

    const card = readFileSync('src/ui/PublicProfileCard.tsx', 'utf8');
    const editor = readFileSync('src/ui/ProfilePhotoEditor.tsx', 'utf8');
    const people = readFileSync('src/app/(main)/people.tsx', 'utf8');
    const chat = readFileSync('src/app/(main)/chat/[id].tsx', 'utf8');
    const community = readFileSync('src/ui/CommunityProfile.tsx', 'utf8');
    const picker = readFileSync('src/ui/prepareProgressPhoto.ts', 'utf8');
    expect(card).toContain('<ProfilePhotoEditor');
    expect(card).toContain('<OwnProfilePhotos');
    expect(editor).toContain('PROFILE_PHOTO_WORDING');
    expect(editor).toContain('Take profile picture');
    expect(editor).toContain('Choose profile picture');
    expect(editor).not.toContain('ProfileAvatarPicker');
    expect(editor).not.toContain('Choose profile photo');
    expect(card).toContain('<MemberAvatar');
    expect(card).toContain('previewUrl');
    expect(card).toContain('size={72}');
    expect(card).not.toContain('ProfileAvatarPicker');
    expect(card).not.toContain('Choose profile photo');
    const avatar = readFileSync('src/ui/MemberAvatar.tsx', 'utf8');
    expect(avatar).toContain('profileInitials');
    expect(avatar).toContain("textAlign: 'center'");
    expect(avatar).toContain('numberOfLines={1}');
    expect(avatar).toContain('maxFontSizeMultiplier={1}');
    expect(avatar).not.toContain('variant="label"');
    expect(editor).toContain('PhotoCropper');
    expect(editor).toContain('Take gallery photo');
    expect(editor).toContain('Choose gallery photo');
    const cropper = readFileSync('src/ui/PhotoCropper.tsx', 'utf8');
    expect(cropper).toContain('Drag to position');
    expect(cropper).toContain('Pinch to zoom');
    expect(cropper).toContain('Circular crop');
    expect(cropper).toContain('Free');
    expect(cropper).toContain('4:3');
    expect(cropper).toContain('Use photo');
    expect(cropper).toContain('profilePictureSeed');
    expect(picker).toContain('encodeProfileCrop');
    expect(editor).toContain('Move up');
    expect(editor).toContain('Move down');
    expect(editor).toContain('Delete photo');
    expect(editor).toContain('Saved ✓');
    expect(picker).toContain('exif: true');
    expect(picker).toContain('profileSquareCrop');
    expect(picker).toContain('SaveFormat.JPEG');
    expect(people).toContain('<MemberAvatar');
    expect(people).toContain('useMemberAvatars');
    expect(people).not.toMatch(/gratitude/);
    expect(people).not.toMatch(/thumos|xai|progress-photos/i);
    expect(chat).toContain('<MemberAvatar');
    expect(community).toContain("reason: 'Profile photo'");
    expect(community).toContain('reportUser');
    expect(community).toContain('Message privately');
    expect(community).not.toMatch(/comment/i);
    expect(community).not.toMatch(/thumos|xai|progress-photos/i);
    expect(readFileSync('src/ui/MemberAvatar.tsx', 'utf8')).toContain('profileInitials');
    expect(readFileSync('src/ui/ConsentChoices.tsx', 'utf8')).toContain('PROFILE_PHOTO_WORDING');
    expect(readFileSync('src/ui/ConsentChoices.tsx', 'utf8')).toContain('Vision board photos always stay private');
    expect(readFileSync('src/ui/ConsentChoices.tsx', 'utf8')).toContain('Gratitude photos stay private unless you switch that photo on');
    expect(readFileSync('supabase/config.toml', 'utf8')).toContain('[functions.profile-photo-url]');
  });
});
