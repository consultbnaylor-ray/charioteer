import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  GOAL_LOAD_FAILED,
  defaultGoalOptions,
  resolveGoalOptions,
} from './goalOptions';
import { GOAL_LABEL, NUTRITION_GOALS } from './nutrition';

describe('goal options', () => {
  it('always has the full list, including maintain and the athlete goals', () => {
    const options = defaultGoalOptions();
    expect(options.map((option) => option.id)).toEqual([...NUTRITION_GOALS]);
    expect(options.length).toBeGreaterThanOrEqual(8);
    expect(options.map((option) => option.label)).toEqual(NUTRITION_GOALS.map((id) => GOAL_LABEL[id]));
    expect(options.some((option) => option.id === 'lose_fat_build_muscle' && option.label === 'Lose Fat & Build Muscle')).toBe(true);
    expect(options.some((option) => option.id === 'maintain' && option.label === 'Maintain Weight')).toBe(true);
    expect(options.some((option) => option.id === 'elite_runner')).toBe(true);
    expect(options.some((option) => option.id === 'body_builder')).toBe(true);
    expect(options.some((option) => option.id === 'elite_heavy_boxer')).toBe(true);
    expect(options.some((option) => option.id === 'elite_middle_boxer')).toBe(true);
    expect(resolveGoalOptions({ ok: true, options }).options).toHaveLength(options.length);
    expect(resolveGoalOptions({ ok: true, options }).failed).toBe(false);
  });

  it('shows the usual list and a retry when the catalogue is empty or fails', () => {
    const failed = resolveGoalOptions({ ok: false });
    const empty = resolveGoalOptions({ ok: true, options: [] });
    const partial = resolveGoalOptions({
      ok: true,
      options: [{ id: 'lose_weight', label: 'Lose Weight' }, { id: 'not-a-goal', label: 'Hidden' }],
    });
    for (const result of [failed, empty]) {
      expect(result.failed).toBe(true);
      expect(result.options.map((option) => option.id)).toEqual([...NUTRITION_GOALS]);
      expect(result.options.length).toBeGreaterThan(0);
    }
    expect(partial.failed).toBe(false);
    expect(partial.options.map((option) => option.id)).toEqual([...NUTRITION_GOALS]);
    expect(partial.options.find((option) => option.id === 'maintain')?.label).toBe('Maintain Weight');
    expect(partial.options.find((option) => option.id === 'elite_runner')?.label).toBe(GOAL_LABEL.elite_runner);
    expect(GOAL_LOAD_FAILED).toMatch(/usual list/i);

    const ui = readFileSync('src/ui/GoalChoices.tsx', 'utf8');
    expect(ui).toContain('GOAL_LOAD_FAILED');
    expect(ui).toContain('label="Try again"');
    expect(ui).toContain('resolveGoalOptions');
    expect(ui).toContain('defaultGoalOptions()');
    expect(ui).toContain("flexWrap: 'wrap'");
    expect(ui).toContain('option.label');
    expect(ui).toContain('settings.goal === option.id');
    expect(ui).toContain('goal: id');
    expect(ui).toContain('if (settings.goal === id) return');
    expect(ui).not.toContain('goal: null');
    expect(ui).not.toContain('console.');
    expect(ui).toContain('variant="label">Goal');
  });

  it('places the same goal section on Nutrition, Health Plan, and You', () => {
    const nutrition = readFileSync('src/app/(main)/nutrition.tsx', 'utf8');
    const plan = readFileSync('src/app/(main)/health-plan.tsx', 'utf8');
    const you = readFileSync('src/app/(main)/profile.tsx', 'utf8');
    expect(nutrition).toContain('<GoalChoices');
    expect(plan).toContain('<GoalChoices');
    expect(you).toContain('<GoalChoices');
    const goalCard = nutrition.slice(nutrition.indexOf('<GoalChoices'), nutrition.indexOf('variant="label">Today'));
    expect(goalCard).toContain('Suggest targets');
    expect(plan.indexOf('<GoalChoices')).toBeLessThan(plan.indexOf('Share on profile'));
    expect(plan.indexOf('<GoalChoices')).toBeGreaterThan(plan.indexOf('intro='));
    expect(you.indexOf('<BuildChoices')).toBeGreaterThan(0);
    expect(you.indexOf('<GoalChoices')).toBeGreaterThan(you.indexOf('<BuildChoices'));
    expect(you.indexOf('<GoalChoices')).toBeLessThan(you.indexOf('<WagonFlag'));
  });

  it('saves a goal change at once and confirms it, leaving Save your details for the other fields', () => {
    const ui = readFileSync('src/ui/GoalChoices.tsx', 'utf8');
    const choose = ui.slice(ui.indexOf('async function choose'), ui.indexOf('const shown'));
    const savedAt = choose.indexOf('setSaved(true)');
    expect(choose).toContain('if (settings.goal === id) return');
    expect(choose.indexOf('await repo.setNutritionSettings')).toBeGreaterThan(-1);
    expect(choose.indexOf('await repo.setNutritionSettings')).toBeLessThan(savedAt);
    expect(choose.indexOf('if (ticket !== write.current) return')).toBeLessThan(savedAt);
    expect(choose).toContain('goal: id');
    expect(choose).toContain('playSavedHaptic()');
    expect(choose).toContain('Could not save that goal.');
    expect(ui).toContain("export const GOAL_SAVED_LINE = 'Goal saved'");
    expect(ui).toContain('accessibilityLabel={GOAL_SAVED_LINE}');
    expect(ui).toContain('<PlanTick done');
    expect(ui).toContain('statsToneColors(theme.scheme).good.ink');
    expect(ui).toContain('color: green');
    expect(ui).not.toContain('profileDetailsDirty');

    const form = readFileSync('src/domain/profileForm.ts', 'utf8');
    expect(form).not.toContain('nutrition');
    expect(form).not.toMatch(/\bgoal\b/);
    const you = readFileSync('src/app/(main)/profile.tsx', 'utf8');
    expect(you).toContain('disabled={!dirty || pending}');
    expect(you).toContain('<GoalChoices />');
    expect(you.indexOf('<GoalChoices />')).toBeLessThan(you.indexOf('variant="label">Your details'));
    const plan = readFileSync('src/app/(main)/health-plan.tsx', 'utf8');
    expect(plan).toContain('<GoalChoices />');
    expect(plan).not.toContain('Save your details');
  });

  it('keeps the other build 28 controls on their own save path', () => {
    const schedule = readFileSync('src/ui/TrainingSchedule.tsx', 'utf8');
    expect(schedule).toContain('setDirty(true)');
    expect(schedule).toContain("setSavedNote('Saved ✓')");
    expect(schedule).toContain('label="Save schedule"');
    expect(schedule).toContain('disabled={pending}');
    expect(schedule).not.toContain('profileDetailsDirty');
    expect(schedule).not.toContain('Save your details');

    const share = readFileSync('src/ui/ShareOnProfile.tsx', 'utf8');
    expect(share).toContain('await repo.setProfileSharing(next)');
    expect(share).not.toContain('profileDetailsDirty');
    const plan = readFileSync('src/app/(main)/health-plan.tsx', 'utf8');
    expect(plan).toContain('label="Share on profile"');
    expect(plan).toContain('label="Share weight and body figures"');
    expect(plan.indexOf('<ShareOnProfile')).toBeGreaterThan(plan.indexOf('<GoalChoices />'));

    const section = readFileSync('src/ui/SectionShare.tsx', 'utf8');
    expect(section).toContain('await onCommit(on)');
    expect(section).toContain('SECTION_SHARE_LABEL');
    expect(section).not.toContain('profileDetailsDirty');
    expect(section).not.toContain('Save your details');
    const you = readFileSync('src/app/(main)/profile.tsx', 'utf8');
    expect(you).toContain('<YouSectionShare />');
  });
});
