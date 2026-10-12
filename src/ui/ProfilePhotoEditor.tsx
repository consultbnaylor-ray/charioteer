import { Image } from 'expo-image';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import { useRepository, useSnapshot } from '@/data';
import type { ProfilePhoto, ProfilePhotoRole } from '@/data/types';
import { shownError } from '@/domain/errors';
import { PHOTO_CAPTION_LIMIT } from '@/domain/profileSharing';
import {
  PROFILE_GALLERY_LIMIT,
  PROFILE_GALLERY_LIMIT_MESSAGE,
  PROFILE_PHOTO_WORDING,
  sortProfilePhotos,
} from '@/domain/profilePhotos';
import { pickProfilePhoto } from '@/ui/prepareProgressPhoto';
import { useAppTheme } from '@/ui/theme';
import { MemberAvatar } from '@/ui/MemberAvatar';
import { Button, ErrorNote, Field, playSavedHaptic, T } from '@/ui/ui';

/** Tappable profile picture. Empty state asks for a photo. The same control is used on the public card and in Edit profile. */
export function ProfileAvatarPicker({
  name,
  size = 72,
  trailing,
}: {
  name: string;
  size?: number;
  trailing?: ReactNode;
}) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const snap = useSnapshot();
  const repo = useRepository();
  const avatar = (snap.profilePhotos ?? []).find((photo) => photo.role === 'avatar') ?? null;
  const empty = !avatar?.previewUrl;
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [pending, setPending] = useState<'camera' | 'library' | 'remove' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const badge = 22;

  function close() {
    if (pending) return;
    setConfirm(false);
    setOpen(false);
  }

  async function add(source: 'camera' | 'library') {
    setError(null);
    setPending(source);
    try {
      const picked = await pickProfilePhoto(source, 'avatar');
      if (!picked) return;
      await repo.addProfilePhoto({ bytes: picked.bytes, role: 'avatar' });
      setOpen(false);
    } catch (err) {
      setError(shownError(err, 'Could not add that photo.'));
    } finally {
      setPending(null);
    }
  }

  async function remove() {
    if (!avatar) return;
    setError(null);
    setPending('remove');
    try {
      await repo.deleteProfilePhoto(avatar.id);
      setConfirm(false);
      setOpen(false);
    } catch (err) {
      setError(shownError(err, 'Could not delete that photo.'));
    } finally {
      setPending(null);
    }
  }

  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={empty ? 'Choose profile photo' : 'Change profile photo'}
          disabled={pending != null}
          onPress={() => {
            setConfirm(false);
            setOpen(true);
          }}
          style={{ width: size, height: size }}
        >
          <MemberAvatar name={name} url={avatar?.previewUrl} size={size} />
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{
              position: 'absolute',
              right: 0,
              bottom: 0,
              width: badge,
              height: badge,
              borderRadius: badge / 2,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.colors.ink,
              borderWidth: 2,
              borderColor: theme.colors.surface,
            }}
          >
            <CameraMark color={theme.colors.bg} />
          </View>
        </Pressable>
        <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
          {trailing}
          {empty ? <T>Choose profile photo</T> : null}
          {trailing && avatar?.caption ? <T variant="muted">{avatar.caption}</T> : null}
        </View>
      </View>
      <ErrorNote>{error}</ErrorNote>
      <Modal visible={open} animationType="slide" transparent onRequestClose={close}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close profile photo" style={{ flex: 1 }} onPress={close} />
          <View
            style={{
              backgroundColor: theme.colors.bg,
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              paddingHorizontal: 20,
              paddingTop: 20,
              paddingBottom: 16 + insets.bottom,
              gap: 8,
            }}
          >
            <T variant="title">Profile photo</T>
            <ErrorNote>{error}</ErrorNote>
            {confirm ? (
              <View style={{ gap: 8 }}>
                <T>Remove this profile photo?</T>
                <Button label="Remove" tone="sos" pending={pending === 'remove'} disabled={pending != null && pending !== 'remove'} onPress={() => void remove()} />
                <Button label="Keep it" tone="quiet" disabled={pending != null} onPress={() => setConfirm(false)} />
              </View>
            ) : (
              <View style={{ gap: 8 }}>
                <Button label="Take photo" tone="quiet" pending={pending === 'camera'} disabled={pending != null && pending !== 'camera'} onPress={() => void add('camera')} />
                <Button label="Choose from library" tone="quiet" pending={pending === 'library'} disabled={pending != null && pending !== 'library'} onPress={() => void add('library')} />
                <Button label="Remove" tone="quiet" disabled={!avatar || pending != null} onPress={() => setConfirm(true)} />
                <Button label="Cancel" tone="quiet" disabled={pending != null} onPress={close} />
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function CameraMark({ color }: { color: string }) {
  return (
    <Svg width={12} height={12} viewBox="0 0 24 24">
      <Path d="M8.5 7.2L9.6 5h4.8l1.1 2.2H19a2 2 0 012 2V18a2 2 0 01-2 2H5a2 2 0 01-2-2V9.2a2 2 0 012-2h3.5z" fill="none" stroke={color} strokeWidth={2} />
      <Circle cx={12} cy={13} r={3.1} fill="none" stroke={color} strokeWidth={2} />
    </Svg>
  );
}

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
  const full = gallery.length >= PROFILE_GALLERY_LIMIT;

  async function add(source: 'camera' | 'library', role: ProfilePhotoRole) {
    setError(null);
    setPending(`${role}-${source}`);
    try {
      const picked = await pickProfilePhoto(source, role);
      if (!picked) return;
      await repo.addProfilePhoto({ bytes: picked.bytes, role });
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
      <ProfileAvatarPicker name={snap.profile?.displayName ?? ''} />
      {avatar ? (
        <CaptionField
          initial={avatar.caption}
          onSave={(caption) => repo.updateProfilePhoto(avatar.id, { caption })}
        />
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
        <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityLabel={label} />
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
