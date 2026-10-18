import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { formatUkCompactDay } from './healthInsights';
import {
  formatWaistCm,
  latestWaistLine,
  latestWaistPoint,
  latestWeightLine,
  latestWeightPoint,
  stonesAndPoundsToKg,
  WAIST_MEASURE_NOTE,
  WAIST_PRIVATE_NOTE,
  waistReadingCm,
  waistWindow,
  weightReadingKg,
  weightReadingReady,
  weightWaistWrite,
} from './weightEntry';

describe('weight entry', () => {
  it('keeps kilograms as the default and treats an empty field as no weight', () => {
    const empty = weightReadingKg({ unit: 'kg', kilograms: '', stones: '11', pounds: '6' });
    expect(empty).toEqual({ ok: true, kg: null });
    expect(weightReadingReady(empty)).toBe(false);
    const typed = weightReadingKg({ unit: 'kg', kilograms: '74.2', stones: '', pounds: '' });
    expect(typed).toEqual({ ok: true, kg: 74.2 });
    expect(weightReadingReady(typed)).toBe(true);
    expect(weightReadingKg({ unit: 'kg', kilograms: '74.24', stones: '', pounds: '' })).toEqual({ ok: true, kg: 74.2 });
    expect(weightReadingKg({ unit: 'kg', kilograms: '0', stones: '', pounds: '' }).ok).toBe(false);
    expect(weightReadingKg({ unit: 'kg', kilograms: '501', stones: '', pounds: '' }).ok).toBe(false);
  });

  it('converts stones and pounds for UK entry', () => {
    expect(stonesAndPoundsToKg(11, 11)).toBe(74.8);
    const both = weightReadingKg({ unit: 'stlb', kilograms: '90', stones: '11', pounds: '11' });
    expect(both).toEqual({ ok: true, kg: 74.8 });
    expect(weightReadingReady(both)).toBe(true);
    expect(weightReadingKg({ unit: 'stlb', kilograms: '', stones: '14', pounds: '' })).toEqual({
      ok: true,
      kg: stonesAndPoundsToKg(14, 0),
    });
    expect(weightReadingKg({ unit: 'stlb', kilograms: '', stones: '', pounds: '10' }).ok).toBe(true);
    const blank = weightReadingKg({ unit: 'stlb', kilograms: '80', stones: '', pounds: '' });
    expect(blank).toEqual({ ok: true, kg: null });
    expect(weightReadingReady(blank)).toBe(false);
    expect(weightReadingKg({ unit: 'stlb', kilograms: '', stones: '0', pounds: '0' }).ok).toBe(false);
    expect(weightReadingKg({ unit: 'stlb', kilograms: '', stones: '11', pounds: '14' }).ok).toBe(false);
    expect(weightReadingKg({ unit: 'stlb', kilograms: '', stones: '11.5', pounds: '0' }).ok).toBe(false);
  });

  it('puts the weight, the unit toggle, and today\'s date above height, and enables Save once a weight is entered', () => {
    const board = readFileSync('src/ui/HealthBoard.tsx', 'utf8');
    const block = board.slice(board.indexOf("kind === 'weight_kg'"), board.indexOf('<GuidanceRange'));
    expect(block.indexOf('<WeightFields')).toBeGreaterThan(-1);
    expect(block.indexOf('<WeightFields')).toBeLessThan(block.indexOf('label="Height (cm)"'));
    const fields = board.slice(board.indexOf('function WeightFields'), board.indexOf('function Readings'));
    expect(fields.indexOf('label="kg"')).toBeGreaterThan(-1);
    expect(fields.indexOf('label="st-lb"')).toBeGreaterThan(fields.indexOf('label="kg"'));
    expect(fields.indexOf('label="Weight (kg)"')).toBeGreaterThan(fields.indexOf('label="st-lb"'));
    expect(fields.indexOf('label="Stones"')).toBeGreaterThan(fields.indexOf('label="Weight (kg)"'));
    expect(fields.indexOf('label="Pounds"')).toBeGreaterThan(fields.indexOf('label="Stones"'));
    expect(fields.indexOf('label="Date"')).toBeGreaterThan(fields.indexOf('label="Pounds"'));
    expect(fields.indexOf('label="cm"')).toBeGreaterThan(fields.indexOf('label="Pounds"'));
    expect(fields.indexOf('label="inches"')).toBeGreaterThan(fields.indexOf('label="cm"'));
    expect(fields.indexOf("label={waistUnit === 'cm' ? 'Waist (cm)' : 'Waist (inches)'}")).toBeGreaterThan(fields.indexOf('label="inches"'));
    expect(fields.indexOf('label="Date"')).toBeGreaterThan(fields.indexOf('Waist (inches)'));
    expect(fields).toContain('hint={WAIST_MEASURE_NOTE}');
    expect(fields).toContain('{WAIST_PRIVATE_NOTE}');
    expect(fields).toContain("useState<WeightUnitMode>('kg')");
    expect(fields).toContain("useState<WaistUnitMode>('cm')");
    expect(fields).toContain('startOfLocalDay(new Date())');
    const history = board.slice(board.indexOf('function WaistHistory'), board.indexOf('function Readings'));
    expect(history).toContain('formatWaistCm(point.cm)');
    expect(history).toContain('formatUkCompactDay(point.day)');
    expect(history).toContain('Average');
    expect(history).toContain('No waist readings in the last');
    expect(history).not.toContain('ShareOnProfile');
    expect(board).toContain('<WaistHistory');
    expect(board).toContain('windowDays={range}');
    expect(board).toContain("label={`${days}d`}");
    const screen = readFileSync('src/app/(main)/health.tsx', 'utf8');
    expect(screen).toContain('label="Save reading"');
    expect(screen).toContain('!value.trim() && weightDraft == null');
    expect(screen).toContain('weightWaistWrite(weightDraft, isoDay(new Date()))');
    expect(screen).toContain('if (planned.sample) samples.push(planned.sample)');
    expect(screen).toContain('heightCm: nextHeight');
    expect(screen).toContain('source: \'manual\'');
    expect(screen).toContain('saveBodyComposition(waistWrite)');
    expect(screen).toContain('waistCm');
    expect(board).toContain('<ScrollTarget key={metric.kind} id="weight">');
    expect(screen).toContain('<PlanTick done');
    const body = readFileSync('src/ui/BodyComposition.tsx', 'utf8');
    expect(body).toContain('figures.waistCm');
    expect(body).toContain('from a weight reading');
    expect(body).not.toContain("label={unit === 'cm' ? 'Waist (cm)' : 'Waist (inches)'}");
    const stored = readFileSync('supabase/migrations/20261014170000_body_composition.sql', 'utf8');
    expect(stored).toContain('waist_cm numeric');
    expect(stored).toContain('user_id = auth.uid()');
  });

  it('stores a waist in centimetres and keeps a window of value, date, and average', () => {
    expect(waistReadingCm('', 'cm')).toEqual({ ok: true, cm: null });
    expect(waistReadingCm('84', 'cm')).toEqual({ ok: true, cm: 84 });
    expect(waistReadingCm('33', 'in')).toEqual({ ok: true, cm: 83.8 });
    expect(waistReadingCm('39', 'cm').ok).toBe(false);
    expect(waistReadingCm('15', 'in').ok).toBe(false);
    expect(formatWaistCm(84)).toBe('84 cm');
    expect(formatWaistCm(83.82)).toBe('83.8 cm');
    const today = '2026-10-17';
    const rows = [
      { recordedOn: '2026-10-17', waistCm: 80, createdAt: '2026-10-17T08:00:00.000Z' },
      { recordedOn: '2026-10-17', waistCm: 84, createdAt: '2026-10-17T18:00:00.000Z' },
      { recordedOn: '2026-10-10', waistCm: 82, createdAt: '2026-10-10T08:00:00.000Z' },
      { recordedOn: '2026-07-01', waistCm: 90, createdAt: '2026-07-01T08:00:00.000Z' },
    ];
    const week = waistWindow(rows, today, 7);
    expect(week.points).toEqual([{ day: '2026-10-17', cm: 84 }]);
    expect(week.latest).toEqual({ day: '2026-10-17', cm: 84 });
    expect(week.averageCm).toBe(84);
    const month = waistWindow(rows, today, 30);
    expect(month.points.map((point) => point.day)).toEqual(['2026-10-17', '2026-10-10']);
    expect(month.averageCm).toBe(83);
    expect(waistWindow(rows, today, 90).points.map((point) => point.cm)).toEqual([84, 82]);
    expect(WAIST_MEASURE_NOTE).toBe('Measure at the navel, relaxed breath out.');
    expect(WAIST_PRIVATE_NOTE).toContain('Share weight and body figures');
  });

  it('writes weight and waist the same way as the weight sheet', () => {
    const today = '2026-10-18';
    const kg = weightReadingKg({ unit: 'kg', kilograms: '74.2', stones: '', pounds: '' });
    const stones = weightReadingKg({ unit: 'stlb', kilograms: '', stones: '11', pounds: '11' });
    const waist = waistReadingCm('84', 'cm');
    const inches = waistReadingCm('33', 'in');
    expect(kg.ok && waist.ok).toBe(true);
    expect(stones.ok && inches.ok).toBe(true);
    if (!kg.ok || !stones.ok || !waist.ok || !inches.ok) return;
    expect(weightWaistWrite({ kg: kg.kg, recordedOn: today, waistCm: waist.cm }, today)).toEqual({
      ok: true,
      sample: { kind: 'weight_kg', value: 74.2, unit: 'kg', recordedOn: today, source: 'manual' },
      waist: { recordedOn: today, bodyFatPct: null, leanMassKg: null, waistCm: 84, source: 'other' },
    });
    expect(weightWaistWrite({ kg: stones.kg, recordedOn: today, waistCm: null }, today).ok).toBe(true);
    const inchesOnly = weightWaistWrite({ kg: null, recordedOn: today, waistCm: inches.cm }, today);
    expect(inchesOnly).toMatchObject({ ok: true, sample: null, waist: { waistCm: 83.8, source: 'other' } });
    expect(weightWaistWrite({ kg: null, recordedOn: today, waistCm: null }, today)).toEqual({
      ok: true,
      sample: null,
      waist: null,
    });
    expect(weightWaistWrite({ kg: 74.2, recordedOn: '2026-10-19', waistCm: null }, today)).toEqual({
      ok: false,
      error: 'Choose today or an earlier day.',
    });
    expect(weightWaistWrite({ kg: 0, recordedOn: today, waistCm: null }, today).ok).toBe(false);
    expect(weightWaistWrite({ kg: null, recordedOn: today, waistCm: 10 }, today).ok).toBe(false);
  });

  it('shows the latest weight and waist with their dates, including an Apple Health weight', () => {
    const samples = [
      { kind: 'weight_kg', value: 80, recordedOn: '2026-10-01', source: 'manual' },
      { kind: 'weight_kg', value: 79.4, recordedOn: '2026-10-17', source: 'healthkit' },
    ];
    const weight = latestWeightPoint(samples);
    expect(weight).toEqual({ day: '2026-10-17', kg: 79.4 });
    expect(latestWeightLine(weight)).toBe(`Latest weight 79.4 kg · ${formatUkCompactDay('2026-10-17')}`);
    expect(latestWeightLine(null)).toBe('No weight logged yet');
    const rows = [
      { recordedOn: '2026-10-17', waistCm: 80, createdAt: '2026-10-17T08:00:00.000Z' },
      { recordedOn: '2026-10-17', waistCm: 84, createdAt: '2026-10-17T18:00:00.000Z' },
      { recordedOn: '2026-10-10', waistCm: 90, createdAt: '2026-10-10T08:00:00.000Z' },
    ];
    const waist = latestWaistPoint(rows);
    expect(waist).toEqual({ day: '2026-10-17', cm: 84 });
    expect(latestWaistLine(waist)).toBe(`Latest waist ${formatWaistCm(84)} · ${formatUkCompactDay('2026-10-17')}`);
    expect(latestWaistLine(null)).toBe('No waist logged yet');
    expect(latestWaistPoint([{ recordedOn: '2026-10-01', waistCm: null, createdAt: '2026-10-01T00:00:00.000Z' }])).toBeNull();
  });

  it('puts Weight and waist on You under Buddies and above Goal, and keeps it private', () => {
    const you = readFileSync('src/app/(main)/profile.tsx', 'utf8');
    const buddies = you.indexOf('label="Buddies"');
    const panel = you.indexOf('<WeightWaistPanel');
    const build = you.indexOf('<BuildChoices');
    const goal = you.indexOf('<GoalChoices');
    expect(buddies).toBeGreaterThan(-1);
    expect(panel).toBeGreaterThan(buddies);
    expect(build).toBeGreaterThan(panel);
    expect(goal).toBeGreaterThan(build);
    const card = readFileSync('src/ui/WeightWaistPanel.tsx', 'utf8');
    expect(card).toContain('variant="label">Weight and waist');
    expect(card).toContain('<WeightFields');
    expect(card).toContain('weightWaistWrite(draft, isoDay(new Date()))');
    expect(card).toContain('repo.saveHealth([planned.sample])');
    expect(card).toContain('repo.saveBodyComposition(planned.waist)');
    expect(card).toContain('label="Save"');
    expect(card).toContain("export const WEIGHT_WAIST_SAVED = 'Saved'");
    expect(card).toContain('<PlanTick done');
    expect(card).toContain('accessibilityLabel={WEIGHT_WAIST_SAVED}');
    expect(card).toContain('statsToneColors');
    expect(card).toContain('latestWeightLine');
    expect(card).toContain('latestWaistLine');
    expect(card).toContain('Open the weight sheet');
    expect(card).toContain("export const WEIGHT_WAIST_SHEET_HREF = '/health?section=weight'");
    expect(card).toContain('router.push(WEIGHT_WAIST_SHEET_HREF');
    expect(card).not.toContain('ShareOnProfile');
    expect(card).not.toContain('shareBodyFigures');
    expect(card).not.toContain('syncAppleHealth');
    expect(card).toContain('disabled={!consent || pending || draft == null}');
    const fields = readFileSync('src/ui/HealthBoard.tsx', 'utf8');
    expect(fields).toContain('{WAIST_PRIVATE_NOTE}');
    expect(fields).toContain('label="kg"');
    expect(fields).toContain('label="st-lb"');
    expect(fields).toContain('label="cm"');
    expect(fields).toContain('label="inches"');
  });
});
