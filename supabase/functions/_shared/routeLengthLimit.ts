/**
 * How long a saved or snapped route may be, by plan.
 * Approved by Ben on 28 November 2026 (t1149u): 26 miles on Standard, 200 miles on Pro,
 * no distance cap on Max.
 *
 * A single OpenRouteService (HeiGIT) directions call still has its own caps (about 50
 * waypoints, and historically 100 km; a dense path can also hit the 2000-vertex
 * geometry limit). Long sketches are split into shorter calls and stitched, so those
 * provider caps are not the person's plan limit.
 */
import { tierDisplayName, upgradeTier, type Tier } from './tierLimits.ts';

export const METRES_PER_MILE = 1609.344;

/** Standard: 26 miles, 41.8 km. */
export const STANDARD_ROUTE_MAX_MILES = 26;
export const STANDARD_ROUTE_MAX_M = Math.round(STANDARD_ROUTE_MAX_MILES * METRES_PER_MILE);

/** Pro: 200 miles, 321.9 km. */
export const PRO_ROUTE_MAX_MILES = 200;
export const PRO_ROUTE_MAX_M = Math.round(PRO_ROUTE_MAX_MILES * METRES_PER_MILE);

/**
 * One provider call stays under this length. A dense 7–8 km footpath can already
 * return more than 2000 vertices, which HeiGIT refuses as error 2004. A 7.4 km
 * sketch is therefore two calls, not one.
 */
export const ORS_CHUNK_MAX_M = 6_000;

/** Whole sketch the edge function will accept before splitting. Enough for a long Max route. */
export const ORS_SKETCH_POINT_CAP = 4_000;

/** The plan cap in metres. Null means no cap (Max). No plan is treated as Standard. */
export function routeLengthCapM(tier: Tier | null): number | null {
  if (tier === 'max') return null;
  if (tier === 'pro') return PRO_ROUTE_MAX_M;
  return STANDARD_ROUTE_MAX_M;
}

export function routeLengthCapMiles(tier: Tier | null): number | null {
  if (tier === 'max') return null;
  if (tier === 'pro') return PRO_ROUTE_MAX_MILES;
  return STANDARD_ROUTE_MAX_MILES;
}

export function routeOverTierLimit(lengthM: number, tier: Tier | null): boolean {
  if (!Number.isFinite(lengthM) || lengthM <= 0) return false;
  const cap = routeLengthCapM(tier);
  return cap != null && lengthM > cap;
}

/**
 * The line shown when a route is longer than the plan allows.
 * The upgrade sentence is only added when the paywall can offer it.
 */
export function routeTierLimitMessage(input: {
  tier: Tier | null;
  offerUpgrade: boolean;
}): string {
  const tier = input.tier ?? 'standard';
  const miles = routeLengthCapMiles(tier);
  if (miles == null) return 'That route is over the limit on this plan. Draw a shorter section.';
  const name = tierDisplayName(tier);
  const limit = `That route is over the ${miles} mile limit on ${name}.`;
  if (!input.offerUpgrade) return `${limit} Draw a shorter section.`;
  const next = upgradeTier(tier);
  if (next === 'pro') return `${limit} Pro can snap routes up to ${PRO_ROUTE_MAX_MILES} miles.`;
  if (next === 'max') return `${limit} Max has no distance limit.`;
  return `${limit} Draw a shorter section.`;
}

export type PlaceLike = { latitude: number; longitude: number };

function haversineM(a: PlaceLike, b: PlaceLike): number {
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function pathLengthM(points: readonly PlaceLike[]): number {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const point = points[index];
    if (!previous || !point) continue;
    total += haversineM(previous, point);
  }
  return total;
}

/**
 * Split a line into sections that each stay under the provider length and waypoint caps.
 * Neighbouring sections share an end, so the stitched route has no gap and no straight join.
 */
export function providerChunks(
  points: readonly PlaceLike[],
  maxM = ORS_CHUNK_MAX_M,
  maxPoints = 50,
): PlaceLike[][] {
  const clean = points.filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude));
  if (clean.length < 2) return [];
  const capPoints = Math.max(2, Math.round(maxPoints));
  const capM = Math.max(1, maxM);
  const chunks: PlaceLike[][] = [];
  let current: PlaceLike[] = [clean[0]!];
  let since = 0;
  for (let index = 1; index < clean.length; index += 1) {
    const point = clean[index]!;
    const last = current[current.length - 1]!;
    const leg = haversineM(last, point);
    const wouldOverflow = current.length >= capPoints || (current.length >= 2 && since + leg > capM);
    if (wouldOverflow) {
      chunks.push(current);
      current = [last];
      since = 0;
    }
    current.push(point);
    since += haversineM(current[current.length - 2]!, point);
  }
  if (current.length >= 2) chunks.push(current);
  return chunks;
}

/** Cut a section in two at a shared middle point, for a retry after the provider refuses it. */
export function splitChunkInHalf(points: readonly PlaceLike[]): [PlaceLike[], PlaceLike[]] | null {
  if (points.length < 3) return null;
  const mid = Math.max(1, Math.floor((points.length - 1) / 2));
  const left = points.slice(0, mid + 1);
  const right = points.slice(mid);
  if (left.length < 2 || right.length < 2) return null;
  return [left, right];
}

/**
 * Join routed pieces that share an end. A point within 8 m of the previous end is dropped
 * so the line does not fold back. A gap is not filled with a straight line.
 */
export function stitchRoutedPoints(pieces: readonly (readonly PlaceLike[])[]): PlaceLike[] {
  const line: PlaceLike[] = [];
  for (const piece of pieces) {
    for (const point of piece) {
      const last = line[line.length - 1];
      if (last && haversineM(last, point) < 8) {
        line[line.length - 1] = point;
        continue;
      }
      line.push(point);
    }
  }
  return line;
}

export type StitchablePlan = {
  points: PlaceLike[];
  distanceM: number;
  durationMinutes: number;
  ascentM?: number | null;
  descentM?: number | null;
  elevationsM?: number[] | null;
};

/** Distance, time and climb add up. Elevations are kept only when every piece has them. */
export function stitchRoutePlans<T extends StitchablePlan>(plans: readonly T[]): T | null {
  const first = plans[0];
  if (!first) return null;
  if (plans.length === 1) return first;
  const points = stitchRoutedPoints(plans.map((plan) => plan.points));
  if (points.length < 2) return null;
  const sumOrNull = (pick: (plan: T) => number | null | undefined): number | null => {
    let total = 0;
    for (const plan of plans) {
      const value = pick(plan);
      if (value == null || !Number.isFinite(value)) return null;
      total += value;
    }
    return total;
  };
  const elevations: number[] = [];
  let elevationsComplete = true;
  for (const plan of plans) {
    if (!plan.elevationsM || plan.elevationsM.length !== plan.points.length) {
      elevationsComplete = false;
      break;
    }
    const start = elevations.length === 0 ? 0 : 1;
    elevations.push(...plan.elevationsM.slice(start));
  }
  return {
    ...plans[plans.length - 1]!,
    points,
    distanceM: Math.max(1, plans.reduce((sum, plan) => sum + Math.max(0, plan.distanceM), 0)),
    durationMinutes: Math.max(1, plans.reduce((sum, plan) => sum + Math.max(0, plan.durationMinutes), 0)),
    ascentM: sumOrNull((plan) => plan.ascentM),
    descentM: sumOrNull((plan) => plan.descentM),
    elevationsM: elevationsComplete ? elevations : null,
  };
}
