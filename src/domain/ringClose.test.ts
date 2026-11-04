import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { todayRing } from '@/domain/nutrition';
import { proteinPace } from '@/domain/statWindow';
import { closedRingPath, ringArcPath, ringDrawsClosed, ringSeam, ringShown, ringStroke } from '@/ui/ringClose';
import { watchArcInk, watchSignalInk } from '@/ui/statsPalette';

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
    expect(readFileSync('src/ui/DistanceCharts.tsx', 'utf8')).toContain('ringShown(fill, motion, ring)');
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

describe('calorie ring at 2,765 kcal of 2,144', () => {
  const ring = 108;
  const stroke = ringStroke(ring);
  const radius = (ring - stroke) / 2;
  const mid = ring / 2;
  const overrun = todayRing({
    hideCalories: false,
    kcal: 2765,
    kcalTarget: 2144,
    proteinG: 0,
    proteinTarget: null,
    logged: true,
  });

  it('keeps a full first lap when the chart ease is still short', () => {
    expect(overrun.fill).toBe(1);
    expect(overrun.overfill).toBeCloseTo(621 / 2144, 10);
    expect(ringShown(overrun.fill, 0, ring)).toBe(1);
    expect(ringShown(overrun.fill, 0.9375, ring)).toBe(1);
    expect(ringShown(overrun.fill, 1, ring)).toBe(1);
    expect(ringShown(1886 / 2144, 1, ring)).toBeCloseTo(1886 / 2144, 10);
    const doubled = todayRing({
      hideCalories: false,
      kcal: 5000,
      kcalTarget: 2144,
      proteinG: 0,
      proteinTarget: null,
      logged: true,
    });
    expect(ringShown(doubled.fill, 0.5, ring)).toBe(1);
    expect(doubled.overfill).toBe(1);
  });

  it('draws the full lap as two half arcs that meet, with no round cap', () => {
    const path = closedRingPath(mid, mid, radius);
    expect(path).toBe('M 54 6 A 48 48 0 1 1 47.984 101.622 M 60.016 101.622 A 48 48 0 1 1 65.937 7.508');
    expect(path.match(/A 48 48 0 1 1 /g)).toHaveLength(2);
    expect(path.startsWith('M 54 6 ')).toBe(true);
    expect(path.endsWith('54 6')).toBe(false);
    const arc = ringArcPath(mid, mid, radius, overrun.overfill);
    expect(arc).toMatch(/^M 54 6 A 48 48 0 0 1 /);
    expect(arc).not.toBe(path);
    expect(ringArcPath(mid, mid, radius, 1)).toBe(path);
    expect(ringArcPath(mid, mid, radius, 0)).toBeNull();
    const seam = ringSeam(mid, mid, radius, stroke);
    expect(seam).toEqual({ x1: 54, y1: 0, x2: 54, y2: 12 });
    const charts = readFileSync('src/ui/DistanceCharts.tsx', 'utf8');
    const pathAt = charts.indexOf('<Path d={closedRingPath');
    const closed = charts.slice(pathAt, charts.indexOf('/>', pathAt) + 2);
    expect(closed).toContain('strokeLinecap="butt"');
    expect(closed).not.toContain('strokeLinecap="round"');
    expect(closed).not.toContain('strokeDasharray');
    expect(charts).toContain('watchArcInk');
    expect(charts).toContain('extra > 0 ? watchSignalInk(theme.scheme) : undefined');
    expect(charts).not.toContain('watch.ink');
    expect(watchArcInk('dark')).toBe('#F59E0B');
    expect(watchArcInk('light')).toBe('#F59E0B');
    expect(watchArcInk('dark')).not.toBe('#FFEDD5');
    expect(watchSignalInk('dark')).toBe('#F59E0B');
    expect(watchSignalInk('light')).toBe('#C2410C');
    expect(contrast(watchSignalInk('dark'), '#1A1A1A')).toBeGreaterThanOrEqual(4.5);
    expect(contrast(watchSignalInk('light'), '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
  });
});

function contrast(front: string, back: string): number {
  const channel = (hex: string, shift: number) => {
    const value = parseInt(hex.slice(1), 16) >> shift & 255;
    const unit = value / 255;
    return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
  };
  const luminance = (hex: string) => 0.2126 * channel(hex, 16) + 0.7152 * channel(hex, 8) + 0.0722 * channel(hex, 0);
  const [hi, lo] = [luminance(front), luminance(back)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}
