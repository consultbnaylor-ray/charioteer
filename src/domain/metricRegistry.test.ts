import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { GARMIN_CARD_CATALOGUE, garminDetailCharts, garminPlaceholderCharts, type GarminChartInput } from '@/domain/garminCharts';
import { buildHealthStatBoard, HEALTH_STAT_CATALOGUE } from '@/domain/healthStatTiles';
import {
  ACTIVITY_BAR_TITLES,
  EMPTY_METRIC_CONTEXT,
  METRIC_CAVEAT,
  METRIC_REGISTRY,
  metricAudit,
  readingFor,
} from '@/domain/metricRegistry';
import { defaultNutritionSettings } from '@/domain/nutrition';
import { profileStatBoard } from '@/domain/profileStatTiles';
import type { PublicProfileView } from '@/domain/profileSharing';
import { buildStatsOverview } from '@/domain/statsOverview';
import { RESTING_AEROBIC_TIP, SLEEP_WAKE_TIP, STEP_WALK_TIP, VO2_CARD_TIPS, VO2_MAIN_TIP } from '@/domain/trainingGuidance';

const end = '2026-11-01';

describe('metric registry', () => {
  it('rates every catalogue, overview, profile, and Garmin card from one list', () => {
    for (const item of HEALTH_STAT_CATALOGUE) {
      const reading = readingFor(item.id, 50, { ...EMPTY_METRIC_CONTEXT, age: 45, sex: 'male', heightCm: 180 });
      expect(reading.caveat, item.id).toBe(METRIC_CAVEAT);
      expect(reading.source.length, item.id).toBeGreaterThan(8);
      expect(reading.label, item.id).toBeTruthy();
      expect(reading.where.length, item.id).toBeGreaterThan(0);
    }

    const board = buildHealthStatBoard({
      today: end,
      samples: [
        { kind: 'steps', value: 9000, recordedOn: end },
        { kind: 'resting_heart_rate', value: 62, recordedOn: end },
        { kind: 'sleep_hours', value: 7.4, recordedOn: end },
        { kind: 'hrv_sdnn', value: 48, recordedOn: end },
        { kind: 'vo2_max', value: 42, recordedOn: end },
        { kind: 'active_energy', value: 420, recordedOn: end },
        { kind: 'workout_minutes', value: 30, recordedOn: end },
        { kind: 'weight_kg', value: 78, recordedOn: end },
      ],
      body: [{ recordedOn: end, bodyFatPct: 18, leanMassKg: 60, waistCm: 84 }],
      activityEnergyKcal: 420,
      heightCm: 180,
      adult: true,
      goalAge: 45,
      goalSex: 'male',
      goal: null,
      build: null,
    });
    const healthTiles = board.sections.flatMap((section) => section.tiles);
    expect(healthTiles.length).toBeGreaterThan(0);
    for (const tile of healthTiles) {
      expect(METRIC_REGISTRY[tile.id], tile.id).toBeTruthy();
      expect(tile.rating?.caveat, tile.id).toBe(METRIC_CAVEAT);
      expect(tile.rating?.source.length, tile.id).toBeGreaterThan(8);
      expect(tile.rating?.label, tile.id).toBeTruthy();
    }

    const overview = buildStatsOverview({
      now: new Date(2026, 10, 1, 12),
      stage: 'stopped',
      sobrietyStartedAt: '2026-08-01T00:00:00.000Z',
      plannedQuitAt: null,
      drinkFreeOn: [],
      drinkFreeDaysGoal: 4,
      checkIns: [{ mood: 4, craving: 8, createdAt: '2026-11-01T08:00:00.000Z' }],
      health: [{ kind: 'weight_kg', value: 78, recordedOn: end }],
      heightCm: 180,
      nutrition: { ...defaultNutritionSettings(), goalAge: 45, goalSex: 'male' },
      foodLogs: [],
      waterDays: [],
      bodyComposition: [],
      gratitude: [],
    });
    for (const tile of overview) {
      expect(METRIC_REGISTRY[tile.id], tile.id).toBeTruthy();
      expect(tile.rating?.caveat, tile.id).toBe(METRIC_CAVEAT);
      expect(tile.rating?.source, tile.id).toBeTruthy();
      expect(tile.rating?.label, tile.id).toBeTruthy();
    }

    const profile = profileStatBoard({
      sober: { days: 12, since: '2026-08-01' },
      moodStreak: 3,
      moneySaved: 20,
      unitsAvoided: 4,
      health: [],
      healthTrends: [],
      gratitude: [{ id: 'g', body: 'Tea', entryDate: end, photos: [] }],
      foodDiary: [],
      calories: null,
      quality: null,
      progress: null,
      bodyFigures: null,
      goal: null,
      healthPlan: null,
    } as unknown as PublicProfileView, { audience: 'member' });
    expect(profile.tiles.length).toBeGreaterThan(0);
    for (const tile of profile.tiles) {
      expect(METRIC_REGISTRY[tile.id], tile.id).toBeTruthy();
      expect(tile.rating?.caveat, tile.id).toBe(METRIC_CAVEAT);
      expect(tile.rating?.source, tile.id).toBeTruthy();
    }

    const charts = garminDetailCharts({
      endDay: end,
      period: '7',
      age: 45,
      sex: 'male',
      goal: 'elite_runner',
      dailies: [{
        calendarDate: end,
        averageStressLevel: 40,
        bodyBatteryCharged: 30,
        bodyBatteryDrained: 20,
        bodyBatteryHighest: 90,
        bodyBatteryLowest: 25,
        restingHeartRateBpm: 58,
        vigorousMinutes: 20,
        moderateMinutes: 40,
      }],
      sleep: [{ calendarDate: end, durationSeconds: 7.5 * 3600, sleepScore: 82, deepSeconds: null, lightSeconds: null, remSeconds: null, awakeSeconds: null }],
      respiration: [{ calendarDate: end, averageBreathsPerMinute: 14, highestBreathsPerMinute: null, lowestBreathsPerMinute: null }],
      pulseOx: [{ calendarDate: end, averageSpo2: 97, lowestSpo2: null, highestSpo2: null }],
      hrv: [{ calendarDate: end, lastNightAvgMs: 44, lastNight5MinHighMs: null }],
      userMetrics: [{ calendarDate: end, vo2Max: 44, vo2MaxCycling: null, fitnessAge: 44 }],
      bloodPressure: [{ calendarDate: end, systolic: 118, diastolic: 76 }],
      bodyComp: [{ calendarDate: end, bodyFatPct: 16, bmi: 23.4, weightKg: 76 }],
      skinTemp: [{ calendarDate: end, deviationC: 0.2 }],
      stress: [{ calendarDate: end, averageStress: 22 }],
      epochs: [{ calendarDate: end, activeSeconds: 600 }],
      healthSnapshot: [{ calendarDate: end, restingHeartRateBpm: 60, heartRateBpm: null }],
      moveIq: [{ calendarDate: end, durationSeconds: 900 }],
      activityDetails: [{ calendarDate: end, durationSeconds: 1800 }],
    } as unknown as GarminChartInput);
    const ids = charts.map((chart) => chart.id);
    expect(ids).toEqual(expect.arrayContaining([
      'stress', 'body_battery_charged', 'sleep_score', 'sleep_duration', 'respiration', 'pulse_ox', 'hrv', 'vo2',
      'fitness_age', 'skin_temp', 'blood_pressure', 'diastolic', 'body_fat', 'bmi',
      'snapshot_heart', 'epoch_minutes', 'move_iq', 'activity_detail',
    ]));
    for (const chart of charts) {
      expect(METRIC_REGISTRY[chart.id], chart.id).toBeTruthy();
      expect(chart.guide.rating?.caveat, chart.id).toBe(METRIC_CAVEAT);
      expect(chart.guide.rating?.source, chart.id).toBe(METRIC_REGISTRY[chart.id]?.source);
      expect(chart.guide.rating?.label, chart.id).toBeTruthy();
    }
  });

  it('fails closed when a card id is missing, and keeps tips for the low side only', () => {
    expect(() => readingFor('not-a-card', 1, EMPTY_METRIC_CONTEXT)).toThrow(/not-a-card/);
    const fair = readingFor('sleep_score', 65, { ...EMPTY_METRIC_CONTEXT, age: 45, sex: 'male' });
    expect(fair.label).toBe('Fair');
    expect(fair.tips.length).toBeGreaterThan(0);
    const good = readingFor('sleep_score', 85, { ...EMPTY_METRIC_CONTEXT, age: 45, sex: 'male' });
    expect(good.label).toBe('Good');
    expect(good.tips).toEqual([]);
    const steps = readingFor('steps', 9000, { ...EMPTY_METRIC_CONTEXT, age: 40, sex: 'female' });
    expect(steps.label).toBe('Good');
    expect(steps.tips).toEqual([]);
    expect(steps.where).toContain('8,000');
    const close = readingFor('fitness_age', 44, {
      ...EMPTY_METRIC_CONTEXT,
      age: 45,
      sex: 'male',
      realAge: 45,
      vo2: 42,
      restingHr: 58,
      bmi: 23,
      vigorousWeek: 40,
    });
    expect(close.label).toBe('Good');
    expect(close.inputs?.map((line) => line.name)).toEqual([
      'VO2 max',
      'Resting heart rate',
      'BMI',
      'Vigorous intensity minutes',
    ]);
    expect(close.inputs?.map((line) => line.detail).join(' ')).toContain('75');
    expect(close.tips[0]).toContain('75');
    expect(close.caveat).toBe(METRIC_CAVEAT);
    const cruiser = readingFor('fitness_age', 44, {
      ...EMPTY_METRIC_CONTEXT,
      age: 45,
      sex: 'male',
      goal: 'elite_cruiser_boxer',
      realAge: 45,
      vo2: 42,
      restingHr: 58,
      bodyFat: 18,
      vigorousWeek: 40,
    });
    expect(cruiser.goalLine).toContain('56–62');
    expect(cruiser.goalLine).toContain('40–60');
    expect(cruiser.goalLine).toContain('6–13%');
    expect(cruiser.goalLine).toContain('Quickest to work on: Vigorous intensity minutes');
    expect(cruiser.why?.body).toContain('13%');
    expect(cruiser.why?.body).toContain('80%');
    expect(cruiser.why?.body).toContain('watch estimate');
    expect(cruiser.why?.body).toContain('cannot predict');
    expect(cruiser.why?.sources).toContain('Kodama');
    expect(cruiser.why?.sources).toContain('Mandsager');
    expect(cruiser.why?.sources).toContain('Ross');
    expect(cruiser.why?.sources).toContain('10.1001/jama.2009.681');
    expect(cruiser.caveat).toBe(METRIC_CAVEAT);
    expect(cruiser.inputs?.find((line) => line.name === 'VO2 max')?.detail).toContain('42');
    expect(cruiser.inputs?.find((line) => line.name === 'VO2 max')?.detail).toContain('Typical for a cruiserweight boxer');
    expect(cruiser.inputs?.find((line) => line.name === 'Body fat')?.detail).toContain('18');
    const resting = { ...EMPTY_METRIC_CONTEXT, age: 45, sex: 'male' as const, goal: 'elite_cruiser_boxer' as const };
    expect(readingFor('resting_heart_rate', 49, resting).label).toBe('Good');
    expect(readingFor('resting_heart_rate', 39, resting).label).toBe('Fair');
    expect(readingFor('resting_heart_rate', 39, resting).where).toContain('unwell or dizzy');
    expect(readingFor('resting_heart_rate', 110, resting).label).toBe('Poor');
    expect(readingFor('vo2', 44, resting).label).toBe('Good');
    expect(readingFor('vo2', 28, resting).label).toBe('Fair');
    expect(readingFor('weight_kg', 85.1, { ...resting, heightCm: null }).label).toBe('Usual');
    expect(readingFor('weight_kg', 85.1, { ...resting, heightCm: 180 }).label).toBe('Usual');
    expect(readingFor('weight_kg', 85.1, { ...EMPTY_METRIC_CONTEXT, age: 45, sex: 'male', heightCm: 180 }).label).toBe('Fair');
    expect(readingFor('hrv_sdnn', 120, EMPTY_METRIC_CONTEXT).label).toBe('Good');
    expect(readingFor('hrv_sdnn', 20, EMPTY_METRIC_CONTEXT).label).toBe('Fair');
    const epochs = readingFor('epoch_minutes', 346, { ...EMPTY_METRIC_CONTEXT, ownUsual: 300 });
    expect(epochs.where).toContain('346');
    expect(epochs.where).not.toContain('No published healthy-person range for this figure');
    expect(epochs.source).toBe('Garmin Health API epoch summaries.');
    expect(epochs.where).not.toContain(epochs.source);
  });

  it('uses the same VO2, resting, sleep, and step advice as the weekly plan', () => {
    const cruiser = { ...EMPTY_METRIC_CONTEXT, age: 34, sex: 'male' as const, goal: 'elite_cruiser_boxer' as const };
    const vo2 = readingFor('vo2_max', 41.7, cruiser);
    expect(vo2.tips).toEqual([...VO2_CARD_TIPS]);
    expect(vo2.tips[0]).toBe(VO2_MAIN_TIP);
    expect(vo2.tips.join(' ')).toMatch(/Helgerud/);
    expect(vo2.tips.join(' ')).toMatch(/not the main way to raise VO2 max/);
    const age = readingFor('fitness_age', 48, { ...cruiser, realAge: 34, vo2: 41.7, restingHr: 49, bodyFat: 12, vigorousWeek: 80 });
    expect(age.tips[0]).toBe(VO2_MAIN_TIP);
    expect(readingFor('resting_heart_rate', 72, cruiser).tips[0]).toBe(RESTING_AEROBIC_TIP);
    expect(readingFor('sleep_hours', 5.5, { ...EMPTY_METRIC_CONTEXT, age: 45, sex: 'male' }).tips[0]).toBe(SLEEP_WAKE_TIP);
    expect(readingFor('steps', 3000, { ...EMPTY_METRIC_CONTEXT, age: 45, sex: 'male' }).tips[0]).toBe(STEP_WALK_TIP);
    const plan = readFileSync('supabase/functions/_shared/healthPlan.ts', 'utf8');
    expect(plan).toContain('intervalDayReason');
    expect(plan).toContain('zone2DayReason');
    expect(plan).toContain('SLEEP_WAKE_TIP');
    expect(plan).toContain('STEP_WALK_TIP');
    expect(plan).not.toContain('so this builds your aerobic base');
  });

  it('names a source and the caveat on every registry row, and the chart titles stay registered', () => {
    for (const row of metricAudit()) {
      expect(row.source.length, row.id).toBeGreaterThan(8);
      expect(row.shownOn.length, row.id).toBeGreaterThan(0);
      expect(row.before.length, row.id).toBeGreaterThan(0);
      expect(row.now.length, row.id).toBeGreaterThan(0);
      expect(METRIC_REGISTRY[row.id]?.rate).toEqual(expect.any(Function));
    }
    const activity = readFileSync('src/ui/DailyActivity.tsx', 'utf8');
    const titles = [...activity.matchAll(/title="([^"]+)"/g)].map((match) => match[1] ?? '');
    expect(titles.length).toBeGreaterThan(5);
    for (const title of titles) {
      expect(ACTIVITY_BAR_TITLES[title], title).toBeTruthy();
      expect(METRIC_REGISTRY[ACTIVITY_BAR_TITLES[title] ?? ''], title).toBeTruthy();
    }
    for (const file of ['src/ui/HealthStatBoard.tsx', 'src/ui/StatTile.tsx', 'src/ui/ProfileStatTiles.tsx', 'src/ui/DailyActivity.tsx', 'src/ui/YourFitness.tsx']) {
      const source = readFileSync(file, 'utf8');
      expect(source, file).toContain('MetricRatingLines');
      expect(source.includes('Not medical advice. Not a diagnosis.') || source.includes('METRIC_CAVEAT'), file).toBe(true);
    }
    expect(readFileSync('supabase/functions/_shared/garmin.ts', 'utf8')).not.toContain('metricRegistry');
    expect(readFileSync('src/domain/thumos.ts', 'utf8')).not.toContain('metricRegistry');
  });

  it('draws empty Garmin cards through the shared chart, including the band and the rating', () => {
    const charts = garminPlaceholderCharts({
      endDay: end,
      period: '7',
      age: 45,
      sex: 'male',
      goal: 'elite_runner',
      dailies: [{ calendarDate: end }],
      sleep: [],
      respiration: [],
      pulseOx: [],
      hrv: [],
    } as unknown as GarminChartInput, new Set());
    expect(charts.map((chart) => chart.id)).toEqual(GARMIN_CARD_CATALOGUE.map((spec) => spec.id));
    for (const chart of charts) {
      expect(chart.points, chart.id).toHaveLength(7);
      expect(chart.points.every((point) => point.empty), chart.id).toBe(true);
      expect(chart.note?.length, chart.id).toBeGreaterThan(8);
      expect(chart.guide.rating?.pending, chart.id).toBe(true);
      expect(chart.guide.rating?.caveat, chart.id).toBe(METRIC_CAVEAT);
      expect(chart.guide.rating?.source, chart.id).toBe(METRIC_REGISTRY[chart.id]?.source);
      expect(chart.guide.rating?.where.length, chart.id).toBeGreaterThan(8);
      expect(chart.guide.rating?.tips.length, chart.id).toBeGreaterThan(0);
    }
    const ox = charts.find((chart) => chart.id === 'pulse_ox');
    expect(ox?.guide.dailyTypical).toEqual({ low: 95, high: 100 });
    expect(ox?.guide.rating?.where).toContain('96');
    const pressure = charts.find((chart) => chart.id === 'blood_pressure');
    expect(pressure?.guide.dailyTypical).toEqual({ low: 90, high: 120 });
    const skin = charts.find((chart) => chart.id === 'skin_temp');
    expect(skin?.guide.dailyTypical).toEqual({ low: -1, high: 1 });
    const snapshot = charts.find((chart) => chart.id === 'snapshot_heart');
    expect(snapshot?.guide.dailyTypical).toEqual({ low: 60, high: 100 });
    const body = charts.find((chart) => chart.id === 'body_fat');
    expect(body?.title).toBe('Body composition');
    expect(body?.guide.rating?.goalLine).toContain('ACE');
    const vo2 = charts.find((chart) => chart.id === 'vo2');
    expect(vo2?.guide.rating?.goalLine).toContain('75th');
    const screen = readFileSync('src/ui/DailyActivity.tsx', 'utf8');
    expect(screen).toContain('garminPlaceholderCharts');
    expect(screen).toContain('NO_READINGS_YET');
    expect(screen).toContain('lead={chart.note}');
    expect(screen).toContain('<ActivityBars');
    expect(screen).not.toContain("item.id === 'pulse_ox'");
    expect(screen).not.toContain('<T>{GARMIN_HRV_EMPTY}</T>');
    expect(screen).not.toContain('<T>{APPLE_HRV_EMPTY}</T>');
    const minuteChart = screen.slice(screen.indexOf('function MinuteTypeChart'), screen.indexOf('function ActivityBars'));
    expect(minuteChart).toContain('<ActivityBars');
    expect(minuteChart).not.toContain('variant="label"');
  });
});
