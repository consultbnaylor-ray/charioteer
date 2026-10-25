/**
 * Route finding is off until this person turns it on.
 * The record lives on this phone (AsyncStorage), not in a database table.
 * Another phone starts off again. Nothing here is shared.
 */

export const ROUTE_CONSENT_VERSION = '2026-10-25';

export const ROUTE_CONSENT_STORAGE_KEY = 'charioteer.route-finding.consent';

export const TURN_ON_ROUTE_FINDING = 'Turn on route finding';

export const NOT_NOW_ROUTE_FINDING = 'Not now';

export const ROUTE_FINDING_SWITCH = 'Route finding';

/** Visible sentences. Not a request to accept OpenStreetMap's terms. */
export const ROUTE_CONSENT_LINES = [
  'The start point and the destination are sent to our route service (OpenRouteService, built on OpenStreetMap data) to make the route.',
  "HeiGIT's privacy policy (April 2022) says the service keeps a request only as long as it needs it, or for a legal retention period. It does not publish a fixed number of days.",
  'Nothing is shared with other people.',
  'Location is used only while the app is open.',
  'You can turn this off any time.',
] as const;

export const ROUTE_CONSENT_CITATION = 'HeiGIT privacy policy, April 2022: https://heigit.org/privacy-policy/';

export const ROUTE_RETENTION_NOTE =
  'A 2021 reply on the OpenRouteService forum said server logs were deleted after 14 days. That number is not in the April 2022 privacy policy, so it is not the retention shown here. The forum software page mentions 90 days for forum logs. That page is the forum, not a route request.';

export const OSM_LICENCE_LINE =
  'OpenStreetMap data is available under the Open Database Licence. The credit names the contributors. This is not a request to accept OpenStreetMap terms.';

export const ROUTE_LICENCE_LINE =
  'A route from the service is under CC-BY-SA 4.0. It stays on your account. It is not sent to other people.';

export const ROUTE_PERSONAL_LINE =
  'A start point can be personal data. HeiGIT terms say not to send personal data except for their own account. This test version sends a start point only after you turn route finding on.';

export const ROUTE_CONSENT_DEVICE_LINE =
  'This choice is stored on this phone only. Another phone starts off. Nothing is shared.';

export const ROUTE_NOT_NOW_LINE =
  'Not now leaves Get Outside, saved routes, and the map working.';

export const OSM_CONTRIBUTORS = '© OpenStreetMap contributors';

export const ORS_CREDIT = '© openrouteservice by HeiGIT | Data from OpenStreetMap';

export type RouteConsentRecord = {
  granted: boolean;
  /** When they last turned it on or off. */
  at: string;
  version: string;
};

export function routeFindingAllowed(record: RouteConsentRecord | null | undefined): boolean {
  return record?.granted === true && record.version === ROUTE_CONSENT_VERSION;
}

export function parseRouteConsent(raw: unknown): RouteConsentRecord | null {
  const value = typeof raw === 'string' ? parseJson(raw) : raw;
  if (!value || typeof value !== 'object') return null;
  const row = value as { granted?: unknown; at?: unknown; version?: unknown };
  if (typeof row.granted !== 'boolean') return null;
  if (typeof row.at !== 'string' || Number.isNaN(Date.parse(row.at))) return null;
  if (typeof row.version !== 'string' || row.version.trim().length === 0) return null;
  return { granted: row.granted, at: row.at, version: row.version };
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
