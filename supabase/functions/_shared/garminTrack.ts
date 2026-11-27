/**
 * Garmin activity detail samples, cut down to a route track.
 * A pushed activityDetails summary carries `samples[]` at up to one per second.
 * We keep one point every 5 seconds (longer on activities over about 2 h 45 min), at most GARMIN_TRACK_MAX_POINTS,
 * with the time offset, position, elevation, heart rate, speed and distance.
 * Nothing here logs a position. The counts line is numbers only.
 */

/** Hard cap on stored points per activity. The database checks the same number. */
export const GARMIN_TRACK_MAX_POINTS = 2000;

/** Shortest gap between kept points, in seconds. */
export const GARMIN_TRACK_MIN_INTERVAL_S = 5;

/** Coordinates are rounded to 5 decimal places, about 1 metre. */
const COORD_DP = 1e5;

/**
 * One kept point: [offset seconds from start, latitude, longitude, elevation m, heart rate bpm, speed m/s, distance m].
 * Any value but the offset can be null.
 */
export type GarminTrackPoint = [
  number,
  number | null,
  number | null,
  number | null,
  number | null,
  number | null,
  number | null,
];

export type GarminTrack = {
  /** The activityDetails summary id, for example `25202876588-detail`. */
  summaryId: string;
  calendarDate: string;
  garminUserId: string;
  startedAt: string;
  intervalSeconds: number;
  points: GarminTrackPoint[];
  gpsPointCount: number;
};

/** Counts for one pushed activity detail. Numbers only, so it is safe to log. */
export type GarminSampleCounts = {
  raw: number;
  gps: number;
  heart: number;
  elevation: number;
  kept: number;
};

type Row = Record<string, unknown>;

function record(value: unknown): Row | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Row : null;
}

function finite(value: unknown, min: number, max: number): number | null {
  const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : Number.NaN;
  if (!Number.isFinite(number) || number < min || number > max) return null;
  return number;
}

function ident(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) return String(Math.trunc(value)).slice(0, 128);
  if (typeof value !== 'string') return '';
  const text = value.trim();
  return /^[A-Za-z0-9_.:-]{1,128}$/.test(text) ? text : '';
}

function round(value: number | null, factor: number): number | null {
  return value == null ? null : Math.round(value * factor) / factor;
}

/** A latitude and longitude pair, or null when either is missing or is the 0,0 placeholder. */
export function samplePosition(sample: Row): { latitude: number; longitude: number } | null {
  const latitude = finite(sample.latitudeInDegree, -90, 90);
  const longitude = finite(sample.longitudeInDegree, -180, 180);
  if (latitude == null || longitude == null) return null;
  if (latitude === 0 && longitude === 0) return null;
  return { latitude, longitude };
}

function sampleHeart(sample: Row): number | null {
  return finite(sample.heartRate ?? sample.heartrate, 25, 250);
}

function sampleElevation(sample: Row): number | null {
  return finite(sample.elevationInMeters, -500, 9000);
}

function rawSamples(detail: Row): Row[] {
  const value = detail.samples;
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const row = record(item);
    return row ? [row] : [];
  });
}

/** The gap between kept points so a long activity stays under the cap. */
export function trackInterval(durationSeconds: number): number {
  const spread = Math.ceil(Math.max(0, durationSeconds) / (GARMIN_TRACK_MAX_POINTS - 1));
  return Math.max(GARMIN_TRACK_MIN_INTERVAL_S, spread);
}

/**
 * Downsamples one activityDetails summary. Returns null when it has no usable samples.
 * The first and last usable samples are always kept.
 */
export function trackFromDetail(detail: Row, ids: { garminUserId: string; summaryId: string; calendarDate: string }): GarminTrack | null {
  const summary = record(detail.summary) ?? detail;
  const startSeconds = finite(summary.startTimeInSeconds, 1, 4_000_000_000);
  const samples = rawSamples(detail);
  if (!samples.length) return null;
  const timed = samples.flatMap((sample) => {
    const at = finite(sample.startTimeInSeconds, 1, 4_000_000_000);
    if (at == null) return [];
    const position = samplePosition(sample);
    const heart = sampleHeart(sample);
    const elevation = sampleElevation(sample);
    if (!position && heart == null && elevation == null) return [];
    return [{ at, position, heart, elevation, speed: finite(sample.speedMetersPerSecond, 0, 100), distance: finite(sample.totalDistanceInMeters, 0, 500_000) }];
  }).sort((left, right) => left.at - right.at);
  if (!timed.length) return null;
  const start = startSeconds ?? timed[0].at;
  const span = timed[timed.length - 1].at - start;
  const interval = trackInterval(span);
  const kept: typeof timed = [];
  let lastAt = Number.NEGATIVE_INFINITY;
  for (const sample of timed) {
    if (sample.at - lastAt < interval) continue;
    kept.push(sample);
    lastAt = sample.at;
  }
  const final = timed[timed.length - 1];
  if (kept[kept.length - 1] !== final) kept.push(final);
  while (kept.length > GARMIN_TRACK_MAX_POINTS) kept.splice(kept.length - 2, 1);
  const points: GarminTrackPoint[] = kept.map((sample) => [
    Math.max(0, Math.round(sample.at - start)),
    round(sample.position?.latitude ?? null, COORD_DP),
    round(sample.position?.longitude ?? null, COORD_DP),
    round(sample.elevation, 10),
    sample.heart == null ? null : Math.round(sample.heart),
    round(sample.speed, 100),
    sample.distance == null ? null : Math.round(sample.distance),
  ]);
  return {
    garminUserId: ids.garminUserId,
    summaryId: ids.summaryId,
    calendarDate: ids.calendarDate,
    startedAt: new Date(start * 1000).toISOString(),
    intervalSeconds: interval,
    points,
    gpsPointCount: points.filter((point) => point[1] != null && point[2] != null).length,
  };
}

/** Counts only, for the webhook log. Never includes a position. */
export function sampleCounts(detail: Row, track: GarminTrack | null): GarminSampleCounts {
  const samples = rawSamples(detail);
  let gps = 0;
  let heart = 0;
  let elevation = 0;
  for (const sample of samples) {
    if (samplePosition(sample)) gps += 1;
    if (sampleHeart(sample) != null) heart += 1;
    if (sampleElevation(sample) != null) elevation += 1;
  }
  return { raw: samples.length, gps, heart, elevation, kept: track?.points.length ?? 0 };
}

/** The counts line. Numbers and the summary id only. */
export function sampleCountsLine(summaryId: string, counts: GarminSampleCounts): string {
  return `garmin-webhook: activityDetails ${ident(summaryId) || 'unknown'} samples=${counts.raw} gps=${counts.gps} hr=${counts.heart} elev=${counts.elevation} kept=${counts.kept}`;
}

/** Start point and climb from the activity summary, rounded to 4 decimal places (about 11 m). */
export function detailStartAndClimb(detail: Row): {
  startLatitude: number | null;
  startLongitude: number | null;
  elevationGainMetres: number | null;
  elevationLossMetres: number | null;
} {
  const summary = record(detail.summary) ?? detail;
  let latitude = finite(summary.startingLatitudeInDegree, -90, 90);
  let longitude = finite(summary.startingLongitudeInDegree, -180, 180);
  if (latitude == null || longitude == null || (latitude === 0 && longitude === 0)) {
    const first = rawSamples(detail).map(samplePosition).find((position) => position != null) ?? null;
    latitude = first?.latitude ?? null;
    longitude = first?.longitude ?? null;
  }
  const gain = finite(summary.totalElevationGainInMeters, 0, 20_000);
  const loss = finite(summary.totalElevationLossInMeters, 0, 20_000);
  return {
    startLatitude: round(latitude, 1e4),
    startLongitude: round(longitude, 1e4),
    elevationGainMetres: gain == null ? null : Math.round(gain),
    elevationLossMetres: loss == null ? null : Math.round(loss),
  };
}

/** One counts line per pushed activity detail. Never logs a position or a user id. */
export function logSampleCounts(body: unknown): void {
  const root = record(body);
  const details = root && Array.isArray(root.activityDetails) ? root.activityDetails : [];
  for (const item of details) {
    const detail = record(item);
    if (!detail) continue;
    const summary = record(detail.summary) ?? detail;
    const summaryId = ident(detail.summaryId) || ident(summary.summaryId) || ident(summary.activityId);
    const track = trackFromDetail(detail, { garminUserId: '', summaryId, calendarDate: '' });
    console.log(sampleCountsLine(summaryId, sampleCounts(detail, track)));
  }
}
