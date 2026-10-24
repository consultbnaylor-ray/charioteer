import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { statsToneColors } from '@/ui/statsPalette';

function channel(hex: string, index: number): number {
  const value = Number.parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16) / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function contrast(front: string, back: string): number {
  const lum = (hex: string) => {
    const [red, green, blue] = [0, 1, 2].map((index) => channel(hex, index));
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  };
  const lighter = Math.max(lum(front), lum(back));
  const darker = Math.min(lum(front), lum(back));
  return (lighter + 0.05) / (darker + 0.05);
}

describe('card chrome', () => {
  const theme = readFileSync('src/ui/theme.tsx', 'utf8');
  const ui = readFileSync('src/ui/ui.tsx', 'utf8');
  const card = ui.slice(ui.indexOf('export function Card'), ui.indexOf('export function Pulse'));
  const choice = ui.slice(ui.indexOf('export function Choice'), ui.indexOf('export function ErrorNote'));
  const field = ui.slice(ui.indexOf('export function Field'), ui.indexOf('function PasswordEye'));

  it('reuses the On-track green and keeps it readable on both themes', () => {
    expect(theme).toContain('statsToneColors(scheme).good.ink');
    expect(theme).toContain('sm: 14, md: 20');
    expect(theme).toContain('control: 2, card: 2, featured: 2.5');
    const light = statsToneColors('light').good.ink;
    const dark = statsToneColors('dark').good.ink;
    expect(light).toBe('#047857');
    expect(dark).toBe('#2DE0A0');
    expect(light).toMatch(/^#[0-9A-F]{6}$/);
    expect(dark).toMatch(/^#[0-9A-F]{6}$/);
    expect(contrast(light, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    expect(contrast(light, '#F2F2EE')).toBeGreaterThanOrEqual(4.5);
    expect(contrast(dark, '#1A1A1A')).toBeGreaterThanOrEqual(4.5);
    expect(contrast(dark, '#0C0C0C')).toBeGreaterThanOrEqual(4.5);
  });

  it('puts the accent on cards and leaves nested controls on the subtle line', () => {
    const frame = ui.slice(ui.indexOf('export function accentFrame'), ui.indexOf('export function Card'));
    expect(frame).toContain('borderColor: theme.colors.accent');
    expect(frame).toContain('radius.md - borderWidth');
    expect(frame).toContain("overflow: 'hidden'");
    expect(frame).toContain("theme.scheme === 'light'");
    expect(card).toContain('featured ? stroke.featured : stroke.card');
    expect(card).not.toContain('theme.colors.line');
    expect(ui).toContain('padding: 20');
    expect(choice).toContain('theme.colors.line');
    expect(choice).not.toContain('theme.colors.accent');
    expect(field).toContain('borderColor: theme.colors.line');
    expect(field).not.toContain('theme.colors.accent');
    expect(ui).toContain('borderRadius: radius.md');
    expect(ui).toContain('borderWidth: stroke.control');
  });
});
