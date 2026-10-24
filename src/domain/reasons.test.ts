import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { planReasons, REASON_MAX_LENGTH, REASON_PLACEHOLDERS, reasonOverLimit, reasonPlaceholder } from './reasons';

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

describe('planned reasons', () => {
  it('trims blanks, drops empty lines, and keeps the first of each case-insensitive reason', () => {
    expect(planReasons(['  Family  ', '', '   ', 'family', 'Sleep', 'SLEEP', '  health  '])).toEqual([
      'Family',
      'Sleep',
      'health',
    ]);
    expect(planReasons([])).toEqual([]);
    expect(reasonOverLimit(['ok', 'x'.repeat(REASON_MAX_LENGTH)])).toBe(false);
    expect(reasonOverLimit(['x'.repeat(REASON_MAX_LENGTH + 1)])).toBe(true);
    expect(REASON_MAX_LENGTH).toBe(280);
  });
});

describe('reason replace', () => {
  const repo = readFileSync('src/data/supabase-repository.ts', 'utf8');
  const demo = readFileSync('src/data/demo-repository.ts', 'utf8');
  const profile = readFileSync('src/app/(main)/profile.tsx', 'utf8');
  const migration = readFileSync('supabase/migrations/20261010260000_set_reasons.sql', 'utf8');
  const save = profile.slice(profile.indexOf('async function saveDetails'), profile.indexOf('async function download'));
  const onboard = repo.slice(repo.indexOf('async completeOnboarding'), repo.indexOf('async updateProfile'));
  const write = repo.slice(repo.indexOf('private async writeReasons'), repo.indexOf('async addCheckIn'));

  it('saves reasons through one function and ignores a second tap while that save is running', () => {
    expect(write).toContain("rpc('set_reasons'");
    expect(write).toContain('planReasons');
    expect(write).not.toContain(".from('reasons')");
    expect(onboard).toContain('this.writeReasons(input.reasons)');
    expect(onboard).not.toContain(".from('reasons')");
    expect(repo.slice(repo.indexOf('async setReasons'), repo.indexOf('private async writeReasons'))).toContain('this.writeReasons(bodies)');
    expect(demo).toContain('planReasons(input.reasons)');
    expect(demo).toContain('planReasons(bodies)');
    expect(save).toContain('savingRef.current = true');
    expect(save.indexOf('savingRef.current = true')).toBeLessThan(save.indexOf('await repo.updateProfile'));
    expect(save).toContain('planReasons(reasons.split');
    expect(save).toContain('reasonOverLimit');
    expect(save).toContain('await repo.setReasons(plannedReasons)');
    expect(profile).toContain('disabled={!dirty || pending}');
    expect(profile).toContain('pending={pending}');
    expect(migration).toContain('create or replace function public.set_reasons(bodies text[])');
    expect(migration).toContain('security definer');
    expect(migration).toContain('set search_path = public');
    expect(migration).toContain('auth.uid()');
    expect(migration).toContain('for update');
    expect(migration).toContain('delete from public.reasons where user_id = uid');
    expect(migration).toContain('distinct on (lower(clean.body))');
    expect(migration).toContain('unnest(coalesce(bodies, array[]::text[])) as listed(item)');
    expect(migration).toContain('char_length(btrim(coalesce(item, \'\'))) > 280');
    expect(migration.toLowerCase()).toContain('revoke all on function public.set_reasons(text[]) from public, anon, authenticated');
    expect(migration.toLowerCase()).toContain('grant execute on function public.set_reasons(text[]) to authenticated');
    expect(migration.toLowerCase()).not.toContain('grant execute on function public.set_reasons(text[]) to anon');
    expect(migration.toLowerCase()).not.toMatch(/create unique index|add constraint|unique \(/);
    expect(migration).not.toMatch(/visibility/);
    expect(migration).not.toContain('public.directory');
  });

  it('leaves interests and goals as replacements, not appended lists', () => {
    const init = readFileSync('supabase/migrations/20261010120000_init.sql', 'utf8');
    const update = repo.slice(repo.indexOf('async updateProfile'), repo.indexOf('async setReasons'));
    const home = readFileSync('src/app/(main)/home.tsx', 'utf8');
    const stage = readFileSync('src/domain/stage.ts', 'utf8');
    expect(save).not.toContain('interestIds');
    expect(init).toContain('primary key (user_id, interest_id)');
    expect(update).toContain('column.weekly_units_goal = patch.weeklyUnitsGoal');
    expect(update).toContain('column.drink_free_days_goal = patch.drinkFreeDaysGoal');
    expect(update).toContain('column.drink_free_on = patch.drinkFreeOn');
    expect(update).not.toContain(".insert(");
    expect(home).toContain('updateProfile({ drinkFreeOn: toggleDrinkFreeDay(profile.drinkFreeOn, todayKey) })');
    expect(stage).toContain('dates.includes(day) ? dates.filter((item) => item !== day) : [...dates, day].sort()');
  });
});

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
