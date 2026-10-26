/**
 * A walk, run, or cycle timed on this phone.
 * The summary is the activity, the date, the distance, the time, and the average pace.
 * A path is not stored. Nothing in this file is sent anywhere.
 */

export type ActivityKind = 'walk' | 'run' | 'cycle';

export type UpdateInterval = 0 | 3 | 5 | 10;

export const ACTIVITY_SUMMARIES_KEY = 'charioteer.activity-summaries';

export const MAX_ACCURACY_M = 50;
export const MIN_PACE_DISTANCE_M = 50;

/** Metres per second. A faster jump is a bad fix, not a change of activity. */
export const SPEED_CAP_MPS: Record<ActivityKind, number> = {
  walk: 15 / 3.6,
  run: 30 / 3.6,
  cycle: 70 / 3.6,
};

export const SETUP_LOCK_LINE =
  'The screen stays on. Locking the phone pauses the time and the distance.';

export const LOCK_PAUSE_NOTE =
  'Locking the phone paused the time and the distance.';

export const ACTIVITY_LOCATION_LINE =
  'Distance and pace use your location only while this screen is open. Locking the phone pauses them.';

export const TRAFFIC_LINE = 'Stay aware of traffic, paths, and other people.';

export const WAITING_FIX = 'Waiting for a clearer fix.';

export const FINISH_LINE = 'You went out. That counts.';

export const SUMMARIES_HINT = 'On this phone. Deleting the app removes this list.';

export const DIARY_HINT = 'Off until you tick it. The diary gets the words, not the path.';

export const LIVE_INTRO = 'Screen on. Locking the phone pauses this.';

const PACED: Record<ActivityKind, readonly string[]> = {
  walk: [
    '{time} in. Easy pace. Keep it comfortable.',
    '{time} in. {pace} per kilometre. Stay with it.',
    '{time} in. You are out. That is the work.',
    '{time} in. {pace} per kilometre. No need to hurry.',
  ],
  run: [
    '{time} in. Settle into the run.',
    '{time} in. {pace} per kilometre. Keep the rhythm.',
    '{time} in. You are out. That is the work.',
    '{time} in. {pace} per kilometre. Stay smooth.',
  ],
  cycle: [
    '{time} in. Easy on the bike.',
    '{time} in. {pace} per kilometre. Keep rolling.',
    '{time} in. You are out. That is the work.',
    '{time} in. {pace} per kilometre. Look ahead.',
  ],
};

const TIME_ONLY: Record<ActivityKind, readonly string[]> = {
  walk: [
    '{time} in. Easy pace. Keep it comfortable.',
    '{time} in. You are out. That is the work.',
    '{time} in. No need to hurry.',
  ],
  run: [
    '{time} in. Settle into the run.',
    '{time} in. You are out. That is the work.',
    '{time} in. Stay smooth.',
  ],
  cycle: [
    '{time} in. Easy on the bike.',
    '{time} in. You are out. That is the work.',
    '{time} in. Look ahead.',
  ],
};

export type ActivityFix = {
  latitude: number;
  longitude: number;
  accuracyM: number | null;
  atMs: number;
};

export type ActivitySummary = {
  id: string;
  activity: ActivityKind;
  date: string;
  distanceM: number;
  movingMs: number;
  averagePaceSecPerKm: number | null;
};

export function isActivityKind(value: unknown): value is ActivityKind {
  return value === 'walk' || value === 'run' || value === 'cycle';
}

export function activityWord(kind: ActivityKind): string {
  if (kind === 'run') return 'Run';
  if (kind === 'cycle') return 'Cycle';
  return 'Walk';
}

export function startLabel(kind: ActivityKind): string {
  if (kind === 'run') return 'Start a run';
  if (kind === 'cycle') return 'Start a cycle';
  return 'Start a walk';
}

export function timePhrase(movingMs: number): string {
  const minutes = Math.max(0, Math.floor(movingMs / 60_000));
  if (minutes < 1) return 'Less than a minute';
  if (minutes === 1) return '1 minute';
  return `${minutes} minutes`;
}

export function clock(movingMs: number): string {
  const total = Math.max(0, Math.floor(movingMs / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  if (hours > 0) return `${hours}:${mm}:${ss}`;
  return `${mm}:${ss}`;
}

export function distanceLabel(metres: number): string {
  const safe = Math.max(0, metres);
  if (safe < 1000) return `${Math.round(safe)} m`;
  return `${(safe / 1000).toFixed(2)} km`;
}

export function paceLabel(secPerKm: number | null): string {
  if (secPerKm == null || !Number.isFinite(secPerKm) || secPerKm <= 0) return '—';
  const total = Math.round(secPerKm);
  const minutes = Math.floor(total / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return `${minutes}:${seconds} /km`;
}

export function averagePaceSecPerKm(distanceM: number, movingMs: number): number | null {
  if (distanceM < MIN_PACE_DISTANCE_M || movingMs <= 0) return null;
  return movingMs / 1000 / (distanceM / 1000);
}

/** How many interval lines are waiting. Off never speaks. Paused time is already left out of movingMs. */
export function updatesDue(movingMs: number, intervalMin: UpdateInterval, sent: number): number {
  if (intervalMin === 0) return 0;
  const slots = Math.floor(Math.max(0, movingMs) / (intervalMin * 60_000));
  return Math.max(0, slots - Math.max(0, sent));
}

export function activityLine(
  kind: ActivityKind,
  movingMs: number,
  pace: string | null,
  index: number,
): string {
  const bank = pace ? PACED[kind] : TIME_ONLY[kind];
  const template = bank[Math.abs(index) % bank.length] ?? bank[0];
  return template
    .replaceAll('{time}', timePhrase(movingMs))
    .replaceAll('{pace}', pace ?? '');
}

export function metresBetween(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
): number {
  const earth = 6_371_000;
  const lat1 = (from.latitude * Math.PI) / 180;
  const lat2 = (to.latitude * Math.PI) / 180;
  const dLat = ((to.latitude - from.latitude) * Math.PI) / 180;
  const dLon = ((to.longitude - from.longitude) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * earth * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function usable(fix: ActivityFix): boolean {
  return typeof fix.accuracyM === 'number' && fix.accuracyM >= 0 && fix.accuracyM <= MAX_ACCURACY_M;
}

/**
 * Adds the distance of a clear, possible step.
 * A poor fix or an impossible jump is ignored, and the previous point stays put.
 */
/** Accepted fixes only. A rejected fix leaves the line where it was. The result is not stored. */
export function extendTrack(
  track: readonly { latitude: number; longitude: number }[],
  anchor: ActivityFix | null,
  step: { previous: ActivityFix | null },
): { latitude: number; longitude: number }[] {
  const next = step.previous;
  if (!next) return track.slice();
  const sameAnchor = anchor != null
    && next.atMs === anchor.atMs
    && next.latitude === anchor.latitude
    && next.longitude === anchor.longitude;
  if (sameAnchor) return track.slice();
  const point = { latitude: next.latitude, longitude: next.longitude };
  const last = track[track.length - 1];
  if (last && last.latitude === point.latitude && last.longitude === point.longitude) return track.slice();
  return [...track, point];
}

export function applyFix(
  kind: ActivityKind,
  previous: ActivityFix | null,
  next: ActivityFix,
): { previous: ActivityFix | null; addedM: number } {
  if (!usable(next)) return { previous, addedM: 0 };
  if (!previous) return { previous: next, addedM: 0 };
  const metres = metresBetween(previous, next);
  const seconds = (next.atMs - previous.atMs) / 1000;
  if (!(seconds > 0) || metres / seconds > SPEED_CAP_MPS[kind]) return { previous, addedM: 0 };
  return { previous: next, addedM: metres };
}

export function summaryFrom(input: {
  id: string;
  activity: ActivityKind;
  date: string;
  distanceM: number;
  movingMs: number;
}): ActivitySummary {
  const distanceM = Math.max(0, input.distanceM);
  const movingMs = Math.max(0, input.movingMs);
  return {
    id: input.id,
    activity: input.activity,
    date: input.date,
    distanceM,
    movingMs,
    averagePaceSecPerKm: averagePaceSecPerKm(distanceM, movingMs),
  };
}

export function parseActivitySummary(value: unknown): ActivitySummary | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== 'string' || !row.id) return null;
  if (!isActivityKind(row.activity)) return null;
  if (typeof row.date !== 'string' || !row.date) return null;
  if (typeof row.distanceM !== 'number' || !Number.isFinite(row.distanceM)) return null;
  if (typeof row.movingMs !== 'number' || !Number.isFinite(row.movingMs)) return null;
  const pace = row.averagePaceSecPerKm;
  if (pace != null && (typeof pace !== 'number' || !Number.isFinite(pace))) return null;
  return {
    id: row.id,
    activity: row.activity,
    date: row.date,
    distanceM: Math.max(0, row.distanceM),
    movingMs: Math.max(0, row.movingMs),
    averagePaceSecPerKm: pace == null ? null : pace,
  };
}
