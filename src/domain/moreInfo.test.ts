import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('more info disclosure', () => {
  it('uses one control, a 44pt target, and keeps a spoken expanded state', () => {
    const source = readFileSync('src/ui/MoreInfo.tsx', 'utf8');
    expect(source).toContain("const label = expanded ? 'Less info' : 'More info'");
    expect(source).toContain('accessibilityRole="button"');
    expect(source).toContain('accessibilityLabel={`${label} about ${about}`}');
    expect(source).toContain('accessibilityState={{ expanded }}');
    expect(source).toContain('minHeight: 44');
    expect(source).toContain('theme.scale');
    expect(source).toContain('<T');
    expect(source).not.toContain('borderColor: theme.colors.accent');
  });

  it('keeps the medical line on the chart, and the Garmin hint behind the same control', () => {
    const charts = readFileSync('src/ui/DailyActivity.tsx', 'utf8');
    const refresh = readFileSync('src/ui/HealthRefresh.tsx', 'utf8');
    expect(charts).toContain("summary={medical ? 'Not medical advice.' : undefined}");
    expect(charts).toContain('guide?.outside');
    expect(charts).toContain('framed={framed}');
    expect(charts).toContain('framed={false}');
    expect(refresh).toContain('<Card>');
    expect(refresh.match(/garminHintLine\(/g)).toHaveLength(1);
    expect(refresh.indexOf('<GarminConnectNudge')).toBeLessThan(refresh.indexOf('garminHintLine('));
    expect(readFileSync('src/app/(main)/stats.tsx', 'utf8')).toContain('A plain look at the figures you already keep.');
    expect(readFileSync('src/ui/UnitsGuide.tsx', 'utf8')).toContain('{ESTIMATE_DISCLAIMER}');
    expect(readFileSync('src/app/(main)/help.tsx', 'utf8')).toContain('crisisHelplines');
    expect(readFileSync('src/ui/ConsentChoices.tsx', 'utf8')).toContain('plain language');
  });
});
