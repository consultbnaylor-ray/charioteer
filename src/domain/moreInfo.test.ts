import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { selfCareStep, VISIBLE_SAFETY_LINE } from '@/domain/visibleSafety';

function sourceFiles(root: string): string[] {
  const found: string[] = [];
  for (const name of readdirSync(root)) {
    const path = join(root, name);
    if (statSync(path).isDirectory()) found.push(...sourceFiles(path));
    else if (name.endsWith('.tsx')) found.push(path);
  }
  return found;
}

describe('more info disclosure', () => {
  it('uses one control, a 44pt target, and keeps a spoken expanded state', () => {
    const source = readFileSync('src/ui/MoreInfo.tsx', 'utf8');
    expect(source).toContain("const label = title ?? (expanded ? 'Less info' : 'More info')");
    expect(source).toContain('accessibilityRole="button"');
    expect(source).toContain('accessibilityLabel={spoken}');
    expect(source).toContain('accessibilityState={{ expanded }}');
    expect(source).toContain('minHeight: 44');
    expect(source).toContain('theme.scale');
    expect(source).toContain('borderRadius: radius.md');
    expect(source).toContain('borderWidth: stroke.control');
    expect(source).toContain('<T');
    expect(source).toContain('statsToneColors(theme.scheme).good.ink');
    expect(source).not.toContain("textDecorationLine: 'underline'");
    expect(source).not.toContain('borderColor: theme.colors.accent');
    expect(source).not.toContain('colors.accent');
  });

  it('keeps the medical line on the chart, and the Garmin hint behind the same control', () => {
    const charts = readFileSync('src/ui/DailyActivity.tsx', 'utf8');
    const refresh = readFileSync('src/ui/HealthRefresh.tsx', 'utf8');
    expect(charts).toContain('summary="Not medical advice."');
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

  it('rejects a grey or muted More info link outside the shared button', () => {
    const offenders: string[] = [];
    for (const path of [...sourceFiles('src/ui'), ...sourceFiles('src/app')]) {
      if (path.endsWith('MoreInfo.tsx')) continue;
      const source = readFileSync(path, 'utf8');
      if (/<T[^>]*variant="muted"[^>]*>\s*More info\s*</.test(source)) offenders.push(path);
      if (source.includes('<T variant="muted">More info</T>')) offenders.push(path);
      if (/colors\.muted[^}]{0,80}More info/.test(source)) offenders.push(path);
    }
    expect(offenders).toEqual([]);
  });

  it('keeps urgent care on the card, outside the collapsed explanation', () => {
    expect(VISIBLE_SAFETY_LINE).toContain('Not medical advice.');
    expect(VISIBLE_SAFETY_LINE).toContain('NHS 111');
    expect(VISIBLE_SAFETY_LINE).toContain('Call 999 for chest pain, fainting or breathlessness.');
    const step = 'Sleep, drink some water, keep exercise steady, and take a rest day if you need one. A breathing exercise can help. If you feel unwell, contact your GP or NHS 111. Call 999 if you have chest pain, fainting, or breathlessness.';
    expect(selfCareStep(step)).toBe('Sleep, drink some water, keep exercise steady, and take a rest day if you need one. A breathing exercise can help.');
    expect(selfCareStep(step)).not.toContain('999');
    expect(selfCareStep(step)).not.toContain('NHS 111');

    const board = readFileSync('src/ui/HealthBoard.tsx', 'utf8');
    const range = readFileSync('src/ui/GuidanceRange.tsx', 'utf8');
    expect(board).toContain('VISIBLE_SAFETY_LINE');
    expect(range).toContain('VISIBLE_SAFETY_LINE');
    const advice = board.slice(board.indexOf('shownFlags.length > 0'));
    expect(advice.indexOf('<T>{VISIBLE_SAFETY_LINE}</T>')).toBeGreaterThanOrEqual(0);
    expect(advice.indexOf('<T>{VISIBLE_SAFETY_LINE}</T>')).toBeLessThan(advice.indexOf('<MoreInfo'));
    expect(advice.indexOf('flag.detail')).toBeGreaterThan(advice.indexOf('<MoreInfo'));
    expect(advice.indexOf('selfCareStep(flag.step)')).toBeGreaterThan(advice.indexOf('<MoreInfo'));
    const warning = range.slice(range.indexOf('guidance.warning'));
    expect(warning.indexOf('<T>{VISIBLE_SAFETY_LINE}</T>')).toBeLessThan(warning.indexOf('<MoreInfo'));
    expect(range.indexOf('guidance.warning.detail')).toBeGreaterThan(range.indexOf('<MoreInfo'));
  });
});
