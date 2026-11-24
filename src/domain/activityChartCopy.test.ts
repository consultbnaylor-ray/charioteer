import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { ACTIVITY_CHART_DEFINITIONS } from '@/domain/activityChartCopy';

function sentences(text: string): string[] {
  return text.split(/(?<=\.)\s+/).map((line) => line.trim()).filter(Boolean);
}

describe('activity chart explanations', () => {
  it('gives every activity chart a non-empty explanation', () => {
    expect(ACTIVITY_CHART_DEFINITIONS.length).toBeGreaterThan(0);
    const titles = new Set<string>();
    for (const chart of ACTIVITY_CHART_DEFINITIONS) {
      expect(chart.title.trim(), chart.id).not.toBe('');
      expect(chart.explanation.trim(), chart.title).not.toBe('');
      const lines = sentences(chart.explanation);
      expect(lines.length, chart.title).toBeGreaterThanOrEqual(2);
      expect(lines.length, chart.title).toBeLessThanOrEqual(3);
      expect(chart.explanation, chart.title).toMatch(/Garmin|Apple Health/);
      expect(chart.explanation, chart.title).toMatch(/Latest/);
      expect(chart.explanation, chart.title).toMatch(/\bMin\b/);
      expect(chart.explanation, chart.title).toMatch(/\bMax\b/);
      expect(titles.has(chart.title), chart.title).toBe(false);
      titles.add(chart.title);
    }

    const charts = readFileSync('src/ui/DailyActivity.tsx', 'utf8');
    expect(charts).toContain('ACTIVITY_CHART_DEFINITIONS');
    expect(charts).toContain('explanation={chart.explanation}');
    const reading = readFileSync('src/ui/ReadingChart.tsx', 'utf8');
    expect(reading).toContain("meaning === 'chart' ? 'What this means'");
    expect(reading).toContain('explanationText');
    expect(reading).not.toMatch(/meaning === 'chart' \? \(\s*<MoreInfo/);
  });
});
