import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { useSnapshot } from '@/data';
import { HEALTH_METRICS } from '@/domain/healthInsights';
import {
  PROFILE_HIDDEN_SHARE,
  SHARE_HINT,
  healthShareLabel,
  toggleShareId,
} from '@/domain/profileSharing';
import { COMMUNITY_CONSENT_BODY } from '@/ui/ConsentChoices';
import { NutritionShareSwitch } from '@/ui/NutritionShare';
import { ShareOnProfile } from '@/ui/ShareOnProfile';
import { Button, Screen, T } from '@/ui/ui';

export default function WhatIShare() {
  const snap = useSnapshot();
  const router = useRouter();
  const communityOn = Boolean(snap.profile?.communityVisible && snap.profile?.ageConfirmed18);

  return (
    <Screen
      eyebrow="Profile"
      title="What I share"
      intro="Each switch shares only that one item. The same switch sits under the box. This list is a second place to review them all."
    >
      <T variant="muted">{communityOn ? SHARE_HINT : PROFILE_HIDDEN_SHARE}</T>
      <T>{COMMUNITY_CONSENT_BODY}</T>
      <T>Name and interests stay on your profile while Community is on.</T>
      <ShareOnProfile
        label="Share bio"
        item="Bio"
        on={snap.sharing.bio}
        apply={(sharing, selected) => ({ ...sharing, bio: selected })}
      />
      <ShareOnProfile
        label="Share town"
        item="Town"
        on={snap.sharing.town}
        apply={(sharing, selected) => ({ ...sharing, town: selected })}
      />
      <ShareOnProfile
        label="Share stage"
        item="Stage"
        on={snap.sharing.stage}
        sensitive
        apply={(sharing, selected) => ({ ...sharing, stage: selected })}
      />
      <ShareOnProfile
        label="Share days sober"
        item="Days sober"
        on={snap.sharing.soberDays}
        sensitive
        apply={(sharing, selected) => ({ ...sharing, soberDays: selected })}
      />
      <ShareOnProfile
        label="Share milestones"
        item="Milestones"
        on={snap.sharing.milestones}
        sensitive
        apply={(sharing, selected) => ({ ...sharing, milestones: selected })}
      />
      {snap.reasons.map((reason) => (
        <ShareOnProfile
          key={reason.id}
          label={`Share “${reason.body}”`}
          item={reason.body.trim()}
          on={snap.sharing.reasonBodies.includes(reason.body.trim())}
          sensitive
          apply={(sharing, selected) => toggleShareId(sharing, 'reasonBodies', reason.body.trim(), selected)}
        />
      ))}
      <ShareOnProfile
        label="Share money saved"
        item="Money saved"
        on={snap.sharing.moneySaved}
        sensitive
        apply={(sharing, selected) => ({ ...sharing, moneySaved: selected })}
      />
      <ShareOnProfile
        label="Share units avoided"
        item="Units avoided"
        on={snap.sharing.unitsAvoided}
        sensitive
        apply={(sharing, selected) => ({ ...sharing, unitsAvoided: selected })}
      />
      <ShareOnProfile
        label="Share mood streak"
        item="Mood streak"
        on={snap.sharing.moodStreak}
        sensitive
        apply={(sharing, selected) => ({ ...sharing, moodStreak: selected })}
      />
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
      <NutritionShareSwitch
        label="Share today's meals"
        item="Today's meals"
        on={snap.nutrition.shareFoodDiary}
        apply={(settings, selected) => ({ ...settings, shareFoodDiary: selected })}
      />
      <NutritionShareSwitch
        label="Share daily calories and macros"
        item="Daily calories and macros"
        on={snap.nutrition.shareCalories}
        apply={(settings, selected) => ({ ...settings, shareCalories: selected })}
      />
      <NutritionShareSwitch
        label="Share food quality"
        item="Food quality"
        on={snap.nutrition.shareQuality}
        apply={(settings, selected) => ({ ...settings, shareQuality: selected })}
      />
      <NutritionShareSwitch
        label="Share progress and streaks"
        item="Progress and streaks"
        on={snap.nutrition.shareProgress}
        apply={(settings, selected) => ({ ...settings, shareProgress: selected })}
      />
      <NutritionShareSwitch
        label="Share the goal and progress"
        item="The goal and progress"
        on={snap.nutrition.shareGoal}
        apply={(settings, selected) => ({ ...settings, shareGoal: selected })}
      />
      <NutritionShareSwitch
        label="Share the wagon flag"
        item="The wagon flag"
        on={snap.nutrition.wagonVisible}
        apply={(settings, selected) => ({ ...settings, wagonVisible: selected })}
      />
      <ShareOnProfile
        label="Share pinned quote"
        item="Pinned quote"
        on={snap.sharing.pinnedQuote}
        apply={(sharing, selected) => ({ ...sharing, pinnedQuote: selected })}
      />
      {snap.gratitude.map((entry) => (
        <ShareOnProfile
          key={entry.id}
          label={`Share “${entry.body}”`}
          item={entry.body}
          on={snap.sharing.gratitudeIds.includes(entry.id)}
          apply={(sharing, selected) => toggleShareId(sharing, 'gratitudeIds', entry.id, selected)}
        />
      ))}
      {snap.gratitude.flatMap((entry) => entry.photos.map((photo) => (
        <ShareOnProfile
          key={photo.id}
          label={photo.caption.trim() ? `Include photo “${photo.caption.trim()}”` : 'Include photo'}
          item={photo.caption.trim() || 'This gratitude photo'}
          on={snap.sharing.gratitudePhotoIds.includes(photo.id)}
          apply={(sharing, selected) => toggleShareId(sharing, 'gratitudePhotoIds', photo.id, selected)}
        />
      )))}
      {snap.visionItems.map((item, index) => (
        <ShareOnProfile
          key={item.id}
          label={item.caption.trim() ? `Share “${item.caption.trim()}”` : `Share untitled picture ${index + 1}`}
          item={item.caption.trim() || 'This vision caption'}
          on={snap.sharing.visionIds.includes(item.id)}
          apply={(sharing, selected) => toggleShareId(sharing, 'visionIds', item.id, selected)}
        />
      ))}
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
