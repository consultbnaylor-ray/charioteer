import { useState } from 'react';

import { useSnapshot } from '@/data';
import { OUTSIDE_SECTION_LABEL } from '@/domain/outsideSection';
import { type OutdoorPoint } from '@/domain/outdoorRoute';
import { LOCATION_FIX_MESSAGE, LOCATION_FIX_PENDING, readWhileUsingFix } from '@/location/whileUsing';
import { FootpathMap } from '@/ui/FootpathMap';
import { OutsideFooter } from '@/ui/OutsideFooter';
import { SavedRouteCard } from '@/ui/SavedRouteCard';
import { Button, Card, Choice, ErrorNote, Screen, T } from '@/ui/ui';

export default function OutsideMap() {
  const snap = useSnapshot();
  const [here, setHere] = useState<OutdoorPoint | null>(null);
  const [focus, setFocus] = useState(0);
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
      setFocus((value) => value + 1);
      setError(null);
    } finally {
      setLocating(false);
    }
  }

  return (
    <Screen eyebrow={OUTSIDE_SECTION_LABEL} title="Saved routes" intro="Footpaths from OpenStreetMap. A saved line stays on your account.">
      <Card>
        <FootpathMap
          routes={routes}
          sketch={[]}
          here={here}
          locationFocus={focus}
          locating={locating}
          onShowMyLocation={() => { void whereIAm(); }}
        />
        {locating ? (
          <Button label="Where I am" tone="quiet" pending pendingLabel={LOCATION_FIX_PENDING} onPress={() => {}} />
        ) : (
          <Choice label="Where I am" selected={here != null} onPress={() => { void whereIAm(); }} />
        )}
        <T variant="muted">Where I am stays on this page. It does not ask the route service for a line.</T>
      </Card>
      <ErrorNote>{error}</ErrorNote>
      {routes.map((route) => <SavedRouteCard key={route.id} route={route} />)}
      <OutsideFooter kind="full" />
    </Screen>
  );
}
