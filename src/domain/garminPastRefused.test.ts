import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { garminAllHistoricalRefusal, GARMIN_BACKFILL_TYPES } from '../../supabase/functions/_shared/garmin';
import { GARMIN_PAST_REFUSED } from '@/domain/healthRefresh';

describe('Garmin refuses past activities', () => {
  const types = [...GARMIN_BACKFILL_TYPES];
  const at = (type: string) => types.indexOf(type as (typeof types)[number]);

  it('counts a 412 on activities or activity details as refused even with 404 and 429 elsewhere', () => {
    const statuses = types.map(() => 412);
    statuses[at('pulseox')] = 404;
    statuses[at('moveiq')] = 429;
    expect(garminAllHistoricalRefusal(statuses, types)).toBe(true);
    const detailsOnly = types.map((type) => (type === 'activityDetails' ? 412 : 404));
    expect(garminAllHistoricalRefusal(detailsOnly, types)).toBe(true);
  });

  it('is not refused when Garmin accepted anything or activities were not 412', () => {
    const accepted = types.map((type) => (type === 'dailies' ? 202 : 412));
    expect(garminAllHistoricalRefusal(accepted, types)).toBe(false);
    const other = types.map((type) => (type === 'activities' || type === 'activityDetails' ? 404 : 412));
    expect(garminAllHistoricalRefusal(other, types)).toBe(false);
    expect(garminAllHistoricalRefusal([], types)).toBe(false);
    expect(garminAllHistoricalRefusal([412, 403])).toBe(false);
    expect(garminAllHistoricalRefusal([412, 412])).toBe(true);
  });

  it('passes the asked types from refresh and tells the person plainly', () => {
    expect(readFileSync('supabase/functions/garmin-refresh/index.ts', 'utf8')).toContain('garminAllHistoricalRefusal(statuses, types)');
    expect(GARMIN_PAST_REFUSED).toBe("Garmin hasn't given Charioteer permission to resend past activities, so only new activities will show routes.");
    const ui = readFileSync('src/ui/HealthRefresh.tsx', 'utf8');
    expect(ui).toMatch(/garmin\.code === 'history'\) \{\s+setHistory\(true\);\s+setGarminNote\(GARMIN_PAST_REFUSED\);/);
  });
});
