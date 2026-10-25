import { useState } from 'react';

import { useRepository, useSnapshot } from '@/data';
import { shownError } from '@/domain/errors';
import { routeKindLabel, routeSummary, type OutdoorPoint } from '@/domain/outdoorRoute';
import { LOCATION_FIX_MESSAGE, LOCATION_FIX_PENDING, readWhileUsingFix } from '@/location/whileUsing';
import { FootpathMap } from '@/ui/FootpathMap';
import { OutsideFooter } from '@/ui/OutsideFooter';
import { Button, Card, Choice, ErrorNote, Screen, T } from '@/ui/ui';

export default function OutsideMap() {
  const snap = useSnapshot();
  const repo = useRepository();
  const [here, setHere] = useState<OutdoorPoint | null>(null);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const routes = snap.outdoorRoutes ?? [];

  async function whereIAm() {
    setError(null);
    setLocating(true);
    try {
      const fix = await readWhileUsingFix();
      if (!fix.ok) {
        setError(LOCATION_FIX_MESSAGE);
        return;
      }
      setHere(fix.point);
      setError(null);
    } finally {
      setLocating(false);
    }
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
        {locating ? (
          <Button label="Where I am" tone="quiet" pending pendingLabel={LOCATION_FIX_PENDING} onPress={() => {}} />
        ) : (
          <Choice label="Where I am" selected={here != null} onPress={() => { void whereIAm(); }} />
        )}
        <T variant="muted">Where I am stays on this page. It does not ask the route service for a line.</T>
      </Card>
      <ErrorNote>{error}</ErrorNote>
      {routes.map((route) => (
        <Card key={route.id}>
          <T variant="title">{route.title}</T>
          <T variant="muted">{routeKindLabel(route.kind)} · {routeSummary(route)}</T>
          <Button label="Delete" tone="quiet" accessibilityLabel={`Delete ${route.title}`} onPress={() => { void remove(route.id); }} />
        </Card>
      ))}
      <OutsideFooter kind="full" />
    </Screen>
  );
}
