import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';

import { deleteActivitySummary, loadActivitySummaries } from '@/activity/summaries';
import { useSnapshot } from '@/data';
import {
  SUMMARIES_HINT,
  activityWord,
  clock,
  distanceLabel,
  type ActivitySummary,
} from '@/domain/activitySession';
import { shownError } from '@/domain/errors';
import { OUTSIDE_SECTION_LABEL, SHOW_WALK_THIS_OFF } from '@/domain/outsideSection';
import { OutsideFooter } from '@/ui/OutsideFooter';
import { OutingInProgressBanner } from '@/ui/OutingInProgressBanner';
import { SavedRouteCard } from '@/ui/SavedRouteCard';
import { Button, Card, ErrorNote, Screen, T } from '@/ui/ui';

export default function Outside() {
  const snap = useSnapshot();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [outings, setOutings] = useState<ActivitySummary[]>([]);
  const routes = snap.outdoorRoutes ?? [];

  const refreshOutings = useCallback(() => {
    void loadActivitySummaries().then(setOutings).catch(() => setOutings([]));
  }, []);

  useFocusEffect(refreshOutings);

  async function removeOuting(id: string) {
    setError(null);
    try {
      await deleteActivitySummary(id);
      refreshOutings();
    } catch (err) {
      setError(shownError(err, 'Could not delete that outing.'));
    }
  }

  return (
    <Screen eyebrow="Tools" title={OUTSIDE_SECTION_LABEL} intro="A walk from the menu.">
      <OutingInProgressBanner />
      <Card>
        <Button label="Find a route" onPress={() => router.push('/find-route' as never)} />
        <Button label="Start a walk" onPress={() => router.push('/activity?kind=walk' as never)} />
        <Button label="Start a run" onPress={() => router.push('/activity?kind=run' as never)} />
        <Button label="Start a cycle" onPress={() => router.push('/activity?kind=cycle' as never)} />
        {SHOW_WALK_THIS_OFF ? (
          <Button label="Walk this off" tone="quiet" onPress={() => router.push('/craving-walk' as never)} />
        ) : null}
        <Button label="Open the map" tone="quiet" onPress={() => router.push('/outside-map' as never)} />
        <T variant="muted">Footpaths come from OpenStreetMap, drawn with OpenFreeMap. The credit stays on the map.</T>
      </Card>
      <ErrorNote>{error}</ErrorNote>
      {outings.length > 0 ? (
        <Card>
          <T variant="label">On this phone</T>
          <T variant="muted">{SUMMARIES_HINT}</T>
          {outings.map((outing) => (
            <Card key={outing.id}>
              <T variant="title">{activityWord(outing.activity)}</T>
              <T variant="muted">{outing.date} · {distanceLabel(outing.distanceM)} · {clock(outing.movingMs)}</T>
              <Button
                label="Delete"
                tone="quiet"
                accessibilityLabel={`Delete ${activityWord(outing.activity)} ${outing.date}`}
                onPress={() => { void removeOuting(outing.id); }}
              />
            </Card>
          ))}
        </Card>
      ) : null}
      <Card>
        <T variant="label">Saved routes</T>
        {routes.length === 0 ? <T>Nothing saved yet. A route stays on your account, and you can delete it.</T> : null}
        {routes.map((route) => <SavedRouteCard key={route.id} route={route} />)}
      </Card>
      <OutsideFooter kind="full" />
    </Screen>
  );
}
