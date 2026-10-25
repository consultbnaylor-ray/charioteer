import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { useRepository } from '@/data';
import { BUDDY_VIEWER_PRIVATE, buddyShareEmptyMessage, type BuddyShareView } from '@/domain/buddies';
import { Button, T } from '@/ui/ui';

const SHARE_LOAD_ERROR = "Couldn't load what they share. Try again.";

/** The private fields one accepted buddy chose for this viewer. Not the Community profile. */
export function BuddySharePanel({ userId, name }: { userId: string; name: string }) {
  const repo = useRepository();
  const [view, setView] = useState<BuddyShareView | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setView(undefined);
    setFailed(false);
    void repo.sharedBuddyData(userId).then((next) => {
      if (!live) return;
      setView(next);
    }).catch(() => {
      if (!live) return;
      setView(null);
      setFailed(true);
    });
    return () => {
      live = false;
    };
  }, [repo, userId, attempt]);

  if (failed) {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={SHARE_LOAD_ERROR} onPress={() => setAttempt((current) => current + 1)} style={{ minHeight: 44, justifyContent: 'center' }}>
        <T>{SHARE_LOAD_ERROR}</T>
      </Pressable>
    );
  }
  if (view === undefined) return null;
  if (!view) return <T variant="muted">{buddyShareEmptyMessage(name)}</T>;
  return <BuddyShareFacts view={view} />;
}

export function BuddyShareFacts({ view }: { view: BuddyShareView }) {
  return (
    <View style={{ gap: 6 }}>
      <T variant="label">{`What ${view.displayName} shares with you`}</T>
      <T variant="muted">{BUDDY_VIEWER_PRIVATE}</T>
      {view.summary.map((line) => <T key={line}>{line}</T>)}
      {view.meals?.map((meal) => <T key={`${meal.meal}-${meal.detail}`}>{meal.meal}: {meal.detail}</T>)}
      {view.calories ? <T>{view.calories}</T> : null}
      {view.quality ? <T>{view.quality}</T> : null}
      {view.goal ? <T>{view.goal}</T> : null}
      {view.progress ? <T>{view.progress}</T> : null}
      {view.checkIns ? <T>{view.checkIns}</T> : null}
      {view.gratitude?.map((line) => <T key={line}>{line}</T>)}
      {view.vision?.map((line) => <T key={line}>{line}</T>)}
      {view.healthPlan ? (
        <View style={{ gap: 4 }}>
          <T>{view.healthPlan.headline}</T>
          {view.healthPlan.focus.map((item) => <T key={item.text}>{item.done ? 'Done' : 'Still to do'} · {item.text}</T>)}
          <T variant="muted">{view.healthPlan.ticked} of {view.healthPlan.total} ticked</T>
        </View>
      ) : null}
      {view.healthData?.map((line) => <T key={line}>{line}</T>)}
    </View>
  );
}

/** Outlined Profile action for an accepted buddy. Reads that person's private share, not Community. */
export function BuddyShareButton({ userId, name }: { userId: string; name: string }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: 10 }}>
      <Button label={open ? 'Hide profile' : 'Profile'} tone="quiet" onPress={() => setOpen((current) => !current)} />
      {open ? <BuddySharePanel userId={userId} name={name} /> : null}
    </View>
  );
}
