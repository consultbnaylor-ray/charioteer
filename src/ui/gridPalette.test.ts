import { describe, expect, it } from 'vitest';

import { gridAccents, type GridRole } from './statsPalette';

function channel(hex: string, index: number): number {
  const value = Number.parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16) / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const [r, g, b] = [0, 1, 2].map((index) => channel(hex, index));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(ink: string, background: string): number {
  const lighter = Math.max(luminance(ink), luminance(background));
  const darker = Math.min(luminance(ink), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

const ROLES: GridRole[] = ['sobriety', 'activity', 'heart', 'food', 'mind', 'warning', 'edge'];

describe('Grid Runner accents', () => {
  it('keeps the dark neon set and a darker light set', () => {
    expect(gridAccents('dark')).toMatchObject({
      sobriety: '#2DE0A0',
      activity: '#36D6FF',
      heart: '#FF4D6D',
      food: '#F59E0B',
      mind: '#9B8CFF',
      warning: '#FFE14A',
      edge: '#D1FAE5',
    });
    expect(gridAccents('light').sobriety).toBe('#047857');
    expect(gridAccents('light').food).toBe('#C2410C');
  });

  it('clears WCAG AA for small text on the screen background', () => {
    for (const role of ROLES) {
      expect(contrast(gridAccents('dark')[role], '#0C0C0C')).toBeGreaterThanOrEqual(4.5);
      expect(contrast(gridAccents('light')[role], '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    }
  });
});
