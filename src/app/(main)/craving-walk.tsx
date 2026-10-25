import { useRouter } from 'expo-router';

import { RouteConsentCard } from '@/ui/RouteConsentCard';
import { RouteMaker } from '@/ui/RouteMaker';
import { useRouteConsent } from '@/ui/useRouteConsent';
import { OutsideFacts } from '@/ui/WalkThisOff';
import { Card, Screen, T } from '@/ui/ui';

export default function CravingWalk() {
  const router = useRouter();
  const consent = useRouteConsent();

  return (
    <Screen eyebrow="Get Outside" title="Walk this off" intro="A 10 to 20 minute loop. Route finding stays off until you turn it on.">
      <Card>
        <OutsideFacts />
      </Card>
      {!consent.ready ? <Card><T>Checking route finding.</T></Card> : null}
      {consent.ready && !consent.allowed ? (
        <RouteConsentCard onNotNow={() => router.replace('/outside' as never)} />
      ) : null}
      {consent.allowed ? <RouteMaker purpose="craving" /> : null}
    </Screen>
  );
}
