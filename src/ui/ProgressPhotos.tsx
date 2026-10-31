import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useRepository, useSnapshot } from '@/data';
import type { ProgressPhoto, ProgressVisibility } from '@/data/types';
import { isoDay, parseIsoDay } from '@/domain/dates';
import { shownError } from '@/domain/errors';
import { resolveComparison, type ComparisonChoice } from '@/domain/progressComparison';
import { planProgressPhoto, PROGRESS_SHARE_WARNING, progressAnchor, progressPhotoLabel, PROGRESS_NOTE_LIMIT } from '@/domain/progressPhotos';
import { PROFILE_HIDDEN_SHARE, SHARE_HINT, sensitiveShareConfirm } from '@/domain/profileSharing';
import { PhotoSectionShare } from '@/ui/SectionShare';
import { DateField } from '@/ui/DateField';
import { OwnerPhoto } from '@/ui/OwnerPhoto';
import { pickProgressPhoto } from '@/ui/prepareProgressPhoto';
import { loadProgressComparison, saveProgressComparison } from '@/ui/progressComparisonStore';
import { DismissKeyboard, inputScrollProps, KeyboardForm } from '@/ui/keyboard';
import { radius, useAppTheme } from '@/ui/theme';
import { Button, Card, Choice, ErrorNote, Field, playSavedHaptic, T } from '@/ui/ui';

type PendingUpload = {
  bytes: Uint8Array;
  takenOn: string;
  previewUri: string;
};

type PendingKind = 'camera' | 'library' | 'save' | 'delete' | 'share' | 'note' | 'date' | null;

function tidyNote(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function ProgressPhotos() {
  const snap = useSnapshot();
  const repo = useRepository();
  const profile = snap.profile;
  const photos = [...(snap.progressPhotos ?? [])].sort((a, b) => a.monthIndex - b.monthIndex || a.takenOn.localeCompare(b.takenOn) || a.createdAt.localeCompare(b.createdAt));
  const [upload, setUpload] = useState<PendingUpload | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [choice, setChoice] = useState<ComparisonChoice | null>(null);
  const [picking, setPicking] = useState<'before' | 'now' | null>(null);
  const localPick = useRef(false);
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [shareIds, setShareIds] = useState<string[] | null>(null);
  const [pending, setPending] = useState<PendingKind>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [savedTick, setSavedTick] = useState(false);
  const userId = profile?.id ?? null;

  useEffect(() => {
    if (!userId) return;
    let live = true;
    void loadProgressComparison(userId).then((stored) => {
      if (!live || localPick.current) return;
      setChoice(stored);
    });
    return () => {
      live = false;
    };
  }, [userId]);

  useEffect(() => {
    return () => {
      if (noteTimer.current) clearTimeout(noteTimer.current);
      if (tickTimer.current) clearTimeout(tickTimer.current);
    };
  }, []);

  if (!profile) return null;
  const ownerId = profile.id;

  const selected = photos.find((photo) => photo.id === selectedId) ?? null;
  const comparison = resolveComparison(photos, choice);
  const before = photos.find((photo) => photo.id === comparison?.beforeId) ?? null;
  const now = photos.find((photo) => photo.id === comparison?.nowId) ?? null;
  const anchor = progressAnchor(profile.sobrietyStartedAt, profile.createdAt);
  const uploadPlan = upload ? planProgressPhoto({ takenOn: upload.takenOn, startingPoint: false, note: '', anchor }) : null;

  function showTick() {
    setSavedTick(true);
    setError(null);
    playSavedHaptic();
    if (tickTimer.current) clearTimeout(tickTimer.current);
    tickTimer.current = setTimeout(() => setSavedTick(false), 2500);
  }

  function markSaved(message: string) {
    setNotice(message);
    showTick();
  }

  function openPhoto(photo: ProgressPhoto) {
    if (noteTimer.current) {
      clearTimeout(noteTimer.current);
      noteTimer.current = null;
    }
    setSelectedId(photo.id);
    setNoteDraft(photo.note);
    setConfirmId(null);
    setSavedTick(false);
    setNotice(null);
  }

  function closeSheet() {
    if (noteTimer.current) {
      clearTimeout(noteTimer.current);
      noteTimer.current = null;
    }
    const current = photos.find((photo) => photo.id === selectedId);
    if (current && pending !== 'note' && tidyNote(noteDraft) !== current.note) {
      void saveDetails(current.id, { note: noteDraft }, 'note');
    }
    setSelectedId(null);
    setConfirmId(null);
    setShareIds((ids) => (ids?.length === 1 ? null : ids));
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
      if (input.note !== undefined) {
        const saved = tidyNote(input.note);
        setNoteDraft((current) => (tidyNote(current) === saved ? saved : current));
      }
      markSaved('Saved');
    } catch (err) {
      setSavedTick(false);
      setError(shownError(err, 'Could not update that photo.'));
    } finally {
      setPending(null);
    }
  }

  function queueNoteSave(id: string, draft: string, currentNote: string) {
    if (noteTimer.current) clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => {
      noteTimer.current = null;
      if (tidyNote(draft) !== currentNote) void saveDetails(id, { note: draft }, 'note');
    }, 600);
  }

  async function remove(id: string) {
    setError(null);
    setPending('delete');
    try {
      await repo.deleteProgressPhoto(id);
      if (selectedId === id) setSelectedId(null);
      const next = resolveComparison(
        photos.filter((photo) => photo.id !== id),
        choice
          ? {
              beforeId: choice.beforeId === id ? '' : choice.beforeId,
              nowId: choice.nowId === id ? '' : choice.nowId,
            }
          : null,
      );
      localPick.current = true;
      setChoice(next);
      if (next) void saveProgressComparison(ownerId, next).catch(() => undefined);
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
      if (visibility === 'community' && !snap.sharing.sensitiveConsentAt) {
        await repo.setProfileSharing({ ...snap.sharing, sensitiveConsentAt: new Date().toISOString() });
      }
      await repo.setProgressPhotoVisibility(ids, visibility);
      setShareIds(null);
      markSaved('Saved');
    } catch (err) {
      setSavedTick(false);
      setError(shownError(err, 'Could not update that photo.'));
    } finally {
      setPending(null);
    }
  }

  function assignSlot(slot: 'before' | 'now', id: string) {
    const current = resolveComparison(photos, choice);
    const next = {
      beforeId: slot === 'before' ? id : current?.beforeId ?? '',
      nowId: slot === 'now' ? id : current?.nowId ?? '',
    };
    localPick.current = true;
    setChoice(next);
    void saveProgressComparison(ownerId, next).catch(() => undefined);
  }

  function useAs(slot: 'before' | 'now', id: string) {
    assignSlot(slot, id);
    markSaved('Saved');
  }

  return (
    <View style={{ gap: 14 }}>
      <PhotoSectionShare />
      <T variant="label">Progress photos</T>
      <T>A starting point, then photos through the months. Counted from your sober date, or from the day you joined.</T>
      <T>Photos stay private unless you choose Share with community. They are not sent to Thumos. Only me puts a shared photo back to just you.</T>
      <T variant="muted">{profile.communityVisible && profile.ageConfirmed18 ? SHARE_HINT : PROFILE_HIDDEN_SHARE}</T>
      {notice ? <T>{notice}</T> : null}
      {error && !selected ? <ErrorNote>{error}</ErrorNote> : null}
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
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {photos.map((photo) => {
          const label = progressPhotoLabel(photo.monthIndex, photo.takenOn);
          return (
            <Pressable
              key={photo.id}
              accessibilityRole="button"
              accessibilityLabel={`Open ${label}`}
              accessibilityState={{ selected: selected?.id === photo.id }}
              onPress={() => openPhoto(photo)}
              collapsable={false}
              style={{ width: '30%', maxWidth: '30%', flexGrow: 0, flexShrink: 0, minHeight: 44, zIndex: 2 }}
            >
              <View style={{ gap: 4 }}>
                <PhotoFrame photo={photo} marked={selected?.id === photo.id} />
                <View pointerEvents="none">
                  <T variant="muted">{label}</T>
                  {photo.visibility === 'community' ? <T variant="label">Shared</T> : null}
                </View>
              </View>
            </Pressable>
          );
        })}
      </View>
      <PhotoDetailSheet
        photo={selected}
        noteDraft={noteDraft}
        savedTick={savedTick}
        pending={pending}
        error={error}
        confirmingDelete={confirmId != null && confirmId === selected?.id}
        confirmingShare={shareIds?.length === 1 && shareIds[0] === selected?.id}
        onClose={closeSheet}
        onNote={(value) => {
          const next = value.slice(0, PROGRESS_NOTE_LIMIT);
          setNoteDraft(next);
          if (selected) queueNoteSave(selected.id, next, selected.note);
        }}
        onNoteBlur={() => {
          if (!selected) return;
          if (noteTimer.current) {
            clearTimeout(noteTimer.current);
            noteTimer.current = null;
          }
          if (tidyNote(noteDraft) !== selected.note) void saveDetails(selected.id, { note: noteDraft }, 'note');
        }}
        onDate={(date) => {
          if (!selected) return;
          void saveDetails(selected.id, { takenOn: isoDay(date), startingPoint: selected.monthIndex === 0 }, 'date');
        }}
        onStartingPoint={(startingPoint) => {
          if (!selected) return;
          void saveDetails(selected.id, { takenOn: selected.takenOn, startingPoint }, 'date');
        }}
        onOnlyMe={() => {
          if (selected?.visibility === 'community') void applyVisibility([selected.id], 'private');
        }}
        onAskShare={() => {
          if (selected && selected.visibility !== 'community') setShareIds([selected.id]);
        }}
        onConfirmShare={() => {
          if (selected) void applyVisibility([selected.id], 'community');
        }}
        firstSensitiveShare={!snap.sharing.sensitiveConsentAt}
        onCancelShare={() => setShareIds(null)}
        onUseAs={(slot) => {
          if (selected) useAs(slot, selected.id);
        }}
        onAskDelete={() => {
          if (selected) setConfirmId(selected.id);
        }}
        onCancelDelete={() => setConfirmId(null)}
        onDelete={() => {
          if (selected) void remove(selected.id);
        }}
      />
      {photos.length >= 2 && before && now ? (
        <Card>
          <T variant="label">Before and now</T>
          <T>Tap Before or Now, then choose a photo.</T>
          <View style={{ gap: 10, alignSelf: 'stretch', zIndex: 2 }}>
            <ComparisonSlot title="Before" photo={before} open={picking === 'before'} onPress={() => setPicking((current) => current === 'before' ? null : 'before')} />
            <ComparisonSlot title="Now" photo={now} open={picking === 'now'} onPress={() => setPicking((current) => current === 'now' ? null : 'now')} />
          </View>
          {picking ? (
            <PhotoStrip
              photos={photos}
              chosenId={picking === 'before' ? before.id : now.id}
              slot={picking}
              onChoose={(id) => assignSlot(picking, id)}
            />
          ) : null}
          {shareIds && shareIds.length > 1 ? (
            <View style={{ gap: 8 }}>
              {snap.sharing.sensitiveConsentAt ? null : <T>{sensitiveShareConfirm('This comparison')}</T>}
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
        </Card>
      ) : null}
    </View>
  );
}

function PhotoDetailSheet({
  photo,
  noteDraft,
  savedTick,
  pending,
  error,
  confirmingDelete,
  confirmingShare,
  firstSensitiveShare = false,
  onClose,
  onNote,
  onNoteBlur,
  onDate,
  onStartingPoint,
  onOnlyMe,
  onAskShare,
  onConfirmShare,
  onCancelShare,
  onUseAs,
  onAskDelete,
  onCancelDelete,
  onDelete,
}: {
  photo: ProgressPhoto | null;
  noteDraft: string;
  savedTick: boolean;
  pending: PendingKind;
  error: string | null;
  confirmingDelete: boolean;
  confirmingShare: boolean;
  firstSensitiveShare?: boolean;
  onClose: () => void;
  onNote: (value: string) => void;
  onNoteBlur: () => void;
  onDate: (date: Date) => void;
  onStartingPoint: (startingPoint: boolean) => void;
  onOnlyMe: () => void;
  onAskShare: () => void;
  onConfirmShare: () => void;
  onCancelShare: () => void;
  onUseAs: (slot: 'before' | 'now') => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
}) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const label = photo ? progressPhotoLabel(photo.monthIndex, photo.takenOn) : '';
  const detailsMaxHeight = Math.max(320, Math.round(height * 0.92) - 96 - insets.bottom);
  return (
    <Modal visible={photo != null} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close photo" style={{ flex: 1 }} onPress={onClose} />
        {photo ? (
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View
              style={{
                backgroundColor: theme.colors.bg,
                borderTopLeftRadius: 16,
                borderTopRightRadius: 16,
                paddingHorizontal: 20,
                paddingTop: 16,
                paddingBottom: 16 + insets.bottom,
                gap: 12,
                maxHeight: '92%',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <DismissKeyboard style={{ flex: 1, gap: 2 }}>
                  <T variant="title">{label}</T>
                  {savedTick ? <T>Saved ✓</T> : null}
                </DismissKeyboard>
                <Button label="Close" tone="quiet" onPress={onClose} />
              </View>
              <ScrollView {...inputScrollProps} nestedScrollEnabled style={{ flexGrow: 0, height: detailsMaxHeight }}>
                <KeyboardForm>
                <View style={{ gap: 12, paddingBottom: 8 }}>
                <View pointerEvents="box-none" style={{ height: 280, borderRadius: radius.md, overflow: 'hidden', backgroundColor: theme.colors.sunken }}>
                  <ScrollView
                    style={{ height: 280, width: '100%' }}
                    contentContainerStyle={{ width: '100%', height: 280 }}
                    maximumZoomScale={4}
                    minimumZoomScale={1}
                    bouncesZoom
                    centerContent
                    pinchGestureEnabled
                    showsHorizontalScrollIndicator={false}
                    showsVerticalScrollIndicator={false}
                  >
                    <OwnerPhoto
                      pointerEvents="none"
                      uri={photo.previewUrl}
                      photoId={photo.id}
                      signWhenMissing
                      style={{ width: '100%', height: 280 }}
                      contentFit="contain"
                    />
                  </ScrollView>
                </View>
                <T variant="muted">Pinch to zoom.</T>
                {error ? <ErrorNote>{error}</ErrorNote> : null}
                <DateField
                  label="Taken on"
                  value={parseIsoDay(photo.takenOn)}
                  onChange={onDate}
                  maximumDate={new Date()}
                  hint="Today or an earlier day."
                />
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  <Choice label="Starting point" selected={photo.monthIndex === 0} onPress={() => onStartingPoint(true)} />
                  <Choice label="On the timeline" selected={photo.monthIndex !== 0} onPress={() => onStartingPoint(false)} />
                </View>
                <Field
                  label="Note"
                  value={noteDraft}
                  onChangeText={onNote}
                  onBlur={onNoteBlur}
                  multiline
                  placeholder="Optional, a few words"
                  hint="Shown with the photo. If you share it, other people see this note and nothing else."
                />
                {confirmingShare ? (
                  <View style={{ gap: 8 }}>
                    {firstSensitiveShare ? <T>{sensitiveShareConfirm('This progress photo')}</T> : null}
                    <T>{PROGRESS_SHARE_WARNING}</T>
                    <T variant="muted">{SHARE_HINT}</T>
                    <Button label="Share this photo" pending={pending === 'share'} onPress={onConfirmShare} />
                    <Button label="Keep it private" tone="quiet" disabled={pending != null} onPress={onCancelShare} />
                  </View>
                ) : (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    <Choice label="Only me" selected={photo.visibility !== 'community'} onPress={onOnlyMe} />
                    <Choice label="Share with community" selected={photo.visibility === 'community'} onPress={onAskShare} />
                  </View>
                )}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  <Button label="Use as Before" tone="quiet" disabled={pending != null} onPress={() => onUseAs('before')} />
                  <Button label="Use as Now" tone="quiet" disabled={pending != null} onPress={() => onUseAs('now')} />
                </View>
                {confirmingDelete ? (
                  <View style={{ gap: 8 }}>
                    <Button label="Delete this photo" tone="sos" pending={pending === 'delete'} onPress={onDelete} />
                    <Button label="Keep it" tone="quiet" disabled={pending != null} onPress={onCancelDelete} />
                  </View>
                ) : (
                  <Button label="Delete" tone="quiet" disabled={pending != null} onPress={onAskDelete} />
                )}
                </View>
                </KeyboardForm>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        ) : null}
      </View>
    </Modal>
  );
}

function ComparisonSlot({
  title,
  photo,
  open,
  onPress,
}: {
  title: string;
  photo: ProgressPhoto;
  open: boolean;
  onPress: () => void;
}) {
  const label = progressPhotoLabel(photo.monthIndex, photo.takenOn);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${label}`}
      accessibilityState={{ expanded: open }}
      onPress={onPress}
      collapsable={false}
      style={{ alignSelf: 'stretch', gap: 6, minHeight: 44, zIndex: 2 }}
    >
      <View style={{ gap: 6 }}>
        <View pointerEvents="none">
          <T variant="label">{title}</T>
        </View>
        <PhotoFrame photo={photo} marked={open} />
        <View pointerEvents="none">
          <T variant="muted">{label}</T>
        </View>
      </View>
    </Pressable>
  );
}

function PhotoStrip({
  photos,
  chosenId,
  slot,
  onChoose,
}: {
  photos: ProgressPhoto[];
  chosenId: string;
  slot: 'before' | 'now';
  onChoose: (id: string) => void;
}) {
  const side = slot === 'before' ? 'Before' : 'Now';
  return (
    <View style={{ gap: 8, zIndex: 3 }}>
      <T variant="muted">Choose the {side} photo</T>
      <ScrollView
        horizontal
        nestedScrollEnabled
        directionalLockEnabled
        keyboardShouldPersistTaps="handled"
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 10, paddingVertical: 4 }}
      >
        {photos.map((photo) => {
          const label = progressPhotoLabel(photo.monthIndex, photo.takenOn);
          const chosen = photo.id === chosenId;
          return (
            <Pressable
              key={photo.id}
              accessibilityRole="button"
              accessibilityLabel={`Use ${label} as ${side}`}
              accessibilityState={{ selected: chosen }}
              onPress={() => onChoose(photo.id)}
              collapsable={false}
              style={{ width: 104, minHeight: 44, zIndex: 2 }}
            >
              <View style={{ gap: 6 }}>
                <PhotoFrame photo={photo} marked={chosen} checked={chosen} />
                <View pointerEvents="none">
                  <T variant="muted">{label}</T>
                </View>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function PhotoFrame({ photo, marked, checked }: { photo: ProgressPhoto; marked?: boolean; checked?: boolean }) {
  const theme = useAppTheme();
  return (
    <View
      pointerEvents="box-none"
      style={{
        width: '100%',
        aspectRatio: 1,
        borderRadius: radius.md,
        backgroundColor: theme.colors.sunken,
        borderWidth: marked ? 2 : 1,
        borderColor: marked ? theme.colors.ink : theme.colors.line,
        overflow: 'hidden',
      }}
    >
      <OwnerPhoto
        pointerEvents="none"
        uri={photo.previewUrl}
        photoId={photo.id}
        signWhenMissing
        style={StyleSheet.absoluteFill}
        contentFit="cover"
      />
      {checked ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 6,
            right: 6,
            width: 22,
            height: 22,
            borderRadius: 11,
            backgroundColor: theme.colors.ink,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: theme.colors.bg, fontSize: 14, lineHeight: 16 }}>✓</Text>
        </View>
      ) : null}
    </View>
  );
}
