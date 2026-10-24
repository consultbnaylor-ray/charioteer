import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { coachConsentAllows } from './coachConsent.ts';
import { defaultNutritionSettings, nutritionContextLines } from './nutrition.ts';
import { loadNutritionLines } from './nutritionLoad.ts';

const today = '2026-10-24';
const now = new Date('2026-10-24T12:00:00Z');

function days(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(`${today}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() - index);
    return date.toISOString().slice(0, 10);
  });
}

function client() {
  const steps = days(5).map((day) => ({
    kind: 'steps',
    value: 4000,
    recorded_on: day,
    source: 'healthkit',
  }));
  const weight = { kind: 'weight_kg', value: 82, recorded_on: today, source: 'healthkit' };
  return {
    from(table: string) {
      const data = table === 'nutrition_settings'
        ? { target_weight_kg: 78, goal: null }
        : table === 'health_samples'
          ? [...steps, weight]
          : table === 'food_logs' || table === 'body_composition'
            ? []
            : null;
      const result = { data, error: null as { message?: string } | null };
      const filter = {
        eq() { return filter; },
        order() { return filter; },
        limit() { return filter; },
        maybeSingle: async () => result,
        then(resolve: (value: typeof result) => void, reject?: (reason: unknown) => void) {
          return Promise.resolve(result).then(resolve, reject);
        },
      };
      return { select() { return filter; } };
    },
  };
}

const profile = { id: 'user-1', height_cm: 180 };

function joined(lines: string[]) {
  return lines.join(' ');
}

describe('coach consent for a target weight', () => {
  it('fails closed when consent is missing or not exactly true', () => {
    expect(coachConsentAllows()).toEqual({ ai: false, health: false });
    expect(coachConsentAllows(null)).toEqual({ ai: false, health: false });
    expect(coachConsentAllows({ consentAi: null, consentHealth: true })).toEqual({ ai: false, health: false });
    expect(coachConsentAllows({ consentAi: false, consentHealth: true })).toEqual({ ai: false, health: false });
    expect(coachConsentAllows({ consentAi: true, consentHealth: null })).toEqual({ ai: true, health: false });
    expect(coachConsentAllows({ consentAi: true, consentHealth: false })).toEqual({ ai: true, health: false });
    expect(coachConsentAllows({ consentAi: true, consentHealth: true })).toEqual({ ai: true, health: true });
  });

  it('keeps the target and the activity totals out of the prompt when consent is off or missing', async () => {
    const off = await loadNutritionLines(client(), profile, [], now, { consentAi: false, consentHealth: true });
    const missing = await loadNutritionLines(client(), profile, [], now);
    for (const lines of [off, missing]) {
      const text = joined(lines);
      expect(text).not.toContain('private target weight');
      expect(text).not.toContain('Current weight');
      expect(text).not.toContain('Steps');
      expect(text).not.toContain('Active minutes');
      expect(text).not.toMatch(/\b(latitude|longitude|gps|route)\b/i);
    }
    const closed = nutritionContextLines({
      logs: [],
      settings: { ...defaultNutritionSettings(), targetWeightKg: 78 },
      waterMl: 0,
      checkIns: [],
      soberDays: null,
      unitsAvoided: 0,
      today,
      body: { weightKg: 82, heightCm: 180, weights: [] },
      activity: days(5).map((day) => ({ day, steps: 4000, stepsSource: 'Apple Health' })),
      coach: null,
    });
    expect(joined(closed)).not.toContain('private target weight');
    expect(joined(closed)).not.toContain('Steps');
  });

  it('sends the target without activity or the weight reading when health consent is off', async () => {
    const lines = await loadNutritionLines(client(), profile, [], now, { consentAi: true, consentHealth: false });
    const text = joined(lines);
    expect(text).toContain('private target weight of 78.0 kg');
    expect(text).not.toContain('Current weight is');
    expect(text).not.toContain('The direction is');
    expect(text).not.toContain('Steps');
    expect(text).not.toContain('Active minutes');
    expect(text).not.toContain('enough activity data');
  });

  it('sends activity as a total, not the raw days, only when both switches are on', async () => {
    const lines = await loadNutritionLines(client(), profile, [], now, { consentAi: true, consentHealth: true });
    const text = joined(lines);
    expect(text).toContain('private target weight of 78.0 kg');
    expect(text).toContain('Current weight is 82.0 kg');
    expect(text).toContain('The direction is lose');
    expect(text).toContain('Steps, about 4,000 a day over 5 days');
    expect(text).not.toContain('2026-10-');
    expect(text).not.toMatch(/\b(latitude|longitude|gps|route|waypoint)\b/i);
  });

  it('gates every server caller, and the meal and plan functions do not send the new lines', () => {
    const chat = readFileSync('supabase/functions/thumos-chat/index.ts', 'utf8');
    const voice = readFileSync('supabase/functions/thumos-voice-token/index.ts', 'utf8');
    const meal = readFileSync('supabase/functions/estimate-meal/index.ts', 'utf8');
    const plan = readFileSync('supabase/functions/health-plan/index.ts', 'utf8');
    const health = readFileSync('supabase/functions/thumos-health/index.ts', 'utf8');
    expect(chat.indexOf('coachConsentAllows')).toBeGreaterThan(-1);
    expect(chat.indexOf('coachConsentAllows')).toBeLessThan(chat.lastIndexOf('loadNutritionLines'));
    expect(chat).toContain('safety.selfHarm || !coach.ai');
    expect(voice.indexOf('coachConsentAllows')).toBeGreaterThan(-1);
    expect(voice.indexOf('coachConsentAllows')).toBeLessThan(voice.lastIndexOf('loadNutritionLines'));
    expect(voice.indexOf('if (!profileRes.data.consent_ai)')).toBeLessThan(voice.lastIndexOf('loadNutritionLines'));
    expect(meal).not.toContain('loadNutritionLines');
    expect(meal).not.toContain('targetActivityPlan');
    expect(meal).not.toContain('MEAL_LOG_INTRO');
    expect(plan).not.toContain('loadNutritionLines');
    expect(plan).not.toContain('target_weight_kg');
    expect(plan).not.toContain('targetActivityPlan');
    expect(health).not.toContain('loadNutritionLines');
    expect(health).not.toContain('nutritionContextLines');
  });
});
