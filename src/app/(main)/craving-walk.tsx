import { Redirect, useRouter } from 'expo-router';

import { OUTSIDE_SECTION_LABEL, SHOW_WALK_THIS_OFF } from '@/domain/outsideSection';
import { RouteConsentCard } from '@/ui/RouteConsentCard';
import { RouteMaker } from '@/ui/RouteMaker';
import { useRouteConsent } from '@/ui/useRouteConsent';
import { OutsideFooter } from '@/ui/OutsideFooter';
import { Card, Screen, T } from '@/ui/ui';

export default function CravingWalk() {
  if (!SHOW_WALK_THIS_OFF) return <Redirect href="/outside" />;
  return <CravingWalkScreen />;
}

function CravingWalkScreen() {
  const router = useRouter();
  const consent = useRouteConsent();

  return (
    <Screen eyebrow={OUTSIDE_SECTION_LABEL} title="Walk this off" intro="A 10 to 20 minute loop.">
      {!consent.ready ? <Card><T>Checking route finding.</T></Card> : null}
      {consent.ready && !consent.allowed ? (
        <RouteConsentCard onNotNow={() => router.replace('/outside' as never)} />
      ) : null}
      {consent.allowed ? <RouteMaker purpose="craving" /> : null}
      <OutsideFooter kind="full" />
    </Screen>
  );
}
