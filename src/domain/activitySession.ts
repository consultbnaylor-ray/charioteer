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

/** Six hours. Ben confirmed this length on 26 October 2026. Change only this number. */
export const OUTING_TIME_LIMIT_MS = 6 * 60 * 60 * 1000;

export const HR_STALE_MS = 60_000;
export const HR_HIGH_BPM = 180;

export const NO_HEART_SOURCE = 'No heart-rate source';
export const WATCH_HEART_HINT =
  'Start a workout on your Apple Watch to show heart rate. The iPhone does not measure it.';
export const HEART_HIGH_LINE = 'Heart rate is 180. This is not medical advice.';
export const HEART_FOREGROUND_LINE =
  'Heart rate updates while Charioteer is in front. It does not update while the app is suspended. The number stays on this phone and is not sent.';
export const ENERGY_WAITING = 'Active energy not available yet';
export const AUDIO_DUCK_LINE =
  'A spoken line lowers your music for a moment, then lets it return. The phone speaks. Nothing is recorded.';
export const SPEECH_GATE_NOTE =
  'Spoken lines stay on the screen until a phone check shows the music dips and then returns to full volume, with no leftover session, including on a call and with Bluetooth headphones. Until that check, the phone does not start an audio session.';
export const TRACKING_ACTIVE_LINE =
  'Tracking is active. The blue location mark stays on until you tap Stop.';
export const LIVE_INTRO = 'You can lock the phone. Measuring continues until you tap Stop.';
export const TIME_LIMIT_LINE = 'The time limit ended this outing.';
export const OTHER_SESSION_LINE = 'Finish the session already running before you start another.';
export const PAUSED_LINE = 'Paused. Resume continues measuring.';

export function limitPhrase(limitMs = OUTING_TIME_LIMIT_MS): string {
  const hours = limitMs / 3_600_000;
  if (hours === 6) return 'six hours';
  return `${hours} hours`;
}

export function beforeStartLine(limitMs = OUTING_TIME_LIMIT_MS): string {
  return `You can lock the phone, take a call, or open another app. Measuring continues until you tap Stop, or for ${limitPhrase(limitMs)}. A blue location mark shows while it is on. The route stays on this phone. If the app is closed, that route is lost.`;
}

export function activityLocationLine(limitMs = OUTING_TIME_LIMIT_MS): string {
  return `Distance and pace keep going after you lock the phone, until you tap Stop or ${limitPhrase(limitMs)} pass. The route stays in memory for that outing. It is cleared when you stop or discard it. If the app is closed, it is lost. It is not sent.`;
}

export const ACTIVITY_LOCATION_LINE = activityLocationLine();

export const TRAFFIC_LINE = 'Stay aware of traffic, paths, and other people.';

export const WAITING_FIX = 'Waiting for a clearer fix.';

export const FINISH_LINE = 'You went out. That counts.';

export const SUMMARIES_HINT = 'On this phone. Deleting the app removes this list.';

export const DIARY_HINT = 'Off until you tick it. The diary gets the words, not the path.';

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

export function outingTimedOut(startedAtMs: number, nowMs: number, limitMs = OUTING_TIME_LIMIT_MS): boolean {
  if (!Number.isFinite(startedAtMs) || !Number.isFinite(nowMs)) return false;
  return nowMs - startedAtMs >= limitMs;
}

export type SplitMark = { kilometre: number; movingMs: number };

/** Kilometre marks. Each row is an index and a time. No coordinates. */
export function splitsForDistance(
  distanceM: number,
  movingMs: number,
  existing: readonly SplitMark[],
): SplitMark[] {
  const count = Math.floor(Math.max(0, distanceM) / 1000);
  if (count <= existing.length) return existing.slice();
  const next = existing.slice();
  for (let kilometre = existing.length + 1; kilometre <= count; kilometre += 1) {
    next.push({ kilometre, movingMs });
  }
  return next;
}

export function splitRow(mark: SplitMark, previousMs: number): string {
  const leg = Math.max(0, mark.movingMs - previousMs);
  return `${mark.kilometre} km · ${clock(mark.movingMs)} · ${paceLabel(averagePaceSecPerKm(1000, leg))}`;
}

export function currentSplitLabel(distanceM: number): string | null {
  if (!(distanceM > 0)) return null;
  const into = distanceM % 1000;
  return `This kilometre · ${(into / 1000).toFixed(2)} km`;
}

export function shownHeart(
  bpm: number | null,
  atMs: number | null,
  nowMs: number,
): { label: string; warning: string | null; age: string | null } {
  if (bpm == null || atMs == null || !Number.isFinite(bpm) || nowMs - atMs > HR_STALE_MS) {
    return { label: NO_HEART_SOURCE, warning: null, age: null };
  }
  const rounded = Math.round(bpm);
  const seconds = Math.max(0, Math.round((nowMs - atMs) / 1000));
  return {
    label: `${rounded} bpm`,
    warning: rounded >= HR_HIGH_BPM ? HEART_HIGH_LINE : null,
    age: `${seconds}s ago`,
  };
}

export function shownEnergy(kcal: number | null): string {
  if (kcal == null || !Number.isFinite(kcal) || kcal <= 0) return ENERGY_WAITING;
  return `${Math.round(kcal)} kcal`;
}

export type GymKind = 'strength' | 'cardio';

const GYM_LINES: Record<GymKind, readonly string[]> = {
  strength: [
    '{time} in. Stay with the set.',
    '{time} in. You are training. That is the work.',
    '{time} in. Rest when you need to.',
  ],
  cardio: [
    '{time} in. Keep it steady.',
    '{time} in. You are training. That is the work.',
    '{time} in. Breathe.',
  ],
};

export function gymLine(kind: GymKind, movingMs: number, index: number): string {
  const bank = GYM_LINES[kind];
  const template = bank[Math.abs(index) % bank.length] ?? bank[0];
  return template.replaceAll('{time}', timePhrase(movingMs));
}

export const GYM_BEFORE_START =
  'The clock runs until you tap Stop. Heart rate shows only if Apple Health has a recent reading. The iPhone does not measure it. If the app is closed, this session is lost. This is not medical advice.';

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
