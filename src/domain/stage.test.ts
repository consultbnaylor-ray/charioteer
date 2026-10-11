import { describe, expect, it } from 'vitest';

import { buildSystemPrompt, buildThumosContext, stageGuidance } from './thumos';
import {
  daysUntil,
  drinkFreeThisWeek,
  showsSoberRecord,
  stageFromRecord,
  toggleDrinkFreeDay,
  USUAL_WEEK_NOW,
  USUAL_WEEK_PAST,
  usualWeekPrompt,
  validateStageStep,
} from './stage';

const today = '2026-10-10';

describe('stage', () => {
  it('treats an existing sober date as stopped and anyone else as exploring', () => {
    expect(stageFromRecord(undefined, '2026-08-01T00:00:00.000Z')).toBe('stopped');
    expect(stageFromRecord(undefined, null)).toBe('exploring');
    expect(stageFromRecord('cutting_down', '2026-08-01T00:00:00.000Z')).toBe('cutting_down');
  });

  it('explains a past usual week after stopping, and the week now while still drinking', () => {
    expect(USUAL_WEEK_PAST).toBe('Enter what you used to drink when you were drinking the most, to see how much you’ve been saving.');
    expect(usualWeekPrompt('stopped')).toBe(USUAL_WEEK_PAST);
    expect(usualWeekPrompt('trying_to_stop')).toBe(USUAL_WEEK_PAST);
    expect(usualWeekPrompt('cutting_down')).toBe(USUAL_WEEK_NOW);
    expect(usualWeekPrompt('exploring')).toBe('Your usual week now');
    expect(usualWeekPrompt(null)).toBe('Your usual week now');
  });

  it('shows a sober record only after someone has stopped', () => {
    expect(showsSoberRecord('stopped')).toBe(true);
    expect(showsSoberRecord('trying_to_stop')).toBe(false);
    expect(showsSoberRecord('cutting_down')).toBe(false);
    expect(showsSoberRecord('exploring')).toBe(false);
  });

  it('counts days until a planned quit date and drink-free days in the UK week', () => {
    const saturday = new Date(2026, 9, 10);
    expect(daysUntil('2026-10-12', saturday)).toBe(2);
    expect(daysUntil('2026-10-10', saturday)).toBe(0);
    expect(drinkFreeThisWeek(['2026-10-04', '2026-10-05', '2026-10-10', '2026-10-10'], saturday)).toBe(2);
    expect(toggleDrinkFreeDay(['2026-10-10'], '2026-10-10')).toEqual([]);
    expect(toggleDrinkFreeDay(['2026-10-10'], '2026-10-11')).toEqual(['2026-10-10', '2026-10-11']);
  });

  it('checks the onboarding choice before a date or a goal is stored', () => {
    expect(validateStageStep({
      stage: null,
      soberDay: today,
      today,
      plannedQuit: null,
      quitUnsure: true,
      unitsGoal: '',
      drinkFreeGoal: '',
    })).toMatch(/where you are/i);
    expect(validateStageStep({
      stage: 'stopped',
      soberDay: '2026-10-11',
      today,
      plannedQuit: null,
      quitUnsure: true,
      unitsGoal: '',
      drinkFreeGoal: '',
    })).toMatch(/earlier day/i);
    expect(validateStageStep({
      stage: 'trying_to_stop',
      soberDay: today,
      today,
      plannedQuit: null,
      quitUnsure: true,
      unitsGoal: '',
      drinkFreeGoal: '',
    })).toBeNull();
    expect(validateStageStep({
      stage: 'cutting_down',
      soberDay: today,
      today,
      plannedQuit: null,
      quitUnsure: true,
      unitsGoal: '10',
      drinkFreeGoal: '8',
    })).toMatch(/0 to 7/);
    expect(validateStageStep({
      stage: 'exploring',
      soberDay: today,
      today,
      plannedQuit: null,
      quitUnsure: true,
      unitsGoal: '',
      drinkFreeGoal: '',
    })).toBeNull();
  });
});

describe('Thumos stage', () => {
  const base = {
    now: new Date('2026-03-01T12:00:00.000Z'),
    displayName: 'Alex',
    sobrietyStartedAt: '2026-01-13T06:00:00.000Z',
    reasons: ['I want to remember my evenings.'],
    weeklySpendGbp: 45,
    weeklyUnits: 28,
    checkIns: [],
    health: [],
    mode: 'steady' as const,
    safety: { selfHarm: false, withdrawal: false, reasons: [] as string[] },
  };

  it('keeps sober time for someone who has stopped and withholds it otherwise', () => {
    const stopped = buildThumosContext({ ...base, stage: 'stopped' });
    expect(stopped).toContain('Sober time:');
    expect(stopped).not.toContain('Do not invent sober time');
    const exploring = buildThumosContext({ ...base, stage: 'exploring', sobrietyStartedAt: null });
    expect(exploring).toContain('Stage: still drinking, just exploring');
    expect(exploring).not.toContain('Sober time:');
    expect(exploring).toContain('Do not invent sober time');
  });

  it('uses planning for trying to stop, and a non-judgemental style while still drinking', () => {
    const trying = buildSystemPrompt('CONTEXT', 'steady', undefined, { stage: 'trying_to_stop' });
    expect(trying).toContain(stageGuidance('trying_to_stop'));
    expect(trying).toContain('NHS 111');
    expect(trying).toContain('stopping suddenly');
    expect(trying).not.toContain('Your job is to help this person stay sober');
    const cutting = buildSystemPrompt('CONTEXT', 'steady', undefined, { stage: 'cutting_down' });
    expect(cutting).toContain('cut down');
    expect(cutting).toContain('non-judgemental');
    const exploring = buildSystemPrompt('CONTEXT', 'steady', undefined, { stage: 'exploring' });
    expect(exploring).toContain('just exploring');
    expect(exploring).toContain('Do not push them to stop');
  });
});
