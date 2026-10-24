import { describe, expect, it } from 'vitest';

import {
  bodyCompositionChart,
  checkInChart,
  checkInDayChart,
  fitnessSeriesChart,
  healthSampleChart,
  healthWindowChart,
  loggedNutritionChart,
  loggingChart,
  nutritionTrendChart,
  overviewLineChart,
  overviewScoreChart,
  profileTrendChart,
  sparklineFromDays,
  waistChart,
  weightChart,
} from '@/domain/chartSeries';
import { workoutMixReport } from '@/domain/fitnessSnapshot';
import type { TrendDay } from '@/domain/nutrition';
import { chartPlot } from '@/domain/readingChart';

const OLDER = '2026-09-21';
const MIDDLE = '2026-10-10';
const NEWER = '2026-10-18';
const TODAY = '2026-10-20';

const newestFirst = [
  { day: NEWER, value: 41.7 },
  { day: MIDDLE, value: 44.3 },
  { day: OLDER, value: 42.8 },
];

function expectOldestLeft(points: readonly { day: string }[]): void {
  const days = points.map((point) => point.day);
  expect(days).toEqual([...days].sort());
  expect(days[0]).toBe(OLDER);
  expect(days.at(-1)).toBe(NEWER);
}

describe('chart adapters plot oldest on the left', () => {
  const samples = newestFirst.map((point) => ({ kind: 'vo2_max', value: point.value, recordedOn: point.day }));

  it('keeps every time chart ascending when the rows arrive newest first', () => {
    expectOldestLeft(healthSampleChart(samples, 'vo2_max', TODAY));
    expectOldestLeft(healthWindowChart(samples, 'vo2_max', TODAY, 90));
    expectOldestLeft(weightChart(samples.map((sample) => ({ ...sample, kind: 'weight_kg' }))));
    expectOldestLeft(fitnessSeriesChart(newestFirst));
    expectOldestLeft(profileTrendChart(newestFirst));
    expectOldestLeft(overviewLineChart(newestFirst));
    expectOldestLeft(overviewScoreChart(newestFirst.map((point) => ({ day: point.day, value: point.value }))));
    expectOldestLeft(checkInChart([
      { day: NEWER, value: 4 },
      { day: OLDER, value: 8 },
      { day: MIDDLE, value: 6 },
    ]));
    expect(sparklineFromDays(newestFirst)).toEqual([42.8, 44.3, 41.7]);
    expectOldestLeft(bodyCompositionChart([
      { recordedOn: `${NEWER}T18:00:00.000Z`, value: 18 },
      { recordedOn: MIDDLE, value: 19 },
      { recordedOn: OLDER, value: 20 },
    ]));
    expectOldestLeft(waistChart([
      { recordedOn: NEWER, waistCm: 84, createdAt: `${NEWER}T18:00:00.000Z` },
      { recordedOn: MIDDLE, waistCm: 86, createdAt: `${MIDDLE}T08:00:00.000Z` },
      { recordedOn: OLDER, waistCm: 88, createdAt: `${OLDER}T08:00:00.000Z` },
    ], TODAY, 90));
    const days: TrendDay[] = [
      { day: NEWER, kcal: 2100, proteinG: 140, logged: true },
      { day: OLDER, kcal: 1800, proteinG: 120, logged: true },
      { day: MIDDLE, kcal: 0, proteinG: 0, logged: false },
    ];
    expect(loggedNutritionChart(days, (day) => day.kcal).map((point) => point.day)).toEqual([OLDER, NEWER]);
    expect(loggingChart(days).map((day) => day.day)).toEqual([OLDER, MIDDLE, NEWER]);
    const mood = checkInDayChart([
      { mood: 4, craving: 2, createdAt: `${NEWER}T12:00:00.000Z` },
      { mood: 8, craving: 1, createdAt: `${OLDER}T12:00:00.000Z` },
    ], new Date(2026, 9, 20), 40);
    expect(mood.map((point) => point.day)).toEqual([OLDER, NEWER]);
    const plot = chartPlot({
      points: newestFirst,
      start: '2026-09-01',
      end: TODAY,
      bucket: 'day',
      aggregate: 'mean',
    });
    expectOldestLeft(plot.points);
    expect(plot.end).toBe(NEWER);
  });

  it('builds nutrition days and session weeks from oldest to newest', () => {
    const plotted = nutritionTrendChart([
      {
        id: 'new',
        userId: 'user',
        eatenOn: NEWER,
        eatenAt: null,
        meal: 'lunch',
        source: 'text',
        note: '',
        items: [{ name: 'eggs', kcal: 150, proteinG: 12, carbsG: 1, sugarG: 0, fibreG: 0, unsaturatedG: 7, saturatedG: 3, transG: 0, sodiumMg: 80, processed: false }],
        estimated: false,
        portion: 1,
        createdAt: `${NEWER}T12:00:00.000Z`,
        previewUrl: null,
      },
      {
        id: 'old',
        userId: 'user',
        eatenOn: OLDER,
        eatenAt: null,
        meal: 'breakfast',
        source: 'text',
        note: '',
        items: [{ name: 'oats', kcal: 200, proteinG: 8, carbsG: 30, sugarG: 1, fibreG: 4, unsaturatedG: 3, saturatedG: 1, transG: 0, sodiumMg: 0, processed: false }],
        estimated: false,
        portion: 1,
        createdAt: `${OLDER}T08:00:00.000Z`,
        previewUrl: null,
      },
    ], TODAY, 40, (day) => day.kcal);
    expect(plotted.map((point) => point.day)).toEqual([OLDER, NEWER]);
    const mix = workoutMixReport({
      samples: [
        { kind: 'workout_type_50', value: 40, recordedOn: NEWER },
        { kind: 'workout_type_37', value: 30, recordedOn: '2026-09-07' },
      ],
      today: TODAY,
    });
    expect(mix.weeks.at(-1)?.label).toBe('Now');
    expect(mix.weeks[0]?.label).not.toBe('Now');
    expect(mix.weeks.map((week) => week.label).indexOf('Now')).toBe(mix.weeks.length - 1);
  });
});
