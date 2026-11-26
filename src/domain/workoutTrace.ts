/**
 * Route tracks from a Garmin activity, and the heart rate and elevation traces
 * drawn under a workout map. Pure functions. Nothing here logs or sends a position.
 */

import { haversineMetres, type HeartSample, type RoutePoint } from '@/domain/workoutRoute';

/** A stored Garmin track point: [offset s, latitude, longitude, elevation m, heart rate, speed m/s, distance m]. */
export type StoredTrackPoint = [number, number | null, number | null, number | null, number | null, number | null, number | null];

export type StoredGarminTrack = {
  startedAt: string;
  points: readonly unknown[];
};

export type GarminRoute = {
  points: RoutePoint[];
  heartSamples: HeartSample[];
};

/** Shown on the workout screen when the route came from Garmin. */
export const ROUTE_PURPOSE_GARMIN =
  'Charioteer shows this route from your Garmin activity so you can see the path, the splits, your heart rate and the climb. It is kept on your Charioteer account for this map only. It is not shared or sent to Thumos.';

/** Elevation changes smaller than this are treated as GPS noise. Metres. */
export const CLIMB_NOISE_M = 3;

/** How many evenly spaced values a trace is drawn with. */
export const TRACE_BUCKETS = 60;

function finite(value: unknown, min: number, max: number): number | null {
  const number = typeof value === 'number' ? value : Number.NaN;
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

/** Reads a stored track. A malformed point is skipped, not drawn. */
export function garminTrackRoute(track: StoredGarminTrack | null | undefined): GarminRoute {
  const start = track ? Date.parse(track.startedAt) : Number.NaN;
  if (!track || !Number.isFinite(start) || !Array.isArray(track.points)) return { points: [], heartSamples: [] };
  const points: RoutePoint[] = [];
  const heartSamples: HeartSample[] = [];
  for (const raw of track.points) {
    if (!Array.isArray(raw)) continue;
    const offset = finite(raw[0], 0, 86_400);
    if (offset == null) continue;
    const at = new Date(start + offset * 1000).toISOString();
    const latitude = finite(raw[1], -90, 90);
    const longitude = finite(raw[2], -180, 180);
    const elevation = finite(raw[3], -500, 9000);
    const heart = finite(raw[4], 25, 250);
    if (heart != null) heartSamples.push({ at, bpm: Math.round(heart) });
    if (latitude == null || longitude == null) continue;
    points.push({ latitude, longitude, altitude: elevation ?? Number.NaN, at, heartRate: heart == null ? null : Math.round(heart) });
  }
  const anyAltitude = points.some((point) => Number.isFinite(point.altitude));
  for (const point of points) if (!Number.isFinite(point.altitude)) point.altitude = anyAltitude ? Number.NaN : 0;
  fillAltitudes(points);
  return { points, heartSamples };
}

function fillAltitudes(points: RoutePoint[]) {
  let last: number | null = null;
  for (const point of points) {
    if (Number.isFinite(point.altitude)) last = point.altitude;
    else point.altitude = last ?? Number.NaN;
  }
  let next: number | null = null;
  for (let index = points.length - 1; index >= 0; index -= 1) {
    if (Number.isFinite(points[index].altitude)) next = points[index].altitude;
    else points[index].altitude = next ?? 0;
  }
}

/** Total climb and descent, ignoring wobbles smaller than CLIMB_NOISE_M. */
export function climbAndDescent(altitudes: readonly number[]): { climb: number; descent: number } | null {
  const values = altitudes.filter((value) => Number.isFinite(value));
  if (values.length < 2) return null;
  let climb = 0;
  let descent = 0;
  let anchor = values[0];
  for (const value of values.slice(1)) {
    const change = value - anchor;
    if (change >= CLIMB_NOISE_M) {
      climb += change;
      anchor = value;
    } else if (change <= -CLIMB_NOISE_M) {
      descent -= change;
      anchor = value;
    }
  }
  return { climb: Math.round(climb), descent: Math.round(descent) };
}

/**
 * The climb line. Garmin's own totals are used when it sent them,
 * otherwise the line is worked out from the route's elevation.
 */
export function climbLine(points: readonly RoutePoint[], recorded?: { gain?: number | null; loss?: number | null }): string | null {
  const valid = (value: number | null | undefined) => (value != null && Number.isFinite(value) && value >= 0 ? Math.round(value) : null);
  const totals = points.some((point) => point.altitude !== 0) ? climbAndDescent(points.map((point) => point.altitude)) : null;
  const up = valid(recorded?.gain) ?? totals?.climb ?? null;
  const down = valid(recorded?.loss) ?? totals?.descent ?? null;
  if (up == null || down == null) return null;
  return `Total climb ${up} m · Total descent ${down} m`;
}

/** Averages values into evenly spaced buckets along x. Empty buckets are left out, not drawn as zero. */
export function evenTrace(rows: readonly { x: number; y: number }[], buckets = TRACE_BUCKETS): number[] {
  const usable = rows.filter((row) => Number.isFinite(row.x) && Number.isFinite(row.y)).sort((a, b) => a.x - b.x);
  if (usable.length < 2) return usable.map((row) => row.y);
  const low = usable[0].x;
  const span = usable[usable.length - 1].x - low;
  if (span <= 0) return [usable[0].y];
  const sums = new Array<number>(buckets).fill(0);
  const counts = new Array<number>(buckets).fill(0);
  for (const row of usable) {
    const index = Math.min(buckets - 1, Math.floor(((row.x - low) / span) * buckets));
    sums[index] += row.y;
    counts[index] += 1;
  }
  return sums.flatMap((sum, index) => (counts[index] ? [Math.round((sum / counts[index]) * 10) / 10] : []));
}

/** Heart rate over the workout, by time. */
export function heartTrace(samples: readonly HeartSample[], points: readonly RoutePoint[] = []): number[] {
  const rows = samples.length
    ? samples.map((sample) => ({ x: Date.parse(sample.at), y: sample.bpm }))
    : points.flatMap((point) => (point.heartRate == null ? [] : [{ x: Date.parse(point.at), y: point.heartRate }]));
  return evenTrace(rows);
}

/** Elevation along the route, by distance. Null when the route has no elevation. */
export function elevationTrace(points: readonly RoutePoint[]): number[] {
  if (!points.some((point) => point.altitude !== 0)) return [];
  let distance = 0;
  const rows = points.map((point, index) => {
    if (index > 0) {
      const step = haversineMetres(points[index - 1], point);
      if (Number.isFinite(step) && step > 0 && step < 500) distance += step;
    }
    return { x: distance, y: point.altitude };
  });
  return evenTrace(rows);
}

/** Lowest and highest heart rate, for the line under the chart. */
export function heartRangeLine(samples: readonly HeartSample[]): string | null {
  const values = samples.map((sample) => sample.bpm).filter((value) => Number.isFinite(value));
  if (values.length < 2) return null;
  return `Lowest ${Math.min(...values)} bpm · Highest ${Math.max(...values)} bpm`;
}

/** The activity summary id Garmin used for the detail push, for either form of the id. */
export function garminDetailIds(summaryId: string): string[] {
  const base = summaryId.replace(/^garmin:/, '').replace(/-detail$/, '');
  return base ? [base, `${base}-detail`] : [];
}
