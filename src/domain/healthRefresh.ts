import { formatUkTime } from '@/domain/dates';

/** Ignore another press until this long after the last one started. */
export const HEALTH_REFRESH_COOLDOWN_MS = 60_000;

/** A HealthKit read inside this window gets the green tick. */
export const APPLE_CHECK_FRESH_MS = 15 * 60 * 1000;

export const REFRESH_APPLE = 'Refresh Apple Health';

export const REFRESH_BOTH = '↻ Refresh Apple Health & Garmin';

export const REFRESH_UPDATED = 'Updated';

export const REFRESH_FAILED = "Couldn't refresh just now. Try again in a minute.";

export const GARMIN_ASKED =
  'Asked Garmin for your latest data — it can take a minute or two to arrive';

export const GARMIN_RECENT =
  'Garmin was asked recently. New data can take a minute or two to arrive.';

export const GARMIN_PERMISSION =
  "Garmin hasn't given Charioteer permission yet. In Garmin Connect, open Charioteer under connected apps, turn on Activities and Daily Health Stats, then disconnect and reconnect Garmin here. Automatic syncing still works once those are on.";

export const SYNC_REFRESH = 'Refresh';

export const GARMIN_WAITING = 'Garmin: waiting for first data';

/** Always shown under the status line while Garmin is connected. */
export const GARMIN_DATA_HINT = 'New Garmin data arrives after your watch syncs with Garmin Connect.';

/** Calm note when catch-up is refused. Not a failure. */
export const GARMIN_HISTORY_NOTE = 'Garmin sends new data automatically after your watch syncs with Garmin Connect.';

export function refreshButtonLabel(garminConnected: boolean): string {
  return garminConnected ? REFRESH_BOTH : REFRESH_APPLE;
}

export function refreshCooling(startedAt: number | null, now: number, cooldown = HEALTH_REFRESH_COOLDOWN_MS): boolean {
  if (startedAt == null) return false;
  return now - startedAt < cooldown;
}

/** `21:48`, or null when the clock is missing. */
export function syncClock(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return formatUkTime(date);
}

/** True when the last HealthKit read is inside the fresh window. */
export function appleCheckIsFresh(iso: string | null, now: number, windowMs = APPLE_CHECK_FRESH_MS): boolean {
  if (!iso) return false;
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return false;
  return now - at >= 0 && now - at < windowMs;
}

/**
 * Names the last Apple check and, when Garmin is connected, the last push.
 * It does not claim the figures are complete.
 */
export function syncStatusText(input: {
  appleCheckedAt: string | null;
  garminConnected: boolean;
  garminReceivedAt: string | null;
}): string {
  const apple = syncClock(input.appleCheckedAt);
  const applePart = apple ? `Apple Health checked ${apple}` : 'Apple Health not checked yet';
  if (!input.garminConnected) return applePart;
  const garmin = syncClock(input.garminReceivedAt);
  const garminPart = garmin ? `Garmin data received ${garmin}` : GARMIN_WAITING;
  return `${applePart} · ${garminPart}`;
}

/** The outlined Refresh control. A fresh Apple check with no error hides it. */
export function syncStatusShowsRefresh(input: { appleCheckedAt: string | null; now: number; error: boolean }): boolean {
  return input.error || !appleCheckIsFresh(input.appleCheckedAt, input.now);
}

/** A Garmin refresh body. `data` wins. A non-2xx response leaves the JSON on `error.context`. */
export async function readGarminRefreshBody(
  data: unknown,
  error: { context?: { json?: () => Promise<unknown> } } | null,
): Promise<Record<string, unknown> | null> {
  const direct = asRefreshRecord(data);
  if (direct) return direct;
  const json = error?.context?.json;
  if (typeof json !== 'function') return null;
  try {
    return asRefreshRecord(await json());
  } catch {
    return null;
  }
}

function asRefreshRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** `Last updated 21:04`. A missing clock stays a named blank. */
export function lastUpdatedLine(iso: string | null): string {
  if (!iso) return 'Last updated —';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Last updated —';
  const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `Last updated ${time}`;
}
