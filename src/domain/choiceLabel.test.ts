import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith('.tsx')) out.push(full);
  }
  return out;
}

/** One Choice element, including props inside braces, stopping at its tag end. */
function choiceTags(source: string): string[] {
  const tags: string[] = [];
  const marker = /<Choice\b/g;
  let match: RegExpExecArray | null;
  while ((match = marker.exec(source))) {
    const start = match.index;
    let depth = 0;
    let quote: string | null = null;
    for (let i = start; i < source.length; i += 1) {
      const ch = source[i];
      if (quote) {
        if (ch === '\\') {
          i += 1;
          continue;
        }
        if (ch === quote) quote = null;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') {
        quote = ch;
        continue;
      }
      if (ch === '{') depth += 1;
      else if (ch === '}') depth -= 1;
      else if (ch === '>' && depth === 0) {
        tags.push(source.slice(start, i + 1));
        break;
      }
    }
  }
  return tags;
}

function choiceSource(): string {
  const ui = readFileSync('src/ui/ui.tsx', 'utf8');
  return ui.slice(ui.indexOf('export function Choice'), ui.indexOf('export function ErrorNote'));
}

describe('pill labels', () => {
  const choice = choiceSource();
  const labelText = choice.slice(choice.indexOf('<Text'), choice.indexOf('</Text>'));

  it('paints the label at its own width', () => {
    expect(labelText).toContain('{label}');
    expect(labelText).toContain('theme.colors.ink');
    expect(labelText).not.toMatch(/flex:\s*1/);
    expect(labelText).not.toContain('flexBasis');
    expect(labelText).not.toContain('flexGrow');
    expect(labelText).not.toContain('flexShrink');
    expect(choice).toContain('accessibilityLabel={label}');
    expect(choice).not.toMatch(/<Text[^>]*flex:\s*1/);
    const ui = readFileSync('src/ui/ui.tsx', 'utf8');
    const pill = ui.slice(ui.indexOf('choice: {'), ui.indexOf('choiceSpacer:'));
    const spacer = ui.slice(ui.indexOf('choiceSpacer:'), ui.indexOf('note:'));
    expect(pill).toContain('flexGrow: 0');
    expect(pill).not.toMatch(/flex:\s*1/);
    expect(spacer).toContain('flexGrow: 1');
    expect(choice).toContain('styles.choiceSpacer');
  });

  it('keeps the green footpath tick without stretching every pill', () => {
    expect(choice).toContain("tone === 'good' && selected");
    expect(choice).toContain("backgroundColor: goodOn ? '#047857'");
    expect(choice).toContain("goodOn ? '#FFFFFF'");
    expect(choice).toContain('goodOn || badge > 0 ? <View style={styles.choiceSpacer} />');
    expect(choice).toContain('{goodOn ? <GoodCheck /> : null}');
    expect(choice).toContain("tone === 'good' ? { selected, checked: selected } : { selected }");
    const outside = readFileSync('src/app/(main)/outside.tsx', 'utf8');
    expect(outside).toContain('label={PREFER_PATHS_LABEL}');
    expect(outside).toContain('tone="good"');
    const ui = readFileSync('src/ui/ui.tsx', 'utf8');
    const tick = ui.slice(ui.indexOf('function GoodCheck'), ui.indexOf('export function Choice'));
    expect(tick).toContain('stroke="#FFFFFF"');
  });

  it('gives every Choice a visible label', () => {
    const tags = walk('src').flatMap((file) => choiceTags(readFileSync(file, 'utf8')).map((tag) => ({ file, tag })));
    expect(tags.length).toBeGreaterThan(40);
    for (const { file, tag } of tags) {
      expect(tag, file).toMatch(/\blabel=/);
      expect(tag, file).not.toMatch(/label=""/);
      expect(tag, file).not.toMatch(/label=\{''\}/);
      expect(tag, file).not.toMatch(/label=\{""\}/);
      expect(tag, file).not.toMatch(/label=\{null\}/);
    }
  });

  it('renders check-in mood, craving, notes, and history', () => {
    const screen = readFileSync('src/app/(main)/check-in.tsx', 'utf8');
    const week = readFileSync('src/ui/CheckInWeek.tsx', 'utf8');
    const mood = screen.slice(screen.indexOf('Mood, 1 to 10'), screen.indexOf('Sleep last night'));
    const craving = screen.slice(screen.indexOf('Craving, 0 to 10'), screen.indexOf('label="Note, if you want"'));
    expect(mood).toContain('label={String(value)}');
    expect(mood).toContain('<Choice');
    expect(craving).toContain('label={String(value)}');
    expect(craving).toContain('<Choice');
    expect(screen).toContain('label="Note, if you want"');
    expect(screen).toContain('label="Grateful for, if you want"');
    expect(screen).toContain('<CheckInWeek checkIns={checkIns} ranged />');
    expect(screen).toContain('>Recent<');
    expect(week).toContain('Recent check-ins');
    expect(week).toContain('title="What this means"');
    expect(week).toContain('<StatPeriodToggle');
  });

  it('renders health, meal, day, mood, and chart-range pills', () => {
    const health = readFileSync('src/app/(main)/health.tsx', 'utf8');
    const nutrition = readFileSync('src/app/(main)/nutrition.tsx', 'utf8');
    const felt = readFileSync('src/ui/HowItFelt.tsx', 'utf8');
    const periods = readFileSync('src/ui/StatPeriodToggle.tsx', 'utf8');
    expect(health).toContain("label: 'Steps'");
    expect(health).toContain('label={item.label}');
    expect(health).toContain('Or add a reading yourself');
    expect(health).toContain('Value (${chosen.unit})');
    expect(nutrition).toContain('>Log a meal<');
    expect(nutrition).toContain('label={MEAL_LABEL[slot]}');
    expect(nutrition).toContain('>Day<');
    expect(nutrition).toContain('label="Today"');
    expect(nutrition).toContain('label="Yesterday"');
    expect(felt).toContain('Effort, 1 to 10');
    expect(felt).toContain('Mood, 1 to 10');
    expect(felt.match(/label=\{String\(score\)\}/g)).toEqual(['label={String(score)}', 'label={String(score)}']);
    expect(periods).toContain('label={HEALTH_STAT_PERIOD_LABEL[id]}');
  });
});
