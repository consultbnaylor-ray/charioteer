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

/** Re-read the Garmin rows already stored here. It does not ask Garmin. */
export const GARMIN_CHECK_AGAIN = 'Check again';

/** Shown on the status line when a re-read finds a later push. */
export const GARMIN_JUST_ARRIVED = 'New Garmin data just arrived';

/** A re-read that did not come back. It does not claim Garmin sent nothing. */
export const GARMIN_CHECK_FAILED = "Couldn't check stored Garmin data just now.";

/** One hint. It does not promise that a watch sync has sent, or will send, data. */
export const GARMIN_SEND_HINT =
  'Garmin decides when to send data to Charioteer. It usually follows a watch sync, but can take a while.';

/** Added to the same hint once the last stored push is about two hours old. */
export const GARMIN_STALE_PUSH_HINT =
  "If your watch has synced and nothing new has arrived, Charioteer can't tell why. Pull down in Garmin Connect to sync, then check again later.";

/** Last push older than this gets the stale sentence. A missing clock does not. */
export const GARMIN_PUSH_STALE_MS = 2 * 60 * 60 * 1000;

/** Ignore another Check again until this long after the last one started. */
export const GARMIN_CHECK_DEBOUNCE_MS = 10_000;

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

export function syncAppleClause(appleCheckedAt: string | null): string {
  const apple = syncClock(appleCheckedAt);
  return apple ? `Apple Health checked ${apple}` : 'Apple Health not checked yet';
}

/** True when a stored push is at least about two hours behind `now`. No push yet stays false. */
export function garminPushIsStale(receivedAt: string | null, now: number, staleMs = GARMIN_PUSH_STALE_MS): boolean {
  if (!receivedAt) return false;
  const at = Date.parse(receivedAt);
  if (!Number.isFinite(at)) return false;
  return now - at >= staleMs;
}

/** The only Garmin hint. A stale push adds the second sentence to this same line. */
export function garminHintLine(receivedAt: string | null, now: number): string {
  if (!garminPushIsStale(receivedAt, now)) return GARMIN_SEND_HINT;
  return `${GARMIN_SEND_HINT} ${GARMIN_STALE_PUSH_HINT}`;
}

export function syncGarminClause(garminReceivedAt: string | null): string {
  const garmin = syncClock(garminReceivedAt);
  return garmin ? `Garmin data received ${garmin}` : GARMIN_WAITING;
}

/** `Checked 07:45 · nothing new from Garmin since 23:24`. No clock means there has not been a push yet. */
export function garminNothingNewLine(checkedAt: string, receivedAt: string | null): string {
  const checked = syncClock(checkedAt) ?? '—';
  const since = syncClock(receivedAt);
  if (since) return `Checked ${checked} · nothing new from Garmin since ${since}`;
  return `Checked ${checked} · nothing new from Garmin`;
}

export type GarminCheckView = 'idle' | 'arrived' | 'nothing' | 'failed';

/**
 * The Garmin half of the status line after Check again.
 * Idle keeps the last push time. A check only reads what is already stored.
 */
export function garminAfterCheckLine(input: {
  view: GarminCheckView;
  checkedAt: string | null;
  receivedAt: string | null;
}): string {
  if (input.view === 'arrived') return GARMIN_JUST_ARRIVED;
  if (input.view === 'nothing' && input.checkedAt) return garminNothingNewLine(input.checkedAt, input.receivedAt);
  if (input.view === 'failed') return GARMIN_CHECK_FAILED;
  return syncGarminClause(input.receivedAt);
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
  const applePart = syncAppleClause(input.appleCheckedAt);
  if (!input.garminConnected) return applePart;
  return `${applePart} · ${syncGarminClause(input.garminReceivedAt)}`;
}

export function garminCheckCooling(startedAt: number | null, now: number, debounce = GARMIN_CHECK_DEBOUNCE_MS): boolean {
  if (startedAt == null) return false;
  return now - startedAt < debounce;
}

/** True when the stored push clock moved forward. */
export function garminReceiptAdvanced(previous: string | null, next: string | null): boolean {
  const nextAt = next ? Date.parse(next) : NaN;
  if (!Number.isFinite(nextAt)) return false;
  const previousAt = previous ? Date.parse(previous) : NaN;
  if (!Number.isFinite(previousAt)) return true;
  return nextAt > previousAt;
}

/** The later clock, keeping a missing one when the other is missing too. */
export function laterSyncClock(left: string | null, right: string | null): string | null {
  if (garminReceiptAdvanced(left, right)) return right;
  return left ?? right;
}

type StoredDaily = {
  calendarDate: string;
  moderateMinutes: number | null;
  vigorousMinutes: number | null;
  activeKilocalories?: number | null;
  restingHeartRateBpm: number | null;
  steps?: number | null;
  distanceMetres?: number | null;
};

type StoredActivity = { summaryId: string; startedAt: string; durationSeconds: number };

type StoredSleep = { summaryId: string; calendarDate: string; durationSeconds: number };

type StoredMetric = { summaryId: string; calendarDate: string; vo2Max: number | null };

/** A stable picture of the latest stored Garmin rows. */
export function garminStoredMark(input: {
  dailies: readonly StoredDaily[];
  activities: readonly StoredActivity[];
  sleep: readonly StoredSleep[];
  userMetrics: readonly StoredMetric[];
}): string {
  const daily = input.dailies[input.dailies.length - 1];
  const activity = input.activities[input.activities.length - 1];
  const sleep = input.sleep[input.sleep.length - 1];
  const metric = input.userMetrics[input.userMetrics.length - 1];
  return [
    input.dailies.length,
    daily ? `${daily.calendarDate}:${daily.moderateMinutes ?? ''}:${daily.vigorousMinutes ?? ''}:${daily.activeKilocalories ?? ''}:${daily.restingHeartRateBpm ?? ''}:${daily.steps ?? ''}:${daily.distanceMetres ?? ''}` : '',
    input.activities.length,
    activity ? `${activity.summaryId}:${activity.startedAt}:${activity.durationSeconds}` : '',
    input.sleep.length,
    sleep ? `${sleep.summaryId}:${sleep.calendarDate}:${sleep.durationSeconds}` : '',
    input.userMetrics.length,
    metric ? `${metric.summaryId}:${metric.calendarDate}:${metric.vo2Max ?? ''}` : '',
  ].join('|');
}

/**
 * A Check again found something newly stored.
 * A failed read comes back disconnected with an empty clock, and that is not new.
 */
export function garminCheckFoundNew(
  previous: { lastPushAt: string | null; mark: string },
  next: { connected: boolean; lastPushAt: string | null; mark: string },
): boolean {
  if (garminReceiptAdvanced(previous.lastPushAt, next.lastPushAt)) return true;
  if (!next.connected) return false;
  return next.mark !== previous.mark;
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
