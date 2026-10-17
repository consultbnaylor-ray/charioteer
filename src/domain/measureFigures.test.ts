import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  breathPhaseFigure,
  checkInWeekFigure,
  countSplit,
  drinkCountBars,
  drinkFreeFigure,
  healthFigure,
  moodCravingBars,
  moodFigure,
  planProgressFigure,
  rangedRing,
  soberFigure,
  unitsWeekFigure,
  urgeStepFigure,
} from './measureFigures';

const today = '2026-10-15';

describe('measured stats figures', () => {
  it('places sleep and resting heart rate on a healthy band, with a plain line', () => {
    const sleep = healthFigure('sleep_hours', [{ day: today, value: 7.4 }], today);
    expect(sleep?.ring?.ring).toMatchObject({ centre: '7.4', unit: 'h', status: 'Within 7 to 9 hours', tone: 'good', fill: 1 });
    expect(sleep?.zone).toMatchObject({ zoneLow: 7, zoneHigh: 9, zoneCaption: 'Healthy range 7–9 h', tone: 'good' });
    expect(healthFigure('sleep_hours', [{ day: today, value: 5.5 }], today)?.ring?.ring).toMatchObject({
      status: 'Under 7 hours',
      tone: 'watch',
    });
    expect(healthFigure('sleep_hours', [{ day: today, value: 10 }], today)?.ring?.ring).toMatchObject({
      status: 'Over 9 hours, not a warning on its own',
      tone: 'info',
    });

    const heart = healthFigure('resting_heart_rate', [{ day: today, value: 62 }], today);
    expect(heart?.ring?.ring).toMatchObject({ centre: '62', unit: 'bpm', status: 'Within 60 to 100 bpm', tone: 'good' });
    expect(heart?.zone?.zoneCaption).toBe('Usual range 60–100 bpm');
    expect(healthFigure('resting_heart_rate', [{ day: today, value: 54 }], today)?.ring?.ring.status).toContain("you're very fit");
    expect(healthFigure('resting_heart_rate', [{ day: today, value: 108 }], today)?.ring?.ring).toMatchObject({
      status: 'Over 100 bpm',
      tone: 'watch',
    });
  });

  it('measures workout minutes against 150 and does not invent a step target', () => {
    const workouts = healthFigure('workout_minutes', [
      { day: '2026-10-15', value: 32 },
      { day: '2026-10-13', value: 45 },
      { day: '2026-10-08', value: 40 },
    ], today);
    expect(workouts?.ring?.ring).toMatchObject({ centre: '77', unit: 'min', status: '73 minutes to 150', tone: 'info' });
    expect(workouts?.bars?.bars.bars.map((bar) => bar.label)).toEqual(['Tue 45 min', 'Thu 32 min']);
    expect(workouts?.bars?.bars.caption).toBe('Logged workouts may not include walking.');
    expect(healthFigure('workout_minutes', [{ day: today, value: 150 }], today)?.ring?.ring.status).toBe('150 minutes logged');
    expect(healthFigure('workout_minutes', [], today)?.ring?.ring).toMatchObject({ centre: '0', status: '150 minutes to go' });

    const steps = healthFigure('steps', [
      { day: '2026-10-14', value: 8000 },
      { day: today, value: 9100 },
    ], today);
    expect(steps?.ring).toBeUndefined();
    expect(steps?.bars?.bars.bars.map((bar) => bar.label)).toEqual(['Today 9,100', 'Recent average 8,000']);
    expect(steps?.bars?.bars.caption).toContain('There is no daily step target.');
    expect(steps?.bars?.bars.caption).toContain('Higher than your recent average.');
    expect(healthFigure('steps', [], today)).toBeNull();
  });

  it('compares heart-rate variability and weight with words, and refuses a cut', () => {
    const hrv = healthFigure('hrv_sdnn', [
      { day: '2026-10-14', value: 46 },
      { day: today, value: 48 },
    ], today);
    expect(hrv?.bars?.bars.bars.map((bar) => bar.label)).toEqual(['Latest 48 ms', 'Usual 46 ms']);
    expect(hrv?.bars?.bars.caption).toBe('Near your own usual level. There is no official target.');
    expect(healthFigure('hrv_sdnn', [{ day: today, value: 48 }], today)?.bars?.bars.caption).toBe('There is no official target.');

    const weight = healthFigure('weight_kg', [
      { day: '2026-10-01', value: 74.8 },
      { day: today, value: 74.2 },
    ], today);
    expect(weight?.ring).toBeUndefined();
    expect(weight?.bars?.bars.caption).toBe('Lower than the earlier reading.');
    expect(weight?.bars?.bars.bars.map((bar) => bar.label)).toEqual(['Earlier 74.8 kg', 'Latest 74.2 kg']);

    const klass = healthFigure('weight_kg', [
      { day: '2026-10-01', value: 74 },
      { day: today, value: 76 },
    ], today, { classKg: 75 });
    expect(klass?.ring?.ring).toMatchObject({ centre: '76', status: '1 kg over the class', tone: 'watch' });
    expect(klass?.bars?.bars.caption).toContain('This is not a cut.');
  });

  it('uses a ring for mood, check-ins, a plan, breath, and units', () => {
    expect(moodFigure(8)).toMatchObject({ centre: '8', unit: '/10', status: 'On the higher side today', tone: 'good' });
    expect(moodFigure(3).tone).toBe('watch');
    expect(moodCravingBars(7, 2)).toMatchObject({
      caption: 'Craving is lower than mood.',
      bars: [
        { label: 'Mood 7', value: 7, tone: 'good' },
        { label: 'Craving 2', value: 2, tone: 'good' },
      ],
    });
    expect(checkInWeekFigure(5)).toMatchObject({ centre: '5', unit: 'of 7', status: '2 days to go', tone: 'good' });
    expect(checkInWeekFigure(0).status).toBe('None this week');
    expect(countSplit(5, 7, 'logged days', 'open days')).toMatchObject({
      leftLabel: 'Logged days 5',
      rightLabel: 'Open days 2',
      caption: 'More logged days than open days.',
      rightTone: 'info',
    });
    expect(countSplit(2, 7, 'drink-free days', 'days not marked').caption).toBe('Fewer drink-free days than days not marked.');

    const plan = planProgressFigure([
      { key: 'focus', label: 'Focus', done: 1, total: 2 },
      { key: 'fitness', label: 'Fitness', done: 0, total: 2 },
    ]);
    expect(plan?.ring).toMatchObject({ centre: '1', unit: 'of 4', status: '3 left this week', tone: 'info' });
    expect(plan?.bars.bars.map((bar) => bar.label)).toEqual(['Focus 1 of 2', 'Fitness 0 of 2']);
    expect(plan?.bars.caption).toBe('Ticked in each part of the plan.');
    expect(planProgressFigure([])).toBeNull();

    expect(breathPhaseFigure(4, 4, 'Ready')).toMatchObject({ centre: '4', unit: 's', fill: 0, status: 'Ready', tone: 'info' });
    expect(breathPhaseFigure(1, 4, 'Breathe in').fill).toBeCloseTo(0.75);
    expect(urgeStepFigure(2, 5, 'Name it')).toMatchObject({ centre: '2', unit: 'of 5', status: 'Name it', tone: 'info' });
    expect(urgeStepFigure(5, 5, 'Choose one small action').tone).toBe('good');

    expect(unitsWeekFigure(10, 'cutting_down')).toMatchObject({ centre: '10', status: 'Within 14 units', tone: 'good' });
    expect(unitsWeekFigure(20, 'cutting_down')).toMatchObject({ status: 'Over 14 units', tone: 'watch' });
    expect(unitsWeekFigure(10, 'stopped')).toMatchObject({ status: 'Within 14, not a target', tone: 'info' });
    expect(drinkCountBars([{ key: 'pint', label: 'Pint', count: 2 }, { key: 'wine', label: 'Wine', count: 0 }])).toMatchObject({
      caption: 'Only one drink type in this week.',
      bars: [{ label: 'Pint 2', tone: 'info' }],
    });

    expect(soberFigure(new Date('2026-08-01T00:00:00.000Z'), new Date('2026-10-14T12:00:00.000Z')).tone).toBe('good');
    expect(drinkFreeFigure(2, 5)).toMatchObject({ centre: '2', unit: 'of 5', status: '3 days to go', tone: 'info' });
    expect(drinkFreeFigure(3, null).status).toBe('No weekly goal yet');
    expect(rangedRing('15', '%', 15, 8, 20, true, 'Within healthy range').tone).toBe('good');
    expect(rangedRing('28', '%', 28, 8, 20, false, 'Above the healthy range').tone).toBe('watch');
  });

  it('keeps the nutrition card pattern on the measured pages, and the day bars narrow', () => {
    const week = readFileSync('src/ui/CheckInWeek.tsx', 'utf8');
    expect(week).toContain('max={10}');
    expect(week).toContain('width: 8');
    expect(week).toContain('flexGrow: 0');
    expect(week).not.toContain('flex: 1');
    expect(week).toContain('No check-ins in the last 7 days.');
    expect(week).toContain('<MeasureRingView');
    expect(week).toContain('<MeasureSplitView');
    expect(readFileSync('src/ui/BodyComposition.tsx', 'utf8')).toContain('<RangeTrack');
    expect(readFileSync('src/ui/BodyComposition.tsx', 'utf8')).toContain('<MeasureRingView');
    const board = readFileSync('src/ui/HealthBoard.tsx', 'utf8');
    const block = board.slice(board.indexOf("kind === 'weight_kg'"), board.indexOf('<GuidanceRange'));
    expect(block.indexOf('<WeightFields')).toBeGreaterThan(-1);
    expect(block.indexOf('<WeightFields')).toBeLessThan(block.indexOf('label="Height (cm)"'));
    expect(board).toContain('<HealthFigureView');
    expect(readFileSync('src/app/(main)/home.tsx', 'utf8')).toContain('soberFigure');
    expect(readFileSync('src/app/(main)/breathe.tsx', 'utf8')).toContain('breathPhaseFigure');
    expect(readFileSync('src/app/(main)/health-plan.tsx', 'utf8')).toContain('planProgressFigure');
    expect(readFileSync('src/ui/TodayMeals.tsx', 'utf8')).not.toContain('statsTone');
    expect(readFileSync('src/ui/MeasuredFigure.tsx', 'utf8')).toContain('statsToneColors');
  });
});
