import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { useSnapshot } from '@/data';
import { GOAL_COMPARE_NOTE } from '@/domain/goalCompareNote';
import { GOAL_LABEL } from '@/domain/nutrition';
import { goalCompareNoteSeen, markGoalCompareNoteSeen } from '@/ui/goalCompareNoteStore';
import { useAppTheme } from '@/ui/theme';
import { T } from '@/ui/ui';

/**
 * Names the saved goal and links to the goal picker.
 * The one-line note appears on the first view, then stays quiet.
 */
export function GoalLine({ note = true }: { note?: boolean }) {
  const snap = useSnapshot();
  const router = useRouter();
  const theme = useAppTheme();
  const goal = snap.nutrition?.goal ?? null;
  const name = goal ? GOAL_LABEL[goal] : null;
  const userId = snap.session?.userId ?? '';
  const [showNote, setShowNote] = useState(false);

  useEffect(() => {
    if (!note || !name || !userId) return undefined;
    let live = true;
    void (async () => {
      const seen = await goalCompareNoteSeen(userId);
      if (!live || seen) return;
      setShowNote(true);
      await markGoalCompareNoteSeen(userId);
    })();
    return () => {
      live = false;
    };
  }, [note, name, userId]);

  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <T style={{ flex: 1, fontFamily: theme.font.bodyStrong }}>
          {name ? `Your goal: ${name}` : 'Choose a goal'}
        </T>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Change goal"
          onPress={() => router.push('/nutrition?section=goal' as never)}
          style={{ minHeight: 44, justifyContent: 'center' }}
        >
          <T style={{ textDecorationLine: 'underline' }}>Change</T>
        </Pressable>
      </View>
      {showNote ? <T variant="muted">{GOAL_COMPARE_NOTE}</T> : null}
    </View>
  );
}
