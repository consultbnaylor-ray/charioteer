import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { REASON_PLACEHOLDERS, reasonPlaceholder } from './reasons';

function contrast(hex: string, on: string): number {
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance = (color: string) => {
    const n = Number.parseInt(color.slice(1), 16);
    return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
  };
  const hi = Math.max(luminance(hex), luminance(on));
  const lo = Math.min(luminance(hex), luminance(on));
  return (hi + 0.05) / (lo + 0.05);
}

describe('reason examples', () => {
  it('gives each of the first three boxes its own example', () => {
    expect(REASON_PLACEHOLDERS.map((_, index) => reasonPlaceholder(index))).toEqual([
      'e.g. I want to be as healthy as I can be',
      'e.g. I want to be present for my family',
      'e.g. I want to wake up with a clear head',
    ]);
    expect(new Set(REASON_PLACEHOLDERS).size).toBe(3);
    expect(reasonPlaceholder(3)).toBe('e.g. In your own words');
  });

  it('starts the reason boxes empty and paints every placeholder in the hint colour', () => {
    const onboarding = readFileSync('src/app/onboarding.tsx', 'utf8');
    const field = readFileSync('src/ui/ui.tsx', 'utf8');
    expect(onboarding).toContain("useState(['', '', ''])");
    expect(onboarding).toContain('placeholder={reasonPlaceholder(index)}');
    expect(onboarding).not.toContain('I want to be as healthy as I can be');
    expect(field).toContain('placeholderTextColor={theme.colors.placeholder}');
    expect(field).toContain('const textColor = value ? theme.colors.ink : theme.colors.placeholder');
    expect(field).not.toContain('placeholderTextColor={theme.colors.muted}');
    expect(field).not.toContain('placeholderTextColor={theme.colors.ink}');
    expect(field).not.toContain('usePlaceholderColor');
  });
});

describe('placeholder contrast', () => {
  const theme = readFileSync('src/ui/theme.tsx', 'utf8');
  const light = theme.slice(theme.indexOf('const light'), theme.indexOf('const dark'));
  const dark = theme.slice(theme.indexOf('const dark'), theme.indexOf('export type Palette'));
  const hex = (block: string, name: string) => {
    const match = block.match(new RegExp(`${name}: '(#[0-9A-Fa-f]{6})'`));
    if (!match) throw new Error(`missing ${name}`);
    return match[1];
  };

  it('keeps the hint readable and clearly quieter than typed text', () => {
    const lightHint = hex(light, 'placeholder');
    const darkHint = hex(dark, 'placeholder');
    expect(contrast(lightHint, hex(light, 'surface'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(darkHint, hex(dark, 'surface'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(lightHint, hex(light, 'surface'))).toBeLessThan(contrast(hex(light, 'ink'), hex(light, 'surface')) - 8);
    expect(contrast(darkHint, hex(dark, 'surface'))).toBeLessThan(contrast(hex(dark, 'ink'), hex(dark, 'surface')) - 8);
  });
});
