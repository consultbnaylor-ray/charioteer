import { useRouter } from 'expo-router';
import { useState } from 'react';

import { useRepository, useSnapshot } from '@/data';
import {
  LOCATION_PAGE_LINE,
  PATH_LINE,
  routeSummary,
} from '@/domain/outdoorRoute';
import { shownError } from '@/domain/errors';
import { MoreInfo } from '@/ui/MoreInfo';
import { OutsideFacts } from '@/ui/WalkThisOff';
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
    <Screen eyebrow="Tools" title="Get Outside" intro="A walk from the menu. The six tabs stay as they are.">
      <Card>
        <OutsideFacts />
        <T>{LOCATION_PAGE_LINE}</T>
        <Button label="Walk this off" onPress={() => router.push('/craving-walk' as never)} />
        <Button label="Open the map" tone="quiet" onPress={() => router.push('/outside-map' as never)} />
        <MoreInfo about="Get Outside">
          <T>{PATH_LINE}</T>
          <T>Footpaths come from OpenStreetMap, drawn with OpenFreeMap. The credit stays on the map.</T>
          <T>This is not a crisis service. Help and crisis lines stay in the menu.</T>
        </MoreInfo>
      </Card>
      <ErrorNote>{error}</ErrorNote>
      <Card>
        <T variant="label">Saved routes</T>
        {routes.length === 0 ? <T>Nothing saved yet. A route stays on your account, and you can delete it.</T> : null}
        {routes.map((route) => (
          <Card key={route.id}>
            <T variant="title">{route.title}</T>
            <T variant="muted">{route.kind === 'craving_walk' ? 'Craving sketch' : 'Drawn route'} · {routeSummary(route)}</T>
            <Button
              label="Delete"
              tone="quiet"
              accessibilityLabel={`Delete ${route.title}`}
              onPress={() => { void remove(route.id); }}
            />
          </Card>
        ))}
      </Card>
    </Screen>
  );
}
