import { useState } from 'react';

import { useRepository } from '@/data';
import { shownError } from '@/domain/errors';
import {
  LOCATION_PAGE_LINE,
  SKETCH_LINE,
  cravingSketch,
  type OutdoorPoint,
} from '@/domain/outdoorRoute';
import { readWhileUsingFix } from '@/location/whileUsing';
import { FootpathMap } from '@/ui/FootpathMap';
import { MoreInfo } from '@/ui/MoreInfo';
import { OutsideFacts } from '@/ui/WalkThisOff';
import { Button, Card, Choice, ErrorNote, Screen, T } from '@/ui/ui';

const MINUTES = [10, 15, 20] as const;

export default function CravingWalk() {
  const repo = useRepository();
  const [minutes, setMinutes] = useState<(typeof MINUTES)[number]>(15);
  const [here, setHere] = useState<OutdoorPoint | null>(null);
  const [sketch, setSketch] = useState<OutdoorPoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function draw() {
    setError(null);
    const fix = await readWhileUsingFix();
    if (!fix) {
      setError('Location stays off until you allow it while this page is open. Nothing is tracked in the background, and nothing is saved unless you tap Save this sketch.');
      return;
    }
    setHere(fix);
    setSketch(cravingSketch(fix, minutes));
  }

  async function save() {
    setError(null);
    setPending(true);
    try {
      await repo.saveOutdoorRoute({ title: 'Craving walk', kind: 'craving_walk', points: sketch, durationMinutes: minutes });
    } catch (err) {
      setError(shownError(err, 'Could not save that sketch.'));
    } finally {
      setPending(false);
    }
  }

  return (
    <Screen eyebrow="Get Outside" title="Walk this off" intro="A 10 to 20 minute ring, drawn on this phone. No routing service is called.">
      <Card>
        <OutsideFacts />
        <T>{LOCATION_PAGE_LINE}</T>
        <T>{SKETCH_LINE}</T>
        <T variant="label">How long</T>
        {MINUTES.map((value) => (
          <Choice key={value} label={`${value} minutes`} selected={minutes === value} onPress={() => setMinutes(value)} />
        ))}
        <FootpathMap routes={[]} sketch={sketch} here={here} />
        <Button label="Use where I am" onPress={() => { void draw(); }} />
        <Button label="Save this sketch" tone="quiet" disabled={sketch.length < 2 || pending} pending={pending} onPress={() => { void save(); }} />
        <MoreInfo about="this craving walk">
          <T>The ring is a radius around the fix. It does not follow a footpath. A path-following loop needs a router, and that is not in this version.</T>
          <T>Samaritans are on 116 123, day and night. NHS 111 is for urgent medical help that is not a 999 emergency.</T>
        </MoreInfo>
      </Card>
      <ErrorNote>{error}</ErrorNote>
    </Screen>
  );
}
