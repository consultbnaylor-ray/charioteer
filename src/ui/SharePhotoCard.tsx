import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, Switch, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useRouter } from 'expo-router';

import { useRepository, useSnapshot } from '@/data';
import { connectionOtherId, memberDisplayName } from '@/domain/connections';
import { shownError } from '@/domain/errors';
import type { CropRect } from '@/domain/photoCrop';
import {
  ALLOW_SAVE_LABEL,
  ALBUM_HONEST_NOTE,
  AUTO_SAVE_LABEL,
  GRATITUDE_DIARY_TICK,
  GRATITUDE_ONLY_LABEL,
  GRATITUDE_SAVED_LABEL,
  ONLY_CHOSEN_NOTE,
  SCREENSHOT_NOTE,
  SENDER_SAVE_NOTE,
  SHARED_PHOTOS_LABEL,
  sharePhotoButtonLabel,
} from '@/domain/sharedPhotos';
import { encodeProfileCrop, pickProfilePhoto } from '@/ui/prepareProgressPhoto';
import { PhotoCropper } from '@/ui/PhotoCropper';
import { cardAccent, statsToneColors } from '@/ui/statsPalette';
import { useAppTheme } from '@/ui/theme';
import { Button, Card, ErrorNote, Field, T } from '@/ui/ui';

const AUTO_SAVE_KEY = 'charioteer.sharedPhotos.autoSaveMine';

function localDay(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function acceptedBuddies(snap: ReturnType<typeof useSnapshot>, me: string) {
  return snap.connections
    .filter((row) => row.status === 'accepted' && (row.requesterId === me || row.addresseeId === me))
    .map((row) => {
      const id = connectionOtherId(row, me);
      return { id, name: memberDisplayName(id, snap.directory, snap.connectionCards) };
    });
}

/** Small monochrome camera for the header. The button name is the accessible label. */
function CameraMark({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" accessibilityElementsHidden>
      <Path d="M4 8.2h3.1l1.3-2h7.2l1.3 2H20v10.2H4V8.2z" stroke={color} strokeWidth={1.6} strokeLinejoin="round" />
      <Circle cx={12} cy={13} r={2.7} stroke={color} strokeWidth={1.6} />
    </Svg>
  );
}

/** Header control on every signed-in screen. Opens the same share flow. */
export function HeaderShareButton() {
  const theme = useAppTheme();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Share a photo"
        onPress={() => setOpen(true)}
        style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
      >
        <CameraMark color={theme.colors.ink} />
      </Pressable>
      <SharePhotoSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function SharePhotoSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const theme = useAppTheme();
  const { height } = useWindowDimensions();
  return (
    <Modal visible={open} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" style={{ flex: 1 }} onPress={onClose} />
        <View style={{ backgroundColor: theme.colors.bg, borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: Math.round(height * 0.92), padding: 16, gap: 8 }}>
          <T variant="title">Share a photo</T>
          {open ? <SharePhotoComposer onClose={onClose} maxHeight={Math.round(height * 0.72)} /> : null}
        </View>
      </View>
    </Modal>
  );
}

/** Card on the Buddies list. The composer is this child, so the closed card does not name the diary. */
export function SharePhotoCard() {
  const theme = useAppTheme();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <Card style={{ borderColor: cardAccent(theme.scheme) }}>
      <T style={{ fontFamily: theme.font.bodyStrong, fontSize: 16, lineHeight: 22 }}>Share a photo</T>
      <T>{ONLY_CHOSEN_NOTE}</T>
      <T>{SCREENSHOT_NOTE}</T>
      <T>{SENDER_SAVE_NOTE}</T>
      <T>{ALBUM_HONEST_NOTE}</T>
      <Button label="Share a photo" accessibilityLabel="Share a photo" onPress={() => setOpen(true)} />
      <Button label={SHARED_PHOTOS_LABEL} tone="quiet" onPress={() => router.push('/shared-photos' as never)} />
      {open ? <SharePhotoComposer onClose={() => setOpen(false)} maxHeight={520} /> : null}
    </Card>
  );
}

function SharePhotoComposer({ onClose, maxHeight }: { onClose: () => void; maxHeight?: number }) {
  const theme = useAppTheme();
  const router = useRouter();
  const repo = useRepository();
  const snap = useSnapshot();
  const me = snap.profile?.id ?? '';
  const buddies = acceptedBuddies(snap, me);
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
  const [gratitudeSaved, setGratitudeSaved] = useState(false);
  const [sent, setSent] = useState(false);
  const selected = chosen ?? buddies.map((buddy) => buddy.id);
  const buttonLabel = sharePhotoButtonLabel(selected.length, diary);
  const green = statsToneColors(theme.scheme).good.ink;

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

  async function saveGratitude(bytes: Uint8Array): Promise<boolean> {
    const entryId = await repo.addGratitudeEntry({
      body: caption.trim(),
      category: null,
      isFavourite: false,
      entryDate: localDay(),
    });
    await repo.addGratitudePhoto(entryId, bytes);
    return true;
  }

  async function submit() {
    if (!prepared) return;
    if (selected.length === 0 && !diary) {
      setError('Choose a buddy, or save it to your Gratitude diary.');
      return;
    }
    if (diary && !caption.trim()) {
      setError('Write a line first.');
      return;
    }
    setPending(true);
    setError(null);
    setNote(null);
    let sentNow = sent;
    try {
      if (selected.length > 0 && !sentNow) {
        await repo.sendSharedPhoto({
          caption: caption.trim(),
          bytes: prepared.bytes,
          previewUri: prepared.previewUri,
          buddyIds: selected,
          allowSave,
        });
        sentNow = true;
        setSent(true);
        const auto = (await AsyncStorage.getItem(AUTO_SAVE_KEY)) === '1';
        if (auto && Platform.OS !== 'web') {
          const { saveJpegToLibrary } = await import('@/ui/saveSharedPhoto');
          const saved = await saveJpegToLibrary(prepared.previewUri);
          if (saved !== 'saved') setNote('The buddy photo was sent. It was not added to the photo library.');
        }
      }
      if (diary) {
        try {
          await saveGratitude(prepared.bytes);
          setGratitudeSaved(true);
        } catch (caught) {
          const lead = sentNow ? 'The buddy photo was sent. The diary copy was not saved. ' : '';
          setError(`${lead}${shownError(caught, 'Could not save that to Gratitude.')}`);
          setPending(false);
          return;
        }
      }
      if (sentNow && !diary) {
        onClose();
        router.push('/shared-photos' as never);
        return;
      }
      if (sentNow) setNote('Sent to your buddies.');
    } catch (caught) {
      setError(shownError(caught, 'Could not send that photo.'));
    } finally {
      setPending(false);
    }
  }

  return (
    <ScrollView style={{ flexGrow: 0, maxHeight }} contentContainerStyle={{ gap: 8, paddingBottom: 8 }}>
      <T>{ALBUM_HONEST_NOTE}</T>
      {buddies.length === 0 ? (
        <T variant="muted">No accepted buddies yet. You can still save this photo to your Gratitude diary.</T>
      ) : null}
      {prepared ? null : (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}><Button label="Take photo" tone="quiet" pending={pending} onPress={() => void pick('camera')} /></View>
          <View style={{ flex: 1 }}><Button label="Choose photo" tone="quiet" pending={pending} onPress={() => void pick('library')} /></View>
        </View>
      )}
      <Pressable
        accessibilityRole="checkbox"
        accessibilityLabel={GRATITUDE_DIARY_TICK}
        accessibilityState={{ checked: diary }}
        onPress={() => setDiary((value) => !value)}
        style={{ minHeight: 44, justifyContent: 'center', borderWidth: 1, borderColor: theme.colors.ink, borderRadius: 8, paddingHorizontal: 12 }}
      >
        <T style={{ fontFamily: theme.font.bodyStrong }}>{diary ? '✓' : '○'} {GRATITUDE_DIARY_TICK}</T>
      </Pressable>
      {prepared ? (
        <>
          <Field label="Caption" value={caption} onChangeText={setCaption} maxLength={140} hint="Optional, unless you save to Gratitude. 140 characters." />
          <Button label="Choose buddies" tone="quiet" onPress={() => setChooserOpen(true)} />
          <T variant="muted">
            {selected.length === 0
              ? 'No buddies selected.'
              : chooserOpen
                ? `${selected.length} selected.`
                : 'All accepted buddies are included until you open the list.'}
          </T>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={GRATITUDE_ONLY_LABEL}
            onPress={() => { setChosen([]); setDiary(true); setChooserOpen(false); }}
            style={{ minHeight: 44, justifyContent: 'center' }}
          >
            <T>{selected.length === 0 && diary ? '✓' : '○'} {GRATITUDE_ONLY_LABEL}</T>
          </Pressable>
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
          {buddies.length === 0 ? (
            <Button label="People" tone="quiet" onPress={() => { onClose(); router.push('/people' as never); }} />
          ) : null}
          {selected.length > 0 ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <T style={{ flex: 1 }}>{ALLOW_SAVE_LABEL}</T>
              <Switch accessibilityLabel={ALLOW_SAVE_LABEL} value={allowSave} onValueChange={setAllowSave} />
            </View>
          ) : null}
          {gratitudeSaved ? null : <Button label={buttonLabel} pending={pending} onPress={() => void submit()} />}
        </>
      ) : null}
      {gratitudeSaved ? (
        <T style={{ color: green, fontFamily: theme.font.bodyStrong }}>✓ {GRATITUDE_SAVED_LABEL}</T>
      ) : null}
      <ErrorNote>{error}</ErrorNote>
      {note ? <T>{note}</T> : null}
      {gratitudeSaved && selected.length > 0 ? (
        <Button label={SHARED_PHOTOS_LABEL} tone="quiet" onPress={() => { onClose(); router.push('/shared-photos' as never); }} />
      ) : null}
      <Button label="Close" tone="quiet" onPress={onClose} />
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
    </ScrollView>
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
