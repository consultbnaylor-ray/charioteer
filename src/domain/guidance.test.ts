import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  BHF_HEART_RATE_URL,
  BHF_RESTING_MAX_BPM,
  BHF_RESTING_MIN_BPM,
  bmiFrom,
  buildMetricGuidance,
  CMO_MODERATE_MINUTES_WEEK,
  CMO_VIGOROUS_MINUTES_WEEK,
  GUIDANCE_CAVEAT,
  LANCET_STEPS_MORE_ACTIVE,
  LANCET_STEPS_URL,
  NHS_ADULT_SLEEP_MAX_HOURS,
  NHS_ADULT_SLEEP_MIN_HOURS,
  NHS_BMI_OBESE_MIN,
  NHS_SLEEP_URL,
  NICE_BMI_HEALTHY_MAX,
  NICE_BMI_HEALTHY_MIN,
  parseHeightCm,
  weeklyUnitsGuidance,
} from './guidance';
import { HRV_EXPLAINER_LINKS, HRV_EXPLAINER_PARAGRAPHS, HRV_EXPLAINER_TIPS, HRV_TOO_FEW, hrvExplainerForCoach, type DayValue } from './healthInsights';

const today = '2026-10-11';
const source = readFileSync('src/domain/guidance.ts', 'utf8');

function days(pairs: [string, number][]): DayValue[] {
  return pairs.map(([day, value]) => ({ day, value }));
}

function metric(kind: Parameters<typeof buildMetricGuidance>[0]['kind'], pairs: [string, number][], extra: Partial<Parameters<typeof buildMetricGuidance>[0]> = {}) {
  return buildMetricGuidance({ kind, today, points: days(pairs), ...extra });
}

describe('guidance sources', () => {
  it('keeps the published figures in comments next to the constants', () => {
    expect(source).toContain('NHS: adults need 7 to 9 hours');
    expect(source).toContain(NHS_SLEEP_URL);
    expect(source).toContain('British Heart Foundation: a normal resting heart rate is usually 60 to 100 bpm');
    expect(source).toContain(BHF_HEART_RATE_URL);
    expect(source).toContain('at least 150 minutes of moderate activity a week');
    expect(source).toContain('https://www.nhs.uk/live-well/exercise/physical-activity-guidelines-for-adults-aged-19-to-64/');
    expect(source).toContain('do not set a daily step target');
    expect(source).toContain(LANCET_STEPS_URL);
    expect(source).toContain('healthy weight BMI 18.5 to 24.9');
    expect(source).toContain('https://www.nice.org.uk/guidance/ng246');
    expect(source).toContain('https://www.nhs.uk/conditions/overweight-and-obesity/');
    expect(source).toContain('not to regularly drink more than 14 units a week');
    expect(NHS_ADULT_SLEEP_MIN_HOURS).toBe(7);
    expect(NHS_ADULT_SLEEP_MAX_HOURS).toBe(9);
    expect(BHF_RESTING_MIN_BPM).toBe(60);
    expect(BHF_RESTING_MAX_BPM).toBe(100);
    expect(CMO_MODERATE_MINUTES_WEEK).toBe(150);
    expect(CMO_VIGOROUS_MINUTES_WEEK).toBe(75);
    expect(LANCET_STEPS_MORE_ACTIVE).toBe(10000);
    expect(NICE_BMI_HEALTHY_MIN).toBe(18.5);
    expect(NICE_BMI_HEALTHY_MAX).toBe(24.9);
    expect(NHS_BMI_OBESE_MIN).toBe(30);
  });
});

describe('sleep guidance', () => {
  it('places 7 to 9 hours in the healthy range', () => {
    const band = metric('sleep_hours', [
      ['2026-10-09', 7],
      ['2026-10-10', 8],
      ['2026-10-11', 9],
    ]);
    expect(band.label).toBe('In the healthy range');
    expect(band.marker?.warning).toBe(false);
    expect(band.warning).toBeNull();
    expect(band.plain).toContain('7 to 9 hours');
    expect(band.sources.map((item) => item.url)).toContain(NHS_SLEEP_URL);
    expect(band.caveat).toBe(GUIDANCE_CAVEAT);
  });

  it('names a shorter average without a warning until the short nights repeat', () => {
    const once = metric('sleep_hours', [['2026-10-11', 6.5]]);
    expect(once.label).toBe('Below typical');
    expect(once.warning).toBeNull();
    expect(once.marker?.warning).toBe(false);

    const repeated = metric('sleep_hours', [
      ['2026-10-09', 5],
      ['2026-10-10', 5.5],
      ['2026-10-11', 4],
    ]);
    expect(repeated.label).toBe('Below typical');
    expect(repeated.warning?.detail).toContain('under 6 hours');
    expect(repeated.warning?.detail).toContain('7 to 9 hours');
    expect(repeated.warning?.step).toContain('GP');
    expect(repeated.warning?.step).toContain('NHS 111');
    expect(repeated.warning?.step).toContain('999');
    expect(repeated.warning?.step).toContain('fainting');
    expect(repeated.warning?.step).toContain('breathlessness');
    expect(repeated.marker?.warning).toBe(true);
    expect(repeated.caveat).toContain('not a diagnosis');
  });

  it('does not treat a longer night as a warning', () => {
    const band = metric('sleep_hours', [['2026-10-11', 10]]);
    expect(band.label).toBe('Above the usual range');
    expect(band.warning).toBeNull();
    expect(band.plain).toContain('not a warning on its own');
  });
});

describe('resting heart rate guidance', () => {
  it('uses 60 to 100 and keeps a fit person\'s lower rate out of the warning', () => {
    const usual = metric('resting_heart_rate', [['2026-10-11', 72]]);
    expect(usual.label).toBe('In the healthy range');
    expect(usual.plain).toContain('60 to 100');
    expect(usual.plain).toContain('athletes');
    expect(usual.sources.map((item) => item.url)).toContain(BHF_HEART_RATE_URL);

    const fit = metric('resting_heart_rate', [['2026-10-11', 52]]);
    expect(fit.label).toBe('Below the usual range');
    expect(fit.warning).toBeNull();
    expect(fit.marker?.warning).toBe(false);
  });

  it('warns only after several days above 100', () => {
    const once = metric('resting_heart_rate', [['2026-10-11', 110]]);
    expect(once.label).toBe('Above the usual range');
    expect(once.warning).toBeNull();

    const repeated = metric('resting_heart_rate', [
      ['2026-10-09', 110],
      ['2026-10-10', 108],
      ['2026-10-11', 104],
    ]);
    expect(repeated.warning?.detail).toContain('above 100');
    expect(repeated.warning?.step).toContain('999');
    expect(repeated.warning?.step).toContain('chest pain');
    expect(repeated.marker?.warning).toBe(true);
  });
});

describe('workout guidance', () => {
  it('compares logged minutes with 150, and never colours a short week as a warning', () => {
    const meeting = metric('workout_minutes', [
      ['2026-10-09', 80],
      ['2026-10-11', 80],
    ]);
    expect(meeting.label).toBe('Meeting the guideline');
    expect(meeting.warning).toBeNull();
    expect(meeting.plain).toContain('150');
    expect(meeting.plain).toContain('75');

    const short = metric('workout_minutes', [['2026-10-11', 40]]);
    expect(short.label).toBe('Below recommended');
    expect(short.warning).toBeNull();
    expect(short.marker?.warning).toBe(false);
    expect(short.plain).toContain('cannot tell how hard');

    const empty = metric('workout_minutes', []);
    expect(empty.label).toBeNull();
    expect(empty.marker).toBeNull();
    expect(empty.plain).toContain('150');
  });
});

describe('steps and heart rate variability', () => {
  it('refuses a national band where the UK has not published one', () => {
    const steps = metric('steps', [
      ['2026-09-20', 6000],
      ['2026-09-27', 6200],
      ['2026-10-04', 6400],
      ['2026-10-10', 8000],
      ['2026-10-11', 8200],
    ]);
    expect(steps.label).toBeNull();
    expect(steps.marker).toBeNull();
    expect(steps.plain).toContain('no NHS or UK Chief Medical Officer daily step target');
    expect(steps.plain).toContain('7,000');
    expect(steps.plain).toContain('10,000');
    expect(steps.plain).toContain('your own earlier average');
    expect(steps.sources.map((item) => item.url)).toContain(LANCET_STEPS_URL);
    expect(steps.plain).not.toContain('In the healthy range');

    const hrv = metric('hrv_sdnn', [
      ['2026-09-20', 40],
      ['2026-09-27', 42],
      ['2026-10-04', 38],
      ['2026-10-11', 46],
    ]);
    expect(hrv.label).toBeNull();
    expect(hrv.marker).toBeNull();
    expect(hrv.plain).toContain(HRV_TOO_FEW);
    expect(hrv.plain).toContain('no official UK target');
    expect(hrv.plain).not.toMatch(/\d+\s*to\s*\d+\s*ms/);
    expect(hrv.plain).not.toContain('earlier average');
    expect(hrv.sources).toEqual([]);
    expect(hrv.caveat).toBe(GUIDANCE_CAVEAT);

    const enough = metric('hrv_sdnn', [
      ['2026-09-10', 40],
      ['2026-09-20', 42],
      ['2026-10-01', 38],
      ['2026-10-08', 44],
      ['2026-10-10', 46],
      ['2026-10-11', 45],
    ]);
    expect(enough.plain).not.toContain(HRV_TOO_FEW);
    expect(enough.label).toBeNull();
    expect(enough.marker).toBeNull();
    expect(enough.plain).toContain('your own');
    expect(enough.caveat).toBe(GUIDANCE_CAVEAT);
  });

  it('keeps typical HRV ranges as rough examples, with the papers named', () => {
    const text = HRV_EXPLAINER_PARAGRAPHS.join(' ');
    expect(text).toContain('variation in time between heartbeats');
    expect(text).toContain('more rested, recovered body');
    expect(text).toContain('Apple Watch measures SDNN');
    expect(text).toContain('mostly overnight');
    expect(text).toContain('general, rough examples, not a target');
    expect(text).toContain('30 to 70 ms');
    expect(text).toContain('70 to 100 ms or more');
    expect(text).toContain('20 to 30 ms');
    expect(text).toContain('falls with age');
    expect(text).toContain('trend over days matters more than one night');
    expect(text).toContain('Alcohol noticeably lowers');
    expect(text).toContain('four weeks');
    expect(text).toContain('not a promise for you');
    expect(HRV_EXPLAINER_TIPS).toContain('Sleep');
    expect(HRV_EXPLAINER_TIPS).toContain('water');
    expect(HRV_EXPLAINER_TIPS).toContain('rest days');
    expect(HRV_EXPLAINER_TIPS).toContain('Breathing exercises');
    expect(HRV_EXPLAINER_LINKS.map((item) => item.url)).toEqual([
      'https://my.clevelandclinic.org/health/symptoms/21773-heart-rate-variability-hrv',
      'https://developer.apple.com/documentation/healthkit/hkquantitytypeidentifier/heartratevariabilitysdnn',
      'https://onlinelibrary.wiley.com/doi/10.1111/j.1540-8159.2010.02841.x',
      'https://pubmed.ncbi.nlm.nih.gov/26883166/',
      'https://pmc.ncbi.nlm.nih.gov/articles/PMC5878366/',
      'https://pmc.ncbi.nlm.nih.gov/articles/PMC12594097/',
    ]);
    const coach = hrvExplainerForCoach();
    expect(coach).toContain('What does HRV mean?');
    expect(coach).toContain('not a diagnosis');
    expect(coach).toContain('GP');
    expect(coach).not.toMatch(/below 50 ms is unhealthy/i);
  });
});

describe('BMI guidance', () => {
  it('uses the NHS worked example and the published ranges', () => {
    const example = bmiFrom(70, 170);
    expect(example).not.toBeNull();
    expect(example ?? 0).toBeCloseTo(24.22, 2);

    const healthy = metric('weight_kg', [['2026-10-11', 74.2]], { heightCm: 178, adult: true });
    expect(healthy.label).toBe('In the healthy range');
    expect(healthy.plain).toContain('23.4');
    expect(healthy.warning).toBeNull();
    expect(healthy.plain).toContain('23 to 27.4');

    const over = metric('weight_kg', [['2026-10-11', 80]], { heightCm: 170, adult: true });
    expect(over.label).toBe('Above the healthy range');
    expect(over.warning).toBeNull();
    expect(over.plain).toContain('overweight');

    const low = metric('weight_kg', [['2026-10-11', 50]], { heightCm: 175, adult: true });
    expect(low.label).toBe('Below the healthy range');
    expect(low.warning?.detail).toContain('18.5');
    expect(low.warning?.step).toContain('999');
    expect(low.marker?.warning).toBe(true);

    const high = metric('weight_kg', [['2026-10-11', 100]], { heightCm: 170, adult: true });
    expect(high.label).toBe('Above the healthy range');
    expect(high.warning?.detail).toContain('obese');
    expect(high.warning?.step).toContain('NHS 111');
    expect(high.marker?.warning).toBe(true);
  });

  it('does not invent a BMI without height or an adult age', () => {
    const missing = metric('weight_kg', [['2026-10-11', 74]], { heightCm: null, adult: true });
    expect(missing.label).toBeNull();
    expect(missing.marker).toBeNull();
    expect(missing.plain).toContain('height');

    const young = metric('weight_kg', [['2026-10-11', 74]], { heightCm: 178, adult: false });
    expect(young.label).toBeNull();
    expect(young.marker).toBeNull();
    expect(young.plain).toContain('18 or over');
    expect(parseHeightCm('')).toEqual({ ok: true, value: null });
    expect(parseHeightCm('178')).toEqual({ ok: true, value: 178 });
    expect(parseHeightCm('1.78').ok).toBe(false);
  });
});

describe('weekly units guidance', () => {
  it('bands 14 units and keeps the higher-risk colour for 50 or more', () => {
    const within = weeklyUnitsGuidance(14);
    expect(within.label).toBe('Within the low-risk guideline');
    expect(within.warning).toBeNull();
    expect(within.plain).toContain('14');
    expect(within.caveat).toBe(GUIDANCE_CAVEAT);

    const above = weeklyUnitsGuidance(20);
    expect(above.label).toBe('Above recommended');
    expect(above.warning).toBeNull();
    expect(above.marker?.warning).toBe(false);

    const depends = weeklyUnitsGuidance(48.4);
    expect(depends.label).toBe('Above recommended');
    expect(depends.warning).toBeNull();
    expect(depends.plain).toContain('35');
    expect(depends.plain).toContain('50');
    expect(depends.plain).toContain('Sex is not recorded');

    const higher = weeklyUnitsGuidance(50, 'stopped');
    expect(higher.warning?.step).toContain('NHS 111');
    expect(higher.warning?.step).toContain('suddenly');
    expect(higher.marker?.warning).toBe(true);
    expect(higher.plain).toContain('not a target to drink');
    expect(higher.sources.some((item) => item.url.includes('nhs.uk'))).toBe(true);
  });
});
