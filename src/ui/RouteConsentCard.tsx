import { useState } from 'react';

import { grantRouteFinding } from '@/data/routeConsentStore';
import {
  NOT_NOW_ROUTE_FINDING,
  OSM_CONTRIBUTORS,
  OSM_LICENCE_LINE,
  ORS_CREDIT,
  ROUTE_CONSENT_CITATION,
  ROUTE_CONSENT_DEVICE_LINE,
  ROUTE_CONSENT_LINES,
  ROUTE_LICENCE_LINE,
  ROUTE_NOT_NOW_LINE,
  ROUTE_PERSONAL_LINE,
  ROUTE_RETENTION_NOTE,
  TURN_ON_ROUTE_FINDING,
} from '@/domain/routeConsent';
import { MoreInfo } from '@/ui/MoreInfo';
import { Button, Card, T } from '@/ui/ui';

/** The first screen for Find a route and the craving walk. It does not call the route service. */
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
      {ROUTE_CONSENT_LINES.map((line) => <T key={line}>{line}</T>)}
      <T variant="muted">{ROUTE_CONSENT_CITATION}</T>
      <T variant="muted">{ROUTE_CONSENT_DEVICE_LINE}</T>
      <T variant="muted">{OSM_CONTRIBUTORS}</T>
      <T variant="muted">{ORS_CREDIT}</T>
      <T>{ROUTE_NOT_NOW_LINE}</T>
      <Button label={TURN_ON_ROUTE_FINDING} pending={pending} onPress={() => { void turnOn(); }} />
      <Button label={NOT_NOW_ROUTE_FINDING} tone="quiet" onPress={onNotNow} />
      <MoreInfo about="route finding">
        <T>{OSM_LICENCE_LINE}</T>
        <T>{ROUTE_LICENCE_LINE}</T>
        <T>{ROUTE_PERSONAL_LINE}</T>
        <T>{ROUTE_RETENTION_NOTE}</T>
      </MoreInfo>
    </Card>
  );
}
