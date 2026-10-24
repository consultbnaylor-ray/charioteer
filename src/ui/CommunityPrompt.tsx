import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { COMMUNITY_PROMPT_BODY } from '@/ui/ConsentChoices';
import { communityPromptHidden, snoozeCommunityPrompt } from '@/ui/communityPromptStore';
import { Button, Card, T } from '@/ui/ui';

/** A quiet note on People when this person has left Community off. */
export function CommunityPrompt({ userId, visible }: { userId: string; visible: boolean }) {
  const router = useRouter();
  const [snoozed, setSnoozed] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let live = true;
    void communityPromptHidden(userId).then((hidden) => {
      if (!live) return;
      setSnoozed(hidden);
      setReady(true);
    });
    return () => {
      live = false;
    };
  }, [userId]);

  if (!visible || !ready || snoozed) return null;

  return (
    <Card>
      <T variant="label">Community</T>
      <T>{COMMUNITY_PROMPT_BODY}</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Button label="Turn on Community" tone="quiet" onPress={() => router.push('/privacy' as never)} />
        <Button
          label="Not now"
          tone="quiet"
          onPress={() => {
            setSnoozed(true);
            void snoozeCommunityPrompt(userId);
          }}
        />
      </View>
    </Card>
  );
}
