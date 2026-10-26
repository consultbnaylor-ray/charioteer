import { useState } from 'react';

import { grantRouteFinding } from '@/data/routeConsentStore';
import {
  NOT_NOW_ROUTE_FINDING,
  ROUTE_NOT_NOW_LINE,
  TURN_ON_ROUTE_FINDING,
} from '@/domain/routeConsent';
import { RouteServiceNotice } from '@/ui/RouteServiceNotice';
import { Button, Card, T } from '@/ui/ui';

/** The first screen for Find a route. It does not call the route service. Walk this off is parked. */
export function RouteConsentCard({ onNotNow }: { onNotNow: () => void }) {
  const [pending, setPending] = useState(false);

  async function turnOn() {
    setPending(true);
    try {
      await grantRouteFinding();
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <T variant="title">Route finding is off</T>
      <RouteServiceNotice />
      <T>{ROUTE_NOT_NOW_LINE}</T>
      <Button label={TURN_ON_ROUTE_FINDING} pending={pending} onPress={() => { void turnOn(); }} />
      <Button label={NOT_NOW_ROUTE_FINDING} tone="quiet" onPress={onNotNow} />
    </Card>
  );
}
