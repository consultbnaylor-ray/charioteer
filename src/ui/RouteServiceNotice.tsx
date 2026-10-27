import {
  OSM_CONTRIBUTORS,
  OSM_LICENCE_LINE,
  ORS_CREDIT,
  ROUTE_CONSENT_CITATION,
  ROUTE_CONSENT_DEVICE_LINE,
  ROUTE_CONSENT_LINES,
  ROUTE_LICENCE_LINE,
  ROUTE_PERSONAL_LINE,
  ROUTE_RETENTION_NOTE,
} from '@/domain/routeConsent';
import { MoreInfo } from '@/ui/MoreInfo';
import { T } from '@/ui/ui';

/** The route-service sentences. The first line and the off line stay in view. */
export function RouteServiceNotice() {
  return (
    <>
      <T>{ROUTE_CONSENT_LINES[0]}</T>
      <MoreInfo about="route finding">
        {ROUTE_CONSENT_LINES.slice(1, -1).map((line) => (
          <T key={line}>{line}</T>
        ))}
        <T variant="muted">{ROUTE_CONSENT_CITATION}</T>
        <T variant="muted">{ROUTE_CONSENT_DEVICE_LINE}</T>
        <T variant="muted">{OSM_CONTRIBUTORS}</T>
        <T variant="muted">{ORS_CREDIT}</T>
        <T>{OSM_LICENCE_LINE}</T>
        <T>{ROUTE_LICENCE_LINE}</T>
        <T>{ROUTE_PERSONAL_LINE}</T>
        <T>{ROUTE_RETENTION_NOTE}</T>
      </MoreInfo>
      <T>{ROUTE_CONSENT_LINES[ROUTE_CONSENT_LINES.length - 1]}</T>
    </>
  );
}
