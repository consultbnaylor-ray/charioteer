import { useRouter } from 'expo-router';

import { OUTSIDE_SECTION_LABEL } from '@/domain/outsideSection';
import { RouteConsentCard } from '@/ui/RouteConsentCard';
import { RouteMaker } from '@/ui/RouteMaker';
import { useRouteConsent } from '@/ui/useRouteConsent';
import { OutsideFooter } from '@/ui/OutsideFooter';
import { Card, Screen, T } from '@/ui/ui';

export default function FindRoute() {
  const router = useRouter();
  const consent = useRouteConsent();

  return (
    <Screen eyebrow={OUTSIDE_SECTION_LABEL} title="Find a route" intro="A loop or a point-to-point line.">
      {!consent.ready ? <Card><T>Checking route finding.</T></Card> : null}
      {consent.ready && !consent.allowed ? (
        <RouteConsentCard onNotNow={() => router.replace('/outside' as never)} />
      ) : null}
      {consent.allowed ? <RouteMaker purpose="find" /> : null}
      <OutsideFooter kind="short" />
    </Screen>
  );
}
