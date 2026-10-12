import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { useSnapshot } from '@/data';
import { PROFILE_HIDDEN_SHARE, SHARE_HINT } from '@/domain/profileSharing';
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
      intro="Each section below has one switch. Lines, photos, and health averages are chosen on their own screens."
    >
      <T variant="muted">{communityOn ? SHARE_HINT : PROFILE_HIDDEN_SHARE}</T>
      <T>Name and interests stay on your profile while Community is on.</T>
      <ShareOnProfile
        label="Share bio"
        on={snap.sharing.bio}
        apply={(sharing, selected) => ({ ...sharing, bio: selected })}
      />
      <ShareOnProfile
        label="Share town"
        on={snap.sharing.town}
        apply={(sharing, selected) => ({ ...sharing, town: selected })}
      />
      <ShareOnProfile
        label="Share stage"
        on={snap.sharing.stage}
        sensitive
        apply={(sharing, selected) => ({ ...sharing, stage: selected })}
      />
      <ShareOnProfile
        label="Share days sober and milestones"
        on={snap.sharing.sober}
        sensitive
        apply={(sharing, selected) => ({ ...sharing, sober: selected })}
      />
      <ShareOnProfile
        label="Share money saved and units avoided"
        on={snap.sharing.savings}
        sensitive
        apply={(sharing, selected) => ({ ...sharing, savings: selected })}
      />
      <ShareOnProfile
        label="Share mood streak"
        on={snap.sharing.moodStreak}
        sensitive
        apply={(sharing, selected) => ({ ...sharing, moodStreak: selected })}
      />
      <ShareOnProfile
        label="Share pinned quote"
        on={snap.sharing.pinnedQuote}
        apply={(sharing, selected) => ({ ...sharing, pinnedQuote: selected })}
      />
      <T variant="label">On the section screen</T>
      <T>Each reason, each health average, each gratitude line and photo, each vision caption, and each progress photo has its own labelled switch there.</T>
      <View style={{ gap: 8 }}>
        <Button label="Health Stats" tone="quiet" onPress={() => router.push('/health' as never)} />
        <Button label="You" tone="quiet" onPress={() => router.push('/profile' as never)} />
        <Button label="Gratitude Diary" tone="quiet" onPress={() => router.push('/gratitude' as never)} />
        <Button label="Vision Board" tone="quiet" onPress={() => router.push('/vision' as never)} />
        <Button label="Progress photos" tone="quiet" onPress={() => router.push('/photos' as never)} />
      </View>
    </Screen>
  );
}
