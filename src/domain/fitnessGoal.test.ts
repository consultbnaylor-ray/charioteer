import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { defaultNutritionSettings } from '@/domain/nutrition';
import { settingsForFitnessGoal, settingsForPreset } from '@/domain/targetWeight';
import { vo2ForFitnessGoal } from '@/domain/fitnessSnapshot';
import { fuelTradeOffLine, resolvedFitnessGoal } from '@/domain/fitnessGoal';

describe('a weight goal and a fitness goal together', () => {
  it('keeps a fitness aim when a weight goal is chosen, and the other way round', () => {
    const runner = settingsForPreset({ ...defaultNutritionSettings(), goal: 'elite_runner' }, 'lose_weight');
    expect(runner.goal).toBe('lose_weight');
    expect(runner.fitnessGoal).toBe('elite');
    const both = settingsForFitnessGoal({ ...runner, fitnessGoal: 'younger_5' }, 'younger_5');
    expect(both.goal).toBe('lose_weight');
    expect(both.fitnessGoal).toBe('younger_5');
    expect(resolvedFitnessGoal({ goal: 'lose_weight', fitnessGoal: null })).toBe('normal');
    expect(resolvedFitnessGoal({ goal: 'lose_weight', fitnessGoal: 'elite' })).toBe('elite');
    expect(resolvedFitnessGoal({ goal: 'maintain', fitnessGoal: 'younger_10' })).toBe('younger_10');
    expect(resolvedFitnessGoal({ goal: 'elite_runner', fitnessGoal: null })).toBe('elite');
    const ui = readFileSync('src/ui/GoalChoices.tsx', 'utf8');
    expect(ui).toContain('Fitness goal');
    expect(ui).toContain('FITNESS_GOAL_LABEL[id]');
    expect(ui).toContain('const fitnessNow = resolvedFitnessGoal(settings)');
    expect(ui).toContain('selected={fitnessNow === id}');
    expect(ui).toContain('selected ? theme.colors.accent : theme.colors.line');
    expect(ui).toContain('selected ? theme.colors.emphasisSoft : theme.colors.surface');
    expect(ui).toContain('settings.goal === option.id && settings.targetWeightKg == null && !draftingTarget');
    expect(ui).toContain('settingsForFitnessGoal');
    const load = readFileSync('src/data/supabase-repository.ts', 'utf8');
    const row = load.slice(load.indexOf('private async nutritionSettingsRow'), load.indexOf('private async nutritionSnapshot'));
    expect(row).toContain('goal, fitness_goal, goal_age');
    expect(row).toContain('competition_cut, competition_cut_at, competition_cut_version');
    expect(readFileSync('supabase/functions/_shared/fitnessGoal.ts', 'utf8')).toContain('Normal Fitness Age');
    expect(readFileSync('supabase/migrations/20261103160000_fitness_goal.sql', 'utf8')).toContain('fitness_goal');
    expect(readFileSync('supabase/migrations/20261103160000_fitness_goal.sql', 'utf8')).not.toContain('create policy');
  });

  it('raises the VO2 target for a younger fitness age and warns when weight loss would steal training fuel', () => {
    const normal = vo2ForFitnessGoal(42, 'male', 'normal');
    const younger = vo2ForFitnessGoal(42, 'male', 'younger_10');
    const elite = vo2ForFitnessGoal(42, 'male', 'elite');
    expect(normal && younger && elite).toBeTruthy();
    expect(younger!.target).toBeGreaterThan(normal!.target);
    expect(elite!.target).toBeGreaterThan(normal!.target);
    expect(younger!.label).toContain('10 years under age 42');
    expect(fuelTradeOffLine(true, 'younger_5')).toMatch(/training still has fuel/);
    expect(fuelTradeOffLine(false, 'elite')).toBeNull();
    expect(fuelTradeOffLine(true, 'normal')).toBeNull();
  });
});
