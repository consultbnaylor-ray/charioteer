import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { GARMIN_SOURCE, chartSourceCaption, stepsSeries, type AppleDayValue } from '@/domain/dailyActivity';
import {
  ATHLETE_RESTING_NOTE,
  BODY_BATTERY_ZONES,
  BREATH_TYPICAL_HIGH,
  BREATH_TYPICAL_LOW,
  GARMIN_DETAILS_TITLE,
  GARMIN_SCORE_NOTE,
  GENERAL_GUIDANCE,
  NO_DATA,
  NO_STANDARD_RANGE,
  OUTSIDE_RANGE_NOTE,
  RESTING_TYPICAL_HIGH,
  RESTING_TYPICAL_LOW,
  SPO2_TYPICAL_LOW,
  STEPS_TYPICAL_HIGH,
  STEPS_TYPICAL_LOW,
  STRESS_ZONES,
  WHO_MODERATE_HIGH,
  WHO_MODERATE_LOW,
  activityChartGuide,
  distanceChartGuide,
  floorsChartGuide,
  garminDetailCharts,
  garminSourceCaption,
  intensitySeries,
  movementPeriod,
  restingChartGuide,
  stepGoalInPeriod,
  stepsChartGuide,
} from '@/domain/garminCharts';
import type { GarminDaily } from '@/domain/garminConnect';
import { periodDayCount } from '@/domain/statWindow';

const end = '2026-10-22';

function daily(partial: Partial<GarminDaily> & { calendarDate: string }): GarminDaily {
  return {
    restingHeartRateBpm: null,
    averageHeartRateBpm: null,
    moderateMinutes: null,
    vigorousMinutes: null,
    ...partial,
  };
}

describe('garmin charts follow the shared period', () => {
  it('uses the Health stats period unless a screen passes its own span', () => {
    expect(movementPeriod(undefined, '7')).toEqual({ period: '7', days: 7 });
    expect(movementPeriod(undefined, '30')).toEqual({ period: '30', days: 30 });
    expect(movementPeriod(undefined, '12m').days).toBe(periodDayCount('12m'));
    expect(movementPeriod(7, '12m')).toEqual({ period: '7', days: 7 });
    expect(movementPeriod(30, '7')).toEqual({ period: '30', days: 30 });

    const screen = readFileSync('src/ui/DailyActivity.tsx', 'utf8');
    expect(screen).toContain('useStatPeriod');
    expect(screen).toContain('movementPeriod(span, sharedPeriod)');
    expect(screen).toContain('<StatPeriodToggle />');
    expect(screen).toContain('framed ? 14 : 8');
    expect(screen).toContain('garminDetailCharts');
    expect(GARMIN_DETAILS_TITLE).toBe('Garmin details');
    expect(screen).toContain('title={GARMIN_DETAILS_TITLE}');
    expect(screen).toContain('Not medical advice.');
    expect(screen).toContain('from \'@/ui/MoreInfo\'');
    expect(screen).not.toContain('What is this?');
    expect(screen).not.toContain('seriesUsesGarmin');
    expect(screen).not.toContain('latitude');
    expect(screen).not.toContain('longitude');
    for (const file of ['src/app/(main)/health.tsx', 'src/app/(main)/health-plan.tsx', 'src/app/(main)/stats.tsx']) {
      const source = readFileSync(file, 'utf8');
      const start = source.indexOf('<MovementCharts');
      const block = source.slice(start, source.indexOf('/>', start));
      expect(block).not.toContain('span=');
      expect(block).toContain('userMetrics={readings.userMetrics}');
    }
    expect(readFileSync('src/ui/DailyActivity.tsx', 'utf8')).toContain('span={span}');
    expect(readFileSync('src/domain/garminCharts.ts', 'utf8')).not.toMatch(/latitude|longitude|maxStress/);
  });

  it('changes the step window and the source caption when the period changes', () => {
    const apple: AppleDayValue[] = [{ day: end, value: 8000 }];
    const dailies = [
      daily({ calendarDate: '2026-10-01', steps: 4000, stepGoal: 9000 }),
      daily({ calendarDate: end, steps: 1000, stepGoal: 8260 }),
    ];
    const week = stepsSeries(end, movementPeriod(undefined, '7').days, apple, dailies);
    const month = stepsSeries(end, movementPeriod(undefined, '30').days, apple, dailies);
    expect(week).toHaveLength(7);
    expect(month).toHaveLength(30);
    expect(week[0]?.day).toBe('2026-10-16');
    expect(month[0]?.day).toBe('2026-09-23');
    expect(chartSourceCaption(week)).toBe('(Apple Health)');
    expect(chartSourceCaption(month)).toBe('(Apple Health and Garmin)');
    expect(week.find((point) => point.day === '2026-10-01')).toBeUndefined();
    expect(month.find((point) => point.day === '2026-10-01')).toMatchObject({ value: 4000, source: 'garmin' });
    expect(month.find((point) => point.source == null)?.label).not.toContain(GARMIN_SOURCE);

    const weekGoal = stepsChartGuide('7', stepGoalInPeriod(dailies, end, '7'));
    const monthGoal = stepsChartGuide('30', stepGoalInPeriod(dailies, end, '30'));
    expect(weekGoal.dailyTypical).toEqual({ low: STEPS_TYPICAL_LOW, high: STEPS_TYPICAL_HIGH });
    expect(weekGoal.periodTypical).toEqual({ low: 49_000, high: 70_000 });
    expect(monthGoal.periodTypical).toEqual({ low: 210_000, high: 300_000 });
    expect(weekGoal.target?.value).toBe(8260);
    expect(monthGoal.target?.value).toBe(8260);
    expect(weekGoal.legend).toContain('49,000');
    expect(monthGoal.legend).toContain('210,000');
    expect(weekGoal.legend).toContain(GENERAL_GUIDANCE);
    expect(stepGoalInPeriod([daily({ calendarDate: '2026-09-01', stepGoal: 5000 })], end, '7')).toBeNull();
  });

  it('changes Garmin chart length and source labels, and keeps a zero score', () => {
    const input = {
      endDay: end,
      dailies: [
        daily({ calendarDate: '2026-10-01', averageStressLevel: 40, bodyBatteryCharged: 0 }),
        daily({ calendarDate: end, averageStressLevel: 0, bodyBatteryCharged: 32, bodyBatteryDrained: 15 }),
      ],
      sleep: [],
      respiration: [],
      pulseOx: [],
      hrv: [],
    };
    const week = garminDetailCharts({ ...input, period: '7' });
    const month = garminDetailCharts({ ...input, period: '30' });
    const weekStress = week.find((chart) => chart.id === 'stress');
    const monthStress = month.find((chart) => chart.id === 'stress');
    expect(weekStress?.points).toHaveLength(7);
    expect(monthStress?.points).toHaveLength(30);
    expect(garminSourceCaption(weekStress!)).toBe(GARMIN_SOURCE);
    expect(garminSourceCaption(monthStress!)).toBe(GARMIN_SOURCE);
    expect(weekStress?.points.find((point) => point.day === '2026-10-01')).toBeUndefined();
    expect(monthStress?.points.find((point) => point.day === '2026-10-01')).toMatchObject({ value: 40, source: 'garmin' });
    expect(monthStress?.points.find((point) => point.day === '2026-10-01')?.label).toContain(GARMIN_SOURCE);
    const empty = monthStress?.points.find((point) => point.empty);
    expect(empty?.label.startsWith(NO_DATA)).toBe(true);
    expect(empty?.label).not.toContain(GARMIN_SOURCE);
    expect(empty?.source).toBeNull();
    const zero = weekStress?.points.find((point) => point.day === end);
    expect(zero).toMatchObject({ value: 0, source: 'garmin', empty: false });
    expect(zero?.label).toContain(`0 score ${GARMIN_SOURCE}`);

    const day = garminDetailCharts({ ...input, period: 'day', dailies: [daily({ calendarDate: '2026-10-01', averageStressLevel: 40 })] });
    expect(day.find((chart) => chart.id === 'stress')).toBeUndefined();

    const charged = week.find((chart) => chart.id === 'body_battery_charged');
    expect(charged?.points.find((point) => point.day === end)).toMatchObject({ value: 32, source: 'garmin' });
    expect(month.find((chart) => chart.id === 'body_battery_charged')?.points.find((point) => point.day === '2026-10-01')).toMatchObject({
      value: 0,
      source: 'garmin',
      empty: false,
    });
    expect(week.map((chart) => chart.id)).not.toContain('max_stress');
  });
});

describe('garmin chart bands', () => {
  it('uses the stated ranges and leaves the rest without a standard band', () => {
    const resting = restingChartGuide('30', [{ value: 0 }, { value: 58 }]);
    expect(resting.dailyTypical).toEqual({ low: RESTING_TYPICAL_LOW, high: RESTING_TYPICAL_HIGH });
    expect(resting.periodTypical).toEqual(resting.dailyTypical);
    expect(resting.outside).toBe(ATHLETE_RESTING_NOTE);
    expect(resting.outside).not.toContain('doctor');
    expect(restingChartGuide('7', [{ value: 110 }]).outside).toBe(OUTSIDE_RANGE_NOTE);
    expect(restingChartGuide('7', [{ value: 72 }]).outside).toBeNull();
    expect(resting.legend).toContain('the last 30 days');
    expect(restingChartGuide('7', [{ value: 72 }]).legend).toContain('the last 7 days');

    const weekMinutes = activityChartGuide('7');
    const monthMinutes = activityChartGuide('30');
    expect(weekMinutes.periodTypical).toEqual({ low: WHO_MODERATE_LOW, high: WHO_MODERATE_HIGH });
    expect(monthMinutes.periodTypical).toEqual({ low: 643, high: 1286 });
    expect(weekMinutes.dailyTypical).toEqual({ low: WHO_MODERATE_LOW / 7, high: WHO_MODERATE_HIGH / 7 });
    expect(monthMinutes.legend).toContain('1,286');
    expect(activityChartGuide('day').periodTypical?.low).toBe(21);

    const charts = garminDetailCharts({
      endDay: end,
      period: '7',
      dailies: [daily({
        calendarDate: end,
        averageStressLevel: 80,
        bodyBatteryCharged: 20,
        bodyBatteryDrained: 15,
        bodyBatteryHighest: 90,
        bodyBatteryLowest: 10,
      })],
      sleep: [{
        summaryId: 'night',
        calendarDate: end,
        durationSeconds: 7.5 * 3600,
        deepSeconds: null,
        lightSeconds: null,
        remSeconds: null,
        awakeSeconds: null,
        sleepScore: 81,
      }],
      respiration: [{ summaryId: 'b', calendarDate: end, averageBreathsPerMinute: 22, highestBreathsPerMinute: null, lowestBreathsPerMinute: null }],
      pulseOx: [{ summaryId: 'o', calendarDate: end, averageSpo2: 92, lowestSpo2: null, highestSpo2: null }],
      hrv: [
        { summaryId: 'h1', calendarDate: '2026-10-21', lastNightAvgMs: 40, lastNight5MinHighMs: null },
        { summaryId: 'h2', calendarDate: end, lastNightAvgMs: 60, lastNight5MinHighMs: null },
      ],
      userMetrics: [
        { summaryId: 'cycle', calendarDate: '2026-10-21', vo2Max: null, vo2MaxCycling: 48, fitnessAge: null },
        { summaryId: 'run', calendarDate: end, vo2Max: 42, vo2MaxCycling: 48, fitnessAge: null },
      ],
      age: 42,
      sex: 'male',
    });
    const byId = new Map(charts.map((chart) => [chart.id, chart]));
    expect(byId.get('stress')?.guide.dailyTypical).toBeNull();
    expect(byId.get('stress')?.guide.legend).toContain(STRESS_ZONES);
    expect(byId.get('stress')?.guide.legend).toContain(GARMIN_SCORE_NOTE);
    expect(byId.get('stress')?.guide.outside).toBeNull();
    expect(byId.get('body_battery_charged')?.guide.legend).toContain(BODY_BATTERY_ZONES);
    expect(byId.get('body_battery_charged')?.guide.about).toContain(GARMIN_SCORE_NOTE);
    expect(byId.get('sleep_score')?.guide.legend).toContain(NO_STANDARD_RANGE);
    expect(byId.get('sleep_score')?.guide.dailyTypical).toBeNull();
    expect(byId.get('sleep_duration')?.points.find((point) => point.day === end)?.label).toContain('7.5 hours');
    expect(byId.get('sleep_duration')?.guide.dailyTypical).toBeNull();
    expect(byId.get('respiration')?.guide.dailyTypical).toEqual({ low: BREATH_TYPICAL_LOW, high: BREATH_TYPICAL_HIGH });
    expect(byId.get('respiration')?.guide.outside).toBe(OUTSIDE_RANGE_NOTE);
    expect(byId.get('pulse_ox')?.guide.dailyTypical?.low).toBe(SPO2_TYPICAL_LOW);
    expect(byId.get('pulse_ox')?.guide.outside).toBe(OUTSIDE_RANGE_NOTE);
    expect(byId.get('hrv')?.guide.dailyTypical).toBeNull();
    expect(byId.get('hrv')?.guide.ownAverage?.value).toBe(50);
    expect(byId.get('hrv')?.guide.legend).toContain('your own recent average');
    expect(byId.get('hrv')?.guide.legend).toContain('not a healthy range for everyone');
    expect(byId.get('hrv')?.guide.about).toContain('no population healthy band');
    const longer = garminDetailCharts({
      endDay: end,
      period: '30',
      dailies: [],
      sleep: [],
      respiration: [],
      pulseOx: [],
      hrv: [
        { summaryId: 'old', calendarDate: '2026-09-23', lastNightAvgMs: 80, lastNight5MinHighMs: null },
        { summaryId: 'h2', calendarDate: end, lastNightAvgMs: 60, lastNight5MinHighMs: null },
      ],
    });
    expect(longer.find((chart) => chart.id === 'hrv')?.guide.ownAverage?.value).toBe(70);
    expect(longer.find((chart) => chart.id === 'hrv')?.points).toHaveLength(30);

    expect(byId.get('vo2')?.guide.dailyTypical).toEqual({ low: 31.9, high: 45 });
    expect(byId.get('vo2')?.points.find((point) => point.day === '2026-10-21')?.empty).toBe(true);
    expect(byId.get('vo2')?.points.find((point) => point.day === end)?.label).toContain('42 ml/kg/min (Garmin)');
    const noAge = garminDetailCharts({
      endDay: end,
      period: '7',
      dailies: [],
      sleep: [],
      respiration: [],
      pulseOx: [],
      hrv: [],
      userMetrics: [{ summaryId: 'run', calendarDate: end, vo2Max: 42, vo2MaxCycling: null, fitnessAge: null }],
    });
    expect(noAge.find((chart) => chart.id === 'vo2')?.guide.dailyTypical).toBeNull();
    expect(noAge.find((chart) => chart.id === 'vo2')?.guide.legend).toContain(NO_STANDARD_RANGE);

    const distance = [
      { value: 0 },
      { value: 2000 },
      { value: 4000 },
    ];
    const distanceGuide = distanceChartGuide('7', distance);
    expect(distanceGuide.dailyTypical).toBeNull();
    expect(distanceGuide.legend).toContain(NO_STANDARD_RANGE);
    expect(distanceGuide.ownAverage?.label).toContain('3 km');
    expect(distanceChartGuide('30', [{ value: 1000 }, { value: 3000 }]).ownAverage?.value).toBe(2000);
    const floors = floorsChartGuide('day', [{ value: 8 }]);
    expect(floors.dailyTypical).toBeNull();
    expect(floors.legend).toContain(NO_STANDARD_RANGE);
    expect(floors.ownAverage?.label).toContain('today');

    const minutes = intensitySeries(end, '7', [daily({ calendarDate: end, moderateMinutes: 20, vigorousMinutes: 10 })]);
    expect(minutes.find((point) => point.day === end)).toMatchObject({ value: 40, source: 'garmin' });
    expect(minutes.find((point) => point.empty)?.label).not.toContain(GARMIN_SOURCE);
    expect(minutes.find((point) => point.day === end)?.label).toContain('vigorous');
  });
});
