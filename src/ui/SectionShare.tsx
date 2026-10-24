import { useRef, useState } from 'react';
import { Switch, View } from 'react-native';

import { useRepository, useSnapshot } from '@/data';
import { shownError } from '@/domain/errors';
import { PROFILE_HIDDEN_SHARE, communitySharingOn } from '@/domain/profileSharing';
import { NUTRITION_SHARE_LOCKED } from '@/ui/NutritionShare';
import {
  SECTION_SHARE_EMPTY,
  SECTION_SHARE_LABEL,
  SECTION_SHARE_SOME,
  applyNutritionSection,
  applyProfileSection,
  boxesBecomingVisible,
  gratitudeSectionBoxes,
  gratitudeSectionPatch,
  healthSectionBoxes,
  healthSectionPatch,
  nutritionSectionBoxes,
  photoSectionBoxes,
  profileTextBoxes,
  reasonBodiesOf,
  reviewSectionBoxes,
  reviewSectionPatch,
  runSectionSave,
  sectionNeedsConsent,
  sectionShareConfirm,
  sectionShareState,
  stampSectionConsent,
  visionSectionBoxes,
  visionSectionPatch,
  youSectionBoxes,
  youSectionPatch,
  type ShareBox,
} from '@/domain/sectionShare';
import { useAppTheme } from '@/ui/theme';
import { Button, Card, QuietNote, T } from '@/ui/ui';

/**
 * One master for the boxes already on this page. On asks, then turns those
 * boxes on. Off turns them off. Mixed reads "Some shared".
 */
export function SectionShare({
  boxes,
  lockedNote,
  consented,
  onCommit,
}: {
  boxes: ShareBox[];
  /** Set when Community is off. The master is greyed and does not write. */
  lockedNote: string | null;
  consented: boolean;
  onCommit: (on: boolean) => Promise<void>;
}) {
  const theme = useAppTheme();
  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<ShareBox[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const state = sectionShareState(boxes);
  const locked = lockedNote != null || boxes.length === 0;

  async function commit(on: boolean) {
    if (locked || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setPending(null);
    setError(null);
    try {
      await onCommit(on);
    } catch (err) {
      setError(shownError(err, 'Could not update sharing.'));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  function change(value: boolean) {
    if (locked || savingRef.current) return;
    if (!value) {
      setPending(null);
      if (state === 'on') void commit(false);
      return;
    }
    const becoming = boxesBecomingVisible(boxes);
    if (becoming.length === 0) return;
    setPending(becoming);
  }

  const label = state === 'mixed' ? `${SECTION_SHARE_LABEL}, ${SECTION_SHARE_SOME}` : SECTION_SHARE_LABEL;

  return (
    <Card>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'center', opacity: locked ? 0.45 : 1 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <T>{SECTION_SHARE_LABEL}</T>
          {state === 'mixed' && !locked ? <T variant="muted">{SECTION_SHARE_SOME}</T> : null}
        </View>
        <Switch
          accessibilityLabel={label}
          accessibilityState={{ disabled: locked, checked: state === 'on' }}
          value={state === 'on'}
          disabled={locked}
          onValueChange={change}
          trackColor={{ true: theme.colors.ink, false: theme.colors.line }}
          thumbColor={theme.colors.surface}
        />
      </View>
      {lockedNote ? <T variant="muted">{lockedNote}</T> : null}
      {!lockedNote && boxes.length === 0 ? <T variant="muted">{SECTION_SHARE_EMPTY}</T> : null}
      {pending ? (
        <View style={{ gap: 8 }}>
          <T>{sectionShareConfirm(pending, consented)}</T>
          <Button label="Share this section" pending={saving} pendingLabel="Saving..." onPress={() => void commit(true)} />
          <Button label="Not now" tone="quiet" disabled={saving} onPress={() => setPending(null)} />
        </View>
      ) : null}
      {state === 'mixed' && !locked && !pending ? (
        <Button label="Turn them all off" tone="quiet" pending={saving} pendingLabel="Saving..." onPress={() => void commit(false)} />
      ) : null}
      <QuietNote>{error}</QuietNote>
    </Card>
  );
}

function useShareWrite() {
  const repo = useRepository();
  const snap = useSnapshot();
  const consented = Boolean(snap.sharing.sensitiveConsentAt);
  const communityOn = communitySharingOn(snap.profile);
  return { repo, snap, consented, communityOn };
}

export function NutritionSectionShare() {
  const { repo, snap, consented, communityOn } = useShareWrite();
  const boxes = nutritionSectionBoxes(snap.nutrition, snap.sharing.healthPlan);
  return (
    <SectionShare
      boxes={boxes}
      lockedNote={communityOn ? null : NUTRITION_SHARE_LOCKED}
      consented={consented}
      onCommit={async (on) => {
        const current = repo.getSnapshot();
        const becoming = on ? boxesBecomingVisible(nutritionSectionBoxes(current.nutrition, current.sharing.healthPlan)) : [];
        const sharing = stampSectionConsent(
          applyProfileSection(current.sharing, { healthPlan: true }, on),
          sectionNeedsConsent(becoming, Boolean(current.sharing.sensitiveConsentAt)),
          new Date().toISOString(),
        );
        const nutrition = applyNutritionSection(current.nutrition, on);
        const sharingChanged = sharing.healthPlan !== current.sharing.healthPlan
          || sharing.sensitiveConsentAt !== current.sharing.sensitiveConsentAt;
        await runSectionSave([
          {
            write: () => repo.setNutritionSettings(nutrition),
            undo: () => repo.setNutritionSettings(current.nutrition),
          },
          ...(sharingChanged ? [{
            write: () => repo.setProfileSharing(sharing),
            undo: () => repo.setProfileSharing(current.sharing),
          }] : []),
        ]);
      }}
    />
  );
}

export function YouSectionShare() {
  const { repo, snap, consented, communityOn } = useShareWrite();
  const pinned = Boolean(snap.profile?.pinnedQuoteId);
  const boxes = youSectionBoxes({
    pinned,
    pinnedOn: snap.sharing.pinnedQuote,
    stageOn: snap.sharing.stage,
    townOn: snap.sharing.town,
    reasons: snap.reasons,
    reasonBodies: snap.sharing.reasonBodies,
    wagonVisible: snap.nutrition.wagonVisible,
    planShared: snap.sharing.healthPlan,
  });
  return (
    <SectionShare
      boxes={boxes}
      lockedNote={communityOn ? null : PROFILE_HIDDEN_SHARE}
      consented={consented}
      onCommit={async (on) => {
        const current = repo.getSnapshot();
        const quotePinned = Boolean(current.profile?.pinnedQuoteId);
        const bodies = reasonBodiesOf(current.reasons);
        const fresh = youSectionBoxes({
          pinned: quotePinned,
          pinnedOn: current.sharing.pinnedQuote,
          stageOn: current.sharing.stage,
          townOn: current.sharing.town,
          reasons: current.reasons,
          reasonBodies: current.sharing.reasonBodies,
          wagonVisible: current.nutrition.wagonVisible,
          planShared: current.sharing.healthPlan,
        });
        const becoming = on ? boxesBecomingVisible(fresh) : [];
        const sharing = stampSectionConsent(
          applyProfileSection(current.sharing, youSectionPatch(quotePinned, bodies), on),
          sectionNeedsConsent(becoming, Boolean(current.sharing.sensitiveConsentAt)),
          new Date().toISOString(),
        );
        const nutrition = { ...current.nutrition, wagonVisible: on };
        await runSectionSave([
          {
            write: () => repo.setProfileSharing(sharing),
            undo: () => repo.setProfileSharing(current.sharing),
          },
          ...(current.nutrition.wagonVisible === on ? [] : [{
            write: () => repo.setNutritionSettings(nutrition),
            undo: () => repo.setNutritionSettings(current.nutrition),
          }]),
        ]);
      }}
    />
  );
}

export function CheckInSectionShare() {
  const { repo, snap, consented, communityOn } = useShareWrite();
  const boxes: ShareBox[] = [{ id: 'moodStreak', label: 'Mood streak', on: snap.sharing.moodStreak, sensitive: true }];
  return (
    <SectionShare
      boxes={boxes}
      lockedNote={communityOn ? null : PROFILE_HIDDEN_SHARE}
      consented={consented}
      onCommit={(on) => saveProfile(repo, { moodStreak: true }, on)}
    />
  );
}

export function SoberSectionShare() {
  const { repo, snap, consented, communityOn } = useShareWrite();
  const boxes: ShareBox[] = [{ id: 'soberDays', label: 'Days sober', on: snap.sharing.soberDays, sensitive: true }];
  return (
    <SectionShare
      boxes={boxes}
      lockedNote={communityOn ? null : PROFILE_HIDDEN_SHARE}
      consented={consented}
      onCommit={(on) => saveProfile(repo, { soberDays: true }, on)}
    />
  );
}

export function HealthSectionShare() {
  const { repo, snap, consented, communityOn } = useShareWrite();
  return (
    <SectionShare
      boxes={healthSectionBoxes(snap.sharing.healthKinds)}
      lockedNote={communityOn ? null : PROFILE_HIDDEN_SHARE}
      consented={consented}
      onCommit={(on) => saveProfile(repo, healthSectionPatch(), on)}
    />
  );
}

export function GratitudeSectionShare() {
  const { repo, snap, consented, communityOn } = useShareWrite();
  return (
    <SectionShare
      boxes={gratitudeSectionBoxes(snap.gratitude, snap.sharing.gratitudeIds, snap.sharing.gratitudePhotoIds)}
      lockedNote={communityOn ? null : PROFILE_HIDDEN_SHARE}
      consented={consented}
      onCommit={async (on) => {
        const current = repo.getSnapshot();
        await saveProfile(repo, gratitudeSectionPatch(current.gratitude), on);
      }}
    />
  );
}

export function VisionSectionShare() {
  const { repo, snap, consented, communityOn } = useShareWrite();
  return (
    <SectionShare
      boxes={visionSectionBoxes(snap.visionItems, snap.sharing.visionIds)}
      lockedNote={communityOn ? null : PROFILE_HIDDEN_SHARE}
      consented={consented}
      onCommit={async (on) => {
        const current = repo.getSnapshot();
        await saveProfile(repo, visionSectionPatch(current.visionItems), on);
      }}
    />
  );
}

export function PhotoSectionShare() {
  const { repo, snap, consented, communityOn } = useShareWrite();
  const photos = snap.progressPhotos ?? [];
  return (
    <SectionShare
      boxes={photoSectionBoxes(photos)}
      lockedNote={communityOn ? null : PROFILE_HIDDEN_SHARE}
      consented={consented}
      onCommit={async (on) => {
        const current = repo.getSnapshot();
        const ids = (current.progressPhotos ?? []).map((photo) => photo.id);
        if (!ids.length) return;
        const becoming = on ? boxesBecomingVisible(photoSectionBoxes(current.progressPhotos ?? [])) : [];
        const sharing = stampSectionConsent(
          current.sharing,
          sectionNeedsConsent(becoming, Boolean(current.sharing.sensitiveConsentAt)),
          new Date().toISOString(),
        );
        const before = (current.progressPhotos ?? []).map((photo) => ({ id: photo.id, visibility: photo.visibility }));
        await runSectionSave([
          ...(sharing !== current.sharing ? [{
            write: () => repo.setProfileSharing(sharing),
            undo: () => repo.setProfileSharing(current.sharing),
          }] : []),
          {
            write: () => repo.setProgressPhotoVisibility(ids, on ? 'community' : 'private'),
            undo: async () => {
              const shared = before.filter((photo) => photo.visibility === 'community').map((photo) => photo.id);
              const kept = before.filter((photo) => photo.visibility !== 'community').map((photo) => photo.id);
              if (shared.length) await repo.setProgressPhotoVisibility(shared, 'community');
              if (kept.length) await repo.setProgressPhotoVisibility(kept, 'private');
            },
          },
        ]);
      }}
    />
  );
}

export function ProfileTextSectionShare() {
  const { repo, snap, consented, communityOn } = useShareWrite();
  return (
    <SectionShare
      boxes={profileTextBoxes(snap.sharing)}
      lockedNote={communityOn ? null : PROFILE_HIDDEN_SHARE}
      consented={consented}
      onCommit={(on) => saveProfile(repo, { bio: true, town: true }, on)}
    />
  );
}

export function ReviewSectionShare() {
  const { repo, snap, consented, communityOn } = useShareWrite();
  const boxes = reviewSectionBoxes({
    sharing: snap.sharing,
    nutrition: snap.nutrition,
    reasons: snap.reasons,
    gratitude: snap.gratitude,
    vision: snap.visionItems,
  });
  return (
    <SectionShare
      boxes={boxes}
      lockedNote={communityOn ? null : PROFILE_HIDDEN_SHARE}
      consented={consented}
      onCommit={async (on) => {
        const current = repo.getSnapshot();
        const patch = reviewSectionPatch({
          reasons: current.reasons,
          gratitude: current.gratitude,
          vision: current.visionItems,
        });
        const fresh = reviewSectionBoxes({
          sharing: current.sharing,
          nutrition: current.nutrition,
          reasons: current.reasons,
          gratitude: current.gratitude,
          vision: current.visionItems,
        });
        const becoming = on ? boxesBecomingVisible(fresh) : [];
        const sharing = stampSectionConsent(
          applyProfileSection(current.sharing, patch, on),
          sectionNeedsConsent(becoming, Boolean(current.sharing.sensitiveConsentAt)),
          new Date().toISOString(),
        );
        const nutrition = applyNutritionSection(current.nutrition, on);
        await runSectionSave([
          {
            write: () => repo.setProfileSharing(sharing),
            undo: () => repo.setProfileSharing(current.sharing),
          },
          {
            write: () => repo.setNutritionSettings(nutrition),
            undo: () => repo.setNutritionSettings(current.nutrition),
          },
        ]);
      }}
    />
  );
}

type Repo = ReturnType<typeof useRepository>;

async function saveProfile(repo: Repo, patch: Parameters<typeof applyProfileSection>[1], on: boolean): Promise<void> {
  const current = repo.getSnapshot();
  const freshBoxes = boxesForPatch(current.sharing, patch);
  const becoming = on ? boxesBecomingVisible(freshBoxes) : [];
  const sharing = stampSectionConsent(
    applyProfileSection(current.sharing, patch, on),
    sectionNeedsConsent(becoming, Boolean(current.sharing.sensitiveConsentAt)),
    new Date().toISOString(),
  );
  await runSectionSave([
    {
      write: () => repo.setProfileSharing(sharing),
      undo: () => repo.setProfileSharing(current.sharing),
    },
  ]);
}

/** Boxes touched by a profile-only patch, used to decide whether consent is still required. */
function boxesForPatch(sharing: ReturnType<Repo['getSnapshot']>['sharing'], patch: Parameters<typeof applyProfileSection>[1]): ShareBox[] {
  const boxes: ShareBox[] = [];
  if (patch.moodStreak !== undefined) boxes.push({ id: 'moodStreak', label: 'Mood streak', on: sharing.moodStreak, sensitive: true });
  if (patch.soberDays !== undefined) boxes.push({ id: 'soberDays', label: 'Days sober', on: sharing.soberDays, sensitive: true });
  if (patch.bio !== undefined) boxes.push({ id: 'bio', label: 'Bio', on: sharing.bio, sensitive: false });
  if (patch.town !== undefined) boxes.push({ id: 'town', label: 'Town', on: sharing.town, sensitive: false });
  if (patch.healthKinds) boxes.push(...healthSectionBoxes(sharing.healthKinds));
  if (patch.gratitudeIds || patch.gratitudePhotoIds) {
    boxes.push({ id: 'lines', label: 'Lines', on: (patch.gratitudeIds ?? []).every((id) => sharing.gratitudeIds.includes(id)) && (patch.gratitudePhotoIds ?? []).every((id) => sharing.gratitudePhotoIds.includes(id)), sensitive: false });
  }
  if (patch.visionIds) {
    boxes.push({ id: 'vision', label: 'Pictures', on: patch.visionIds.every((id) => sharing.visionIds.includes(id)), sensitive: false });
  }
  return boxes;
}
