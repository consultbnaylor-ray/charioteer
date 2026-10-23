/** Ignore another press until this long after the last one started. */
export const HEALTH_REFRESH_COOLDOWN_MS = 60_000;

export const REFRESH_APPLE = 'Refresh Apple Health';

export const REFRESH_BOTH = '↻ Refresh Apple Health & Garmin';

export const REFRESH_UPDATED = 'Updated';

export const REFRESH_FAILED = "Couldn't refresh just now. Try again in a minute.";

export const GARMIN_ASKED =
  'Asked Garmin for your latest data — it can take a minute or two to arrive';

export const GARMIN_RECENT =
  'Garmin was asked recently. New data can take a minute or two to arrive.';

export function refreshButtonLabel(garminConnected: boolean): string {
  return garminConnected ? REFRESH_BOTH : REFRESH_APPLE;
}

export function refreshCooling(startedAt: number | null, now: number, cooldown = HEALTH_REFRESH_COOLDOWN_MS): boolean {
  if (startedAt == null) return false;
  return now - startedAt < cooldown;
}

/** `Last updated 21:04`. A missing clock stays a named blank. */
export function lastUpdatedLine(iso: string | null): string {
  if (!iso) return 'Last updated —';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Last updated —';
  const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `Last updated ${time}`;
}
