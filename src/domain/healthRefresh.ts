import { formatUkTime } from '@/domain/dates';
import { londonDay } from '@/domain/healthInsights';

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

/** The refresh call was throttled or duplicated. This is not a failed sync. */
export const GARMIN_BUSY = 'Garmin is busy. Try again in a minute.';

/** Shown when a refresh is throttled and there is no stored push clock. */
export const GARMIN_THROTTLED_NOTE = 'Garmin is already sending data. There is nothing new to ask for yet.';

/** A stored push inside this window means data is already coming through. */
export const GARMIN_REFRESH_FRESH_MS = 6 * 60 * 60 * 1000;

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

/**
 * A calm prompt once the last stored push is about three hours old.
 * It sits beside the existing “Garmin data received” clock. It does not add another clock.
 */
export const GARMIN_CONNECT_NUDGE_MS = 3 * 60 * 60 * 1000;

/** Local hours when a quiet sync reminder is useful. Overnight stays quiet. */
export const GARMIN_DAY_START_HOUR = 7;
export const GARMIN_DAY_END_HOUR = 22;

export const GARMIN_CONNECT_NUDGE = 'Not updating? Open Garmin Connect so your watch can sync.';

/**
 * The watch may have charged overnight. Stay quiet until mid-morning London,
 * and until the newest Garmin push or daily is at least 12 hours old.
 * A reading dated today means the link is still delivering, so this stays off.
 * A missing connection is the reconnect note, not this one.
 */
export const GARMIN_WATCH_LINK_HOUR = 10;
export const GARMIN_WATCH_LINK_GAP_MS = 12 * 60 * 60 * 1000;
export const GARMIN_WATCH_LINK_NOTE = "Garmin data hasn't synced recently.";
export const GARMIN_WATCH_LINK_HOW = 'How to fix';
/** Short steps. Region lives in Garmin Connect's advanced settings; the exact menu is Garmin's. */
export const GARMIN_WATCH_LINK_STEPS = [
  "Restart the Garmin Connect app and check it's connected to your watch (device icon).",
  "If you use a VPN, turn it off or make sure Garmin Connect's region (in its advanced settings) matches your country, e.g. UK.",
  'Then pull to refresh.',
] as const;
export const GARMIN_WATCH_LINK_HIDE = 'Hide for today';

export function garminWatchLinkDismissed(raw: string | null, userId: string, today: string): boolean {
  if (!raw || !userId) return false;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return false;
    return (parsed as Record<string, unknown>)[userId] === today;
  } catch {
    return false;
  }
}

export function withGarminWatchLinkDismissed(raw: string | null, userId: string, today: string): string {
  let current: Record<string, string> = {};
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        for (const [key, value] of Object.entries(parsed)) {
          if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) current[key] = value;
        }
      }
    } catch {
      current = {};
    }
  }
  current[userId] = today;
  return JSON.stringify(current);
}

/**
 * Garmin Connect Mobile’s documented iOS scheme.
 * Garmin’s Connect IQ guide names `gcm-ciq` so an app can ask whether Connect is installed.
 * Opening `gcm-ciq://` is the start page. Anything else is left as plain text.
 */
export const GARMIN_CONNECT_APP_URL = 'gcm-ciq://';

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

/** London hour 0–23. Tests can pass `hour` instead of calling this. */
export function londonHour(now: number): number {
  const formatted = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(now));
  const hour = Number(formatted);
  return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : 0;
}

export function latestGarminDailyDay(days: readonly string[]): string | null {
  let latest: string | null = null;
  for (const day of days) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    if (!latest || day > latest) latest = day;
  }
  return latest;
}

/**
 * Connected, a previous Garmin reading exists, nothing is dated today, it is
 * 10:00 London or later, and the newest reading is at least 12 hours old.
 */
export function garminWatchLinkDue(input: {
  connected: boolean;
  lastPushAt: string | null;
  latestDailyDay: string | null;
  now: number;
  today?: string;
  hour?: number;
}): boolean {
  if (!input.connected) return false;
  const today = input.today ?? londonDay(new Date(input.now));
  const hour = input.hour ?? londonHour(input.now);
  if (!Number.isInteger(hour) || hour < GARMIN_WATCH_LINK_HOUR) return false;
  const pushAt = input.lastPushAt ? Date.parse(input.lastPushAt) : NaN;
  const pushOk = Number.isFinite(pushAt);
  const pushDay = pushOk ? londonDay(new Date(pushAt)) : null;
  const daily = input.latestDailyDay && /^\d{4}-\d{2}-\d{2}$/.test(input.latestDailyDay) ? input.latestDailyDay : null;
  if (!pushDay && !daily) return false;
  if (pushDay === today || daily === today) return false;
  const marks = [pushOk ? pushAt : null, daily ? Date.parse(`${daily}T12:00:00Z`) : null]
    .filter((value): value is number => value != null && Number.isFinite(value));
  const newest = marks.length ? Math.max(...marks) : NaN;
  return Number.isFinite(newest) && input.now - newest >= GARMIN_WATCH_LINK_GAP_MS;
}

/**
 * True during the day when the last stored push is about three hours old or more.
 * A missing or unreadable clock stays false. Night hours stay false.
 * `hour` is the local hour of `now` (0–23). Tests pass it so the clock zone does not matter.
 */
export function garminConnectNudge(receivedAt: string | null, now: number, hour = new Date(now).getHours()): boolean {
  if (!Number.isInteger(hour) || hour < GARMIN_DAY_START_HOUR || hour >= GARMIN_DAY_END_HOUR) return false;
  return garminPushIsStale(receivedAt, now, GARMIN_CONNECT_NUDGE_MS);
}

/** The Connect app URL, or null when the scheme is not the one Garmin documents. */
export function garminConnectOpenUrl(url: string = GARMIN_CONNECT_APP_URL): string | null {
  const match = /^([a-z][a-z0-9+.-]*):\/\/$/i.exec(url.trim());
  if (!match) return null;
  if (match[1].toLowerCase() !== 'gcm-ciq') return null;
  return 'gcm-ciq://';
}

/** True when Garmin has already delivered data within the last few hours. */
export function garminDataIsRecent(receivedAt: string | null, now: number, windowMs = GARMIN_REFRESH_FRESH_MS): boolean {
  if (!receivedAt) return false;
  const at = Date.parse(receivedAt);
  if (!Number.isFinite(at)) return false;
  const age = now - at;
  return age >= 0 && age <= windowMs;
}

export function garminAlreadySentLine(receivedAt: string | null): string | null {
  const clock = syncClock(receivedAt);
  if (!clock) return null;
  return `Garmin already sent your latest data at ${clock}.`;
}

/**
 * A throttled or duplicate refresh is a calm note.
 * Any Garmin refresh failure is also a note when data arrived in the last few hours.
 * A real failure with no recent data stays an error.
 */
export function garminRefreshFace(input: {
  error: string | null;
  receivedAt: string | null;
  now: number;
}): { error: string | null; note: string | null } {
  const message = input.error?.trim() ?? '';
  if (!message) return { error: null, note: null };
  const throttled = message === GARMIN_BUSY;
  const askFailed = message === 'Could not ask Garmin for new data.';
  const recent = garminDataIsRecent(input.receivedAt, input.now);
  if (throttled || (askFailed && recent)) {
    return { error: null, note: garminAlreadySentLine(input.receivedAt) ?? GARMIN_THROTTLED_NOTE };
  }
  return { error: message, note: null };
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
