import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { todayRing } from '@/domain/nutrition';
import { proteinPace } from '@/domain/statWindow';
import { ringDrawsClosed, ringStroke } from '@/ui/ringClose';

describe('protein ring at 192 g of 194 g', () => {
  const ring = 108;
  const protein = todayRing({
    hideCalories: true,
    kcal: 0,
    kcalTarget: null,
    proteinG: 192,
    proteinTarget: 194,
    logged: true,
  });
  const energy = todayRing({
    hideCalories: false,
    kcal: 1886,
    kcalTarget: 2144,
    proteinG: 192,
    proteinTarget: 194,
    logged: true,
  });

  it('keeps the 2 g remainder in the words and closes the notch', () => {
    expect(protein.fill).toBeCloseTo(192 / 194, 10);
    expect(protein.fill).toBe(0.9896907216494846);
    expect(protein.fill).toBeLessThan(0.999);
    expect(protein.status).toBe('2 g left');
    expect(protein.centre).toBe('192');
    expect(ringStroke(ring)).toBe(12);
    expect(ringDrawsClosed(protein.fill, ring)).toBe(true);
    expect(ringDrawsClosed(0.9, ring)).toBe(false);
    expect(readFileSync('src/ui/DistanceCharts.tsx', 'utf8')).toContain('ringDrawsClosed(shown, ring)');
  });

  it('leaves a real shortfall, and the energy ring, open', () => {
    const short = todayRing({
      hideCalories: true,
      kcal: 0,
      kcalTarget: null,
      proteinG: 170,
      proteinTarget: 194,
      logged: true,
    });
    expect(short.status).toBe('24 g left');
    expect(short.status).not.toBe('At your target');
    expect(ringDrawsClosed(short.fill, ring)).toBe(false);
    expect(energy.status).toBe('258 kcal left');
    expect(energy.fill).toBeCloseTo(1886 / 2144, 10);
    expect(ringDrawsClosed(energy.fill, ring)).toBe(false);
    const pace = proteinPace({
      period: 'day',
      loggedDays: 1,
      now: new Date('2026-10-27T21:28:00.000Z'),
      average: 192,
      target: 194,
      hits: 0,
    });
    expect(pace.word).toBe('Early days');
  });

  it('closes a ring that is already within the at-target remainder', () => {
    const near = todayRing({
      hideCalories: true,
      kcal: 0,
      kcalTarget: null,
      proteinG: 29.96,
      proteinTarget: 30,
      logged: true,
    });
    expect(near.status).toBe('At your target');
    expect(near.fill).toBeLessThan(0.999);
    expect(ringDrawsClosed(near.fill, ring)).toBe(true);
    expect(ringDrawsClosed(1, ring)).toBe(true);
    expect(ringDrawsClosed(0, ring)).toBe(false);
  });
});
