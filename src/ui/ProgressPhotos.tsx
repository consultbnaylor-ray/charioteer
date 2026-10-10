import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useRepository, useSnapshot } from '@/data';
import type { ProgressPhoto, ProgressVisibility } from '@/data/types';
import { isoDay, startOfLocalDay } from '@/domain/dates';
import { shownError } from '@/domain/errors';
import { planProgressPhoto, PROGRESS_SHARE_WARNING, progressAnchor, progressPhotoLabel, PROGRESS_NOTE_LIMIT } from '@/domain/progressPhotos';
import { DateField } from '@/ui/DateField';
import { pickProgressPhoto } from '@/ui/prepareProgressPhoto';
import { radius, useAppTheme } from '@/ui/theme';
import { Button, Card, Choice, ErrorNote, Field, T } from '@/ui/ui';

export function ProgressPhotos() {
  const snap = useSnapshot();
  const repo = useRepository();
  const profile = snap.profile;
  const photos = [...(snap.progressPhotos ?? [])].sort((a, b) => a.monthIndex - b.monthIndex || a.takenOn.localeCompare(b.takenOn) || a.createdAt.localeCompare(b.createdAt));
  const [draft, setDraft] = useState<Uint8Array | null>(null);
  const [takenOn, setTakenOn] = useState(() => startOfLocalDay(new Date()));
  const [startingPoint, setStartingPoint] = useState(false);
  const [note, setNote] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [beforeId, setBeforeId] = useState<string | null>(null);
  const [nowId, setNowId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [shareIds, setShareIds] = useState<string[] | null>(null);
  const [pending, setPending] = useState<'camera' | 'library' | 'save' | 'delete' | 'share' | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!profile) return null;

  const selected = photos.find((photo) => photo.id === selectedId) ?? photos[photos.length - 1] ?? null;
  const before = photos.find((photo) => photo.id === beforeId) ?? photos[0] ?? null;
  const now = photos.find((photo) => photo.id === nowId) ?? photos[photos.length - 1] ?? null;
  const anchor = progressAnchor(profile.sobrietyStartedAt, profile.createdAt);
  const plan = draft
    ? planProgressPhoto({ takenOn: isoDay(takenOn), startingPoint, note, anchor })
    : null;
  const groups = groupPhotos(photos);

  async function choose(source: 'camera' | 'library') {
    setError(null);
    setPending(source);
    try {
      const picked = await pickProgressPhoto(source);
      if (!picked) return;
      setDraft(picked.bytes);
      setTakenOn(startOfLocalDay(new Date()));
      setNote('');
      setStartingPoint(!photos.some((photo) => photo.monthIndex === 0));
    } catch (err) {
      setError(shownError(err, 'Could not add that photo.'));
    } finally {
      setPending(null);
    }
  }

  async function save() {
    if (!draft) return;
    setError(null);
    setPending('save');
    try {
      await repo.addProgressPhoto({ bytes: draft, takenOn: isoDay(takenOn), startingPoint, note });
      setDraft(null);
      setNote('');
    } catch (err) {
      setError(shownError(err, 'Could not save that photo.'));
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
      {error ? <ErrorNote>{error}</ErrorNote> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Button label="Take a photo" pending={pending === 'camera'} disabled={pending != null && pending !== 'camera'} onPress={() => void choose('camera')} />
        <Button label="Choose from library" tone="quiet" pending={pending === 'library'} disabled={pending != null && pending !== 'library'} onPress={() => void choose('library')} />
      </View>
      {draft && plan ? (
        <Card>
          <T variant="label">Add this photo</T>
          <DateField label="Taken on" value={takenOn} onChange={setTakenOn} maximumDate={new Date()} hint="Today or an earlier day." />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Choice label="Starting point" selected={startingPoint} onPress={() => setStartingPoint(true)} />
            <Choice label="On the timeline" selected={!startingPoint} onPress={() => setStartingPoint(false)} />
          </View>
          <T>{plan.ok ? plan.label : plan.message}</T>
          <Field
            label="Note"
            value={note}
            onChangeText={(value) => setNote(value.slice(0, PROGRESS_NOTE_LIMIT))}
            placeholder="Optional, a few words"
            hint="Optional. Only you can see it."
          />
          <Button label="Save this photo" pending={pending === 'save'} disabled={!plan.ok} onPress={() => void save()} />
          <Button label="Cancel" tone="quiet" disabled={pending != null} onPress={() => setDraft(null)} />
        </Card>
      ) : null}
      {photos.length === 0 ? <T variant="muted">No photos yet.</T> : null}
      {groups.map((group) => (
        <View key={group.label} style={{ gap: 8 }}>
          <T variant="label">{group.label}</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {group.photos.map((photo) => (
              <View key={photo.id} style={{ flexBasis: '47%', flexGrow: 1, maxWidth: '100%', gap: 6 }}>
                <PhotoTile
                  photo={photo}
                  selected={selected?.id === photo.id}
                  onPress={() => {
                    setSelectedId(photo.id);
                    setConfirmId(null);
                  }}
                />
                {photo.visibility === 'community' ? <T variant="label">Shared</T> : null}
                {photo.note ? <T variant="muted">{photo.note}</T> : null}
                {shareIds?.length === 1 && shareIds[0] === photo.id ? (
                  <View style={{ gap: 8 }}>
                    <T>{PROGRESS_SHARE_WARNING}</T>
                    <Button label="Share this photo" pending={pending === 'share'} onPress={() => void applyVisibility([photo.id], 'community')} />
                    <Button label="Keep it private" tone="quiet" disabled={pending != null} onPress={() => setShareIds(null)} />
                  </View>
                ) : (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    <Choice label="Only me" selected={photo.visibility !== 'community'} onPress={() => { if (photo.visibility === 'community') void applyVisibility([photo.id], 'private'); }} />
                    <Choice label="Share with community" selected={photo.visibility === 'community'} onPress={() => { if (photo.visibility !== 'community') setShareIds([photo.id]); }} />
                  </View>
                )}
                {confirmId === photo.id ? (
                  <View style={{ gap: 8 }}>
                    <Button label="Delete this photo" tone="sos" pending={pending === 'delete'} onPress={() => void remove(photo.id)} />
                    <Button label="Keep it" tone="quiet" disabled={pending != null} onPress={() => setConfirmId(null)} />
                  </View>
                ) : (
                  <Button label="Delete" tone="quiet" disabled={pending != null} onPress={() => setConfirmId(photo.id)} />
                )}
              </View>
            ))}
          </View>
        </View>
      ))}
      {photos.length >= 2 && before && now ? (
        <Card>
          <T variant="label">Before and now</T>
          <T>Select a photo, then choose which side it sits on.</T>
          {selected ? <T variant="muted">Selected: {progressPhotoLabel(selected.monthIndex, selected.takenOn)}</T> : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Button
              label="Show as Before"
              tone="quiet"
              disabled={!selected}
              onPress={() => selected && setBeforeId(selected.id)}
            />
            <Button
              label="Show as Now"
              tone="quiet"
              disabled={!selected}
              onPress={() => selected && setNowId(selected.id)}
            />
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
