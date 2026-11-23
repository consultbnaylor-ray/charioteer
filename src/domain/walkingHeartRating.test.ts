import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { buildHealthStatBoard, type HealthStatBoardInput } from '@/domain/healthStatTiles';
import { EMPTY_METRIC_CONTEXT, readingFor } from '@/domain/metricRegistry';
import { rateWalkingHeart } from '@/domain/walkingHeartRating';

const fit = { age: 42, sex: 'male' as const };

function board(overrides: Partial<HealthStatBoardInput> = {}) {
  const input: HealthStatBoardInput = {
    today: '2026-11-22',
    samples: [],
    body: [],
    activityEnergyKcal: null,
    heightCm: 178,
    adult: true,
    goalAge: 42,
    goalSex: 'male',
    goal: null,
    build: null,
    ...overrides,
  };
  return buildHealthStatBoard(input);
}

function walking(model: ReturnType<typeof buildHealthStatBoard>) {
  const tile = model.sections.flatMap((section) => section.tiles).find((item) => item.id === 'walking_heart_rate');
  if (!tile) throw new Error('missing walking heart rate tile');
  return tile;
}

describe('walking heart rate rating', () => {
  it('rates a low heart rate Good when resting heart rate and VO2 max are strong', () => {
    const rated = rateWalkingHeart(71, { ...fit, vo2: 50, restingHr: 48 });
    expect(rated.label).toBe('Good');
    expect(rated.where).toContain('Rated Good from the latest reading, 71 bpm, because your resting heart rate and VO2 max are strong.');
    expect(rated.where).toContain('A low walking heart rate usually means an efficient heart.');
    expect(rated.where).toContain('Below the moderate zone');
    expect(rated.where).toContain('This is an approximation.');
    expect(rated.where).toContain('Not medical advice.');
    expect(rated.factors).toEqual(['resting heart rate', 'VO2 max']);
    expect(readingFor('walking_heart_rate', 71, { ...EMPTY_METRIC_CONTEXT, ...fit, vo2: 50, restingHr: 48 }).label).toBe('Good');
  });

  it('rates Excellent when a third strong marker agrees', () => {
    const rated = rateWalkingHeart(71, { ...fit, vo2: 50, restingHr: 48, stepsPerDay: 9000, windowDays: 7 });
    expect(rated.label).toBe('Excellent');
    expect(rated.where).toContain('Rated Excellent from the latest reading, 71 bpm');
    expect(rated.where).toContain('recent steps are strong');
    expect(rated.factors).toEqual(['resting heart rate', 'VO2 max', 'recent steps']);
  });

  it('stays a cautious Fair when no other fitness data is available', () => {
    const rated = rateWalkingHeart(71, { ...fit });
    expect(rated.label).toBe('Fair');
    expect(rated.where).toContain('Rated Fair from the latest reading, 71 bpm.');
    expect(rated.where).toContain('No other fitness data was available, so this stays a cautious rating.');
    expect(rated.where).toContain('easy walk or a fitter heart');
    expect(rated.where).not.toContain('efficient heart');
    expect(rated.where).not.toContain('gentle effort');
    expect(rated.factors).toEqual([]);
  });

  it('stays cautious when the other markers are poor', () => {
    const rated = rateWalkingHeart(71, { ...fit, vo2: 25, restingHr: 95 });
    expect(rated.label).toBe('Fair');
    expect(rated.where).toContain('below the usual range for your age and sex');
    expect(rated.where).toContain('outside the fit range');
    expect(rated.where).toContain('cautious rating');
    expect(rated.where).not.toContain('efficient heart');
  });

  it('stays cautious when strong and poor markers disagree', () => {
    const rated = rateWalkingHeart(71, { ...fit, vo2: 50, restingHr: 95 });
    expect(rated.label).toBe('Fair');
    expect(rated.where).toContain('Your VO2 max is strong');
    expect(rated.where).toContain('resting heart rate is outside the fit range');
    expect(rated.where).toContain('cautious rating');
    expect(rated.where).not.toContain('efficient heart');
  });

  it('does not treat empty vigorous minutes as a poor marker', () => {
    const rated = rateWalkingHeart(71, { ...fit, vo2: 50, restingHr: 48, vigorousMinutes: 0, windowDays: 7 });
    expect(rated.label).toBe('Good');
    expect(rated.where).toContain('because your resting heart rate and VO2 max are strong');
    expect(rated.where).not.toContain('vigorous');
  });

  it('leaves a high walking heart rate on its zone label', () => {
    const high = rateWalkingHeart(150, { ...fit, vo2: 55, restingHr: 45, stepsPerDay: 10000, windowDays: 7 });
    expect(high.label).toBe('Fair');
    expect(high.where).toContain('Rated Fair from the latest reading, 150 bpm.');
    expect(high.where).toContain('Inside the vigorous zone');
    expect(high.where).not.toContain('efficient heart');
    expect(high.where).not.toContain('because your');
    expect(high.factors).toEqual([]);
    expect(high.tips[0]).toContain('slow the pace');

    const inside = rateWalkingHeart(120, { ...fit, vo2: 25 });
    expect(inside.label).toBe('Good');
    expect(inside.where).toContain('Rated Good from the latest reading, 120 bpm.');
    expect(inside.where).toContain('Inside the approximate moderate zone');
    expect(inside.where).not.toContain('because your');
  });

  it('does not use a VO2 max it cannot place, and prefers Garmin HRV over a low Apple SDNN', () => {
    expect(rateWalkingHeart(71, { ...fit, sex: null, vo2: 60 }).where).toContain('No other fitness data was available');
    const hrv = rateWalkingHeart(71, { ...fit, hrvRmssd: 60, hrvSdnn: 20 });
    expect(hrv.label).toBe('Good');
    expect(hrv.where).toContain('your heart rate variability is strong');
    expect(hrv.where).not.toContain('heart rate variability is low');
  });

  it('says Usual when age is missing', () => {
    const rated = rateWalkingHeart(71, { age: null, sex: 'male' });
    expect(rated.label).toBe('Usual');
    expect(rated.where).toContain('Age is not set');
    expect(rated.band).toBeNull();
  });

  it('does not apply this upgrade to session heart rate or heart-rate recovery', () => {
    const ctx = { ...EMPTY_METRIC_CONTEXT, ...fit, vo2: 55, restingHr: 48, stepsPerDay: 9000, windowDays: 7 };
    expect(readingFor('session_heart_rate', 96, ctx).label).toBe('Good');
    expect(readingFor('session_heart_rate', 180, ctx).label).toBe('Fair');
    expect(readingFor('heart_rate_recovery', 8, ctx).label).toBe('Fair');
    expect(readingFor('heart_rate_recovery', 22, ctx).label).toBe('Good');
    expect(readingFor('resting_heart_rate', 48, ctx).label).toBe('Good');
    expect(readingFor('resting_heart_rate', 110, ctx).label).toBe('Poor');
  });

  it('rates the chart latest, not the window average, and keeps the badge and note on the same words', () => {
    const model = board({
      samples: [
        { kind: 'walking_heart_rate', value: 85, recordedOn: '2026-11-18' },
        { kind: 'walking_heart_rate', value: 71, recordedOn: '2026-11-22' },
      ],
    });
    const tile = walking(model);
    expect(tile.valueText).toBe('71');
    expect(tile.rating?.label).toBe('Fair');
    expect(tile.rating?.where).toBe(tile.status);
    expect(tile.visual.kind).toBe('zone');
    if (tile.visual.kind === 'zone') expect(tile.visual.status).toBe(tile.status);
    expect(tile.status).toContain('Rated Fair from the latest reading, 71 bpm.');
    expect(tile.status).not.toContain('78');
    expect(tile.status).toContain('Below the moderate zone');
    expect(tile.status).toContain('This is an approximation.');
  });

  it('uses a fresh Garmin VO2 max ahead of a lower Apple Health reading', () => {
    const samples = [
      { kind: 'walking_heart_rate', value: 71, recordedOn: '2026-11-22' },
      { kind: 'vo2_max', value: 28, recordedOn: '2026-11-22' },
      { kind: 'resting_heart_rate', value: 48, recordedOn: '2026-11-22' },
    ];
    const garmin = walking(board({
      samples,
      userMetrics: [{ calendarDate: '2026-11-20', vo2Max: 55 }],
    }));
    expect(garmin.rating?.label).toBe('Good');
    expect(garmin.status).toContain('because your resting heart rate and VO2 max are strong');

    const apple = walking(board({ samples }));
    expect(apple.rating?.label).toBe('Fair');
    expect(apple.status).toContain('VO2 max is below the usual range');
    expect(apple.status).not.toContain('efficient heart');

    const stale = walking(board({
      samples,
      userMetrics: [{ calendarDate: '2026-08-01', vo2Max: 55 }],
    }));
    expect(stale.rating?.label).toBe('Fair');
  });

  it('names the rating in the explanation without prefixing the badge twice', () => {
    expect(readFileSync('src/ui/MetricRating.tsx', 'utf8')).toContain("startsWith('Rated ')");
  });
});
