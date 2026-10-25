import { useRouter } from 'expo-router';
import { useState } from 'react';

import { useRepository, useSnapshot } from '@/data';
import {
  routeKindLabel,
  routeSummary,
} from '@/domain/outdoorRoute';
import { shownError } from '@/domain/errors';
import { OUTSIDE_SECTION_LABEL, SHOW_WALK_THIS_OFF } from '@/domain/outsideSection';
import { OutsideFooter } from '@/ui/OutsideFooter';
import { Button, Card, ErrorNote, Screen, T } from '@/ui/ui';

export default function Outside() {
  const snap = useSnapshot();
  const repo = useRepository();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const routes = snap.outdoorRoutes ?? [];

  async function remove(id: string) {
    setError(null);
    try {
      await repo.deleteOutdoorRoute(id);
    } catch (err) {
      setError(shownError(err, 'Could not delete that route.'));
    }
  }

  return (
    <Screen eyebrow="Tools" title={OUTSIDE_SECTION_LABEL} intro="A walk from the menu.">
      <Card>
        <Button label="Find a route" onPress={() => router.push('/find-route' as never)} />
        {SHOW_WALK_THIS_OFF ? (
          <Button label="Walk this off" tone="quiet" onPress={() => router.push('/craving-walk' as never)} />
        ) : null}
        <Button label="Open the map" tone="quiet" onPress={() => router.push('/outside-map' as never)} />
        <T variant="muted">Footpaths come from OpenStreetMap, drawn with OpenFreeMap. The credit stays on the map.</T>
      </Card>
      <ErrorNote>{error}</ErrorNote>
      <Card>
        <T variant="label">Saved routes</T>
        {routes.length === 0 ? <T>Nothing saved yet. A route stays on your account, and you can delete it.</T> : null}
        {routes.map((route) => (
          <Card key={route.id}>
            <T variant="title">{route.title}</T>
            <T variant="muted">{routeKindLabel(route.kind)} · {routeSummary(route)}</T>
            <Button
              label="Delete"
              tone="quiet"
              accessibilityLabel={`Delete ${route.title}`}
              onPress={() => { void remove(route.id); }}
            />
          </Card>
        ))}
      </Card>
      <OutsideFooter kind="full" />
    </Screen>
  );
}
