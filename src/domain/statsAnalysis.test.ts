import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { emptyGarminReadings } from '@/domain/garminConnect';
import { buildStatsAnalysis } from '@/domain/statsAnalysis';
import { NUTRITION_PROMPT_LINE } from '../../supabase/functions/_shared/nutrition.ts';
import { STATS_ANALYSIS_PROMPT, analysisSectionsFromText, localStatsVerdict, nutritionInputLines, nutritionReviewLines, sanitizeStatsAnalysis, withNutritionReview } from '../../supabase/functions/_shared/statsAnalysis.ts';
import { VO2_ANALYSIS_RULE } from '../../supabase/functions/_shared/trainingGuidance.ts';

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
        { id: 'steps', name: 'Steps', value: 9000, latest: 9000, average: 8000, today: null, trend: 'up', rating: 'Good', range: '', tip: null, goalTarget: null, goalGap: null },
        { id: 'sleep_score', name: 'Sleep score', value: 50, latest: 50, average: 50, today: null, trend: 'steady', rating: 'Poor', range: '', tip: 'Keep a steady wake time.', goalTarget: null, goalGap: null },
        { id: 'stress', name: 'Stress', value: 80, latest: 80, average: 80, today: null, trend: 'up', rating: 'Poor', range: '', tip: null, goalTarget: null, goalGap: null },
      ],
    });
    expect(mixed).toContain('reasonable');
    expect(mixed).toContain('Strengths: Steps 9000');
    expect(mixed).not.toContain('Looked at');
    expect(mixed).not.toMatch(/invent/);
    const strong = localStatsVerdict({
      age: 45,
      sex: 'male',
      goal: null,
      stats: [
        { id: 'steps', name: 'Steps', value: 9000, latest: 9000, average: 9000, today: null, trend: 'steady', rating: 'Good', range: '', tip: null, goalTarget: null, goalGap: null },
        { id: 'sleep_hours', name: 'Sleep hours', value: 8, latest: 8, average: 8, today: null, trend: 'steady', rating: 'Good', range: '', tip: null, goalTarget: null, goalGap: null },
        { id: 'resting_heart_rate', name: 'Resting heart rate', value: 60, latest: 60, average: 60, today: null, trend: 'steady', rating: 'Good', range: '', tip: null, goalTarget: null, goalGap: null },
      ],
    });
    expect(strong).toContain('strong');
    expect(strong).not.toContain('Looked at');
    const mostlyPoor = localStatsVerdict({
      age: 45,
      sex: 'male',
      goal: null,
      stats: [
        { id: 'steps', name: 'Steps', value: 2000, latest: 2000, average: 2000, today: null, trend: 'down', rating: 'Poor', range: '', tip: null, goalTarget: null, goalGap: null },
        { id: 'sleep_hours', name: 'Sleep hours', value: 4, latest: 4, average: 4, today: null, trend: 'down', rating: 'Poor', range: '', tip: null, goalTarget: null, goalGap: null },
        { id: 'stress', name: 'Stress', value: 90, latest: 90, average: 90, today: null, trend: 'up', rating: 'Poor', range: '', tip: null, goalTarget: null, goalGap: null },
      ],
    });
    expect(mostlyPoor).toContain('Most of these ratings are Poor or Fair');
    expect(mostlyPoor).not.toContain('Strengths:');
    const short = localStatsVerdict({
      age: 45,
      sex: 'male',
      goal: 'Elite Athlete (Cruiserweight Boxer)',
      stats: [
        { id: 'vo2', name: 'VO2 max', value: 43.2, latest: 43.2, average: 43.2, today: null, trend: 'steady', rating: 'Good', range: '', tip: null, goalTarget: '56–62 ml/kg/min', goalGap: 12.8 },
        { id: 'steps', name: 'Steps', value: 9000, latest: 9000, average: 9000, today: null, trend: 'steady', rating: 'Good', range: '', tip: null, goalTarget: null, goalGap: null },
      ],
    });
    expect(short).toContain('some way off');
    expect(short).not.toContain('Keep up the good work');
    expect(short).toContain('VO2 max is 12.8 short of 56–62 ml/kg/min');
    const shortParts = short.split(/\n\n/);
    const shortStrengths = shortParts.find((part) => part.includes('Strengths:')) ?? '';
    expect(shortStrengths).not.toContain('VO2 max is');
    expect(shortStrengths).toContain('Steps 9000');
  });

  it('keeps a VO2 that is good for age but short of a boxing target out of the strengths', () => {
    const readings = emptyGarminReadings();
    readings.userMetrics = [{ summaryId: 'u', calendarDate: '2026-11-01', vo2Max: 43.2, vo2MaxCycling: null, fitnessAge: null }];
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
    const payload = buildStatsAnalysis({
      today: '2026-11-02',
      age: 45,
      sex: 'male',
      goal: 'elite_cruiser_boxer',
      heightCm: 180,
      samples: [{ kind: 'sleep_hours', value: 7.4, recordedOn: '2026-11-01' }],
      readings,
    });
    const vo2 = payload.stats.find((stat) => stat.id === 'vo2');
    expect(vo2?.value).toBe(43.2);
    expect(vo2?.rating).toBe('Good');
    expect(vo2?.goalTarget).toBe('56–62 ml/kg/min');
    expect(vo2?.goalGap).toBe(12.8);
    expect(payload.stats.some((stat) => stat.id === 'sleep_hours')).toBe(true);
    expect(payload.stats.some((stat) => stat.id === 'sleep_duration')).toBe(false);
    const text = localStatsVerdict(payload);
    expect(text).toContain('some way off');
    expect(text).not.toContain('Keep up the good work');
    expect(text).toContain('VO2 max is 12.8 short of 56–62 ml/kg/min');
    const parts = text.split(/\n\n/);
    expect(parts.length).toBeGreaterThan(1);
    const overview = parts.find((part) => part.startsWith('Overview')) ?? '';
    expect(overview).toContain('Strengths:');
    expect(overview).not.toContain('VO2 max is');
    expect(text).toContain('Nutrition: calories & protein');
    expect(text).toContain('not enough logged food');
    expect(parts.some((part) => part.includes('158–') || part.includes('85 to 95 percent'))).toBe(true);
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
    expect(prompt).toContain('at most three');
    expect(prompt).toContain('goalGap');
    expect(prompt).toContain('VO2_ANALYSIS_RULE');
    expect(STATS_ANALYSIS_PROMPT).toContain(VO2_ANALYSIS_RULE);
    expect(VO2_ANALYSIS_RULE).toContain('85 to 95 percent');
    expect(VO2_ANALYSIS_RULE).toContain('Helgerud');
    expect(VO2_ANALYSIS_RULE).toMatch(/not the main way to raise VO2 max/);
    expect(prompt).toContain('not a strength');
    expect(prompt).not.toContain('Looked at');
    expect(prompt).toContain('Do not list every stat');
    expect(prompt).toContain('blank line');
    expect(prompt).toContain('Nutrition: calories & protein');
    expect(prompt).toContain('not enough logged food');
    expect(plan).not.toContain('text.replace(/\\s+/g, \' \')');
    expect(plan).toContain('sections');
    expect(plan).toContain('nutritionForAnalysis');
    expect(prompt).toContain('maxHeartRate');
    expect(ui).toContain('THUMOS_ANALYSIS_CAVEAT');
    expect(ui).not.toContain('VISIBLE_SAFETY_LINE');
    expect(ui).not.toContain('OUTSIDE_CRISIS_LINE');
    expect(ui).not.toContain('METRIC_CAVEAT');
    expect(ui).toContain('section.title');
    expect(ui).toContain('analysisSectionsFromText');
  });

  it('turns a recorded max heart rate into bpm and keeps one paragraph per topic', () => {
    const readings = emptyGarminReadings();
    readings.dailies = [{
      calendarDate: '2026-11-01',
      restingHeartRateBpm: 58,
      averageHeartRateBpm: 70,
      moderateMinutes: 10,
      vigorousMinutes: 0,
      maxHeartRateBpm: 186,
    }];
    readings.userMetrics = [{ summaryId: 'u', calendarDate: '2026-11-01', vo2Max: 42, vo2MaxCycling: null, fitnessAge: null }];
    const payload = buildStatsAnalysis({
      today: '2026-11-03',
      age: 40,
      sex: 'male',
      goal: 'elite_cruiser_boxer',
      heightCm: 180,
      samples: [],
      readings,
    });
    expect(payload.maxHeartRate).toEqual({ bpm: 186, source: 'recorded' });
    const text = localStatsVerdict(payload);
    const parts = text.split(/\n\n/);
    expect(parts[0]).toMatch(/some way off|mixed|reasonable|Poor or Fair|strong/i);
    expect(parts.some((part) => part.includes('about 158–177 bpm from your highest recorded 186 bpm'))).toBe(true);
    expect(parts.some((part) => part.includes('red zone') && part.includes('word or two') && part.includes('On Garmin'))).toBe(true);
    expect(text).not.toMatch(/this goal|your goal/i);
    const kept = sanitizeStatsAnalysis({ ...payload, latitude: 1, maxHeartRate: { bpm: 186, source: 'recorded' } });
    expect(kept?.maxHeartRate).toEqual({ bpm: 186, source: 'recorded' });
    expect(kept && 'latitude' in kept).toBe(false);
  });

  it('splits a single paragraph by topic and compares logged food with the targets', () => {
    const blob = 'Your overall health looks mixed for your age. VO2 max needs 4x4 intervals. Steps average 7727. Sleep has been short.';
    const sections = analysisSectionsFromText(blob);
    expect(sections.map((section) => section.title)).toEqual(expect.arrayContaining([
      'Overview',
      'Cardio/VO2',
      'Steps & movement',
      'Sleep & recovery',
    ]));
    expect(sections.length).toBeGreaterThan(1);
    const payload = buildStatsAnalysis({
      today: '2026-11-03',
      age: 40,
      sex: 'male',
      goal: 'elite_cruiser_boxer',
      heightCm: 180,
      kcalTarget: 2400,
      proteinTarget: 150,
      logs: [
        { eatenOn: '2026-11-02', portion: 1, items: [{ kcal: 2000, proteinG: 120 }] },
        { eatenOn: '2026-11-03', portion: 1, items: [{ kcal: 2200, proteinG: 140 }] },
      ],
      samples: [{ kind: 'weight_kg', value: 82, recordedOn: '2026-11-03' }],
      readings: emptyGarminReadings(),
    });
    expect(payload.nutrition?.loggedDays).toBe(2);
    expect(payload.nutrition?.averageKcal).toBe(2100);
    expect(payload.nutrition?.averageProteinG).toBe(130);
    expect(payload.nutrition?.calorieTarget).toBe(2400);
    expect(payload.nutrition?.proteinGuide).toContain('1.6 to 2.2');
    expect(payload.nutrition?.proteinGuide).toContain('82 kg');
    expect(payload.nutrition?.proteinTargetG).toBe(150);
    expect(payload.nutrition?.proteinTargetSource).toBe('saved');
    const text = localStatsVerdict(payload);
    expect(text).toContain('Daily targets:');
    expect(text).toContain('150 g protein');
    expect(text).toContain('Averaging about 2,100 kcal and 130 g protein a day, under the 2,400 kcal target');
    expect(text).toContain('Not medical advice');
    expect(text).not.toMatch(/\d{1,2} \w+ \d{4}, /);
    const hidden = sanitizeStatsAnalysis({ ...payload, nutrition: { ...payload.nutrition, latitude: 51 } });
    expect(hidden?.nutrition && 'latitude' in hidden.nutrition).toBe(false);
  });

  it('reviews logged meals in UK dates and suggests practical changes', () => {
    const payload = buildStatsAnalysis({
      today: '2026-11-03',
      age: 40,
      sex: 'male',
      goal: 'elite_cruiser_boxer',
      heightCm: 180,
      kcalTarget: 2200,
      samples: [{ kind: 'weight_kg', value: 82, recordedOn: '2026-11-03' }],
      readings: emptyGarminReadings(),
      logs: [
        { eatenOn: '2026-11-03T18:00:00.000Z', meal: 'breakfast', estimated: false, portion: 1, items: [{ name: 'Toast', kcal: 80, proteinG: 8 }] },
        { eatenOn: '2026-11-03', meal: 'snack', estimated: true, portion: 1, note: 'crisps', items: [{ name: 'Crisps', kcal: 800, proteinG: 5 }] },
        { eatenOn: '2026-11-03', meal: 'dinner', estimated: false, portion: 1, items: [{ name: 'Pasta', kcal: 1600, proteinG: 40 }] },
        { eatenOn: '2026-11-02', meal: 'breakfast', estimated: false, portion: 1, items: [{ name: 'Toast', kcal: 90, proteinG: 6 }] },
        { eatenOn: '2026-11-02', meal: 'dinner', estimated: false, portion: 1, items: [{ name: 'Chicken', kcal: 700, proteinG: 45 }] },
      ],
    });
    const text = localStatsVerdict(payload);
    expect(payload.nutrition?.proteinTargetSource).toBe('goal');
    expect(payload.nutrition?.proteinTargetG).toBe(164);
    expect(text).toContain('Daily targets: 2,200 kcal and about 164 g protein.');
    expect(text).toContain('Swap toast for eggs or Greek yoghurt at breakfast.');
    expect(text).toContain('Reduce evening snacks, or swap them for fruit or yoghurt.');
    expect(text).not.toMatch(/\d{1,2} \w+ \d{4}, /);
    expect(text).not.toContain('Estimate.');
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
    expect(payload.nutrition?.meals.some((meal) => meal.name === 'Toast')).toBe(true);
    expect(payload.nutrition?.improvements.length).toBeGreaterThanOrEqual(2);
    expect(payload.nutrition?.improvements.length).toBeLessThanOrEqual(4);
    expect(readFileSync('supabase/functions/health-plan/index.ts', 'utf8')).not.toContain('eaten_at');
    expect(STATS_ANALYSIS_PROMPT).toContain('nutrition.meals is input only');
    expect(STATS_ANALYSIS_PROMPT).toContain('2 to 4');
    const review = nutritionReviewLines(payload.nutrition!);
    expect(review.some((line) => line.includes('3 Nov 2026'))).toBe(false);
    expect(review.some((line) => line.startsWith('Daily targets:'))).toBe(true);
    expect(review.some((line) => line.startsWith('Averaging about'))).toBe(true);
    const input = nutritionInputLines(payload.nutrition!);
    expect(input[0]).toContain('Meal log for reasoning only');
    expect(input.some((line) => line.includes('3 Nov 2026, Breakfast: Toast'))).toBe(true);
    expect(localStatsVerdict(payload)).toContain(review[0]);
    expect(NUTRITION_PROMPT_LINE).toContain('training fuel');
    expect(NUTRITION_PROMPT_LINE).toContain('Do not repeat the log');
    const load = readFileSync('supabase/functions/_shared/nutritionLoad.ts', 'utf8');
    expect(load).toContain('nutritionReviewLines');
    expect(load).toContain('nutritionInputLines');
    expect(load).toContain('item.name');
    expect(load).toContain('coach.ai');
    expect(readFileSync('supabase/functions/thumos-chat/index.ts', 'utf8')).toContain('loadNutritionLines');
    expect(readFileSync('supabase/functions/thumos-voice-token/index.ts', 'utf8')).toContain('loadNutritionLines');
    expect(readFileSync('src/voice/briefing.ts', 'utf8')).toContain('nutritionInputLines');
    expect(readFileSync('supabase/functions/_shared/thumos.ts', 'utf8')).toContain('nutritionChars: 2400');
    const card = withNutritionReview(
      [{ title: 'Overview', body: 'Your overall health looks mixed for your age.' }],
      payload.nutrition,
    );
    const nutrition = card.find((section) => section.title === 'Nutrition: calories & protein');
    expect(card.map((section) => section.title)).toContain('Nutrition: calories & protein');
    expect(nutrition?.body).toContain('Daily targets: 2,200 kcal and about 164 g protein.');
    expect(nutrition?.body).toContain('Averaging about');
    expect(nutrition?.body).not.toContain('3 Nov 2026');
    expect(nutrition?.body).toContain('Swap toast for eggs or Greek yoghurt at breakfast.');
    expect(nutrition?.body.split(/\n\n/).length).toBeGreaterThanOrEqual(4);
    expect(nutrition?.body.split(/\n\n/).length).toBeLessThanOrEqual(8);
    expect(readFileSync('src/ui/ThumosStatsAnalysis.tsx', 'utf8')).toContain('withNutritionReview');
    expect(readFileSync('src/app/(main)/health-plan.tsx', 'utf8')).toContain('<ThumosStatsAnalysis />');
  });
});