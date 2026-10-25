import { useState } from 'react';

import { useRepository, useSnapshot } from '@/data';
import { shownError } from '@/domain/errors';
import {
  LOCATION_PAGE_LINE,
  PATH_LINE,
  SKETCH_LINE,
  type OutdoorPoint,
} from '@/domain/outdoorRoute';
import { readWhileUsingFix } from '@/location/whileUsing';
import { FootpathMap } from '@/ui/FootpathMap';
import { MoreInfo } from '@/ui/MoreInfo';
import { OutsideFacts } from '@/ui/WalkThisOff';
import { Button, Card, ErrorNote, Field, Screen, T } from '@/ui/ui';

export default function OutsideMap() {
  const snap = useSnapshot();
  const repo = useRepository();
  const [here, setHere] = useState<OutdoorPoint | null>(null);
  const [line, setLine] = useState<OutdoorPoint[]>([]);
  const [title, setTitle] = useState('My walk');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const routes = snap.outdoorRoutes ?? [];

  async function whereIAm() {
    setError(null);
    const fix = await readWhileUsingFix();
    if (!fix) {
      setError('Location stays off until you allow it while this page is open. Saved routes still open. Nothing is tracked in the background.');
      return;
    }
    setHere(fix);
    setLine((current) => [...current, fix].slice(-64));
  }

  async function save() {
    setError(null);
    setPending(true);
    try {
      await repo.saveOutdoorRoute({ title, kind: 'drawn', points: line });
      setLine([]);
    } catch (err) {
      setError(shownError(err, 'Could not save that route.'));
    } finally {
      setPending(false);
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
    <Screen eyebrow="Get Outside" title="The map" intro="Footpaths from OpenStreetMap. A saved line stays on your account.">
      <Card>
        <FootpathMap routes={routes} sketch={line} here={here} />
        <T>{LOCATION_PAGE_LINE}</T>
        <OutsideFacts />
        <Button label="Where I am" onPress={() => { void whereIAm(); }} />
        <T variant="muted">Each tap adds a point while this page is open. {line.length === 0 ? 'No new line yet.' : `${line.length} points on this line.`}</T>
        <Field label="Route name" value={title} onChangeText={setTitle} maxLength={80} />
        <Button label="Save this line" tone="quiet" disabled={line.length < 2 || pending} pending={pending} onPress={() => { void save(); }} />
        <MoreInfo about="the map">
          <T>{PATH_LINE}</T>
          <T>{SKETCH_LINE}</T>
        </MoreInfo>
      </Card>
      <ErrorNote>{error}</ErrorNote>
      {routes.map((route) => (
        <Card key={route.id}>
          <T variant="title">{route.title}</T>
          <Button label="Delete" tone="quiet" accessibilityLabel={`Delete ${route.title}`} onPress={() => { void remove(route.id); }} />
        </Card>
      ))}
    </Screen>
  );
}
