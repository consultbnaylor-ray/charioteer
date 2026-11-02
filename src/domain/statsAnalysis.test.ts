import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { emptyGarminReadings } from '@/domain/garminConnect';
import { buildStatsAnalysis } from '@/domain/statsAnalysis';
import { localStatsVerdict, sanitizeStatsAnalysis } from '../../supabase/functions/_shared/statsAnalysis.ts';

describe('stats analysis summaries', () => {
  it('sends ratings and summaries, and drops location, files, and women\'s health', () => {
    const readings = emptyGarminReadings();
    readings.dailies = [{
      calendarDate: '2026-11-01',
      restingHeartRateBpm: 58,
      averageHeartRateBpm: 70,
      moderateMinutes: 20,
      vigorousMinutes: 15,
      averageStressLevel: 40,
      bodyBatteryCharged: 30,
    }];
    readings.sleep = [{
      summaryId: 's',
      calendarDate: '2026-11-01',
      durationSeconds: 8 * 3600,
      deepSeconds: null,
      lightSeconds: null,
      remSeconds: null,
      awakeSeconds: null,
      sleepScore: 82,
    }];
    readings.pulseOx = [{ summaryId: 'o', calendarDate: '2026-11-01', averageSpo2: 97, lowestSpo2: null, highestSpo2: null }];
    readings.userMetrics = [{ summaryId: 'u', calendarDate: '2026-11-01', vo2Max: 44, vo2MaxCycling: 50, fitnessAge: 44 }];
    readings.epochs = [{ summaryId: 'e', calendarDate: '2026-11-01', activeSeconds: 3600, steps: 100, distanceMetres: 800, meanHeartRateBpm: 90 }];
    readings.activityDetails = [{ summaryId: 'a', calendarDate: '2026-11-01', durationSeconds: 1200, distanceMetres: null, averageHeartRateBpm: null, activeKilocalories: null }];
    readings.hrv = [{ summaryId: 'h', calendarDate: '2026-11-01', lastNightAvgMs: 48, lastNight5MinHighMs: null }];
    const payload = buildStatsAnalysis({
      today: '2026-11-02',
      age: 45,
      sex: 'male',
      goal: 'elite_cruiser_boxer',
      heightCm: 180,
      samples: [
        { kind: 'steps', value: 9000, recordedOn: '2026-11-01' },
        { kind: 'steps', value: 267, recordedOn: '2026-11-02' },
        { kind: 'hrv_sdnn', value: 42, recordedOn: '2026-11-01' },
        { kind: 'resting_heart_rate', value: 49, recordedOn: '2026-11-01' },
        { kind: 'weight_kg', value: 85.1, recordedOn: '2026-11-01' },
      ],
      readings,
    });
    const text = JSON.stringify(payload);
    expect(text).not.toMatch(/latitude|longitude|menstrual|callback|samples|fileType/i);
    expect(payload.goal).toContain('Cruiserweight');
    const steps = payload.stats.find((stat) => stat.id === 'steps');
    expect(steps?.value).toBe(9000);
    expect(steps?.latest).toBe(9000);
    expect(steps?.today).toBe(267);
    expect(steps?.rating).not.toBe('Poor');
    expect(payload.stats.find((stat) => stat.id === 'sleep_score')?.rating).toBe('Good');
    expect(payload.stats.find((stat) => stat.id === 'epoch_minutes')?.latest).toBe(60);
    expect(payload.stats.find((stat) => stat.id === 'fitness_age')?.latest).toBe(44);
    expect(payload.stats.find((stat) => stat.id === 'pulse_ox')?.rating).toBeTruthy();
    expect(payload.stats.map((stat) => stat.id)).toEqual(expect.arrayContaining([
      'stress', 'sleep_score', 'hrv', 'hrv_sdnn', 'pulse_ox', 'fitness_age', 'body_battery_charged', 'vo2',
    ]));
    expect(payload.stats.find((stat) => stat.id === 'vo2')?.rating).toBe('Good');
    expect(payload.stats.find((stat) => stat.id === 'resting_heart_rate')?.rating).toBe('Good');
    expect(payload.stats.find((stat) => stat.id === 'resting_heart_rate')?.value).toBe(58);
    const dirty = sanitizeStatsAnalysis({
      age: 45,
      sex: 'male',
      goal: 'Cruiser',
      latitude: 51.5,
      menstrual: true,
      stats: [
        { id: 'pulse_ox', latest: 97, average: 96, trend: 'steady', rating: 'Good', range: 'Usual healthy readings.', samples: [1, 2], longitude: -0.1 },
        { id: 'menstrual_cycle', latest: 1, average: 1, trend: 'up', rating: 'Poor', range: 'no' },
      ],
    });
    expect(JSON.stringify(dirty)).not.toMatch(/latitude|longitude|menstrual|samples/);
    expect(dirty?.stats).toHaveLength(1);
    expect(dirty?.stats[0]?.id).toBe('pulse_ox');
    const mixed = localStatsVerdict({
      age: 45,
      sex: 'male',
      goal: 'Cruiser',
      stats: [
        { id: 'steps', name: 'Steps', value: 9000, latest: 9000, average: 8000, today: null, trend: 'up', rating: 'Good', range: '', tip: null },
        { id: 'sleep_score', name: 'Sleep score', value: 50, latest: 50, average: 50, today: null, trend: 'steady', rating: 'Poor', range: '', tip: 'Keep a steady wake time.' },
        { id: 'stress', name: 'Stress', value: 80, latest: 80, average: 80, today: null, trend: 'up', rating: 'Poor', range: '', tip: null },
      ],
    });
    expect(mixed).toContain('reasonable');
    expect(mixed).toContain('Strengths: Steps 9000');
    expect(mixed).toContain('Looked at: Steps, Sleep score, Stress');
    expect(mixed).not.toMatch(/invent/);
    const strong = localStatsVerdict({
      age: 45,
      sex: 'male',
      goal: null,
      stats: [
        { id: 'steps', name: 'Steps', value: 9000, latest: 9000, average: 9000, today: null, trend: 'steady', rating: 'Good', range: '', tip: null },
        { id: 'sleep_hours', name: 'Sleep hours', value: 8, latest: 8, average: 8, today: null, trend: 'steady', rating: 'Good', range: '', tip: null },
        { id: 'resting_heart_rate', name: 'Resting heart rate', value: 60, latest: 60, average: 60, today: null, trend: 'steady', rating: 'Good', range: '', tip: null },
      ],
    });
    expect(strong).toContain('strong');
    expect(strong).toContain('Looked at:');
    const mostlyPoor = localStatsVerdict({
      age: 45,
      sex: 'male',
      goal: null,
      stats: [
        { id: 'steps', name: 'Steps', value: 2000, latest: 2000, average: 2000, today: null, trend: 'down', rating: 'Poor', range: '', tip: null },
        { id: 'sleep_hours', name: 'Sleep hours', value: 4, latest: 4, average: 4, today: null, trend: 'down', rating: 'Poor', range: '', tip: null },
        { id: 'stress', name: 'Stress', value: 90, latest: 90, average: 90, today: null, trend: 'up', rating: 'Poor', range: '', tip: null },
      ],
    });
    expect(mostlyPoor).toContain('Most of these ratings are Poor or Fair');
    expect(mostlyPoor).not.toContain('Strengths:');
  });

  it('calls the coach only from the button and meters it on health-plan', () => {
    const ui = readFileSync('src/ui/ThumosStatsAnalysis.tsx', 'utf8');
    const plan = readFileSync('supabase/functions/health-plan/index.ts', 'utf8');
    const config = readFileSync('supabase/config.toml', 'utf8');
    expect(readFileSync('src/domain/statsAnalysis.ts', 'utf8')).toContain('Have Thumos Analyze your data');
    expect(ui).toContain('THUMOS_ANALYSE');
    expect(ui).toContain('THUMOS_ANALYSE_CREDIT');
    expect(readFileSync('src/domain/statsAnalysis.ts', 'utf8')).toContain('This uses one AI credit.');
    expect(ui).toContain('onPress={() => void run()}');
    expect(ui).not.toContain('useEffect');
    expect(readFileSync('src/app/(main)/health-plan.tsx', 'utf8')).toContain('<ThumosStatsAnalysis />');
    expect(plan).toContain("body.mode === 'analyse'");
    expect(plan).toContain('sanitizeStatsAnalysis');
    expect(plan).toContain('gateAiUse');
    expect(plan).toContain("kind: 'plan'");
    expect(plan).toContain('consent_health');
    expect(plan).toContain('XAI_PERSONAL_DATA_ENABLED');
    expect(plan).not.toMatch(/latitude|longitude|menstrual/);
    expect(config).toContain('[functions.health-plan]\nverify_jwt = true');
    expect(readFileSync('src/ui/ConsentChoices.tsx', 'utf8')).toContain('epoch active minutes');
    expect(readFileSync('src/ui/ConsentChoices.tsx', 'utf8')).toContain('women\'s health are not sent');
    const prompt = readFileSync('supabase/functions/_shared/statsAnalysis.ts', 'utf8');
    expect(prompt).toContain('Good or Excellent');
    expect(prompt).toContain('Looked at:');
    expect(prompt).toContain('Do not skip one');
    expect(ui).toContain('THUMOS_ANALYSIS_CAVEAT');
    expect(ui).not.toContain('VISIBLE_SAFETY_LINE');
    expect(ui).not.toContain('OUTSIDE_CRISIS_LINE');
    expect(ui).not.toContain('METRIC_CAVEAT');
  });
});