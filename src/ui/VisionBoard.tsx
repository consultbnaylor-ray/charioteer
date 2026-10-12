import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useRepository, useSnapshot } from '@/data';
import { shownError } from '@/domain/errors';
import {
  packVisionRows,
  planVisionText,
  sortVisionItems,
  visionAreaLabel,
  visionDateLine,
  visionPhotoLimitMessage,
  VISION_AREAS,
  VISION_CAPTION_LIMIT,
  VISION_EMPTY_EXAMPLES,
  VISION_EMPTY_STATEMENT,
  VISION_SIZES,
  VISION_STATEMENT_LIMIT,
  type VisionArea,
  type VisionItem,
  type VisionSize,
} from '@/domain/visionBoard';
import { toggleShareId } from '@/domain/profileSharing';
import { pickProgressPhoto } from '@/ui/prepareProgressPhoto';
import { ShareOnProfile } from '@/ui/ShareOnProfile';
import { Button, Choice, ErrorNote, Field, playSavedHaptic, Screen, T } from '@/ui/ui';
import { useAppTheme } from '@/ui/theme';

const TILE = { small: 132, medium: 188, large: 220 } as const;

function Overlay({ caption, area }: { caption: string; area: string | null }) {
  if (!caption && !area) return null;
  return (
    <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }} pointerEvents="none">
      <View style={{ height: 18, backgroundColor: 'rgba(0,0,0,0.12)' }} />
      <View style={{ height: 22, backgroundColor: 'rgba(0,0,0,0.32)' }} />
      <View style={{ backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 10, paddingBottom: 10, paddingTop: 4 }}>
        {area ? <T style={{ color: '#F3F3EE', fontSize: 11, letterSpacing: 0.4 }}>{area.toUpperCase()}</T> : null}
        {caption ? <T style={{ color: '#F3F3EE' }}>{caption}</T> : null}
      </View>
    </View>
  );
}

export function VisionBoard() {
  const repo = useRepository();
  const snap = useSnapshot();
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const width = useWindowDimensions().width;
  const profile = snap.profile;
  const items = sortVisionItems(snap.visionItems);
  const [statement, setStatement] = useState(profile?.visionStatement ?? '');
  const statementRef = useRef(statement);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photoPending, setPhotoPending] = useState<'camera' | 'library' | null>(null);
  const [photoNotice, setPhotoNotice] = useState<string | null>(null);
  const [retry, setRetry] = useState<Uint8Array | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [show, setShow] = useState(false);
  const [slide, setSlide] = useState(0);

  useEffect(() => {
    const next = profile?.visionStatement ?? '';
    setStatement(next);
    statementRef.current = next;
  }, [profile?.visionStatement]);

  const open = items.find((item) => item.id === openId) ?? null;
  useEffect(() => {
    setCaption(open?.caption ?? '');
    setConfirmDelete(false);
  }, [open?.id, open?.caption]);

  useEffect(() => {
    if (!show || items.length < 2) return undefined;
    const timer = setInterval(() => setSlide((current) => (current + 1) % items.length), 5000);
    return () => clearInterval(timer);
  }, [show, items.length]);

  async function saveStatement() {
    const plan = planVisionText(statementRef.current, VISION_STATEMENT_LIMIT);
    if (!plan.ok) {
      setError(plan.message);
      return;
    }
    if (plan.text === (profile?.visionStatement ?? '')) return;
    setError(null);
    try {
      await repo.saveVisionStatement(plan.text);
      setSaved(true);
      playSavedHaptic();
    } catch (err) {
      setError(shownError(err, 'Could not save that.'));
    }
  }

  async function storePhoto(bytes: Uint8Array) {
    setPhotoNotice(null);
    setRetry(null);
    try {
      await repo.addVisionItem(bytes);
      setPhotoNotice('Photo saved');
      playSavedHaptic();
    } catch (err) {
      setRetry(bytes);
      setError(shownError(err, 'Could not add that photo.'));
    }
  }

  async function choosePhoto(source: 'camera' | 'library') {
    const room = visionPhotoLimitMessage(items.length);
    if (room || photoPending) {
      setError(room ?? 'That photo is still saving.');
      return;
    }
    setPhotoPending(source);
    setError(null);
    setPhotoNotice(null);
    try {
      const picked = await pickProgressPhoto(source);
      if (!picked) return;
      await storePhoto(picked.bytes);
    } catch (err) {
      setError(shownError(err, 'Could not add that photo.'));
    } finally {
      setPhotoPending((current) => (current === source ? null : current));
    }
  }

  function openItem(item: VisionItem) {
    setOpenId(item.id);
    setCaption(item.caption);
    setConfirmDelete(false);
    setError(null);
  }

  async function saveCaption() {
    if (!open) return;
    const plan = planVisionText(caption, VISION_CAPTION_LIMIT);
    if (!plan.ok) {
      setError(plan.message);
      return;
    }
    if (plan.text === open.caption) return;
    try {
      await repo.updateVisionItem(open.id, { caption: plan.text });
      setSaved(true);
      playSavedHaptic();
    } catch (err) {
      setError(shownError(err, 'Could not save that caption.'));
    }
  }

  async function setArea(area: VisionArea | null) {
    if (!open || open.area === area) return;
    try {
      await repo.updateVisionItem(open.id, { area });
    } catch (err) {
      setError(shownError(err, 'Could not save that tag.'));
    }
  }

  async function setSize(size: VisionSize) {
    if (!open || open.size === size) return;
    try {
      await repo.updateVisionItem(open.id, { size });
    } catch (err) {
      setError(shownError(err, 'Could not change that size.'));
    }
  }

  async function move(direction: 'up' | 'down') {
    if (!open) return;
    try {
      await repo.moveVisionItem(open.id, direction);
    } catch (err) {
      setError(shownError(err, 'Could not move that photo.'));
    }
  }

  async function remove() {
    if (!open) return;
    try {
      await repo.deleteVisionItem(open.id);
      setOpenId(null);
    } catch (err) {
      setError(shownError(err, 'Could not remove that photo.'));
    }
  }

  const rows = packVisionRows(items);
  const gap = 8;
  const boardWidth = Math.min(width, 760) - 40;
  const openIndex = open ? items.findIndex((item) => item.id === open.id) : -1;
  const current = items[slide] ?? null;

  return (
    <Screen
      eyebrow="Vision Board"
      title="My 5-year vision"
      intro={visionDateLine(profile?.visionStartedOn ?? null)}
    >
      <Field
        label="In my own words"
        value={statement}
        onChangeText={(value) => {
          statementRef.current = value;
          setStatement(value);
          setSaved(false);
        }}
        onBlur={() => { void saveStatement(); }}
        placeholder={VISION_EMPTY_STATEMENT}
        multiline
        maxLength={VISION_STATEMENT_LIMIT}
        hint="Private. Thumos can read these words when the coach is on. The photos stay on your phone and are not sent."
      />
      {saved ? <T variant="muted">Saved ✓</T> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Button label={photoPending === 'camera' ? 'Saving photo…' : 'Take a photo'} tone="quiet" onPress={() => { void choosePhoto('camera'); }} />
        <Button label={photoPending === 'library' ? 'Saving photo…' : 'Choose from library'} tone="quiet" onPress={() => { void choosePhoto('library'); }} />
      </View>
      {photoNotice ? <T variant="muted">{photoNotice}</T> : null}
      {retry ? <Button label="Try again" tone="quiet" onPress={() => { void storePhoto(retry); }} /> : null}
      {items.length ? (
        <Button
          label="Look at my vision"
          tone="quiet"
          onPress={() => {
            setSlide(0);
            setShow(true);
          }}
        />
      ) : null}
      {items.length === 0 ? (
        <View style={{ gap: gap }}>
          <T variant="muted">Examples, until you add your own.</T>
          {VISION_EMPTY_EXAMPLES.map((example) => (
            <View
              key={example.caption}
              style={{
                minHeight: 96,
                borderRadius: 16,
                backgroundColor: theme.colors.sunken,
                justifyContent: 'flex-end',
                padding: 12,
              }}
            >
              <T style={{ color: theme.colors.placeholder }}>{example.area}</T>
              <T style={{ color: theme.colors.placeholder }}>{example.caption}</T>
            </View>
          ))}
        </View>
      ) : (
        <View style={{ gap }}>
          {rows.map((row) => (
            <View key={row.map((item) => item.id).join('-')} style={{ flexDirection: 'row', gap, alignItems: 'flex-start' }}>
              {row.map((item) => {
                const span = item.size === 'large' || row.length === 1 ? boardWidth : (boardWidth - gap) / 2;
                const index = items.findIndex((candidate) => candidate.id === item.id);
                return (
                  <View key={item.id} style={{ width: span, gap: 6 }}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${item.caption || 'Vision photo'}${item.area ? `, ${visionAreaLabel(item.area)}` : ''}`}
                      onPress={() => openItem(item)}
                      style={{ width: span, height: TILE[item.size], borderRadius: 16, overflow: 'hidden', backgroundColor: theme.colors.sunken }}
                    >
                      {item.previewUrl ? (
                        <Image source={{ uri: item.previewUrl }} style={{ width: '100%', height: '100%' }} contentFit="cover" accessibilityIgnoresInvertColors />
                      ) : null}
                      <Overlay caption={item.caption} area={visionAreaLabel(item.area)} />
                    </Pressable>
                    <ShareOnProfile
                      label={item.caption.trim() ? `Share “${item.caption.trim()}”` : `Share untitled picture ${index + 1}`}
                      item={item.caption.trim() || 'This vision caption'}
                      on={snap.sharing.visionIds.includes(item.id)}
                      apply={(sharing, selected) => toggleShareId(sharing, 'visionIds', item.id, selected)}
                    />
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      )}
      <ErrorNote>{error}</ErrorNote>
      <Modal visible={open != null} animationType="slide" transparent onRequestClose={() => setOpenId(null)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close photo" style={{ flex: 1 }} onPress={() => setOpenId(null)} />
          <View style={{ maxHeight: '88%', backgroundColor: theme.colors.bg, borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16 + insets.bottom, gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <T variant="title">This picture</T>
              <Button label="Close" tone="quiet" onPress={() => setOpenId(null)} />
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 12, paddingBottom: 72 }}>
              {open?.previewUrl ? (
                <Image source={{ uri: open.previewUrl }} style={{ width: '100%', height: 220, borderRadius: 16 }} contentFit="cover" accessibilityIgnoresInvertColors />
              ) : null}
              <T variant="muted">The picture file stays on your account and is not sent to Thumos. The caption can appear on your profile if you switch it on.</T>
              <Field
                label="Caption"
                value={caption}
                onChangeText={setCaption}
                onBlur={() => { void saveCaption(); }}
                placeholder="A few words for this picture"
                maxLength={VISION_CAPTION_LIMIT}
              />
              <T variant="label">Life area</T>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <Choice label="No tag" selected={open?.area == null} onPress={() => { void setArea(null); }} />
                {VISION_AREAS.map((area) => (
                  <Choice key={area.id} label={area.label} selected={open?.area === area.id} onPress={() => { void setArea(area.id); }} />
                ))}
              </View>
              <T variant="label">Size</T>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {VISION_SIZES.map((size) => (
                  <Choice
                    key={size}
                    label={size === 'small' ? 'Small' : size === 'medium' ? 'Medium' : 'Large'}
                    selected={open?.size === size}
                    onPress={() => { void setSize(size); }}
                  />
                ))}
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <Button label="Move up" tone="quiet" onPress={() => { void move('up'); }} />
                <Button label="Move down" tone="quiet" onPress={() => { void move('down'); }} />
              </View>
              {openIndex === 0 ? <T variant="muted">This is the first photo.</T> : null}
              {confirmDelete ? (
                <View style={{ gap: 8 }}>
                  <T>Remove this photo from your board?</T>
                  <Button label="Remove" tone="quiet" onPress={() => { void remove(); }} />
                  <Button label="Keep it" tone="quiet" onPress={() => setConfirmDelete(false)} />
                </View>
              ) : (
                <Button label="Delete" tone="quiet" onPress={() => setConfirmDelete(true)} />
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
      <Modal visible={show && current != null} animationType="fade" onRequestClose={() => setShow(false)}>
        <View style={{ flex: 1, backgroundColor: '#0C0C0C', justifyContent: 'center', paddingTop: insets.top, paddingBottom: 24 + insets.bottom }}>
          <T variant="label" style={{ color: '#F3F3EE', textAlign: 'center', marginBottom: 12 }}>Look at my vision</T>
          {current?.previewUrl ? (
            <Image source={{ uri: current.previewUrl }} style={{ width: '100%', height: 420 }} contentFit="contain" accessibilityIgnoresInvertColors />
          ) : null}
          <View style={{ padding: 20, gap: 8 }}>
            {current?.area ? <T style={{ color: '#F3F3EE' }}>{visionAreaLabel(current.area)}</T> : null}
            {current?.caption ? <T style={{ color: '#F3F3EE' }}>{current.caption}</T> : null}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <Button label="Previous" tone="quiet" onPress={() => setSlide((index) => (index - 1 + items.length) % items.length)} />
              <Button label="Next" tone="quiet" onPress={() => setSlide((index) => (index + 1) % items.length)} />
            </View>
            <Button label="Close" onPress={() => setShow(false)} />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}
