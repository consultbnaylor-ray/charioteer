import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { APPLE_HEALTH_READ_TYPES, APPLE_HEALTH_SHARE } from '@/health/connection';
import {
  SCALE_BIA_LINE,
  SCALE_COMPARE_LINE,
  SCALE_CORE_LINE,
  SCALE_EMPTY_LINE,
  SCALE_MORE_ARRIVES,
  SCALE_MORE_BAND,
  SCALE_MORE_BMI,
  SCALE_NEEDS_HEIGHT,
  SCALE_NO_READING,
  scaleReadingFigures,
} from '@/domain/scaleReading';

const PROPOSED = [
  SCALE_CORE_LINE,
  SCALE_BIA_LINE,
  SCALE_COMPARE_LINE,
  SCALE_EMPTY_LINE,
  SCALE_NO_READING,
  SCALE_NEEDS_HEIGHT,
  SCALE_MORE_BAND,
  SCALE_MORE_ARRIVES,
  SCALE_MORE_BMI,
];

describe('scale reading beside BMI', () => {
  it('keeps the proposed sentences exact', () => {
    expect(SCALE_CORE_LINE).toBe('BMI cannot tell muscle from fat. Read it next to body fat and lean mass.');
    expect(SCALE_COMPARE_LINE).toBe('Compare readings at the same time of day. A home scale estimate can change from one reading to the next.');
    expect(SCALE_BIA_LINE).toBe('Smart-scale body fat uses a tiny electrical current, called bioelectrical impedance. Hydration, time of day, and food can move a single reading, so the trend matters more than one number.');
    expect(readFileSync('src/ui/ScaleReading.tsx', 'utf8')).toContain('SCALE_BIA_LINE');
    expect(SCALE_EMPTY_LINE).toBe('No weight, body fat, or lean mass yet.');
    expect(SCALE_MORE_BAND).toContain('may not correspond to the same degree of fatness');
    expect(SCALE_MORE_ARRIVES).toContain('no standard type');
    expect(SCALE_MORE_BMI).toContain('18.5 to 24.9');
    expect(SCALE_MORE_BMI).toContain('not a diagnosis');
    for (const line of PROPOSED) {
      expect(line).not.toMatch(/\b(overweight|obese|healthy user|you are very fit)\b/i);
    }
  });

  it('shows weight, calculated BMI, body fat, and lean mass without a category', () => {
    const view = scaleReadingFigures({ weightKg: 74.2, heightCm: 178, bodyFatPct: 15, leanMassKg: 63 });
    expect(view.empty).toBe(false);
    expect(view.figures).toEqual([
      { label: 'Weight', value: '74.2 kg' },
      { label: 'BMI', value: '23.4' },
      { label: 'Body fat', value: '15%' },
      { label: 'Lean mass', value: '63 kg' },
    ]);
  });

  it('names a missing body-fat or lean-mass reading and a missing height', () => {
    const partial = scaleReadingFigures({ weightKg: 80, heightCm: null, bodyFatPct: null, leanMassKg: null });
    expect(partial.empty).toBe(false);
    expect(partial.figures.map((figure) => figure.value)).toEqual(['80 kg', SCALE_NEEDS_HEIGHT, SCALE_NO_READING, SCALE_NO_READING]);
    expect(scaleReadingFigures({ weightKg: null, heightCm: 178, bodyFatPct: null, leanMassKg: null }).empty).toBe(true);
  });

  it('does not add a HealthKit read type', () => {
    expect(APPLE_HEALTH_READ_TYPES).toContain('HKQuantityTypeIdentifierBodyMass');
    expect(APPLE_HEALTH_READ_TYPES).toContain('HKQuantityTypeIdentifierBodyFatPercentage');
    expect(APPLE_HEALTH_READ_TYPES).toContain('HKQuantityTypeIdentifierLeanBodyMass');
    expect(APPLE_HEALTH_READ_TYPES).toContain('HKQuantityTypeIdentifierHeight');
    expect(APPLE_HEALTH_READ_TYPES).not.toContain('HKQuantityTypeIdentifierBodyMassIndex');
    expect(APPLE_HEALTH_READ_TYPES).not.toContain('HKQuantityTypeIdentifierBasalEnergyBurned');
    expect(APPLE_HEALTH_READ_TYPES).not.toContain('HKQuantityTypeIdentifierWaistCircumference');
    expect(APPLE_HEALTH_SHARE).toContain('weight, height, body fat, lean body mass');
    expect(APPLE_HEALTH_SHARE).not.toMatch(/visceral|skeletal muscle|metabolic age|body water|bone mass/i);
    const app = readFileSync('app.json', 'utf8');
    expect(app).toContain(APPLE_HEALTH_SHARE);
    expect(app).not.toContain('HKQuantityTypeIdentifierBodyMassIndex');
  });

  it('sits with the weight range and on the weight page, not on Your fitness', () => {
    const range = readFileSync('src/ui/GoalWeightRange.tsx', 'utf8');
    const weight = readFileSync('src/app/(main)/weight-waist.tsx', 'utf8');
    const fitness = readFileSync('src/ui/YourFitness.tsx', 'utf8');
    const note = readFileSync('src/ui/ScaleReading.tsx', 'utf8');
    expect(range).toContain('<ScaleReadingNote />');
    expect(weight).toContain('<ScaleReadingNote />');
    expect(fitness).not.toContain('ScaleReadingNote');
    expect(note.indexOf('{SCALE_CORE_LINE}')).toBeLessThan(note.indexOf('<MoreInfo'));
    expect(note.indexOf('{SCALE_COMPARE_LINE}')).toBeLessThan(note.indexOf('<MoreInfo'));
    expect(note).toContain('VISIBLE_SAFETY_LINE');
    expect(readFileSync('src/health/connection.ts', 'utf8')).not.toContain('BodyMassIndex');
  });
});
