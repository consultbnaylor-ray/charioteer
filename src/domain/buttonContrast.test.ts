import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function channel(hex: string, index: number): number {
  const value = Number.parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16) / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const [red, green, blue] = [0, 1, 2].map((index) => channel(hex, index));
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(front: string, back: string): number {
  const lighter = Math.max(luminance(front), luminance(back));
  const darker = Math.min(luminance(front), luminance(back));
  return (lighter + 0.05) / (darker + 0.05);
}

function palette(source: string, name: 'light' | 'dark') {
  const start = source.indexOf(`const ${name} = {`);
  const body = source.slice(start, source.indexOf('};', start));
  const read = (key: string) => {
    const match = body.match(new RegExp(`${key}: '(#[0-9A-Fa-f]{6})'`));
    if (!match?.[1]) throw new Error(`${name}.${key}`);
    return match[1];
  };
  return { bg: read('bg'), surface: read('surface'), ink: read('ink') };
}

describe('button contrast', () => {
  const theme = readFileSync('src/ui/theme.tsx', 'utf8');
  const ui = readFileSync('src/ui/ui.tsx', 'utf8');
  const button = ui.slice(ui.indexOf('export function Button'), ui.indexOf('export function Field'));
  const nutrition = readFileSync('src/app/(main)/nutrition.tsx', 'utf8');

  it('keeps primary text and quiet outline text at AA on both themes', () => {
    for (const name of ['light', 'dark'] as const) {
      const colors = palette(theme, name);
      expect(contrast(colors.bg, colors.ink)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(colors.ink, colors.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(colors.ink, colors.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(colors.ink, colors.surface)).toBeGreaterThanOrEqual(3);
    }
  });

  it('draws a quiet action as an outline and dims a disabled one', () => {
    expect(button).toContain("quiet: { bg: 'transparent', fg: theme.colors.ink, border: theme.colors.ink }");
    expect(button).toContain('primary: { bg: theme.colors.ink, fg: theme.colors.bg, border: \'transparent\' }');
    expect(button).toContain("borderWidth: tone === 'quiet' ? stroke.control : 0");
    expect(button).toContain('opacity: inactive ? 0.45 : pressed ? 0.86 : 1');
    expect(button).toContain('accessibilityHint={reason || undefined}');
    expect(button).toContain('{reason ? <T variant="muted">{reason}</T> : null}');
    expect(button).not.toContain('sunken');
  });

  it('makes Suggest targets a primary button and leaves the photo actions outlined', () => {
    expect(nutrition).toContain('<Button label="Suggest targets" pending={isPending(\'suggest\')} pendingLabel="Suggesting..." onPress={suggest} />');
    expect(nutrition).not.toMatch(/label="Suggest targets"[^\n]*tone="quiet"/);
    expect(nutrition).toContain('label="Estimate from text"');
    expect(nutrition).toContain('label="Take a photo" tone="quiet"');
    expect(nutrition).toContain('label="Choose a photo" tone="quiet"');
    expect(nutrition).toContain('label="Enter it myself"');
    const checkIn = readFileSync('src/app/(main)/check-in.tsx', 'utf8');
    const you = readFileSync('src/app/(main)/profile.tsx', 'utf8');
    expect(checkIn).toContain("disabledReason={dirty ? undefined : 'Change the check-in to save.'}");
    expect(you).toContain("disabledReason={dirty ? undefined : 'Change a detail to save.'}");
    expect(you).toContain("disabledReason={confirm === 'DELETE' ? undefined : 'Type DELETE to remove the account.'}");
  });
});
