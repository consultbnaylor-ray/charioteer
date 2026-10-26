import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { useRepository, useSnapshot } from '@/data';
import type { ProfilePhoto, ProfilePhotoRole } from '@/data/types';
import { shownError } from '@/domain/errors';
import { PHOTO_CAPTION_LIMIT } from '@/domain/profileSharing';
import {
  galleryInChosenOrder,
  PROFILE_GALLERY_HINT,
  PROFILE_GALLERY_PAGE,
  PROFILE_PHOTO_WORDING,
  profileFrontPhotos,
  profileGalleryNeedsLibrary,
  SEE_ALL_PHOTOS,
  sortProfilePhotos,
} from '@/domain/profilePhotos';
import type { CropRect } from '@/domain/photoCrop';
import { encodeProfileCrop, pickProfilePhoto } from '@/ui/prepareProgressPhoto';
import { PhotoCropper } from '@/ui/PhotoCropper';
import { ProfilePhotoEnlarge, ProfilePhotoTiles } from '@/ui/ProfileGallery';
import { MemberAvatar } from '@/ui/MemberAvatar';
import { Button, ErrorNote, Field, playSavedHaptic, T } from '@/ui/ui';

export function OwnProfilePhotos({ name, photos }: { name: string; photos: ProfilePhoto[] }) {
  const router = useRouter();
  const gallery = galleryInChosenOrder(photos);
  const front = profileFrontPhotos(photos);
  const [openId, setOpenId] = useState<string | null>(null);
  if (!gallery.length) return null;
  const tiles = front.map((photo) => ({ id: photo.id, caption: photo.caption, uri: photo.previewUrl }));
  return (
    <View accessibilityLabel={`${name} profile photos`} style={{ gap: 8 }}>
      <ProfilePhotoTiles tiles={tiles} mode="open" onPress={setOpenId} />
      {profileGalleryNeedsLibrary(gallery.length) ? (
        <Button label={SEE_ALL_PHOTOS} tone="quiet" onPress={() => router.push('/profile-gallery' as never)} />
      ) : null}
      <ProfilePhotoEnlarge tile={tiles.find((tile) => tile.id === openId) ?? null} onClose={() => setOpenId(null)} />
    </View>
  );
}

export function ProfilePhotoEditor() {
  const snap = useSnapshot();
  const repo = useRepository();
  const router = useRouter();
  const photos = sortProfilePhotos(snap.profilePhotos ?? []);
  const avatar = photos.find((photo) => photo.role === 'avatar') ?? null;
  const gallery = galleryInChosenOrder(photos);
  const [pending, setPending] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmSelected, setConfirmSelected] = useState(false);
  const [visible, setVisible] = useState(PROFILE_GALLERY_PAGE);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ uri: string; width: number; height: number; role: ProfilePhotoRole } | null>(null);
  const page = gallery.slice(0, visible);
  const pageKey = page.map((photo) => photo.id).join(',');
  const oneSelected = selected.length === 1 ? gallery.find((photo) => photo.id === selected[0]) ?? null : null;

  useEffect(() => {
    const ids = pageKey ? pageKey.split(',') : [];
    if (!ids.length) return;
    void repo.signProfilePhotos(ids);
  }, [repo, pageKey]);

  async function add(source: 'camera' | 'library', role: ProfilePhotoRole) {
    setError(null);
    setPending(`${role}-${source}`);
    try {
      const picked = await pickProfilePhoto(source);
      if (!picked) return;
      setDraft({ ...picked, role });
    } catch (err) {
      setError(shownError(err, 'Could not add that photo.'));
    } finally {
      setPending(null);
    }
  }

  async function saveCrop(crop: CropRect) {
    if (!draft) return;
    setError(null);
    setPending('crop');
    try {
      const encoded = await encodeProfileCrop(draft.uri, draft.width, draft.height, crop);
      await repo.addProfilePhoto({ bytes: encoded.bytes, role: draft.role });
      setDraft(null);
    } catch (err) {
      setError(shownError(err, 'Could not add that photo.'));
    } finally {
      setPending(null);
    }
  }

  async function removeSelected() {
    setError(null);
    setPending('delete-selected');
    try {
      for (const id of selected) await repo.deleteProfilePhoto(id);
      setSelected([]);
      setConfirmSelected(false);
    } catch (err) {
      setError(shownError(err, 'Could not delete that photo.'));
    } finally {
      setPending(null);
    }
  }

  async function remove(id: string) {
    setError(null);
    setPending(`delete-${id}`);
    try {
      await repo.deleteProfilePhoto(id);
      setConfirmId(null);
    } catch (err) {
      setError(shownError(err, 'Could not delete that photo.'));
    } finally {
      setPending(null);
    }
  }

  async function move(id: string, direction: 'up' | 'down') {
    setError(null);
    setPending(`move-${id}`);
    try {
      await repo.moveProfilePhoto(id, direction);
    } catch (err) {
      setError(shownError(err, 'Could not reorder that photo.'));
    } finally {
      setPending(null);
    }
  }

  return (
    <View style={{ gap: 12 }}>
      <T variant="label">Profile photos</T>
      <T variant="muted">{PROFILE_PHOTO_WORDING}</T>
      <ErrorNote>{error}</ErrorNote>
      <T variant="label">Profile picture</T>
      <MemberAvatar name={snap.profile?.displayName ?? ''} url={avatar?.previewUrl} size={96} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Button label="Take profile picture" tone="quiet" pending={pending === 'avatar-camera'} disabled={pending != null} onPress={() => void add('camera', 'avatar')} />
        </View>
        <View style={{ flex: 1 }}>
          <Button label="Choose profile picture" tone="quiet" pending={pending === 'avatar-library'} disabled={pending != null} onPress={() => void add('library', 'avatar')} />
        </View>
      </View>
      {avatar ? (
        <View style={{ gap: 8 }}>
          <CaptionField
            initial={avatar.caption}
            onSave={(caption) => repo.updateProfilePhoto(avatar.id, { caption })}
          />
          {confirmId === avatar.id ? (
            <View style={{ gap: 8 }}>
              <Button label="Delete this photo" tone="sos" pending={pending === `delete-${avatar.id}`} onPress={() => void remove(avatar.id)} />
              <Button label="Keep it" tone="quiet" disabled={pending != null} onPress={() => setConfirmId(null)} />
            </View>
          ) : (
            <Button label="Remove profile picture" tone="quiet" disabled={pending != null} onPress={() => setConfirmId(avatar.id)} />
          )}
        </View>
      ) : null}
      <T variant="label">Gallery</T>
      <T variant="muted">{PROFILE_GALLERY_HINT}</T>
      <ProfilePhotoTiles
        tiles={page.map((photo) => ({ id: photo.id, caption: photo.caption, uri: photo.previewUrl }))}
        mode="select"
        selected={new Set(selected)}
        onPress={(id) => {
          setConfirmSelected(false);
          setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
        }}
      />
      {visible < gallery.length ? (
        <Button label="Load more" tone="quiet" disabled={pending != null} onPress={() => setVisible((count) => count + PROFILE_GALLERY_PAGE)} />
      ) : null}
      {profileGalleryNeedsLibrary(gallery.length) ? (
        <Button label={SEE_ALL_PHOTOS} tone="quiet" onPress={() => router.push('/profile-gallery' as never)} />
      ) : null}
      {oneSelected ? (
        <View style={{ gap: 8 }}>
          <CaptionField
            initial={oneSelected.caption}
            onSave={(caption) => repo.updateProfilePhoto(oneSelected.id, { caption })}
          />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Button label="Move up" tone="quiet" disabled={pending != null || gallery[0]?.id === oneSelected.id} onPress={() => void move(oneSelected.id, 'up')} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="Move down" tone="quiet" disabled={pending != null || gallery[gallery.length - 1]?.id === oneSelected.id} onPress={() => void move(oneSelected.id, 'down')} />
            </View>
          </View>
        </View>
      ) : null}
      {selected.length > 0 ? (
        confirmSelected ? (
          <View style={{ gap: 8 }}>
            <Button label="Delete photo" tone="sos" pending={pending === 'delete-selected'} onPress={() => void removeSelected()} />
            <Button label="Keep it" tone="quiet" disabled={pending != null} onPress={() => setConfirmSelected(false)} />
          </View>
        ) : (
          <Button label="Remove selected" tone="quiet" disabled={pending != null} onPress={() => setConfirmSelected(true)} />
        )
      ) : null}
      {draft ? (
        <PhotoCropper
          image={draft}
          role={draft.role}
          pending={pending === 'crop'}
          error={error}
          onCancel={() => {
            if (pending === 'crop') return;
            setDraft(null);
            setError(null);
          }}
          onUse={(crop) => void saveCrop(crop)}
        />
      ) : null}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Button label="Take gallery photo" tone="quiet" pending={pending === 'gallery-camera'} disabled={pending != null} onPress={() => void add('camera', 'gallery')} />
        </View>
        <View style={{ flex: 1 }}>
          <Button label="Choose gallery photo" tone="quiet" pending={pending === 'gallery-library'} disabled={pending != null} onPress={() => void add('library', 'gallery')} />
        </View>
      </View>
    </View>
  );
}

function CaptionField({ initial, onSave }: { initial: string; onSave: (caption: string) => Promise<void> }) {
  const [value, setValue] = useState(initial);
  const ref = useRef(initial);
  const [saved, setSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    ref.current = initial;
    setValue(initial);
  }, [initial]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function save() {
    if (ref.current === initial) return;
    try {
      await onSave(ref.current);
    } catch {
      return;
    }
    setSaved(true);
    playSavedHaptic();
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setSaved(false), 2500);
  }

  return (
    <View style={{ gap: 6 }}>
      <Field
        label="Caption"
        value={value}
        onChangeText={(text) => {
          ref.current = text;
          setValue(text);
        }}
        onBlur={() => void save()}
        maxLength={PHOTO_CAPTION_LIMIT}
        placeholder="A few words under this photo"
      />
      {saved ? <T>Saved ✓</T> : null}
    </View>
  );
}
