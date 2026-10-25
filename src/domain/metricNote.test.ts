import { describe, expect, it } from 'vitest';

import { ageRangeLine, metricParagraph, placeReading, rangeVerdict, targetComparison } from '@/domain/metricNote';

const adult = { low: 60, high: 100, unit: 'bpm', source: 'The British Heart Foundation' };
const ageBand = { low: 32, high: 45, unit: 'ml/kg/min', source: 'Kaminsky, Arena, and Myers, 2015' };

describe('metric reading notes', () => {
  it('places a reading below, within, and above a range, and treats a missing number as none', () => {
    expect(placeReading(59, 60, 100)).toBe('below');
    expect(placeReading(60, 60, 100)).toBe('within');
    expect(placeReading(72, 60, 100)).toBe('within');
    expect(placeReading(100, 60, 100)).toBe('within');
    expect(placeReading(101, 60, 100)).toBe('above');
    expect(placeReading(null, 60, 100)).toBe('none');
    expect(placeReading(Number.NaN, 60, 100)).toBe('none');
  });

  it('says when age is missing, and does not invent an age band', () => {
    expect(ageRangeLine({ age: null, ageBand: null, general: adult, ownScale: null })).toContain("because age isn't set");
    const set = ageRangeLine({ age: 42, ageBand: null, general: adult, ownScale: null });
    expect(set).toContain('Your age is set as 42');
    expect(set).toContain('not split by age');
    expect(set).not.toMatch(/for someone aged 42, the range is/i);
    const aged = ageRangeLine({ age: 42, ageBand, general: adult, ownScale: null });
    expect(aged).toContain('around age 42');
    expect(aged).toContain('32 to 45');
    expect(aged).not.toContain("because age isn't set");
  });

  it('compares a stored target and says when none is set or there is no reading', () => {
    expect(targetComparison(72, null)).toContain('No target is set');
    expect(targetComparison(null, { value: 70, unit: 'kg' })).toContain('no reading yet');
    expect(targetComparison(74.2, { value: 70, unit: 'kg' })).toBe('You are 4.2 kg above your target of 70 kg.');
    expect(targetComparison(68, { value: 70, unit: 'kg' })).toBe('You are 2 kg below your target of 70 kg.');
    expect(targetComparison(70, { value: 70, unit: 'kg' })).toContain('matches your target');
  });

  it('states a warm verdict inside the range, a calm one outside, and none when there is no data', () => {
    expect(rangeVerdict('within', 'range')).toContain('looks healthy for general guidance');
    expect(rangeVerdict('above', 'range')).toContain('not a diagnosis');
    expect(rangeVerdict('above', 'range')).toContain('not an alarm');
    expect(rangeVerdict('above', 'range')).not.toMatch(/dangerous|disease/i);
    expect(rangeVerdict('below', 'higher')).toContain('under the reference range');
    expect(rangeVerdict('none', 'range')).toContain('no reading yet');
    expect(rangeVerdict('within', 'own')).toContain('no healthy-person range');
  });

  it('keeps one paragraph, with no medication or crash-diet advice', () => {
    const text = metricParagraph({
      what: 'Resting heart rate is beats per minute.',
      comparison: ageRangeLine({ age: null, ageBand: null, general: adult, ownScale: null }),
      target: targetComparison(72, null),
      verdict: rangeVerdict('within', 'range'),
      consider: 'Sleep, easy movement, and less alcohol can help. A breathing exercise can help on a wired day.',
      source: 'British Heart Foundation.',
    });
    expect(text.match(/Not medical advice/gi) ?? []).toHaveLength(0);
    expect(text).not.toMatch(/medication|mg\b|crash diet|cut weight|starve/i);
    expect(text.indexOf('beats per minute')).toBeLessThan(text.indexOf("because age isn't set"));
    expect(text.indexOf("because age isn't set")).toBeLessThan(text.indexOf('No target is set'));
    expect(text.indexOf('No target is set')).toBeLessThan(text.indexOf('looks healthy'));
  });
});
