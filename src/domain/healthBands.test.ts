import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  ACSM_MODERATE_HIGH,
  ACSM_MODERATE_LOW,
  ACSM_VIGOROUS_HIGH,
  ACSM_VIGOROUS_LOW,
  AHA_ATHLETE_RESTING_LOW,
  BAND_CAVEAT,
  COLE_ABNORMAL_AT_OR_UNDER,
  NUNAN_SDNN_HIGH,
  NUNAN_SDNN_LOW,
  NUNAN_SDNN_MEAN,
  REFERENCE_NOT_A_TARGET,
  athleteRestingNote,
  hrvReading,
  intensityZones,
  publishedBandGuide,
  recoveryReading,
  referenceBandsForCoach,
  restingSexNote,
  sessionHeartReading,
  tanakaMaxHeartRate,
  walkingHeartReading,
} from '@/domain/healthBands';
import { HEALTH_PLAN_PROMPT, healthPlanModelContext, type PlanInput } from '@/domain/healthPlan';
import { buildSystemPrompt, buildThumosContext } from '@/domain/thumos';

const CAVEAT = 'Population averages vary by person, medication and fitness. Not medical advice. Speak to your GP if something worries you.';

describe('published health bands', () => {
  it('keeps the caveat and the reference label exactly as written', () => {
    expect(BAND_CAVEAT).toBe(CAVEAT);
    expect(REFERENCE_NOT_A_TARGET).toBe('This is a reference, not a target.');
    expect(publishedBandGuide()).toContain(CAVEAT);
    expect(publishedBandGuide()).not.toMatch(/this goal|your goal/i);
  });

  it('places an adult of 42 on the Tanaka and ACSM zones', () => {
    expect(tanakaMaxHeartRate(42)).toBe(178.6);
    expect(tanakaMaxHeartRate(17)).toBeNull();
    expect(tanakaMaxHeartRate(null)).toBeNull();
    const zones = intensityZones(42);
    expect(zones).toEqual({
      tanakaMax: 178.6,
      moderateLow: 114,
      moderateHigh: 136,
      vigorousLow: 138,
      vigorousHigh: 170,
      ahaMax: 178,
      ahaModerateLow: 89,
      ahaModerateHigh: 125,
      ahaVigorousLow: 125,
      ahaVigorousHigh: 151,
    });
    expect(ACSM_MODERATE_LOW).toBe(64);
    expect(ACSM_MODERATE_HIGH).toBe(76);
    expect(ACSM_VIGOROUS_LOW).toBe(77);
    expect(ACSM_VIGOROUS_HIGH).toBe(95);
    expect(intensityZones(16)).toBeNull();
  });

  it('describes session heart rate as intensity, with no goal-level target', () => {
    const reading = sessionHeartReading(132, 42, 'Elite Athlete (Cruiserweight Boxer)');
    expect(reading?.status).toContain('Inside the moderate zone');
    expect(reading?.status).toContain('114 to 136');
    expect(reading?.meaning).toContain('did not change with sex');
    expect(reading?.meaning).toContain('not a target to reach the top');
    expect(reading?.meaning).toContain(CAVEAT);
    expect(reading?.goalCaption).not.toContain(REFERENCE_NOT_A_TARGET);
    expect(reading?.rangeNote).toContain('no published session heart rate range for a cruiserweight boxer specifically');
    expect(reading?.rangeNote).toContain('a general adult');
    expect(reading?.rangeNote).toContain('This stand-in is not the Elite Athlete (Cruiserweight Boxer) range.');
    expect(reading?.meaning.match(/This is a reference, not a target\./g)).toHaveLength(1);
    expect(reading?.links.map((link) => link.year)).toEqual([2001, 2023, 2024, null]);
    expect(sessionHeartReading(132, null, null)).toBeNull();
    expect(sessionHeartReading(132, 16, null)).toBeNull();
    expect(`${reading?.status} ${reading?.meaning}`).not.toMatch(/this goal|your goal/i);
  });

  it('treats walking heart rate as an approximation of the moderate zone', () => {
    const reading = walkingHeartReading(96, 42, 'Lose Fat & Build Muscle');
    expect(reading?.status).toContain('Below the moderate zone');
    expect(reading?.status).toContain('This is an approximation.');
    expect(reading?.meaning).toContain('Apple publishes no normal range');
    expect(reading?.meaning).toContain('Brisk walking');
    expect(reading?.rangeNote).toContain('Approximation, not an Apple norm.');
    expect(reading?.goalLow).toBeNull();
    expect(reading?.links[0]?.year).toBe(2024);
    expect(walkingHeartReading(96, null, null)).toBeNull();
  });

  it('uses the Cole recovery study without turning a larger fall into a target', () => {
    const high = recoveryReading(22, 'Lose Fat & Build Muscle');
    expect(high.status).toContain(`Above ${COLE_ABNORMAL_AT_OR_UNDER} bpm`);
    expect(high.meaning).toContain('referred for a treadmill test');
    expect(high.meaning).toContain('not a healthy population');
    expect(high.meaning).toContain('no age or sex table');
    expect(high.zoneLow).toBe(12);
    expect(high.zoneHigh).toBe(23);
    expect(high.goalLow).toBeNull();
    expect(high.links[0]?.url).toBe('https://www.nejm.org/doi/full/10.1056/NEJM199910283411804');
    const low = recoveryReading(12, null);
    expect(low.status).toContain('called abnormal');
    expect(low.goalCaption).toBeNull();
  });

  it('uses the Nunan short-term SDNN spread, not an age table or an athlete target', () => {
    const reading = hrvReading(47, 'Elite Athlete (Cruiserweight Boxer)');
    expect(NUNAN_SDNN_MEAN).toBe(50);
    expect(reading.zoneLow).toBe(NUNAN_SDNN_LOW);
    expect(reading.zoneHigh).toBe(NUNAN_SDNN_HIGH);
    expect(reading.status).toContain('32 to 93');
    expect(reading.meaning).toContain('not a personal target');
    expect(reading.meaning).toContain('not split by age or sex');
    expect(reading.meaning).toContain('24-hour age table');
    expect(reading.rangeNote).toContain('no published heart-rate variability range for a cruiserweight boxer specifically');
    expect(reading.rangeNote).toContain('Nunan, Sandercock, and Brodie, 2010');
    expect(reading.meaning.match(/This is a reference, not a target\./g)).toHaveLength(1);
    expect(reading.goalLow).toBeNull();
    expect(reading.links[0]?.year).toBe(2010);
  });

  it('keeps the athlete resting note off the shaded band unless the aim is athletic', () => {
    expect(AHA_ATHLETE_RESTING_LOW).toBe(40);
    expect(athleteRestingNote(false)).toBeNull();
    const note = athleteRestingNote(true);
    expect(note).toContain('as low as 40');
    expect(note).toContain(REFERENCE_NOT_A_TARGET);
    const resting = restingSexNote('Lose Fat & Build Muscle');
    expect(resting).toContain('60 to 100');
    expect(resting).toContain('does not split the range by age');
    expect(resting).toContain('no published resting heart rate range for Lose Fat & Build Muscle specifically');
    expect(resting).toContain('a general adult');
    expect(resting).not.toContain('as low as 40');
    expect(resting.match(/This is a reference, not a target\./g)).toHaveLength(1);
    const cruiser = restingSexNote('Elite Athlete (Cruiserweight Boxer)');
    expect(cruiser).toContain('no published resting heart rate range for a cruiserweight boxer specifically');
    expect(cruiser).toContain('an athlete or a more active person');
    expect(cruiser).toContain('American Heart Association, 2024');
    expect(cruiser).toContain('as low as 40');
    expect(cruiser).toContain('This stand-in is not the Elite Athlete (Cruiserweight Boxer) range.');
    expect(cruiser).not.toContain('general elite athletes');
    expect(cruiser.match(/This is a reference, not a target\./g)).toHaveLength(1);
    expect(cruiser.match(/Not medical advice/gi) ?? []).toHaveLength(0);
    expect(`${note} ${resting} ${cruiser}`).not.toMatch(/this goal|your goal/i);
  });

  it('gives Thumos and the health plan the same figures', () => {
    const guide = publishedBandGuide();
    expect(guide).toContain('208 − 0.7 × age');
    expect(guide).toContain('64–76%');
    expect(guide).toContain('32 to 93 ms');
    const personal = referenceBandsForCoach({
      age: 42,
      goalLabel: 'Elite Athlete (Cruiserweight Boxer)',
      athlete: true,
      sessionBpm: 132,
      walkingBpm: 96,
      recoveryBpm: 22,
      hrvMs: 47,
    });
    expect(personal).toContain('Inside the moderate zone');
    expect(personal).toContain('This is an approximation.');
    expect(personal).toContain('as low as 40');
    expect(personal).not.toMatch(/this goal|your goal/i);

    const context = buildThumosContext({
      now: new Date('2026-10-17T12:00:00.000Z'),
      displayName: 'Alex',
      sobrietyStartedAt: '2026-01-13T06:00:00.000Z',
      reasons: [],
      weeklySpendGbp: null,
      weeklyUnits: null,
      checkIns: [],
      health: [],
      mode: 'steady',
      safety: { selfHarm: false, withdrawal: false, reasons: [] },
    });
    expect(context).toContain('Published comparison bands');
    expect(context).toContain('208 − 0.7 × age');
    const crisis = buildThumosContext({
      now: new Date('2026-10-17T12:00:00.000Z'),
      displayName: 'Alex',
      sobrietyStartedAt: '2026-01-13T06:00:00.000Z',
      reasons: [],
      weeklySpendGbp: null,
      weeklyUnits: null,
      checkIns: [],
      health: [],
      mode: 'support',
      safety: { selfHarm: true, withdrawal: false, reasons: ['self-harm or suicidal language'] },
    });
    expect(crisis).not.toContain('208 − 0.7 × age');
    expect(buildSystemPrompt('CONTEXT', 'steady')).toContain('published comparison bands');
    expect(HEALTH_PLAN_PROMPT).toContain('referenceBands');
    expect(HEALTH_PLAN_PROMPT).toContain('not a reason to chase the top of a range');

    const input: PlanInput = {
      now: new Date('2026-10-17T12:00:00.000Z'),
      salt: 'bands',
      displayName: 'Alex',
      stage: 'stopped',
      sobrietyStartedAt: '2026-01-13T06:00:00.000Z',
      heightCm: 178,
      visionStatement: '',
      visionCaptions: [],
      interestLabels: [],
      reasons: [],
      limits: '',
      goal: 'elite_cruiser_boxer',
      goalSex: 'male',
      goalAge: 42,
      build: 'muscular',
      kcalTarget: 2400,
      proteinTarget: 140,
      hideCalories: false,
      foodLogs: [],
      checkIns: [],
      health: [
        { kind: 'session_heart_rate', value: 132, recordedOn: '2026-10-17' },
        { kind: 'walking_heart_rate', value: 96, recordedOn: '2026-10-15' },
        { kind: 'heart_rate_recovery', value: 22, recordedOn: '2026-10-17' },
        { kind: 'hrv_sdnn', value: 47, recordedOn: '2026-10-17' },
      ],
      bodyFatPct: null,
      leanMassKg: null,
      waistCm: null,
      doneTexts: [],
      fitnessSnapshot: null,
    };
    const plan = {
      focus: [],
      nutrition: { targets: '', habits: [], swaps: [] },
      fitness: { intro: '', sessions: [] },
      wellbeing: { habits: [] },
      limits: '',
      disclaimer: '',
      updatedAt: '',
    };
    const model = healthPlanModelContext(input, plan);
    expect(model.referenceBands).toContain('114 to 136');
    expect(model.referenceBands).toContain('as low as 40');
    expect(model.referenceBands).not.toMatch(/this goal|your goal/i);
  });

  it('shows the year on a tappable source and the caveat on a band', () => {
    const board = readFileSync('src/ui/HealthStatBoard.tsx', 'utf8');
    expect(board).toContain('accessibilityRole="link"');
    expect(board).toContain('BAND_CAVEAT');
    expect(board).toContain('No year is printed on that page.');
    const shared = readFileSync('supabase/functions/_shared/healthBands.ts', 'utf8');
    expect(shared).toContain(CAVEAT);
    expect(readFileSync('supabase/functions/_shared/thumos.ts', 'utf8')).toContain('publishedBandGuide');
    expect(readFileSync('supabase/functions/_shared/healthPlan.ts', 'utf8')).toContain('referenceBandsForCoach');
  });
});
