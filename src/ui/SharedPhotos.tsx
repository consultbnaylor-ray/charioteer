import { Image } from 'expo-image';
import { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';

import { useRepository } from '@/data';
import { shownError } from '@/domain/errors';
import {
  SAVED_TO_GRATITUDE,
  SAVED_TO_LIBRARY,
  SCREENSHOT_NOTE,
  SENDER_SAVE_NOTE,
  buddyMaySave,
  filterSharedPhotos,
  sharedPhotoWhen,
  splitSharedPhotos,
  type SharedPhotoCard,
} from '@/domain/sharedPhotos';
import { saveJpegToLibrary } from '@/ui/saveSharedPhoto';
import { statsToneColors } from '@/ui/statsPalette';
import { useAppTheme } from '@/ui/theme';
import { AutoSaveSwitch } from '@/ui/SharePhotoCard';
import { Button, Card, ErrorNote, T } from '@/ui/ui';

export function SharedPhotos() {
  const theme = useAppTheme();
  const repo = useRepository();
  const [rows, setRows] = useState<SharedPhotoCard[]>([]);
  const [buddy, setBuddy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const green = statsToneColors(theme.scheme).good.ink;

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await repo.listSharedPhotos());
    } catch (caught) {
      setError(shownError(caught, 'Could not load shared photos.'));
    }
  }, [repo]);

  useEffect(() => {
    void load();
  }, [load]);

  const names = [...new Set(rows.flatMap((row) => row.buddyNames))].sort((left, right) => left.localeCompare(right));
  const filtered = filterSharedPhotos(rows, buddy);
  const split = splitSharedPhotos(filtered);

  async function act(id: string, run: () => Promise<void>) {
    setPending(id);
    setError(null);
    setNote(null);
    try {
      await run();
      await load();
    } catch (caught) {
      setError(shownError(caught, 'Could not update that photo.'));
    } finally {
      setPending(null);
    }
  }

  async function saveToGratitude(photo: SharedPhotoCard) {
    if (!photo.imageUrl) {
      setNote('This sample photo is not a file on this phone.');
      return;
    }
    const response = await fetch(photo.imageUrl);
    if (!response.ok) throw new Error('Could not read that photo.');
    const bytes = new Uint8Array(await response.arrayBuffer());
    await repo.saveSharedPhotoToGratitude({ caption: photo.caption, bytes });
    setNote(SAVED_TO_GRATITUDE);
  }

  async function save(photo: SharedPhotoCard) {
    if (!photo.imageUrl) {
      setNote('This sample photo is not a file on this phone.');
      return;
    }
    const result = await saveJpegToLibrary(photo.imageUrl);
    if (result === 'unavailable') setNote('Saving to the photo library is available on the phone.');
    else if (result === 'denied') setNote('Photo library save was not allowed.');
    else setNote(SAVED_TO_LIBRARY);
  }

  function group(title: string, photos: SharedPhotoCard[]) {
    return (
      <View style={{ gap: 8 }}>
        <T style={{ fontFamily: theme.font.bodyStrong, fontSize: 16, lineHeight: 22 }}>{title}</T>
        {photos.length === 0 ? <T variant="muted">None yet.</T> : null}
        {photos.map((photo) => (
          <Card key={photo.id}>
            {photo.imageUrl ? (
              <Image source={{ uri: photo.imageUrl }} accessibilityLabel={photo.caption || `Photo from ${photo.buddyNames[0] ?? 'a buddy'}`} style={{ width: '100%', height: 180, backgroundColor: theme.colors.surface }} contentFit="cover" />
            ) : (
              <View accessibilityLabel={photo.caption || `Photo from ${photo.buddyNames[0] ?? 'a buddy'}`} style={{ height: 120, backgroundColor: '#143024', alignItems: 'center', justifyContent: 'center' }}>
                <T style={{ color: green }}>{photo.caption || 'Photo'}</T>
              </View>
            )}
            <T>{photo.caption || (photo.mine ? 'Photo you sent' : `Photo from ${photo.buddyNames[0] ?? 'a buddy'}`)}</T>
            <T variant="muted">{sharedPhotoWhen(photo.createdAt)}</T>
            <T variant="muted">{photo.mine ? `To ${photo.buddyNames.join(', ') || 'a buddy'}` : `From ${photo.buddyNames[0] ?? 'a buddy'}`}</T>
            {photo.mine ? (
              <Button label="Delete" tone="quiet" pending={pending === photo.id} onPress={() => void act(photo.id, () => repo.deleteSharedPhoto(photo.id))} />
            ) : (
              <View style={{ gap: 8 }}>
                <Button label="Hide" tone="quiet" pending={pending === photo.id} onPress={() => void act(photo.id, () => repo.hideSharedPhoto(photo.id))} />
                <Button label="Report" tone="quiet" pending={pending === `report-${photo.id}`} onPress={() => void act(`report-${photo.id}`, () => repo.reportSharedPhoto(photo.id, 'Shared photo'))} />
              </View>
            )}
            {buddyMaySave(photo) ? <Button label="Save to Photos" tone="quiet" onPress={() => void save(photo)} /> : <T variant="muted">The sender did not allow Save to Photos.</T>}
            <Button label="Save to Gratitude" tone="quiet" pending={pending === `gratitude-${photo.id}`} onPress={() => void act(`gratitude-${photo.id}`, () => saveToGratitude(photo))} />
          </Card>
        ))}
      </View>
    );
  }

  return (
    <View style={{ gap: 12 }}>
      <T>{SCREENSHOT_NOTE}</T>
      <T>{SENDER_SAVE_NOTE}</T>
      {Platform.OS === 'web' ? <T variant="muted">Saving to the photo library is available on the phone.</T> : null}
      <AutoSaveSwitch />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Filter label="All" selected={buddy == null} onPress={() => setBuddy(null)} />
        {names.map((name) => <Filter key={name} label={name} selected={buddy === name} onPress={() => setBuddy(name)} />)}
      </View>
      <ErrorNote>{error}</ErrorNote>
      {note ? <T>{note}</T> : null}
      {group('Sent', split.sent)}
      {group('Received', split.received)}
    </View>
  );
}

function Filter({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const theme = useAppTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 8, borderWidth: 1, borderColor: selected ? theme.colors.ink : theme.colors.line }}>
      <T>{label}</T>
    </Pressable>
  );
}
