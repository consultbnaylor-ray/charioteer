export const FITNESS_GOALS = ['normal', 'younger_2', 'younger_5', 'younger_10', 'elite'] as const;

export type FitnessGoal = (typeof FITNESS_GOALS)[number];

export const FITNESS_GOAL_LABEL: Record<FitnessGoal, string> = {
  normal: 'Normal Fitness Age',
  younger_2: '2 years younger',
  younger_5: '5 years younger',
  younger_10: '10 years younger',
  elite: 'Elite Athlete',
};

export function isFitnessGoal(value: string): value is FitnessGoal {
  return (FITNESS_GOALS as readonly string[]).includes(value);
}

export function fitnessYearsYounger(goal: FitnessGoal): number {
  if (goal === 'younger_2') return 2;
  if (goal === 'younger_5') return 5;
  if (goal === 'younger_10') return 10;
  return 0;
}

/** A stored athlete goal stays Elite. A weight goal with nothing saved is Normal Fitness Age. */
export function resolvedFitnessGoal(input: { goal?: string | null; fitnessGoal?: string | null }): FitnessGoal {
  if (input.fitnessGoal && isFitnessGoal(input.fitnessGoal)) return input.fitnessGoal;
  if (input.goal === 'elite_runner' || input.goal === 'body_builder') return 'elite';
  return 'normal';
}

export function fuelTradeOffLine(losing: boolean, fitnessGoal: FitnessGoal): string | null {
  if (!losing || fitnessGoal === 'normal') return null;
  return 'Losing weight and a younger fitness age pull in different directions. Keep calories at or above the safety floor and keep protein at the daily target, so training still has fuel. Not medical advice.';
}
