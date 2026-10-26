import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useRepository, useSnapshot } from '@/data';
import type { ProfilePhoto, ProfilePhotoRole } from '@/data/types';
import { shownError } from '@/domain/errors';
import { PHOTO_CAPTION_LIMIT, SHOW_PHOTO_ON_PROFILE, toggleShareId } from '@/domain/profileSharing';
import {
  PROFILE_GALLERY_LIMIT,
  PROFILE_GALLERY_LIMIT_MESSAGE,
  PROFILE_PHOTO_WORDING,
  sortProfilePhotos,
} from '@/domain/profilePhotos';
import type { CropRect } from '@/domain/photoCrop';
import { encodeProfileCrop, pickProfilePhoto } from '@/ui/prepareProgressPhoto';
import { PhotoCropper } from '@/ui/PhotoCropper';
import { useAppTheme } from '@/ui/theme';
import { MemberAvatar } from '@/ui/MemberAvatar';
import { OwnerPhoto } from '@/ui/OwnerPhoto';
import { ShareOnProfile } from '@/ui/ShareOnProfile';
import { Button, ErrorNote, Field, playSavedHaptic, T } from '@/ui/ui';

export function OwnProfilePhotos({ name, photos }: { name: string; photos: ProfilePhoto[] }) {
  const gallery = sortProfilePhotos(photos.filter((photo) => photo.role === 'gallery'));
  if (!gallery.length) return null;
  return (
    <View accessibilityLabel={`${name} profile photos`} style={{ gap: 8 }}>
      {gallery.map((photo) => (
        <View key={photo.id} style={{ gap: 4 }}>
          <PhotoFrame uri={photo.previewUrl} label={photo.caption || 'Profile photo'} />
          {photo.caption ? <T variant="muted">{photo.caption}</T> : null}
        </View>
      ))}
    </View>
  );
}

export function ProfilePhotoEditor() {
  const snap = useSnapshot();
  const repo = useRepository();
  const photos = sortProfilePhotos(snap.profilePhotos ?? []);
  const avatar = photos.find((photo) => photo.role === 'avatar') ?? null;
  const gallery = photos.filter((photo) => photo.role === 'gallery');
  const [pending, setPending] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ uri: string; width: number; height: number; role: ProfilePhotoRole } | null>(null);
  const full = gallery.length >= PROFILE_GALLERY_LIMIT;

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
      <T variant="muted">Up to {PROFILE_GALLERY_LIMIT} photos.</T>
      {gallery.map((photo, index) => (
        <View key={photo.id} style={{ gap: 8 }}>
          <PhotoFrame uri={photo.previewUrl} label={photo.caption || 'Profile photo'} />
          <CaptionField
            initial={photo.caption}
            onSave={(caption) => repo.updateProfilePhoto(photo.id, { caption })}
          />
          <ShareOnProfile
            label={SHOW_PHOTO_ON_PROFILE}
            item={photo.caption.trim() || 'This gallery photo'}
            on={snap.sharing.profilePhotoIds.includes(photo.id)}
            apply={(sharing, selected) => toggleShareId(sharing, 'profilePhotoIds', photo.id, selected)}
          />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Button label="Move up" tone="quiet" disabled={pending != null || index === 0} onPress={() => void move(photo.id, 'up')} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="Move down" tone="quiet" disabled={pending != null || index === gallery.length - 1} onPress={() => void move(photo.id, 'down')} />
            </View>
          </View>
          {confirmId === photo.id ? (
            <View style={{ gap: 8 }}>
              <Button label="Delete this photo" tone="sos" pending={pending === `delete-${photo.id}`} onPress={() => void remove(photo.id)} />
              <Button label="Keep it" tone="quiet" disabled={pending != null} onPress={() => setConfirmId(null)} />
            </View>
          ) : (
            <Button label="Delete photo" tone="quiet" disabled={pending != null} onPress={() => setConfirmId(photo.id)} />
          )}
        </View>
      ))}
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
      {full ? <T variant="muted">{PROFILE_GALLERY_LIMIT_MESSAGE}</T> : (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Button label="Take gallery photo" tone="quiet" pending={pending === 'gallery-camera'} disabled={pending != null} onPress={() => void add('camera', 'gallery')} />
          </View>
          <View style={{ flex: 1 }}>
            <Button label="Choose gallery photo" tone="quiet" pending={pending === 'gallery-library'} disabled={pending != null} onPress={() => void add('library', 'gallery')} />
          </View>
        </View>
      )}
    </View>
  );
}

function PhotoFrame({ uri, label }: { uri: string | null; label: string }) {
  const theme = useAppTheme();
  return (
    <View style={{ width: '100%', maxWidth: 280, aspectRatio: 1, borderRadius: 8, overflow: 'hidden', backgroundColor: theme.colors.sunken }}>
      {uri ? (
        <OwnerPhoto uri={uri} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityLabel={label} />
      ) : (
        <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
          <T variant="muted">Photo</T>
        </View>
      )}
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
