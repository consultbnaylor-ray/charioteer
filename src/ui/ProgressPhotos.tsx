import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { useRepository, useSnapshot } from '@/data';
import type { ProgressPhoto, ProgressVisibility } from '@/data/types';
import { isoDay, parseIsoDay } from '@/domain/dates';
import { shownError } from '@/domain/errors';
import { planProgressPhoto, PROGRESS_SHARE_WARNING, progressAnchor, progressPhotoLabel, PROGRESS_NOTE_LIMIT } from '@/domain/progressPhotos';
import { DateField } from '@/ui/DateField';
import { pickProgressPhoto } from '@/ui/prepareProgressPhoto';
import { radius, useAppTheme } from '@/ui/theme';
import { Button, Card, Choice, ErrorNote, Field, playSavedHaptic, T } from '@/ui/ui';

type PendingUpload = {
  bytes: Uint8Array;
  takenOn: string;
  previewUri: string;
};

export function ProgressPhotos() {
  const snap = useSnapshot();
  const repo = useRepository();
  const profile = snap.profile;
  const photos = [...(snap.progressPhotos ?? [])].sort((a, b) => a.monthIndex - b.monthIndex || a.takenOn.localeCompare(b.takenOn) || a.createdAt.localeCompare(b.createdAt));
  const [upload, setUpload] = useState<PendingUpload | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [beforeId, setBeforeId] = useState<string | null>(null);
  const [nowId, setNowId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [shareIds, setShareIds] = useState<string[] | null>(null);
  const [pending, setPending] = useState<'camera' | 'library' | 'save' | 'delete' | 'share' | 'note' | 'date' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  if (!profile) return null;

  const selected = photos.find((photo) => photo.id === selectedId) ?? null;
  const before = photos.find((photo) => photo.id === beforeId) ?? photos[0] ?? null;
  const now = photos.find((photo) => photo.id === nowId) ?? photos[photos.length - 1] ?? null;
  const anchor = progressAnchor(profile.sobrietyStartedAt, profile.createdAt);
  const groups = groupPhotos(photos);
  const uploadPlan = upload ? planProgressPhoto({ takenOn: upload.takenOn, startingPoint: false, note: '', anchor }) : null;

  function markSaved(message: string) {
    setNotice(message);
    setError(null);
    playSavedHaptic();
  }

  function openPhoto(photo: ProgressPhoto) {
    setSelectedId(photo.id);
    setNoteDraft(photo.note);
    setConfirmId(null);
    setNotice(null);
  }

  async function choose(source: 'camera' | 'library') {
    setError(null);
    setNotice(null);
    setPending(source);
    try {
      const picked = await pickProgressPhoto(source);
      if (!picked) return;
      await store({ bytes: picked.bytes, takenOn: picked.takenOn, previewUri: picked.previewUri });
    } catch (err) {
      setError(shownError(err, 'Could not add that photo.'));
    } finally {
      setPending((current) => (current === source ? null : current));
    }
  }

  async function store(next: PendingUpload) {
    setUpload(next);
    setError(null);
    setPending('save');
    try {
      await repo.addProgressPhoto({ bytes: next.bytes, takenOn: next.takenOn, startingPoint: false, note: '' });
      setUpload(null);
      markSaved('Photo saved');
    } catch (err) {
      setError(shownError(err, 'Could not save that photo.'));
    } finally {
      setPending((current) => (current === 'save' ? null : current));
    }
  }

  async function saveDetails(id: string, input: { takenOn?: string; startingPoint?: boolean; note?: string }, kind: 'note' | 'date') {
    setPending(kind);
    setError(null);
    try {
      await repo.updateProgressPhoto(id, input);
      if (input.note !== undefined) setNoteDraft(input.note.trim().replace(/\s+/g, ' '));
      markSaved('Saved');
    } catch (err) {
      setError(shownError(err, 'Could not update that photo.'));
    } finally {
      setPending(null);
    }
  }

  async function remove(id: string) {
    setError(null);
    setPending('delete');
    try {
      await repo.deleteProgressPhoto(id);
      if (selectedId === id) setSelectedId(null);
      if (beforeId === id) setBeforeId(null);
      if (nowId === id) setNowId(null);
      setConfirmId(null);
    } catch (err) {
      setError(shownError(err, 'Could not delete that photo.'));
    } finally {
      setPending(null);
    }
  }

  async function applyVisibility(ids: string[], visibility: ProgressVisibility) {
    setError(null);
    setPending('share');
    try {
      await repo.setProgressPhotoVisibility(ids, visibility);
      setShareIds(null);
      markSaved('Saved');
    } catch (err) {
      setError(shownError(err, 'Could not update that photo.'));
    } finally {
      setPending(null);
    }
  }

  return (
    <View style={{ gap: 14 }}>
      <T variant="label">Progress photos</T>
      <T>A starting point, then photos through the months. Counted from your sober date, or from the day you joined.</T>
      <T>Photos stay private unless you choose Share with community. They are not sent to Thumos. Only me puts a shared photo back to just you.</T>
      {notice ? <T>{notice}</T> : null}
      {error ? <ErrorNote>{error}</ErrorNote> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Button label="Take a photo" pending={pending === 'camera'} disabled={pending != null && pending !== 'camera'} onPress={() => void choose('camera')} />
        <Button label="Choose from library" tone="quiet" pending={pending === 'library'} disabled={pending != null && pending !== 'library'} onPress={() => void choose('library')} />
      </View>
      {upload ? (
        <View style={{ width: 160, gap: 8 }}>
          <View style={{ width: 160, aspectRatio: 1, borderRadius: radius.md, overflow: 'hidden', backgroundColor: '#171717' }}>
            <Image source={{ uri: upload.previewUri }} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityLabel="Photo being saved" />
            {pending === 'save' ? (
              <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)', gap: 8 }]}>
                <ActivityIndicator color="#F3F3EE" />
                <T style={{ color: '#F3F3EE' }}>Saving photo…</T>
              </View>
            ) : null}
          </View>
          {uploadPlan?.ok ? <T variant="muted">{uploadPlan.label}</T> : null}
          {pending !== 'save' && error ? (
            <Button label="Try again" pending={false} onPress={() => void store(upload)} />
          ) : null}
        </View>
      ) : null}
      {photos.length === 0 && !upload ? <T variant="muted">No photos yet.</T> : null}
      {groups.map((group) => (
        <View key={group.label} style={{ gap: 8 }}>
          <T variant="label">{group.label}</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {group.photos.map((photo) => (
              <View key={photo.id} style={{ flexBasis: '47%', flexGrow: 1, maxWidth: '100%', gap: 6 }}>
                <PhotoTile photo={photo} selected={selected?.id === photo.id} onPress={() => openPhoto(photo)} />
                {photo.visibility === 'community' ? <T variant="label">Shared</T> : null}
                {photo.note ? <T variant="muted">{photo.note}</T> : null}
              </View>
            ))}
          </View>
        </View>
      ))}
      {selected ? (
        <Card>
          <T variant="label">This photo</T>
          <T>{progressPhotoLabel(selected.monthIndex, selected.takenOn)}</T>
          <DateField
            label="Taken on"
            value={parseIsoDay(selected.takenOn)}
            onChange={(date) => void saveDetails(selected.id, { takenOn: isoDay(date), startingPoint: selected.monthIndex === 0 }, 'date')}
            maximumDate={new Date()}
            hint="Today or an earlier day."
          />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Choice label="Starting point" selected={selected.monthIndex === 0} onPress={() => void saveDetails(selected.id, { startingPoint: true }, 'date')} />
            <Choice label="On the timeline" selected={selected.monthIndex !== 0} onPress={() => void saveDetails(selected.id, { takenOn: selected.takenOn, startingPoint: false }, 'date')} />
          </View>
          <Field
            label="Note"
            value={noteDraft}
            onChangeText={(value) => setNoteDraft(value.slice(0, PROGRESS_NOTE_LIMIT))}
            onBlur={() => {
              if (noteDraft.trim().replace(/\s+/g, ' ') !== selected.note) void saveDetails(selected.id, { note: noteDraft }, 'note');
            }}
            placeholder="Optional, a few words"
            hint="Shown with the photo. If you share it, other people see this note and nothing else."
          />
          <Button
            label="Save note"
            tone="quiet"
            pending={pending === 'note'}
            disabled={pending != null || noteDraft.trim().replace(/\s+/g, ' ') === selected.note}
            onPress={() => void saveDetails(selected.id, { note: noteDraft }, 'note')}
          />
          {shareIds?.length === 1 && shareIds[0] === selected.id ? (
            <View style={{ gap: 8 }}>
              <T>{PROGRESS_SHARE_WARNING}</T>
              <Button label="Share this photo" pending={pending === 'share'} onPress={() => void applyVisibility([selected.id], 'community')} />
              <Button label="Keep it private" tone="quiet" disabled={pending != null} onPress={() => setShareIds(null)} />
            </View>
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <Choice label="Only me" selected={selected.visibility !== 'community'} onPress={() => { if (selected.visibility === 'community') void applyVisibility([selected.id], 'private'); }} />
              <Choice label="Share with community" selected={selected.visibility === 'community'} onPress={() => { if (selected.visibility !== 'community') setShareIds([selected.id]); }} />
            </View>
          )}
          {confirmId === selected.id ? (
            <View style={{ gap: 8 }}>
              <Button label="Delete this photo" tone="sos" pending={pending === 'delete'} onPress={() => void remove(selected.id)} />
              <Button label="Keep it" tone="quiet" disabled={pending != null} onPress={() => setConfirmId(null)} />
            </View>
          ) : (
            <Button label="Delete" tone="quiet" disabled={pending != null} onPress={() => setConfirmId(selected.id)} />
          )}
        </Card>
      ) : null}
      {photos.length >= 2 && before && now ? (
        <Card>
          <T variant="label">Before and now</T>
          <T>Select a photo, then choose which side it sits on.</T>
          {selected ? <T variant="muted">Selected: {progressPhotoLabel(selected.monthIndex, selected.takenOn)}</T> : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Button label="Show as Before" tone="quiet" disabled={!selected} onPress={() => selected && setBeforeId(selected.id)} />
            <Button label="Show as Now" tone="quiet" disabled={!selected} onPress={() => selected && setNowId(selected.id)} />
          </View>
          {shareIds && shareIds.length > 1 ? (
            <View style={{ gap: 8 }}>
              <T>{PROGRESS_SHARE_WARNING}</T>
              <Button label="Share this comparison" pending={pending === 'share'} onPress={() => void applyVisibility(shareIds, 'community')} />
              <Button label="Keep it private" tone="quiet" disabled={pending != null} onPress={() => setShareIds(null)} />
            </View>
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <Choice
                label="Only me"
                selected={before.visibility !== 'community' && now.visibility !== 'community'}
                onPress={() => void applyVisibility([before.id, now.id], 'private')}
              />
              <Choice
                label="Share with community"
                selected={before.visibility === 'community' && now.visibility === 'community'}
                onPress={() => setShareIds([...new Set([before.id, now.id])])}
              />
            </View>
          )}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1, gap: 6 }}>
              <T variant="label">Before</T>
              <PhotoTile photo={before} />
              <T variant="muted">{progressPhotoLabel(before.monthIndex, before.takenOn)}</T>
            </View>
            <View style={{ flex: 1, gap: 6 }}>
              <T variant="label">Now</T>
              <PhotoTile photo={now} />
              <T variant="muted">{progressPhotoLabel(now.monthIndex, now.takenOn)}</T>
            </View>
          </View>
        </Card>
      ) : null}
    </View>
  );
}

function groupPhotos(photos: ProgressPhoto[]): { label: string; photos: ProgressPhoto[] }[] {
  const order: string[] = [];
  const grouped = new Map<string, ProgressPhoto[]>();
  for (const photo of photos) {
    const label = progressPhotoLabel(photo.monthIndex, photo.takenOn);
    const list = grouped.get(label);
    if (list) list.push(photo);
    else {
      grouped.set(label, [photo]);
      order.push(label);
    }
  }
  return order.map((label) => ({ label, photos: grouped.get(label) ?? [] }));
}

function PhotoTile({ photo, selected, onPress }: { photo: ProgressPhoto; selected?: boolean; onPress?: () => void }) {
  const theme = useAppTheme();
  const label = progressPhotoLabel(photo.monthIndex, photo.takenOn);
  const frame = {
    width: '100%' as const,
    aspectRatio: 1,
    borderRadius: radius.md,
    backgroundColor: theme.colors.sunken,
    borderWidth: selected ? 2 : 0,
    borderColor: theme.colors.ink,
    overflow: 'hidden' as const,
  };
  const image = photo.previewUrl ? (
    <Image source={{ uri: photo.previewUrl }} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityLabel={label} />
  ) : (
    <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', padding: 8 }]}>
      <T variant="muted">Photo unavailable</T>
    </View>
  );
  if (!onPress) return <View style={frame}>{image}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Select ${label}`} onPress={onPress} style={frame}>
      {image}
    </Pressable>
  );
}
