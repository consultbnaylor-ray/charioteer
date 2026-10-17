import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { stonesAndPoundsToKg, weightReadingKg, weightReadingReady } from './weightEntry';

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
    expect(fields).toContain("useState<WeightUnitMode>('kg')");
    expect(fields).toContain('startOfLocalDay(new Date())');
    const screen = readFileSync('src/app/(main)/health.tsx', 'utf8');
    expect(screen).toContain('label="Save reading"');
    expect(screen).toContain('!value.trim() && weightDraft == null');
    expect(screen).toContain("kind: 'weight_kg'");
    expect(screen).toContain('unit: \'kg\'');
    expect(screen).toContain('heightCm: nextHeight');
    expect(screen).toContain('source: \'manual\'');
  });
});
