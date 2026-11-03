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
    expect(resolvedFitnessGoal({ goal: 'elite_runner', fitnessGoal: null })).toBe('elite');
    const ui = readFileSync('src/ui/GoalChoices.tsx', 'utf8');
    expect(ui).toContain('Fitness goal');
    expect(ui).toContain('FITNESS_GOAL_LABEL[id]');
    expect(ui).toContain('settingsForFitnessGoal');
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
