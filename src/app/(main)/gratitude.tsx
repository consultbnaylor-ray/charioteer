import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useRepository, useSnapshot } from '@/data';
import { formatUkLong, isoDay, parseIsoDay, startOfLocalDay } from '@/domain/dates';
import { shownError } from '@/domain/errors';
import {
  filterGratitude,
  gratitudeCountLabel,
  GRATITUDE_CATEGORIES,
  groupGratitudeByDay,
  planGratitudeEntry,
  resurfaceGratitude,
  sameGratitudeBody,
  type GratitudeCategory,
  type GratitudeEntry,
  type GratitudePhoto,
} from '@/domain/gratitude';
import { gratitudePhotoLimitMessage } from '@/domain/gratitudePhotos';
import { DateField } from '@/ui/DateField';
import { pickProgressPhoto } from '@/ui/prepareProgressPhoto';
import { Button, Card, Choice, EditSheet, ErrorNote, Field, playSavedHaptic, Screen, T } from '@/ui/ui';
import { radius, useAppTheme } from '@/ui/theme';

const EXAMPLE = 'My daughter laughing at breakfast';

type ReflectState = {
  entryId: string;
  comment: string;
  suggestions: { text: string; added: boolean }[];
};

type PendingPhoto = { entryId: string; bytes: Uint8Array; previewUri: string };

export default function GratitudeDiary() {
  const repo = useRepository();
  const snap = useSnapshot();
  const router = useRouter();
  const theme = useAppTheme();
  const entries = snap.gratitude ?? [];
  const today = isoDay(new Date());
  const [view, setView] = useState<'all' | 'favourites'>('all');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<GratitudeCategory | null>(null);
  const [body, setBody] = useState('');
  const [draftCategory, setDraftCategory] = useState<GratitudeCategory | null>(null);
  const [favourite, setFavourite] = useState(false);
  const [date, setDate] = useState(() => startOfLocalDay(new Date()));
  const [editing, setEditing] = useState<GratitudeEntry | null>(null);
  const [editBody, setEditBody] = useState('');
  const [editCategory, setEditCategory] = useState<GratitudeCategory | null>(null);
  const [editFavourite, setEditFavourite] = useState(false);
  const [editDate, setEditDate] = useState(() => startOfLocalDay(new Date()));
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [reflect, setReflect] = useState<ReflectState | null>(null);
  const [reflectNote, setReflectNote] = useState<string | null>(null);
  const [reflectingId, setReflectingId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [upload, setUpload] = useState<PendingPhoto | null>(null);
  const [photoPending, setPhotoPending] = useState<null | 'camera' | 'library' | 'save' | 'remove'>(null);
  const [photoNotice, setPhotoNotice] = useState<string | null>(null);
  const [viewing, setViewing] = useState<GratitudePhoto | null>(null);
  const [removePhotoId, setRemovePhotoId] = useState<string | null>(null);

  const filtered = filterGratitude(entries, { query, category, favouritesOnly: view === 'favourites' });
  const groups = groupGratitudeByDay(filtered);
  const resurfaced = view === 'all' && !query.trim() && !category ? resurfaceGratitude(entries, today) : null;
  const editingLive = editing ? entries.find((item) => item.id === editing.id) ?? editing : null;
  const editingPhotos = editingLive?.photos ?? [];
  const editingUpload = upload && editing?.id === upload.entryId ? upload : null;

  async function addEntry() {
    const plan = planGratitudeEntry(body, isoDay(date), today);
    if (!plan.ok) {
      setError(plan.message);
      return;
    }
    setPending(true);
    setError(null);
    try {
      await repo.addGratitudeEntry({
        body: plan.body,
        entryDate: plan.entryDate,
        category: draftCategory,
        isFavourite: favourite,
      });
      setBody('');
      setFavourite(false);
      setDraftCategory(null);
      setDate(startOfLocalDay(new Date()));
    } catch (err) {
      setError(shownError(err, 'Could not save that line.'));
    } finally {
      setPending(false);
    }
  }

  function openEdit(entry: GratitudeEntry) {
    setEditing(entry);
    setEditBody(entry.body);
    setEditCategory(entry.category);
    setEditFavourite(entry.isFavourite);
    setEditDate(parseIsoDay(entry.entryDate));
    setRemovePhotoId(null);
    setMenuId(null);
    setError(null);
  }

  async function saveEdit() {
    if (!editing) return;
    const plan = planGratitudeEntry(editBody, isoDay(editDate), today);
    if (!plan.ok) {
      setError(plan.message);
      return;
    }
    setPending(true);
    setError(null);
    try {
      await repo.updateGratitudeEntry(editing.id, {
        body: plan.body,
        entryDate: plan.entryDate,
        category: editCategory,
        isFavourite: editFavourite,
      });
      setEditing(null);
    } catch (err) {
      setError(shownError(err, 'Could not save that line.'));
    } finally {
      setPending(false);
    }
  }

  async function toggleStar(entry: GratitudeEntry) {
    setError(null);
    try {
      await repo.updateGratitudeEntry(entry.id, {
        body: entry.body,
        entryDate: entry.entryDate,
        category: entry.category,
        isFavourite: !entry.isFavourite,
      });
    } catch (err) {
      setError(shownError(err, 'Could not update that line.'));
    }
  }

  async function remove(id: string) {
    setError(null);
    setPending(true);
    try {
      await repo.deleteGratitudeEntry(id);
      setConfirmId(null);
      setMenuId(null);
      if (editing?.id === id) setEditing(null);
      if (upload?.entryId === id) setUpload(null);
    } catch (err) {
      setError(shownError(err, 'Could not delete that line.'));
    } finally {
      setPending(false);
    }
  }

  async function reflectOn(entry: GratitudeEntry) {
    setError(null);
    setReflectNote(null);
    if (!snap.profile?.consentAi) {
      setReflectNote('Turn on the coach under Privacy & consent. A reflection sends only this line.');
      return;
    }
    setReflectingId(entry.id);
    try {
      const result = await repo.reflectOnGratitude(entry.body, entry.category);
      setReflect({
        entryId: entry.id,
        comment: result.comment,
        suggestions: result.suggestions.map((text) => ({
          text,
          added: entries.some((item) => sameGratitudeBody(item.body, text)),
        })),
      });
    } catch (err) {
      setError(shownError(err, 'Could not reflect just now.'));
    } finally {
      setReflectingId(null);
    }
  }

  async function takeSuggestion(entry: GratitudeEntry, text: string) {
    if (!reflect) return;
    if (entries.some((item) => sameGratitudeBody(item.body, text))) {
      setReflect({
        ...reflect,
        suggestions: reflect.suggestions.map((item) => item.text === text ? { ...item, added: true } : item),
      });
      return;
    }
    setError(null);
    try {
      await repo.addGratitudeEntry({
        body: text,
        entryDate: today,
        category: entry.category,
        isFavourite: false,
      });
      setReflect({
        ...reflect,
        suggestions: reflect.suggestions.map((item) => item.text === text ? { ...item, added: true } : item),
      });
    } catch (err) {
      setError(shownError(err, 'Could not add that line.'));
    }
  }

  async function choosePhoto(source: 'camera' | 'library') {
    if (!editing) return;
    const room = gratitudePhotoLimitMessage(editingPhotos.length);
    if (room || editingUpload) {
      setError(room ?? 'That photo is still saving.');
      return;
    }
    setPhotoPending(source);
    setError(null);
    setPhotoNotice(null);
    try {
      const picked = await pickProgressPhoto(source);
      if (!picked) return;
      await storePhoto(editing.id, { entryId: editing.id, bytes: picked.bytes, previewUri: picked.previewUri });
    } catch (err) {
      setError(shownError(err, 'Could not add that photo.'));
    } finally {
      setPhotoPending((current) => (current === source ? null : current));
    }
  }

  async function storePhoto(entryId: string, next: PendingPhoto) {
    setUpload(next);
    setError(null);
    setPhotoPending('save');
    setPhotoNotice(null);
    try {
      await repo.addGratitudePhoto(entryId, next.bytes);
      setUpload(null);
      setPhotoNotice('Photo saved');
      playSavedHaptic();
    } catch (err) {
      setError(shownError(err, 'Could not save that photo.'));
    } finally {
      setPhotoPending((current) => (current === 'save' ? null : current));
    }
  }

  async function removePhoto(id: string) {
    setError(null);
    setPhotoPending('remove');
    try {
      await repo.deleteGratitudePhoto(id);
      setRemovePhotoId(null);
      if (viewing?.id === id) setViewing(null);
    } catch (err) {
      setError(shownError(err, 'Could not remove that photo.'));
    } finally {
      setPhotoPending((current) => (current === 'remove' ? null : current));
    }
  }

  const photoLimit = gratitudePhotoLimitMessage(editingPhotos.length);

  return (
    <Screen
      eyebrow="Private"
      title="Gratitude Diary"
      intro="A list you can come back to. This diary is private. It is not shown to the community. Photos on a line stay private too, and are not sent to Thumos. Thumos sees a few lines of text only if you have allowed the coach."
    >
      <T>{gratitudeCountLabel(entries.length)}</T>
      {photoNotice ? <T>{photoNotice}</T> : null}
      <Card>
        <Field label="A line to keep" value={body} onChangeText={setBody} multiline placeholder={EXAMPLE} maxLength={1000} />
        <DateField label="Date" value={date} onChange={setDate} maximumDate={new Date()} />
        <T variant="label">Tag, if you want</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Choice label="No tag" selected={draftCategory == null} onPress={() => setDraftCategory(null)} />
          {GRATITUDE_CATEGORIES.map((item) => (
            <Choice key={item} label={item} selected={draftCategory === item} onPress={() => setDraftCategory(item)} />
          ))}
        </View>
        <Choice label="Favourite" selected={favourite} onPress={() => setFavourite((value) => !value)} />
        <Button label="Add to the diary" pending={pending && !editing} onPress={() => void addEntry()} />
      </Card>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Choice label="All" selected={view === 'all'} onPress={() => setView('all')} />
        <Choice label="Favourites" selected={view === 'favourites'} onPress={() => setView('favourites')} />
      </View>
      <Field label="Search" value={query} onChangeText={setQuery} placeholder="Search your lines" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Choice label="Any tag" selected={category == null} onPress={() => setCategory(null)} />
        {GRATITUDE_CATEGORIES.map((item) => (
          <Choice key={item} label={item} selected={category === item} onPress={() => setCategory(item)} />
        ))}
      </View>
      <ErrorNote>{error}</ErrorNote>
      {reflectNote ? (
        <Card>
          <T>{reflectNote}</T>
          <Button label="Privacy & consent" tone="quiet" onPress={() => router.push('/privacy' as never)} />
        </Card>
      ) : null}
      {entries.length === 0 ? (
        <Card>
          <T variant="muted">{EXAMPLE}</T>
          <T variant="muted">An example, greyed out. Yours can be smaller than that.</T>
        </Card>
      ) : null}
      {resurfaced ? (
        <Card>
          <T variant="label">{resurfaced.kind === 'on-this-day' ? 'On this day' : 'A while ago'}</T>
          <T variant="muted">{formatUkLong(resurfaced.entry.entryDate)}</T>
          <T>{resurfaced.entry.body}</T>
        </Card>
      ) : null}
      {entries.length > 0 && groups.length === 0 ? <T variant="muted">Nothing matches.</T> : null}
      {groups.map((group) => (
        <View key={group.entryDate} style={{ gap: 8 }}>
          <T variant="label">{formatUkLong(group.entryDate)}</T>
          {group.entries.map((entry) => {
            const cardUpload = upload && upload.entryId === entry.id && editing?.id !== entry.id ? upload : null;
            return (
              <Card key={entry.id}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                  <T style={{ flex: 1 }}>{entry.body}</T>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={entry.isFavourite ? 'Remove favourite' : 'Mark as favourite'}
                    onPress={() => void toggleStar(entry)}
                    style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <T style={{ color: entry.isFavourite ? theme.colors.ink : theme.colors.muted }}>{entry.isFavourite ? '★' : '☆'}</T>
                  </Pressable>
                </View>
                {entry.category ? <T variant="muted">{entry.category}</T> : null}
                {entry.photos.length || cardUpload ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {entry.photos.map((photo) => (
                      <Pressable
                        key={photo.id}
                        accessibilityRole="button"
                        accessibilityLabel="View photo"
                        onPress={() => setViewing(photo)}
                        style={{ width: 72, height: 72, borderRadius: radius.md, overflow: 'hidden', backgroundColor: theme.colors.sunken }}
                      >
                        {photo.previewUrl ? (
                          <Image pointerEvents="none" source={{ uri: photo.previewUrl }} style={{ width: 72, height: 72 }} contentFit="cover" />
                        ) : (
                          <View pointerEvents="none" style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                            <T variant="muted">Photo</T>
                          </View>
                        )}
                      </Pressable>
                    ))}
                    {cardUpload ? (
                      <SavingThumb
                        previewUri={cardUpload.previewUri}
                        saving={photoPending === 'save'}
                        onRetry={() => void storePhoto(entry.id, cardUpload)}
                      />
                    ) : null}
                  </View>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="More actions"
                  onPress={() => setMenuId((current) => (current === entry.id ? null : entry.id))}
                  style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
                >
                  <T>…</T>
                </Pressable>
                {menuId === entry.id ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    <Pressable accessibilityRole="button" accessibilityLabel="Edit" onPress={() => openEdit(entry)} style={menuHit}>
                      <T>Edit</T>
                    </Pressable>
                    <Pressable accessibilityRole="button" accessibilityLabel="Delete" onPress={() => setConfirmId(entry.id)} style={menuHit}>
                      <T>Delete</T>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Reflect with Thumos"
                      disabled={reflectingId === entry.id}
                      onPress={() => void reflectOn(entry)}
                      style={menuHit}
                    >
                      {reflectingId === entry.id ? <ActivityIndicator color={theme.colors.ink} /> : <T>Reflect with Thumos</T>}
                    </Pressable>
                  </View>
                ) : null}
                {confirmId === entry.id ? (
                  <View style={{ gap: 8 }}>
                    <T>Delete this line?</T>
                    <Button label="Delete this line" tone="quiet" pending={pending} onPress={() => void remove(entry.id)} />
                    <Button label="Keep it" tone="quiet" onPress={() => setConfirmId(null)} />
                  </View>
                ) : null}
                {reflect?.entryId === entry.id ? (
                  <View style={{ gap: 8 }}>
                    <T>{reflect.comment}</T>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {reflect.suggestions.map((suggestion) => (
                        <Choice
                          key={suggestion.text}
                          label={suggestion.added ? `Added: ${suggestion.text}` : suggestion.text}
                          selected={suggestion.added}
                          onPress={() => {
                            if (!suggestion.added) void takeSuggestion(entry, suggestion.text);
                          }}
                        />
                      ))}
                    </View>
                  </View>
                ) : null}
              </Card>
            );
          })}
        </View>
      ))}
      <EditSheet
        visible={editing != null}
        title="Edit this line"
        saveLabel="Save"
        pending={pending}
        onClose={() => { if (!pending) setEditing(null); }}
        onSave={() => void saveEdit()}
      >
        <Field label="Line" value={editBody} onChangeText={setEditBody} multiline maxLength={1000} />
        <DateField label="Date" value={editDate} onChange={setEditDate} maximumDate={new Date()} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Choice label="No tag" selected={editCategory == null} onPress={() => setEditCategory(null)} />
          {GRATITUDE_CATEGORIES.map((item) => (
            <Choice key={item} label={item} selected={editCategory === item} onPress={() => setEditCategory(item)} />
          ))}
        </View>
        <Choice label="Favourite" selected={editFavourite} onPress={() => setEditFavourite((value) => !value)} />
        <T variant="label">Photos</T>
        <T variant="muted">Up to four. They stay private and are not sent to Thumos. A photo saves as soon as you pick it.</T>
        {photoNotice ? <T>{photoNotice}</T> : null}
        {photoLimit ? <T>{photoLimit}</T> : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Button
            label="Take a photo"
            tone="quiet"
            pending={photoPending === 'camera'}
            disabled={photoPending != null || photoLimit != null || editingUpload != null}
            onPress={() => void choosePhoto('camera')}
          />
          <Button
            label="Choose from library"
            tone="quiet"
            pending={photoPending === 'library'}
            disabled={photoPending != null || photoLimit != null || editingUpload != null}
            onPress={() => void choosePhoto('library')}
          />
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {editingPhotos.map((photo) => (
            <View key={photo.id} style={{ width: 96, gap: 4 }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="View photo"
                onPress={() => setViewing(photo)}
                style={{ width: 96, height: 96, borderRadius: radius.md, overflow: 'hidden', backgroundColor: theme.colors.sunken }}
              >
                {photo.previewUrl ? (
                  <Image pointerEvents="none" source={{ uri: photo.previewUrl }} style={{ width: 96, height: 96 }} contentFit="cover" />
                ) : (
                  <View pointerEvents="none" style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                    <T variant="muted">Photo</T>
                  </View>
                )}
              </Pressable>
              {removePhotoId === photo.id ? (
                <View style={{ gap: 4 }}>
                  <T>Remove this photo?</T>
                  <Button label="Remove photo" tone="quiet" pending={photoPending === 'remove'} onPress={() => void removePhoto(photo.id)} />
                  <Button label="Keep it" tone="quiet" onPress={() => setRemovePhotoId(null)} />
                </View>
              ) : (
                <Pressable accessibilityRole="button" accessibilityLabel="Remove photo" onPress={() => setRemovePhotoId(photo.id)} style={menuHit}>
                  <T>Remove</T>
                </Pressable>
              )}
            </View>
          ))}
          {editingUpload ? (
            <SavingThumb
              previewUri={editingUpload.previewUri}
              saving={photoPending === 'save'}
              onRetry={() => void storePhoto(editingLive?.id ?? editingUpload.entryId, editingUpload)}
            />
          ) : null}
        </View>
        <ErrorNote>{error}</ErrorNote>
      </EditSheet>
      <PhotoViewer photo={viewing} onClose={() => setViewing(null)} />
    </Screen>
  );
}

const menuHit = { minHeight: 44, justifyContent: 'center' as const, paddingHorizontal: 4 };

function SavingThumb({ previewUri, saving, onRetry }: { previewUri: string; saving: boolean; onRetry: () => void }) {
  return (
    <View style={{ width: 96, gap: 4 }}>
      <View style={{ width: 72, height: 72, borderRadius: radius.md, overflow: 'hidden', backgroundColor: '#171717' }}>
        <Image pointerEvents="none" source={{ uri: previewUri }} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityLabel="Photo being saved" />
        {saving ? (
          <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)' }]}>
            <ActivityIndicator color="#F3F3EE" />
          </View>
        ) : null}
      </View>
      {saving ? <T variant="muted">Saving photo…</T> : <Button label="Try again" tone="quiet" onPress={onRetry} />}
    </View>
  );
}

function PhotoViewer({ photo, onClose }: { photo: GratitudePhoto | null; onClose: () => void }) {
  const theme = useAppTheme();
  return (
    <Modal visible={photo != null} animationType="fade" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'center', padding: 16, backgroundColor: 'rgba(0,0,0,0.72)' }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close photo" onPress={onClose} style={StyleSheet.absoluteFill} />
        <View style={{ zIndex: 1, backgroundColor: theme.colors.bg, borderRadius: 16, padding: 16, gap: 12 }}>
          <ScrollView
            maximumZoomScale={4}
            minimumZoomScale={1}
            bouncesZoom
            centerContent
            pinchGestureEnabled
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
            style={{ height: 360 }}
          >
            {photo?.previewUrl ? (
              <Image pointerEvents="none" source={{ uri: photo.previewUrl }} style={{ width: '100%', height: 360 }} contentFit="contain" />
            ) : (
              <View pointerEvents="none" style={{ height: 360, alignItems: 'center', justifyContent: 'center' }}>
                <T variant="muted">Photo unavailable</T>
              </View>
            )}
          </ScrollView>
          <T variant="muted">Pinch to zoom.</T>
          <Button label="Close" tone="quiet" accessibilityLabel="Close photo" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}
