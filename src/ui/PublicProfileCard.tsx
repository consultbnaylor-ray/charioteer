import { useEffect, useRef, useState } from 'react';
import { Switch, View } from 'react-native';

import { useRepository, useSnapshot } from '@/data';
import type { ProgressPhoto } from '@/data/types';
import { isoDay } from '@/domain/dates';
import { shownError } from '@/domain/errors';
import { interestChipRemovable, interestChipVisible } from '@/domain/interests';
import { planCustomInterest, validateTown } from '@/domain/privacy';
import { NEVER_SHARED, projectPublicProfile } from '@/domain/profileSharing';
import { progressPhotoLabel } from '@/domain/progressPhotos';
import { formatGbp } from '@/domain/savings';
import { SharedPhotoFrame } from '@/ui/CommunityProfile';
import { COMMUNITY_CONSENT_BODY } from '@/ui/ConsentChoices';
import { InterestChip } from '@/ui/InterestChip';
import { ShareOnProfile } from '@/ui/ShareOnProfile';
import { useAppTheme } from '@/ui/theme';
import { Button, Card, ErrorNote, Field, playSavedHaptic, T } from '@/ui/ui';

export const PUBLIC_PROFILE_HIDDEN = 'Your profile is hidden from others';

/** Shown when Discover has nobody left after blocks and the directory rules. */
export const DISCOVER_EMPTY =
  'No one to show yet. As more people join near you or share your interests, they’ll appear here.';

type SavedField = 'name' | 'town' | 'interests';

export function PublicProfileCard() {
  const snap = useSnapshot();
  const repo = useRepository();
  const theme = useAppTheme();
  const profile = snap.profile;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profile?.displayName ?? '');
  const [town, setTown] = useState(profile?.town ?? '');
  const nameRef = useRef(profile?.displayName ?? '');
  const townRef = useRef(profile?.town ?? '');
  const [customInterest, setCustomInterest] = useState('');
  const [addingInterest, setAddingInterest] = useState(false);
  const addingInterestRef = useRef(false);
  const [communityBusy, setCommunityBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Partial<Record<SavedField, boolean>>>({});
  const timers = useRef<Partial<Record<SavedField, ReturnType<typeof setTimeout>>>>({});

  useEffect(() => {
    const next = profile?.displayName ?? '';
    nameRef.current = next;
    setName(next);
  }, [profile?.displayName]);

  useEffect(() => {
    const next = profile?.town ?? '';
    townRef.current = next;
    setTown(next);
  }, [profile?.town]);

  useEffect(() => () => {
    for (const timer of Object.values(timers.current)) {
      if (timer) clearTimeout(timer);
    }
  }, []);

  if (!profile) return null;
  const me = profile;

  const hidden = !me.communityVisible || !me.ageConfirmed18;
  const labels = new Map(snap.interests.map((interest) => [interest.id, interest.label]));
  const now = new Date();
  const preview = projectPublicProfile({
    now,
    today: isoDay(now),
    displayName: me.displayName,
    town: me.town,
    stage: me.stage,
    sobrietyStartedAt: me.sobrietyStartedAt,
    weeklySpendGbp: me.weeklySpendGbp,
    weeklyUnits: me.weeklyUnits,
    interestLabels: me.interestIds.map((id) => labels.get(id) ?? 'Interest'),
    reasons: snap.reasons.map((reason) => ({ body: reason.body, sortOrder: reason.sortOrder })),
    checkIns: snap.checkIns.map((item) => ({ createdAt: item.createdAt })),
    health: snap.health.map((item) => ({ kind: item.kind, value: item.value, recordedOn: item.recordedOn })),
    gratitude: snap.gratitude.map((entry) => ({
      id: entry.id,
      body: entry.body,
      entryDate: entry.entryDate,
      photoIds: entry.photos.map((photo) => photo.id),
    })),
    vision: snap.visionItems.map((item) => ({ id: item.id, caption: item.caption, area: item.area })),
    progressPhotos: snap.progressPhotos.map((photo) => ({
      id: photo.id,
      note: photo.note,
      takenOn: photo.takenOn,
      monthIndex: photo.monthIndex,
      visibility: photo.visibility === 'community' ? 'community' : 'private',
    })),
  }, snap.sharing);
  const interestLine = preview.interests.join(' · ');
  const shared = snap.progressPhotos
    .filter((photo) => photo.visibility === 'community')
    .sort((a, b) => a.monthIndex - b.monthIndex || a.takenOn.localeCompare(b.takenOn));

  function tick(field: SavedField) {
    setSaved((current) => ({ ...current, [field]: true }));
    playSavedHaptic();
    const pending = timers.current[field];
    if (pending) clearTimeout(pending);
    timers.current[field] = setTimeout(() => {
      setSaved((current) => ({ ...current, [field]: false }));
    }, 2500);
  }

  function changeName(value: string) {
    nameRef.current = value;
    setName(value);
  }

  function changeTown(value: string) {
    townRef.current = value;
    setTown(value);
  }

  async function saveName() {
    const next = nameRef.current.trim();
    if (next === me.displayName) return;
    if (!next) {
      nameRef.current = me.displayName;
      setName(me.displayName);
      setError('Add your name.');
      return;
    }
    setError(null);
    try {
      await repo.updateProfile({ displayName: next });
      tick('name');
    } catch (err) {
      setError(shownError(err, 'Could not save.'));
    }
  }

  async function saveTown() {
    const next = townRef.current.trim();
    if (next === (me.town ?? '')) return;
    const townError = validateTown(next);
    if (townError) {
      setError(townError);
      return;
    }
    setError(null);
    try {
      await repo.updateProfile({ town: next });
      tick('town');
    } catch (err) {
      setError(shownError(err, 'Could not save.'));
    }
  }

  async function toggleInterest(id: string, selected: boolean) {
    setError(null);
    try {
      await repo.setInterestSelected(id, selected);
      tick('interests');
    } catch (err) {
      setError(shownError(err, 'Could not update that interest.'));
    }
  }

  async function addOwnInterest() {
    if (addingInterestRef.current) return;
    const plan = planCustomInterest(customInterest);
    if (!plan.ok) {
      setError(plan.message);
      return;
    }
    const known = snap.interests.find((item) => item.slug === plan.slug);
    if (known && me.interestIds.includes(known.id)) {
      setCustomInterest('');
      setError(null);
      return;
    }
    addingInterestRef.current = true;
    setAddingInterest(true);
    setError(null);
    try {
      if (known) await repo.setInterestSelected(known.id, true);
      else await repo.addCustomInterest(plan.label);
      setCustomInterest('');
      tick('interests');
    } catch (err) {
      setError(shownError(err, 'Could not add that interest.'));
    } finally {
      addingInterestRef.current = false;
      setAddingInterest(false);
    }
  }

  async function turnCommunity(on: boolean) {
    if (!me.ageConfirmed18 || communityBusy) return;
    setError(null);
    setCommunityBusy(true);
    try {
      await repo.saveConsents({
        communityVisible: on,
        consentHealth: me.consentHealth,
        consentAi: me.consentAi,
      });
    } catch (err) {
      setError(shownError(err, 'Could not save that.'));
    } finally {
      setCommunityBusy(false);
    }
  }

  function finishEditing() {
    void saveName();
    void saveTown();
    setEditing(false);
  }

  return (
    <View style={{ gap: 10 }}>
      <T variant="title">Your public profile</T>
      <Card>
        {hidden ? (
          <View style={{ gap: 8 }}>
            <T variant="title">{PUBLIC_PROFILE_HIDDEN}</T>
            {me.ageConfirmed18 ? (
              <View style={{ gap: 8 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                  <T variant="title" style={{ fontSize: 20, flex: 1 }}>Community</T>
                  <Switch
                    accessibilityLabel="Community"
                    value={me.communityVisible}
                    disabled={communityBusy}
                    onValueChange={(value) => void turnCommunity(value)}
                    trackColor={{ true: theme.colors.ink, false: theme.colors.line }}
                    thumbColor={theme.colors.surface}
                  />
                </View>
                <T variant="muted">{COMMUNITY_CONSENT_BODY}</T>
              </View>
            ) : (
              <T variant="muted">Community is for adults. Confirm you are 18 or over before your profile can be seen.</T>
            )}
          </View>
        ) : (
          <View style={{ gap: 8 }}>
            <T variant="label">Name and interests stay on</T>
            <T variant="title">{preview.displayName}</T>
            <T variant="muted">{preview.town || 'Area not shared'}</T>
            {interestLine ? <T>{interestLine}</T> : null}
            {preview.stage ? <T>Stage: {preview.stage}</T> : null}
            {preview.sober ? <T>{preview.sober.days} days sober{preview.sober.milestones.length ? ` · ${preview.sober.milestones.join(', ')}` : ''}</T> : null}
            {preview.reasons.map((reason) => <T key={reason}>{reason}</T>)}
            {preview.savings ? <T>{formatGbp(preview.savings.moneyGbp)} saved · {preview.savings.units} units avoided</T> : null}
            {preview.moodStreak != null ? <T>Mood streak {preview.moodStreak}</T> : null}
            {preview.health.map((line) => <T key={line}>{line}</T>)}
            {preview.gratitude.map((entry) => <T key={entry.id}>{entry.body}</T>)}
            {preview.vision.map((item) => <T key={item.id}>{item.caption}</T>)}
            <OwnSharedPhotos name={me.displayName} photos={shared} />
          </View>
        )}
        <ShareOnProfile
          detail="town"
          on={snap.sharing.town}
          apply={(sharing, selected) => ({ ...sharing, town: selected })}
        />
        {hidden ? (
          <T variant="muted">Chosen, but not visible until Community is on: {preview.sharedLabels.join(', ')}</T>
        ) : null}
        <ErrorNote>{error}</ErrorNote>
        <Button label={editing ? 'Done' : 'Edit profile'} tone="quiet" onPress={() => (editing ? finishEditing() : setEditing(true))} />
        {editing ? (
          <View style={{ gap: 10 }}>
            <Field label="Name" value={name} onChangeText={changeName} onBlur={() => void saveName()} placeholder="What should we call you?" />
            {saved.name ? <T>Saved ✓</T> : null}
            <Field label="Town or area" value={town} onChangeText={changeTown} onBlur={() => void saveTown()} placeholder="Bristol, or leave blank" />
            {saved.town ? <T>Saved ✓</T> : null}
            <T variant="label">Interests</T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {snap.interests.filter((interest) => interestChipVisible(interest, me.interestIds.includes(interest.id))).map((interest) => {
                const selected = me.interestIds.includes(interest.id);
                const removable = interestChipRemovable(interest);
                return (
                  <InterestChip
                    key={interest.id}
                    label={interest.label}
                    selected={selected}
                    custom={removable}
                    onPress={() => void toggleInterest(interest.id, !selected)}
                    onRemove={removable ? () => void toggleInterest(interest.id, false) : undefined}
                  />
                );
              })}
            </View>
            {saved.interests ? <T>Saved ✓</T> : null}
            <Field
              label="Add your own interest"
              value={customInterest}
              onChangeText={setCustomInterest}
              placeholder="Climbing, choir, five-a-side…"
              editable={!addingInterest}
              maxLength={40}
            />
            <Button
              label="Add"
              pending={addingInterest}
              disabled={addingInterest || !customInterest.trim()}
              onPress={() => void addOwnInterest()}
            />
          </View>
        ) : null}
      </Card>
      <T>Hidden: {preview.hiddenLabels.join(', ')}</T>
      <T variant="muted">{NEVER_SHARED}</T>
    </View>
  );
}

function OwnSharedPhotos({ name, photos }: { name: string; photos: ProgressPhoto[] }) {
  if (!photos.length) return null;
  const before = photos[0];
  const now = photos[photos.length - 1];
  return (
    <View style={{ gap: 10 }}>
      <T variant="label">Shared photos</T>
      <T variant="muted">{name} chose to show these. Private photos stay hidden.</T>
      {photos.length >= 2 && before && now && before.id !== now.id ? (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1, gap: 6 }}>
            <T variant="label">Before</T>
            <SharedPhotoFrame photo={before} />
          </View>
          <View style={{ flex: 1, gap: 6 }}>
            <T variant="label">Now</T>
            <SharedPhotoFrame photo={now} />
          </View>
        </View>
      ) : null}
      {photos.map((photo) => (
        <View key={photo.id} style={{ gap: 6 }}>
          <SharedPhotoFrame photo={photo} />
          <T variant="label">Shared</T>
          <T>{progressPhotoLabel(photo.monthIndex, photo.takenOn)}</T>
          {photo.note ? <T variant="muted">{photo.note}</T> : null}
        </View>
      ))}
    </View>
  );
}
