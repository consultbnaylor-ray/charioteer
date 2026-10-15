import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Switch, View } from 'react-native';

import { useRepository, useSnapshot } from '@/data';
import type { ProgressPhoto } from '@/data/types';
import { shownError } from '@/domain/errors';
import { HEALTH_METRICS } from '@/domain/healthInsights';
import { sortGratitude } from '@/domain/gratitude';
import { PROFILE_PHOTO_WORDING } from '@/domain/profilePhotos';
import { compareNewest } from '@/domain/shareList';
import {
  PROFILE_HIDDEN_SHARE,
  SHARE_HINT,
  SHARE_NEW_GRATITUDE,
  SHARE_NEW_GRATITUDE_HINT,
  communitySharingOn,
  healthShareLabel,
  sensitiveShareConfirm,
  toggleShareId,
} from '@/domain/profileSharing';
import { PROGRESS_SHARE_WARNING, progressPhotoLabel } from '@/domain/progressPhotos';
import { COMMUNITY_CONSENT_BODY } from '@/ui/ConsentChoices';
import { NutritionShareSwitch } from '@/ui/NutritionShare';
import { ScrollTarget } from '@/ui/ScrollTarget';
import { GratitudeSectionShare, PhotoSectionShare, ReviewSectionShare, VisionSectionShare } from '@/ui/SectionShare';
import { ShareOnProfile } from '@/ui/ShareOnProfile';
import { ShareSwitchList } from '@/ui/ShareSwitchList';
import { useAppTheme } from '@/ui/theme';
import { Button, QuietNote, Screen, T } from '@/ui/ui';

export default function WhatIShare() {
  const snap = useSnapshot();
  const router = useRouter();
  const communityOn = communitySharingOn(snap.profile);
  const gratitudePhotos = snap.gratitude.flatMap((entry) => entry.photos);

  return (
    <Screen
      eyebrow="Profile"
      title="What I share"
      intro="Each switch shares only that one item. The same switch sits under the box. A hidden name on your profile opens that switch."
    >
      <ReviewSectionShare />
      <T variant="muted">{communityOn ? SHARE_HINT : PROFILE_HIDDEN_SHARE}</T>
      <T>{COMMUNITY_CONSENT_BODY}</T>
      <T>Name and interests stay on your profile while Community is on.</T>
      <ShareAnchor id="bio" title="Bio">
        <ShareOnProfile
          label="Share bio"
          item="Bio"
          on={snap.sharing.bio}
          apply={(sharing, selected) => ({ ...sharing, bio: selected })}
        />
      </ShareAnchor>
      <ShareAnchor id="town" title="Town">
        <ShareOnProfile
          label="Share town"
          item="Town"
          on={snap.sharing.town}
          apply={(sharing, selected) => ({ ...sharing, town: selected })}
        />
      </ShareAnchor>
      <ShareAnchor id="stage" title="Stage">
        <ShareOnProfile
          label="Share stage"
          item="Stage"
          on={snap.sharing.stage}
          sensitive
          apply={(sharing, selected) => ({ ...sharing, stage: selected })}
        />
      </ShareAnchor>
      <ShareAnchor id="daysSober" title="Days sober">
        <ShareOnProfile
          label="Share days sober"
          item="Days sober"
          on={snap.sharing.soberDays}
          sensitive
          apply={(sharing, selected) => ({ ...sharing, soberDays: selected })}
        />
      </ShareAnchor>
      <ShareAnchor id="milestones" title="Milestones">
        <ShareOnProfile
          label="Share milestones"
          item="Milestones"
          on={snap.sharing.milestones}
          sensitive
          apply={(sharing, selected) => ({ ...sharing, milestones: selected })}
        />
      </ShareAnchor>
      <ShareAnchor id="reasons" title="Reasons">
        {snap.reasons.length ? snap.reasons.map((reason) => (
          <ShareOnProfile
            key={reason.id}
            label={`Share “${reason.body}”`}
            item={reason.body.trim()}
            on={snap.sharing.reasonBodies.includes(reason.body.trim())}
            sensitive
            apply={(sharing, selected) => toggleShareId(sharing, 'reasonBodies', reason.body.trim(), selected)}
          />
        )) : (
          <EmptyShare note="No reasons yet. Add them on You, then share each one here.">
            <Button label="You" tone="quiet" onPress={() => router.push('/profile' as never)} />
          </EmptyShare>
        )}
      </ShareAnchor>
      <ShareAnchor id="moneySaved" title="Money saved">
        <ShareOnProfile
          label="Share money saved"
          item="Money saved"
          on={snap.sharing.moneySaved}
          sensitive
          apply={(sharing, selected) => ({ ...sharing, moneySaved: selected })}
        />
      </ShareAnchor>
      <ShareAnchor id="unitsAvoided" title="Units avoided">
        <ShareOnProfile
          label="Share units avoided"
          item="Units avoided"
          on={snap.sharing.unitsAvoided}
          sensitive
          apply={(sharing, selected) => ({ ...sharing, unitsAvoided: selected })}
        />
      </ShareAnchor>
      <ShareAnchor id="moodStreak" title="Mood streak">
        <ShareOnProfile
          label="Share mood streak"
          item="Mood streak"
          on={snap.sharing.moodStreak}
          sensitive
          apply={(sharing, selected) => ({ ...sharing, moodStreak: selected })}
        />
      </ShareAnchor>
      <ShareAnchor id="health" title="Health headlines">
        {HEALTH_METRICS.map((metric) => (
          <ShareOnProfile
            key={metric.kind}
            label={healthShareLabel(metric.label)}
            item={`${metric.label} average`}
            on={snap.sharing.healthKinds.includes(metric.kind)}
            sensitive
            apply={(sharing, selected) => {
              const healthKinds = selected
                ? sharing.healthKinds.includes(metric.kind) ? sharing.healthKinds : [...sharing.healthKinds, metric.kind]
                : sharing.healthKinds.filter((kind) => kind !== metric.kind);
              return { ...sharing, healthKinds };
            }}
          />
        ))}
      </ShareAnchor>
      <ShareAnchor id="progressPhotos" title="Progress photos">
        <PhotoSectionShare />
        <ProgressPhotoShares />
      </ShareAnchor>
      <ShareAnchor id="profilePhotos" title="Profile photos">
        <T variant="muted">{PROFILE_PHOTO_WORDING}</T>
        <T variant="muted">There is no separate share switch. A picture shows on your profile while Community is on.</T>
        <Button label="Edit profile photos" tone="quiet" onPress={() => router.push('/public-profile?edit=photos' as never)} />
      </ShareAnchor>
      <ShareAnchor id="gratitudeLines" title="Gratitude lines">
        <GratitudeSectionShare />
        <ShareOnProfile
          label={SHARE_NEW_GRATITUDE}
          item="Lines I add later"
          on={snap.sharing.shareNewGratitude}
          apply={(sharing, selected) => ({ ...sharing, shareNewGratitude: selected })}
        />
        <T variant="muted">{SHARE_NEW_GRATITUDE_HINT}</T>
        {snap.gratitude.length ? (
          <ShareSwitchList
            title="Gratitude entries"
            shared={snap.gratitude.filter((entry) => snap.sharing.gratitudeIds.includes(entry.id)).length}
            items={sortGratitude(snap.gratitude).map((entry) => (
              <ShareOnProfile
                key={entry.id}
                lines={2}
                label={`Share “${entry.body}”`}
                item={entry.body}
                on={snap.sharing.gratitudeIds.includes(entry.id)}
                apply={(sharing, selected) => toggleShareId(sharing, 'gratitudeIds', entry.id, selected)}
              />
            ))}
          />
        ) : (
          <EmptyShare note="No gratitude lines yet.">
            <Button label="Gratitude Diary" tone="quiet" onPress={() => router.push('/gratitude' as never)} />
          </EmptyShare>
        )}
      </ShareAnchor>
      <ShareAnchor id="gratitudePhotos" title="Gratitude photos">
        {gratitudePhotos.length ? (
          <ShareSwitchList
            title="Gratitude photos"
            shared={gratitudePhotos.filter((photo) => snap.sharing.gratitudePhotoIds.includes(photo.id)).length}
            items={sortGratitude(snap.gratitude).flatMap((entry) => [...entry.photos].sort((a, b) => compareNewest(
              { stamp: a.createdAt, id: a.id },
              { stamp: b.createdAt, id: b.id },
            )).map((photo) => (
              <ShareOnProfile
                key={photo.id}
                lines={2}
                label={photo.caption.trim() ? `Include photo “${photo.caption.trim()}”` : 'Include photo'}
                item={photo.caption.trim() || 'This gratitude photo'}
                on={snap.sharing.gratitudePhotoIds.includes(photo.id)}
                apply={(sharing, selected) => toggleShareId(sharing, 'gratitudePhotoIds', photo.id, selected)}
              />
            )))}
          />
        ) : (
          <EmptyShare note="No gratitude photos yet. A photo stays private until you include it.">
            <Button label="Gratitude Diary" tone="quiet" onPress={() => router.push('/gratitude' as never)} />
          </EmptyShare>
        )}
      </ShareAnchor>
      <ShareAnchor id="visionItems" title="Vision items">
        <VisionSectionShare />
        {snap.visionItems.length ? (
          <ShareSwitchList
            title="Vision items"
            shared={snap.visionItems.filter((item) => snap.sharing.visionIds.includes(item.id)).length}
            items={[...snap.visionItems].sort((a, b) => compareNewest(
              { stamp: a.createdAt, id: a.id },
              { stamp: b.createdAt, id: b.id },
            )).map((item) => {
              const index = snap.visionItems.findIndex((candidate) => candidate.id === item.id);
              return (
                <ShareOnProfile
                  key={item.id}
                  lines={2}
                  label={item.caption.trim() ? `Share “${item.caption.trim()}”` : `Share untitled picture ${index + 1}`}
                  item={item.caption.trim() || 'This vision caption'}
                  on={snap.sharing.visionIds.includes(item.id)}
                  apply={(sharing, selected) => toggleShareId(sharing, 'visionIds', item.id, selected)}
                />
              );
            })}
          />
        ) : (
          <EmptyShare note="No vision items yet. Add one on the Vision Board, then share it here.">
            <Button label="Vision Board" tone="quiet" onPress={() => router.push('/vision' as never)} />
          </EmptyShare>
        )}
      </ShareAnchor>
      <ShareAnchor id="pinnedQuote" title="Pinned quote">
        <ShareOnProfile
          label="Share pinned quote"
          item="Pinned quote"
          on={snap.sharing.pinnedQuote}
          apply={(sharing, selected) => ({ ...sharing, pinnedQuote: selected })}
        />
      </ShareAnchor>
      <ShareAnchor id="meals" title="Today's meals">
        <NutritionShareSwitch
          label="Share today's meals"
          item="Today's meals"
          on={snap.nutrition.shareFoodDiary}
          apply={(settings, selected) => ({ ...settings, shareFoodDiary: selected })}
        />
      </ShareAnchor>
      <ShareAnchor id="calories" title="Calories and macros">
        <NutritionShareSwitch
          label="Share daily calories and macros"
          item="Daily calories and macros"
          on={snap.nutrition.shareCalories}
          apply={(settings, selected) => ({ ...settings, shareCalories: selected })}
        />
      </ShareAnchor>
      <ShareAnchor id="foodQuality" title="Food quality">
        <NutritionShareSwitch
          label="Share food quality"
          item="Food quality"
          on={snap.nutrition.shareQuality}
          apply={(settings, selected) => ({ ...settings, shareQuality: selected })}
        />
      </ShareAnchor>
      <ShareAnchor id="nutritionProgress" title="Progress and streaks">
        <NutritionShareSwitch
          label="Share progress and streaks"
          item="Progress and streaks"
          on={snap.nutrition.shareProgress}
          apply={(settings, selected) => ({ ...settings, shareProgress: selected })}
        />
      </ShareAnchor>
      <ShareAnchor id="hardMoment" title="A hard moment">
        <T variant="muted">Shown on your profile as a hard moment. This switch is the wagon flag.</T>
        <NutritionShareSwitch
          label="Share the wagon flag"
          item="The wagon flag"
          on={snap.nutrition.wagonVisible}
          apply={(settings, selected) => ({ ...settings, wagonVisible: selected })}
        />
      </ShareAnchor>
      <ShareAnchor id="nutritionGoal" title="Nutrition goal">
        <NutritionShareSwitch
          label="Share the goal and progress"
          item="The goal and progress"
          on={snap.nutrition.shareGoal}
          apply={(settings, selected) => ({ ...settings, shareGoal: selected })}
        />
      </ShareAnchor>
      <T variant="label">On the section screen</T>
      <T>Days sober is on Today. Mood streak is on Check-in. Each health average, reason, gratitude line, and vision caption also has its switch under that box.</T>
      <View style={{ gap: 8 }}>
        <Button label="Today" tone="quiet" onPress={() => router.push('/home' as never)} />
        <Button label="Health Stats" tone="quiet" onPress={() => router.push('/health' as never)} />
        <Button label="Nutrition" tone="quiet" onPress={() => router.push('/nutrition' as never)} />
        <Button label="You" tone="quiet" onPress={() => router.push('/profile' as never)} />
        <Button label="Gratitude Diary" tone="quiet" onPress={() => router.push('/gratitude' as never)} />
        <Button label="Vision Board" tone="quiet" onPress={() => router.push('/vision' as never)} />
        <Button label="Progress photos" tone="quiet" onPress={() => router.push('/photos' as never)} />
      </View>
    </Screen>
  );
}

function ShareAnchor({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <ScrollTarget id={id}>
      <View style={{ gap: 8 }}>
        <T>{title}</T>
        {children}
      </View>
    </ScrollTarget>
  );
}

function EmptyShare({ note, children }: { note: string; children: ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <T variant="muted">{note}</T>
      {children}
    </View>
  );
}

function ProgressPhotoShares() {
  const snap = useSnapshot();
  const router = useRouter();
  const photos = snap.progressPhotos ?? [];
  if (!photos.length) {
    return (
      <EmptyShare note="No progress photos yet. Add one, then choose who can see it.">
        <Button label="Add a progress photo" tone="quiet" onPress={() => router.push('/photos' as never)} />
      </EmptyShare>
    );
  }
  const ordered = [...photos].sort((a, b) => compareNewest(
    { stamp: `${a.takenOn}T${a.createdAt}`, id: a.id },
    { stamp: `${b.takenOn}T${b.createdAt}`, id: b.id },
  ));
  const shared = ordered.filter((photo) => photo.visibility === 'community').length;
  return (
    <ShareSwitchList
      title="Progress photos"
      shared={shared}
      items={ordered.map((photo) => <ProgressPhotoShareSwitch key={photo.id} photo={photo} />)}
    />
  );
}

function ProgressPhotoShareSwitch({ photo }: { photo: ProgressPhoto }) {
  const snap = useSnapshot();
  const repo = useRepository();
  const theme = useAppTheme();
  const communityOn = communitySharingOn(snap.profile);
  const [ask, setAsk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = photo.caption.trim() || progressPhotoLabel(photo.monthIndex, photo.takenOn);
  const on = photo.visibility === 'community';

  async function save(selected: boolean) {
    setError(null);
    setAsk(false);
    try {
      const current = repo.getSnapshot();
      if (!communitySharingOn(current.profile)) return;
      if (selected && !current.sharing.sensitiveConsentAt) {
        await repo.setProfileSharing({ ...current.sharing, sensitiveConsentAt: new Date().toISOString() });
      }
      await repo.setProgressPhotoVisibility([photo.id], selected ? 'community' : 'private');
    } catch (err) {
      setError(shownError(err, 'Could not update that photo.'));
    }
  }

  function change(value: boolean) {
    if (!communityOn) return;
    if (!value) {
      setAsk(false);
      if (on) void save(false);
      return;
    }
    if (!snap.sharing.sensitiveConsentAt) {
      setAsk(true);
      return;
    }
    void save(true);
  }

  return (
    <View style={{ gap: 6, opacity: communityOn ? 1 : 0.45 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
        <T style={{ flex: 1 }} numberOfLines={2}>{name}</T>
        <Switch
          accessibilityLabel={`Share ${name}`}
          value={on}
          disabled={!communityOn}
          onValueChange={change}
          trackColor={{ true: theme.colors.ink, false: theme.colors.line }}
          thumbColor={theme.colors.surface}
        />
      </View>
      {ask ? (
        <View style={{ gap: 8 }}>
          <T>{sensitiveShareConfirm('This progress photo')}</T>
          <T variant="muted">{PROGRESS_SHARE_WARNING}</T>
          <Button label="Share" onPress={() => void save(true)} />
          <Button label="Not now" tone="quiet" onPress={() => setAsk(false)} />
        </View>
      ) : null}
      <QuietNote>{error}</QuietNote>
    </View>
  );
}
