import { Switch, View } from 'react-native';

import { grantRouteFinding, withdrawRouteFinding } from '@/data/routeConsentStore';
import { formatUkCompactWhen } from '@/domain/dates';
import {
  ORS_CREDIT,
  OSM_CONTRIBUTORS,
  ROUTE_CONSENT_LINES,
  ROUTE_CONSENT_VERSION,
  ROUTE_FINDING_SWITCH,
} from '@/domain/routeConsent';
import { useRouteConsent } from '@/ui/useRouteConsent';
import { useAppTheme } from '@/ui/theme';
import { Card, T } from '@/ui/ui';

function statusLine(allowed: boolean, at: string | null, version: string | null): string {
  if (!at) return 'Off. Nothing is stored until you choose.';
  const when = formatUkCompactWhen(at);
  if (allowed) return `On since ${when}. Stored on this phone only. Wording ${version}.`;
  if (version && version !== ROUTE_CONSENT_VERSION) {
    return `Off. The wording changed (${ROUTE_CONSENT_VERSION}). Turn it on again if you still want route finding. Stored on this phone only.`;
  }
  return `Off since ${when}. Stored on this phone only.`;
}

/** The same wording as the consent screen. Turning it on is the opt-in. Turning it off stops route calls. */
export function RouteFindingSwitch() {
  const theme = useAppTheme();
  const { ready, record, allowed } = useRouteConsent();

  return (
    <Card>
      <T variant="label">Route finding</T>
      {ROUTE_CONSENT_LINES.map((line) => <T key={line}>{line}</T>)}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
        <T style={{ flex: 1 }}>{ROUTE_FINDING_SWITCH}</T>
        <Switch
          accessibilityLabel={ROUTE_FINDING_SWITCH}
          value={allowed}
          disabled={!ready}
          onValueChange={(value) => {
            void (value ? grantRouteFinding() : withdrawRouteFinding());
          }}
          trackColor={{ true: theme.colors.ink, false: theme.colors.line }}
          thumbColor={theme.colors.surface}
        />
      </View>
      <T variant="muted">{ready ? statusLine(allowed, record?.at ?? null, record?.version ?? null) : 'Checking this phone.'}</T>
      <T variant="muted">{OSM_CONTRIBUTORS}</T>
      <T variant="muted">{ORS_CREDIT}</T>
    </Card>
  );
}
