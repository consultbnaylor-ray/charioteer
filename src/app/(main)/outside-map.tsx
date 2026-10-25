import { useState } from 'react';

import { useRepository, useSnapshot } from '@/data';
import { shownError } from '@/domain/errors';
import { LOCATION_PAGE_LINE, PATH_LINE, routeKindLabel, routeSummary, type OutdoorPoint } from '@/domain/outdoorRoute';
import { readWhileUsingFix } from '@/location/whileUsing';
import { FootpathMap } from '@/ui/FootpathMap';
import { MoreInfo } from '@/ui/MoreInfo';
import { OutsideFacts } from '@/ui/WalkThisOff';
import { Button, Card, ErrorNote, Screen, T } from '@/ui/ui';

export default function OutsideMap() {
  const snap = useSnapshot();
  const repo = useRepository();
  const [here, setHere] = useState<OutdoorPoint | null>(null);
  const [error, setError] = useState<string | null>(null);
  const routes = snap.outdoorRoutes ?? [];

  async function whereIAm() {
    setError(null);
    const fix = await readWhileUsingFix();
    if (!fix) {
      setError('Location stays off until you allow it while this page is open. Saved routes still open. Nothing is tracked in the background.');
      return;
    }
    setHere(fix);
  }

  async function remove(id: string) {
    setError(null);
    try {
      await repo.deleteOutdoorRoute(id);
    } catch (err) {
      setError(shownError(err, 'Could not delete that route.'));
    }
  }

  return (
    <Screen eyebrow="Get Outside" title="Saved routes" intro="Footpaths from OpenStreetMap. A saved line stays on your account.">
      <Card>
        <FootpathMap routes={routes} sketch={[]} here={here} />
        <T>{LOCATION_PAGE_LINE}</T>
        <OutsideFacts />
        <Button label="Where I am" onPress={() => { void whereIAm(); }} />
        <T variant="muted">Where I am stays on this page. It does not ask the route service for a line.</T>
        <MoreInfo about="the map">
          <T>{PATH_LINE}</T>
        </MoreInfo>
      </Card>
      <ErrorNote>{error}</ErrorNote>
      {routes.map((route) => (
        <Card key={route.id}>
          <T variant="title">{route.title}</T>
          <T variant="muted">{routeKindLabel(route.kind)} · {routeSummary(route)}</T>
          <Button label="Delete" tone="quiet" accessibilityLabel={`Delete ${route.title}`} onPress={() => { void remove(route.id); }} />
        </Card>
      ))}
    </Screen>
  );
}
