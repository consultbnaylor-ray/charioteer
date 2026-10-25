import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Platform, Pressable, Switch, View } from 'react-native';

import { useRepository, useSnapshot } from '@/data';
import { connectionOtherId, memberDisplayName } from '@/domain/connections';
import { shownError } from '@/domain/errors';
import {
  ALLOW_SAVE_LABEL,
  ALBUM_HONEST_NOTE,
  AUTO_SAVE_LABEL,
  ONLY_CHOSEN_NOTE,
  SCREENSHOT_NOTE,
  SENDER_SAVE_NOTE,
  SHARED_PHOTOS_LABEL,
} from '@/domain/sharedPhotos';
import { encodeProfileCrop, pickProfilePhoto } from '@/ui/prepareProgressPhoto';
import { PhotoCropper } from '@/ui/PhotoCropper';
import type { CropRect } from '@/domain/photoCrop';
import { cardAccent } from '@/ui/statsPalette';
import { useAppTheme } from '@/ui/theme';
import { Button, Card, ErrorNote, Field, T } from '@/ui/ui';
import { useRouter } from 'expo-router';

const AUTO_SAVE_KEY = 'charioteer.sharedPhotos.autoSaveMine';

function localDay(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/** Card on the Buddies list. The composer is this child, so the People screen does not name the diary. */
export function SharePhotoCard() {
  const theme = useAppTheme();
  const router = useRouter();
  const repo = useRepository();
  const snap = useSnapshot();
  const me = snap.profile?.id ?? '';
  const buddies = snap.connections
    .filter((row) => row.status === 'accepted' && (row.requesterId === me || row.addresseeId === me))
    .map((row) => {
      const id = connectionOtherId(row, me);
      return { id, name: memberDisplayName(id, snap.directory, snap.connectionCards) };
    });
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<{ uri: string; width: number; height: number } | null>(null);
  const [prepared, setPrepared] = useState<{ bytes: Uint8Array; previewUri: string } | null>(null);
  const [caption, setCaption] = useState('');
  const [diary, setDiary] = useState(false);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [chosen, setChosen] = useState<string[] | null>(null);
  const [allowSave, setAllowSave] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const selected = chosen ?? buddies.map((buddy) => buddy.id);

  async function pick(source: 'camera' | 'library') {
    setError(null);
    setPending(true);
    try {
      const image = await pickProfilePhoto(source);
      if (image) setPicked(image);
    } catch (caught) {
      setError(shownError(caught, 'Could not use that photo.'));
    } finally {
      setPending(false);
    }
  }

  async function useCrop(crop: CropRect) {
    if (!picked) return;
    setPending(true);
    setError(null);
    try {
      const encoded = await encodeProfileCrop(picked.uri, picked.width, picked.height, crop);
      setPrepared(encoded);
      setPicked(null);
    } catch (caught) {
      setError(shownError(caught, 'Could not use that photo.'));
    } finally {
      setPending(false);
    }
  }

  async function send() {
    if (!prepared) return;
    if (diary && !caption.trim()) {
      setError('Write a line first.');
      return;
    }
    setPending(true);
    setError(null);
    setNote(null);
    try {
      await repo.sendSharedPhoto({
        caption: caption.trim(),
        bytes: prepared.bytes,
        previewUri: prepared.previewUri,
        buddyIds: selected,
        allowSave,
      });
      if (diary) {
        try {
          const entryId = await repo.addGratitudeEntry({
            body: caption.trim(),
            category: null,
            isFavourite: false,
            entryDate: localDay(),
          });
          await repo.addGratitudePhoto(entryId, prepared.bytes);
        } catch (caught) {
          setNote(`The buddy photo was sent. The extra copy was not saved. ${shownError(caught, 'Could not save the extra copy.')}`);
        }
      }
      const auto = (await AsyncStorage.getItem(AUTO_SAVE_KEY)) === '1';
      if (auto && Platform.OS !== 'web') {
        const { saveJpegToLibrary } = await import('@/ui/saveSharedPhoto');
        const saved = await saveJpegToLibrary(prepared.previewUri);
        if (saved !== 'saved') setNote('The buddy photo was sent. It was not added to the photo library.');
      }
      setOpen(false);
      setPrepared(null);
      setCaption('');
      setDiary(false);
      setChooserOpen(false);
      setChosen(null);
      router.push('/shared-photos' as never);
    } catch (caught) {
      setError(shownError(caught, 'Could not send that photo.'));
    } finally {
      setPending(false);
    }
  }

  return (
    <Card style={{ borderColor: cardAccent(theme.scheme) }}>
      <T style={{ fontFamily: theme.font.bodyStrong, fontSize: 16, lineHeight: 22 }}>Share a photo</T>
      <T>{ONLY_CHOSEN_NOTE}</T>
      <T>{SCREENSHOT_NOTE}</T>
      <T>{SENDER_SAVE_NOTE}</T>
      <T>{ALBUM_HONEST_NOTE}</T>
      <Button label="Share a photo" accessibilityLabel="Share a photo" onPress={() => setOpen(true)} />
      <Button label={SHARED_PHOTOS_LABEL} tone="quiet" onPress={() => router.push('/shared-photos' as never)} />
      {open ? (
        <View style={{ gap: 8 }}>
          <T>{ALBUM_HONEST_NOTE}</T>
          {prepared ? null : (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}><Button label="Take photo" tone="quiet" pending={pending} onPress={() => void pick('camera')} /></View>
              <View style={{ flex: 1 }}><Button label="Choose photo" tone="quiet" pending={pending} onPress={() => void pick('library')} /></View>
            </View>
          )}
          {prepared ? (
            <>
              <Field label="Caption" value={caption} onChangeText={setCaption} maxLength={140} hint="Optional. 140 characters." />
              <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: diary }} onPress={() => setDiary((value) => !value)} style={{ minHeight: 44, justifyContent: 'center' }}>
                <T>{diary ? '✓' : '○'} Also add to my Gratitude list</T>
              </Pressable>
              <Button label="Choose buddies" tone="quiet" onPress={() => setChooserOpen(true)} />
              <T variant="muted">{chooserOpen ? `${selected.length} selected.` : 'All accepted buddies are included until you open the list.'}</T>
              {chooserOpen ? buddies.map((buddy) => {
                const on = selected.includes(buddy.id);
                return (
                  <Pressable
                    key={buddy.id}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    onPress={() => {
                      const next = new Set(selected);
                      if (on) next.delete(buddy.id);
                      else next.add(buddy.id);
                      setChosen([...next]);
                    }}
                    style={{ minHeight: 44, justifyContent: 'center' }}
                  >
                    <T>{on ? '✓' : '○'} {buddy.name}</T>
                  </Pressable>
                );
              }) : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <T style={{ flex: 1 }}>{ALLOW_SAVE_LABEL}</T>
                <Switch accessibilityLabel={ALLOW_SAVE_LABEL} value={allowSave} onValueChange={setAllowSave} />
              </View>
              <Button label="Send" pending={pending} onPress={() => void send()} />
            </>
          ) : null}
          <ErrorNote>{error}</ErrorNote>
          {note ? <T>{note}</T> : null}
          <Button label="Close" tone="quiet" onPress={() => { setOpen(false); setPicked(null); }} />
        </View>
      ) : null}
      {picked ? (
        <PhotoCropper
          image={picked}
          role="gallery"
          pending={pending}
          error={error}
          onCancel={() => setPicked(null)}
          onUse={(crop) => void useCrop(crop)}
        />
      ) : null}
    </Card>
  );
}

export function AutoSaveSwitch() {
  const [on, setOn] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    void AsyncStorage.getItem(AUTO_SAVE_KEY).then((value) => {
      setOn(value === '1');
      setReady(true);
    });
  }, []);
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <T style={{ flex: 1 }}>{AUTO_SAVE_LABEL}</T>
        <Switch
          accessibilityLabel={AUTO_SAVE_LABEL}
          value={on}
          disabled={!ready || Platform.OS === 'web'}
          onValueChange={(value) => {
            setOn(value);
            void AsyncStorage.setItem(AUTO_SAVE_KEY, value ? '1' : '0');
          }}
        />
      </View>
      <T variant="muted">{ALBUM_HONEST_NOTE} This starts off. It applies only to photos you send. A photo you receive is never saved on its own.</T>
      {Platform.OS === 'web' ? <T variant="muted">Saving to the photo library is available on the phone.</T> : null}
    </View>
  );
}
