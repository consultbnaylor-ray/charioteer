import { readFileSync, readdirSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { GOAL_COMPARE_NOTE, goalCompareNoteSeenIn, withGoalCompareNoteSeen } from './goalCompareNote';
import { closerToGoal, goalTitle, towardGoal, whyGoalMatters } from './nutrition';

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = `${dir}/${name}`;
    if (statSync(path).isDirectory()) {
      if (name === 'node_modules') continue;
      walk(path, out);
    } else if (name.endsWith('.ts') || name.endsWith('.tsx')) out.push(path);
  }
  return out;
}

/** Comments are not shown. The banner is allowed to say "Your goal:". */
function shownCopy(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replaceAll('Your goal:', '');
}

describe('goal name on comparisons', () => {
  it('keeps the first-view note for one visit', () => {
    expect(GOAL_COMPARE_NOTE).toBe('Comparisons use the goal you picked.');
    expect(goalCompareNoteSeenIn(null, 'alex')).toBe(false);
    const saved = withGoalCompareNoteSeen(null, 'alex');
    expect(goalCompareNoteSeenIn(saved, 'alex')).toBe(true);
    expect(goalCompareNoteSeenIn(saved, 'sam')).toBe(false);
    expect(goalCompareNoteSeenIn(withGoalCompareNoteSeen(saved, 'sam'), 'alex')).toBe(true);
    expect(goalCompareNoteSeenIn('{', 'alex')).toBe(false);
  });

  it('writes the saved goal into the headings', () => {
    expect(goalTitle('elite_heavy_boxer')).toBe('Elite Athlete (Heavy Weight Boxer)');
    expect(goalTitle(null)).toBeNull();
    expect(closerToGoal('elite_heavy_boxer')).toBe('To get closer to Elite Athlete (Heavy Weight Boxer)');
    expect(whyGoalMatters('elite_middle_boxer')).toBe('Why this matters for Elite Athlete (Middle Weight Boxer)');
    expect(towardGoal('Lose Fat & Build Muscle')).toBe("How you're doing toward Lose Fat & Build Muscle");
    expect(closerToGoal(null)).toBe('To get closer');
  });

  it('names the goal on stats, health, the overview, and the detail sheets', () => {
    const stats = readFileSync('src/app/(main)/stats.tsx', 'utf8');
    const health = readFileSync('src/app/(main)/health.tsx', 'utf8');
    const goal = readFileSync('src/ui/YourGoal.tsx', 'utf8');
    const fitness = readFileSync('src/ui/YourFitness.tsx', 'utf8');
    const weight = readFileSync('src/ui/GoalWeightRange.tsx', 'utf8');
    const board = readFileSync('src/ui/HealthStatBoard.tsx', 'utf8');
    const line = readFileSync('src/ui/GoalLine.tsx', 'utf8');
    expect(stats).toContain('<GoalLine />');
    expect(health).toContain('<GoalLine />');
    expect(goal).toContain('<GoalLine />');
    expect(goal).toContain('towardGoal(view.name)');
    expect(fitness).toContain('<GoalLine note={false} />');
    expect(weight).toContain('<GoalLine note={false} />');
    expect(weight).toContain('No separate published range for ${goalName}');
    expect(board).toContain('<GoalLine note={false} />');
    expect(line).toContain('Your goal: ${name}');
    expect(line).toContain('>Change<');
    expect(line).toContain("'/nutrition?section=goal'");
    expect(line).toContain('GOAL_COMPARE_NOTE');
    expect(line).toContain('minHeight: 44');
  });

  it('does not leave a generic this goal or your goal in the copy a person can read', () => {
    const hits: string[] = [];
    for (const root of ['src', 'supabase/functions/_shared']) {
      for (const file of walk(root)) {
        if (file.endsWith('.test.ts')) continue;
        const text = shownCopy(readFileSync(file, 'utf8'));
        if (/this goal|your goal/i.test(text)) hits.push(file);
      }
    }
    expect(hits).toEqual([]);
  });
});
