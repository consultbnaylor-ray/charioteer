/**
 * Route finding is off until this person turns it on.
 * The record lives on this phone (AsyncStorage), not in a database table.
 * Another phone starts off again. Nothing here is shared.
 */

export const ROUTE_CONSENT_VERSION = '2026-10-26-1';

export const ROUTE_CONSENT_STORAGE_KEY = 'charioteer.route-finding.consent';

export const TURN_ON_ROUTE_FINDING = 'Turn on route finding';

export const NOT_NOW_ROUTE_FINDING = 'Not now';

export const ROUTE_FINDING_SWITCH = 'Route finding';

/** A route call. A place search is named in the same sentence so the limit is not overstated. */
export const ROUTE_SEND_LINE =
  "A route sends the coordinates and the travel type only. It does not send your name or account number. HeiGIT sees our server's address, not your phone's. A place search sends the words you type.";

/**
 * Verified 25 Oct 2026 at https://account.heigit.org/info/transparency-statement
 * The statement says it is voluntary and non-binding. Two decimal places is their example.
 */
export const ROUTE_RETENTION_LINE =
  "HeiGIT's transparency statement says the full request and response, the IP address, and the API key are kept for 7 days to look for abuse, then deleted. For a route, coordinates rounded to about 1 km, and the request metadata, are kept with no end date. This is done on servers in the EU. The statement is voluntary and not a binding promise.";

/** Visible sentences. Not a request to accept OpenStreetMap's terms. */
export const ROUTE_CONSENT_LINES = [
  'The start point, the destination, and any points you add on the map are sent to our route service (OpenRouteService, built on OpenStreetMap data) to make the route.',
  ROUTE_SEND_LINE,
  ROUTE_RETENTION_LINE,
  'Nothing is shared with other people.',
  'Location is used only while the app is open.',
  'You can turn this off any time.',
] as const;

export const ROUTE_CONSENT_CITATION =
  'HeiGIT transparency statement: https://account.heigit.org/info/transparency-statement';

export const ROUTE_RETENTION_NOTE =
  'The April 2022 privacy policy (https://heigit.org/privacy-policy/) says personal data is kept only as long as needed. It does not give these day counts. The 7 days, the coordinates kept after rounding to two decimal places, and the EU servers are in the transparency statement. That statement says it is voluntary and not a binding promise. The terms (https://account.heigit.org/info/tos) do not restate the 7 days. A place search is geocoding. The same statement says the typed place and its coordinate are not kept past those 7 days.';

export const OSM_LICENCE_LINE =
  'OpenStreetMap data is available under the Open Database Licence. The credit names the contributors. This is not a request to accept OpenStreetMap terms.';

export const ROUTE_LICENCE_LINE =
  'A route from the service is under CC-BY-SA 4.0. It stays on your account. It is not sent to other people.';

export const ROUTE_PERSONAL_LINE =
  'A start point can be personal data. HeiGIT terms say not to send personal data except for their own account. This test version sends a start point only after you turn route finding on.';

export const ROUTE_CONSENT_DEVICE_LINE =
  'This choice is stored on this phone only. Another phone starts off. Nothing is shared.';

export const ROUTE_NOT_NOW_LINE =
  'Not now leaves Outside is Good, saved routes, and the map working.';

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
