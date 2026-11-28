import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import {
  ORS_CHUNK_MAX_M,
  ORS_SKETCH_POINT_CAP,
  PRO_ROUTE_MAX_M,
  PRO_ROUTE_MAX_MILES,
  STANDARD_ROUTE_MAX_M,
  STANDARD_ROUTE_MAX_MILES,
  pathLengthM,
  providerChunks,
  routeLengthCapM,
  routeOverTierLimit,
  routeTierLimitMessage,
  splitChunkInHalf,
  appendUncoveredSketchTail,
  stitchPlanWithSketchTail,
  stitchRoutePlans,
  stitchRoutedPoints,
} from '@/domain/routeLengthLimit';
import { paywallEnabled } from '@/domain/subscription';
import { resolveRouteTier } from '../../supabase/functions/_shared/routeTier';
import { sketchLimitMessage, readSketchPoints } from '../../supabase/functions/_shared/orsRoute';

const start = { latitude: 52.905, longitude: -1.38 };

function along(metres: number, east = 0) {
  return {
    latitude: start.latitude + metres / 111_195,
    longitude: start.longitude + east / (111_195 * Math.cos((start.latitude * Math.PI) / 180)),
  };
}

function sketch(lengthM: number, stepM = 100) {
  const points = [along(0)];
  for (let at = stepM; at < lengthM; at += stepM) points.push(along(at));
  points.push(along(lengthM));
  return points;
}

describe('route length by plan (Ben, t1149u)', () => {
  it('sets 26 miles on Standard, 200 miles on Pro, and no cap on Max', () => {
    expect(STANDARD_ROUTE_MAX_MILES).toBe(26);
    expect(PRO_ROUTE_MAX_MILES).toBe(200);
    expect(STANDARD_ROUTE_MAX_M).toBe(Math.round(26 * 1609.344));
    expect(PRO_ROUTE_MAX_M).toBe(Math.round(200 * 1609.344));
    expect(Math.round(STANDARD_ROUTE_MAX_M / 100) / 10).toBe(41.8);
    expect(Math.round(PRO_ROUTE_MAX_M / 100) / 10).toBe(321.9);
    expect(routeLengthCapM('standard')).toBe(STANDARD_ROUTE_MAX_M);
    expect(routeLengthCapM(null)).toBe(STANDARD_ROUTE_MAX_M);
    expect(routeLengthCapM('pro')).toBe(PRO_ROUTE_MAX_M);
    expect(routeLengthCapM('max')).toBeNull();
  });

  it('lets a 7.4 km sketch through on every plan, and names the cap in miles', () => {
    const drawn = pathLengthM(sketch(7_400));
    expect(drawn).toBeGreaterThan(7_300);
    expect(drawn).toBeLessThan(7_500);
    expect(routeOverTierLimit(drawn, 'standard')).toBe(false);
    expect(routeOverTierLimit(drawn, 'pro')).toBe(false);
    expect(routeOverTierLimit(drawn, 'max')).toBe(false);
    expect(routeOverTierLimit(STANDARD_ROUTE_MAX_M + 1, 'standard')).toBe(true);
    expect(routeOverTierLimit(STANDARD_ROUTE_MAX_M + 1, 'pro')).toBe(false);
    expect(routeOverTierLimit(PRO_ROUTE_MAX_M + 1, 'pro')).toBe(true);
    expect(routeOverTierLimit(PRO_ROUTE_MAX_M + 1, 'max')).toBe(false);
    expect(routeTierLimitMessage({ tier: 'standard', offerUpgrade: false })).toBe(
      'That route is over the 26 mile limit on Standard. Draw a shorter section.',
    );
    expect(routeTierLimitMessage({ tier: 'standard', offerUpgrade: true })).toBe(
      'That route is over the 26 mile limit on Standard. Pro can snap routes up to 200 miles.',
    );
    expect(routeTierLimitMessage({ tier: 'pro', offerUpgrade: true })).toBe(
      'That route is over the 200 mile limit on Pro. Max has no distance limit.',
    );
    expect(routeTierLimitMessage({ tier: 'pro', offerUpgrade: false })).toBe(
      'That route is over the 200 mile limit on Pro. Draw a shorter section.',
    );
  });

  it('does not mention an upgrade when the paywall is off, as in TestFlight', () => {
    expect(paywallEnabled({ EXPO_PUBLIC_PAYWALL_ENABLED: 'false' })).toBe(false);
    expect(paywallEnabled({ EXPO_PUBLIC_PAYWALL_ENABLED: 'true' })).toBe(true);
    const line = routeTierLimitMessage({
      tier: 'standard',
      offerUpgrade: paywallEnabled({ EXPO_PUBLIC_PAYWALL_ENABLED: 'false' }),
    });
    expect(line).toContain('26 mile limit on Standard');
    expect(line).not.toMatch(/Pro|Max/);
  });
});

describe('provider chunking', () => {
  it('splits a 7.4 km sketch so each call stays under the dense-path cap', () => {
    const points = sketch(7_400, 80);
    const chunks = providerChunks(points);
    expect(ORS_CHUNK_MAX_M).toBe(6_000);
    expect(chunks.length).toBe(2);
    expect(chunks[0]?.[0]).toEqual(points[0]);
    expect(chunks[1]?.[chunks[1]!.length - 1]).toEqual(points[points.length - 1]);
    // Shared end, so a stitch has no gap and no invented straight.
    expect(chunks[0]?.[chunks[0]!.length - 1]).toEqual(chunks[1]?.[0]);
    expect(chunks.every((chunk) => pathLengthM(chunk) <= ORS_CHUNK_MAX_M + 80)).toBe(true);
    expect(chunks.every((chunk) => chunk.length <= 50)).toBe(true);
  });

  it('stitches routed pieces on the shared end and never fills a gap with a straight line', () => {
    const left = [along(0), along(1_000), along(3_000)];
    const right = [along(3_000), along(5_000), along(7_400)];
    const joined = stitchRoutedPoints([left, right]);
    expect(joined).toHaveLength(5);
    expect(pathLengthM(joined)).toBeCloseTo(7_400, 0);
    const plan = stitchRoutePlans([
      { points: left, distanceM: 3_000, durationMinutes: 40, ascentM: 10, descentM: 2, elevationsM: [0, 5, 10] },
      { points: right, distanceM: 4_400, durationMinutes: 55, ascentM: 8, descentM: 4, elevationsM: [10, 14, 18] },
    ]);
    expect(plan?.distanceM).toBe(7_400);
    expect(plan?.durationMinutes).toBe(95);
    expect(plan?.ascentM).toBe(18);
    expect(plan?.elevationsM).toEqual([0, 5, 10, 14, 18]);
    const halves = splitChunkInHalf(sketch(7_400, 200));
    expect(halves).not.toBeNull();
    expect(halves![0][halves![0].length - 1]).toEqual(halves![1][0]);
  });

  it('the edge function accepts a long sketch and only refuses an unsplittable 100 km leg', () => {
    expect(readSketchPoints(sketch(7_400))?.length).toBeGreaterThan(2);
    expect(sketchLimitMessage(sketch(7_400))).toBeNull();
    expect(readSketchPoints(sketch(50_000, 400))?.length).toBeGreaterThan(50);
    expect(sketchLimitMessage(sketch(50_000, 400))).toBeNull();
    const longLeg = [along(0), along(120_000)];
    expect(sketchLimitMessage(longLeg)).not.toBeNull();
    expect(ORS_SKETCH_POINT_CAP).toBe(4_000);
  });
});

describe('plan lookup and wiring', () => {
  it('uses a comp over the store plan, and treats a missing plan as Standard at the caller', async () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const rows: Record<string, Record<string, unknown>> = {
      subscriptions: {
        product_id: 'charioteer.monthly',
        status: 'active',
        expires_at: future,
        is_trial: false,
        environment: 'Production',
      },
      entitlement_overrides: { tier: 'pro', expires_at: future },
    };
    const admin = {
      from(table: string) {
        return {
          select() {
            return {
              eq() {
                return { maybeSingle: async () => ({ data: rows[table] ?? null, error: null }) };
              },
            };
          },
        };
      },
    };
    expect(await resolveRouteTier(admin, 'user-1')).toBe('pro');
    rows.entitlement_overrides = { tier: 'max', expires_at: future };
    expect(await resolveRouteTier(admin, 'user-1')).toBe('max');
    delete rows.entitlement_overrides;
    expect(await resolveRouteTier(admin, 'user-1')).toBe('standard');
    delete rows.subscriptions;
    expect(await resolveRouteTier(admin, 'user-1')).toBeNull();
  });

  it('the function and the maker use the same cap, and nothing logs a position', () => {
    const fn = readFileSync('supabase/functions/outdoor-route/index.ts', 'utf8');
    expect(fn).toContain('resolveRouteTier');
    expect(fn).toContain("code: 'tier_limit'");
    expect(fn).toContain('routeSketchByChunks');
    expect(fn).toContain('providerChunks');
    expect(fn).not.toMatch(/console\.(log|info|debug|warn|error)\([^)]*(latitude|longitude)/);
    const maker = readFileSync('src/ui/RouteMaker.tsx', 'utf8');
    expect(maker).toContain('tier: routeTier');
    expect(maker).toContain('routeTierLimitMessage');
    expect(maker).toContain('paywallEnabled()');
    const body = readFileSync('src/domain/routeAdjust.ts', 'utf8');
    expect(body).toContain('ORS_SKETCH_POINT_CAP');
    expect(body).not.toContain('SKETCH_WAYPOINT_MAX).map');
    expect(fn).toContain('stitchPlanWithSketchTail');
    expect(fn).toContain('sectionOrDrawn');
    expect(fn).toContain('keepDrawnSection');
  });
});

describe('restoring a dropped end', () => {
  it('puts a dropped loop back on the stitched route rather than leaving a stub', () => {
    const road = sketch(6_000, 80);
    const stub = road[road.length - 1]!;
    const loop = [stub, along(6_000, 400), along(6_400, 400), along(6_400, 0), stub];
    const filled = appendUncoveredSketchTail(road, [...road, ...loop.slice(1)]);
    expect(filled.keptDrawn).toBe(true);
    expect(filled.points.length).toBeGreaterThan(road.length);
    const plan = stitchPlanWithSketchTail(
      { points: road, distanceM: 6_000, durationMinutes: 75 },
      [...road, ...loop.slice(1)],
    );
    expect(plan.keptDrawn).toBe(true);
    expect(plan.plan.distanceM).toBeGreaterThan(6_000);
  });
});
