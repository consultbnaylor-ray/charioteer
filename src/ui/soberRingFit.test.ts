import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  SOBER_RING_PAD,
  SOBER_RING_SIZE,
  SOBER_RING_STROKE,
  ringChordWidth,
  ringInnerRadius,
  soberRingEdgeOffset,
  soberRingFit,
} from '@/ui/soberRingFit';

/**
 * Advances in em, measured from the fonts the ring draws.
 * Barlow SemiBold uppercase for the label. Oswald Bold for the count.
 * Letter spacing is added in points and does not shrink with the font.
 */
const DAYS_SOBER_EM = 5.695;
const TOTAL_DAYS_EM = 5.654;
const COUNT_136_EM = 1.437;
const COUNT_1000_EM = 2.035;
/** Four Oswald zeros. Wider than any 4-digit day count, so it bounds 1000+. */
const COUNT_WIDE_EM = 2.2;
const LABEL_GAPS = 9;
const COUNT_GAPS = 3;
/** Display type tracking. The count does not override it. */
const COUNT_TRACKING = 0.2;

function fittedWidth(em: number, fontSize: number, tracking: number, gaps: number, box: number): number {
  const gapsWidth = tracking * gaps;
  const glyphs = em * fontSize;
  if (glyphs + gapsWidth <= box) return glyphs + gapsWidth;
  const ratio = Math.max(0, (box - gapsWidth) / glyphs);
  return em * fontSize * ratio + gapsWidth;
}

describe('sober ring copy', () => {
  it('keeps the label and a 4-digit count inside the stroke at the default size', () => {
    const fit = soberRingFit(1, 1);
    const edge = soberRingEdgeOffset(fit.scale);
    const chord = ringChordWidth(SOBER_RING_SIZE, SOBER_RING_STROKE, edge);
    expect(fit.scale).toBe(1);
    expect(fit.labelLift).toBeLessThan(0);
    expect(fit.width).toBeLessThanOrEqual(chord - SOBER_RING_PAD * 2 + 1e-9);
    expect(fit.width).toBeGreaterThan(64);

    const days = fittedWidth(DAYS_SOBER_EM, 12 * fit.scale, fit.letterSpacing, LABEL_GAPS, fit.width);
    const total = fittedWidth(TOTAL_DAYS_EM, 12 * fit.scale, fit.letterSpacing, LABEL_GAPS, fit.width);
    expect(days).toBeLessThanOrEqual(fit.width + 1e-9);
    expect(total).toBeLessThanOrEqual(fit.width + 1e-9);
    expect(chord - days).toBeGreaterThanOrEqual(SOBER_RING_PAD * 2 - 1e-9);

    const threeDigits = COUNT_136_EM * 40 * fit.scale + COUNT_TRACKING * 2;
    expect(threeDigits).toBeLessThanOrEqual(fit.width);

    const thousand = fittedWidth(COUNT_1000_EM, 40 * fit.scale, COUNT_TRACKING, COUNT_GAPS, fit.width);
    const widest = fittedWidth(COUNT_WIDE_EM, 40 * fit.scale, COUNT_TRACKING, COUNT_GAPS, fit.width);
    expect(thousand).toBeLessThanOrEqual(fit.width + 1e-9);
    expect(widest).toBeLessThanOrEqual(fit.width + 1e-9);
    expect(thousand / (COUNT_1000_EM * 40 + COUNT_TRACKING * COUNT_GAPS)).toBeGreaterThan(0.8);
  });

  it('fits the same chord on a small phone and at large Dynamic Type', () => {
    const radius = ringInnerRadius(SOBER_RING_SIZE, SOBER_RING_STROKE);
    for (const theme of [1, 1.15, 1.32]) {
      for (const system of [0.85, 1, 1.35, 2, 3.5]) {
        const fit = soberRingFit(theme, system);
        const edge = soberRingEdgeOffset(fit.scale);
        const chord = ringChordWidth(SOBER_RING_SIZE, SOBER_RING_STROKE, edge);
        expect(edge, `theme ${theme} system ${system}`).toBeLessThanOrEqual(radius - SOBER_RING_PAD + 1e-9);
        expect(fit.width, `theme ${theme} system ${system}`).toBeLessThanOrEqual(chord - SOBER_RING_PAD * 2 + 1e-9);
        expect(fit.width, `theme ${theme} system ${system}`).toBeGreaterThan(36);
        const days = fittedWidth(DAYS_SOBER_EM, 12 * fit.scale, fit.letterSpacing, LABEL_GAPS, fit.width);
        const widest = fittedWidth(COUNT_WIDE_EM, 40 * fit.scale, COUNT_TRACKING, COUNT_GAPS, fit.width);
        expect(days).toBeLessThanOrEqual(fit.width + 1e-9);
        expect(widest).toBeLessThanOrEqual(fit.width + 1e-9);
      }
    }
  });

  it('sizes the Today ring from that chord and leaves the rest of the card alone', () => {
    const glance = readFileSync('src/ui/TodayGlance.tsx', 'utf8');
    const ring = glance.slice(glance.indexOf('<GlowRing'), glance.indexOf('</GlowRing>'));
    expect(ring).toContain('size={SOBER_RING_SIZE}');
    expect(ring).toContain('strokeWidth={SOBER_RING_STROKE}');
    expect(ring).toContain('width: ringFit.width');
    expect(ring).toContain('numberOfLines={1}');
    expect(ring).toContain('adjustsFontSizeToFit');
    expect(ring).toContain('minimumFontScale={0.3}');
    expect(ring).toContain('maxFontSizeMultiplier={1}');
    expect(ring).toContain('marginTop: ringFit.labelLift');
    expect(ring).toContain('letterSpacing: ringFit.letterSpacing');
    expect(ring).toContain('{heroLabel}');
    expect(ring).toContain('{hero}');
    expect(glance).toContain('soberRingFit(theme.scale, fontScale)');
    expect(glance).toContain('GlowRing size={54}');
    expect(glance).toContain('Next milestone');
    expect(glance).toContain('Correct the date');
  });
});
