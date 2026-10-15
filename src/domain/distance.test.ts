import { describe, expect, it } from 'vitest';

import {
  bodyFatRange,
  bodyFatZoneCaption,
  drinkFreeRing,
  gratitudeWeekRing,
  soberMilestoneRing,
  waistRange,
} from './distance';

describe('distance from a target or healthy range', () => {
  it('places body fat and waist against the screen bands', () => {
    const within = bodyFatRange(15, null);
    expect(within).toMatchObject({
      zoneLow: 10,
      zoneHigh: 28,
      scaleMin: 0,
      scaleMax: 45,
      within: true,
      status: 'Within healthy range',
    });
    expect(bodyFatZoneCaption(within)).toBe('Healthy range 10–28%');
    expect(bodyFatRange(4, 'male')).toMatchObject({ status: 'Under the healthy range', zoneLow: 6, zoneHigh: 25 });
    expect(bodyFatRange(50, 'female').scaleMax).toBe(55);
    expect(bodyFatRange(50, 'female').status).toBe('Above the healthy range');

    expect(waistRange(0.47)).toMatchObject({
      scaleMin: 0.25,
      scaleMax: 0.75,
      zoneHigh: 0.5,
      within: true,
      status: 'Within healthy range',
    });
    expect(waistRange(0.5).status).toBe('Above the healthy range');
    expect(waistRange(0.9).scaleMax).toBeCloseTo(0.95);
  });

  it('counts days to the next sober milestone and lines toward the week', () => {
    const started = new Date('2026-08-01T00:00:00.000Z');
    const now = new Date('2026-10-14T17:41:00.000Z');
    expect(soberMilestoneRing(started, now)).toMatchObject({
      centre: '74',
      unit: 'days',
      status: '16 days to 90 days',
    });
    expect(soberMilestoneRing(new Date('2020-01-01T00:00:00.000Z'), now)).toMatchObject({ fill: 1, status: 'Still going' });
    const fresh = new Date('2026-10-14T08:00:00.000Z');
    expect(soberMilestoneRing(fresh, new Date('2026-10-14T18:00:00.000Z')).status).toBe('14 hours to 24 hours');

    expect(drinkFreeRing(2, 5)).toMatchObject({ centre: '2', unit: 'of 5', status: '3 days to go', fill: 0.4 });
    expect(drinkFreeRing(5, 5).status).toBe("This week's aim is met");
    expect(gratitudeWeekRing(3)).toMatchObject({ centre: '3', unit: 'lines', status: '4 lines to go' });
    expect(gratitudeWeekRing(1)).toMatchObject({ centre: '1', unit: 'line', status: '6 lines to go' });
    expect(gratitudeWeekRing(0).status).toBe('None this week');
    expect(gratitudeWeekRing(7).status).toBe("This week's aim is met");
  });
});
