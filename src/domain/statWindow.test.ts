import { describe, expect, it } from 'vitest';

import { buildGoalLed, figuresForLondonWeek } from '@/domain/goalLed';
import { buildFitnessSnapshot, periodActiveMinutes } from '@/domain/fitnessSnapshot';
import {
  minuteUnit,
  paceJudgement,
  periodFairChance,
  proteinPace,
  rollingWindow,
  scaledPeriodTarget,
} from '@/domain/statWindow';

describe('period windows', () => {
  it('uses a rolling window ending today, so Monday still holds the days before it', () => {
    expect(rollingWindow('2026-10-19', '7')).toMatchObject({
      start: '2026-10-13',
      end: '2026-10-19',
      today: '2026-10-19',
    });
    expect(rollingWindow('2026-10-19', '7').days).toHaveLength(7);
    expect(rollingWindow('2026-10-19', 'day')).toEqual({
      start: '2026-10-19',
      end: '2026-10-19',
      today: '2026-10-19',
      days: ['2026-10-19'],
    });
    expect(rollingWindow('2026-10-19', '30').days).toHaveLength(30);
    expect(rollingWindow('2026-10-19', '30').start).toBe('2026-09-20');
  });

  it('scales a weekly target to the period', () => {
    expect(scaledPeriodTarget(6, 'day')).toBe(1);
    expect(scaledPeriodTarget(6, '7')).toBe(6);
    expect(scaledPeriodTarget(6, '30')).toBe(26);
    expect(scaledPeriodTarget(150, 'day')).toBe(21);
    expect(scaledPeriodTarget(150, '7')).toBe(150);
    expect(scaledPeriodTarget(150, '30')).toBe(643);
  });

  it('names the minute unit for the period', () => {
    expect(minuteUnit('day')).toBe('min today');
    expect(minuteUnit('7')).toBe('min in last 7 days');
    expect(minuteUnit('30')).toBe('min in last 30 days');
  });

  it('keeps Watch and Short back until the period has had a fair chance', () => {
    const morning = new Date('2026-10-19T08:00:00.000Z');
    const evening = new Date('2026-10-19T18:00:00.000Z');
    expect(periodFairChance({ period: 'day', loggedDays: 1, now: morning })).toBe(false);
    expect(periodFairChance({ period: 'day', loggedDays: 1, now: evening })).toBe(false);
    expect(periodFairChance({ period: '7', loggedDays: 1, now: evening })).toBe(false);
    expect(periodFairChance({ period: '7', loggedDays: 2, now: morning })).toBe(true);
    expect(paceJudgement({ period: 'day', loggedDays: 1, now: morning, met: false, behind: 'Short' })).toMatchObject({
      word: 'Early days',
      tone: 'info',
      neutral: true,
    });
    expect(paceJudgement({ period: 'day', loggedDays: 1, now: morning, met: true, behind: 'Short' })).toMatchObject({
      word: 'On pace',
      neutral: true,
    });
    expect(paceJudgement({ period: '7', loggedDays: 3, now: evening, met: false, behind: 'Short' }).word).toBe('Short');
    expect(paceJudgement({ period: '7', loggedDays: 3, now: evening, met: true }).word).toBe('On track');
  });

  it('calls protein on pace when the average meets the target, and early when one day is short', () => {
    expect(proteinPace({
      period: '7',
      loggedDays: 6,
      now: new Date('2026-10-18T12:00:00.000Z'),
      average: 142,
      target: 140,
      hits: 4,
    })).toMatchObject({ word: 'On pace', neutral: true });
    expect(proteinPace({
      period: '7',
      loggedDays: 1,
      now: new Date('2026-10-19T08:00:00.000Z'),
      average: 122,
      target: 140,
      hits: 0,
    })).toMatchObject({ word: 'Early days', tone: 'info' });
    expect(proteinPace({
      period: '7',
      loggedDays: 4,
      now: new Date('2026-10-19T18:00:00.000Z'),
      average: 100,
      target: 140,
      hits: 1,
    }).word).toBe('Watch');
  });

  it('scales training on the goal card and leaves class weight on the latest reading', () => {
    const monday = new Date('2026-10-19T08:30:00.000Z');
    const day = buildGoalLed({
      goal: 'elite_middle_boxer',
      proteinTarget: 140,
      weekProtein: [122],
      workoutsKnown: true,
      workoutDays: 1,
      workoutMinutes: 33,
      scheduledDays: 6,
      weightKg: 83.8,
      previousWeightKg: 84,
      period: 'day',
      now: monday,
    });
    expect(day.measures.find((item) => item.id === 'protein')).toMatchObject({
      centre: '122',
      signal: 'Early days',
      status: 'Avg 122 g/day, target hit on 0 of 1 logged day',
    });
    expect(day.measures.find((item) => item.id === 'sessions')).toMatchObject({
      centre: '1',
      status: '1 of 1',
      signal: 'On pace',
    });
    expect(day.measures.find((item) => item.id === 'weight')).toMatchObject({
      centre: '83.8',
      label: 'Class',
    });
    const month = buildGoalLed({
      goal: 'lose_fat_build_muscle',
      proteinTarget: 140,
      weekProtein: [140, 140],
      workoutsKnown: true,
      workoutDays: 10,
      workoutMinutes: 400,
      scheduledDays: 6,
      weightKg: 80,
      period: '30',
      now: monday,
    });
    expect(month.measures.find((item) => item.id === 'sessions')?.status).toBe('10 of 26');
    expect(month.progressWords.startsWith('Last 30 days:')).toBe(true);
    const sameWeight = buildGoalLed({
      goal: 'elite_middle_boxer',
      weightKg: 83.8,
      period: '30',
      now: monday,
      workoutsKnown: true,
      workoutDays: 0,
      scheduledDays: 6,
    });
    expect(sameWeight.measures.find((item) => item.id === 'weight')?.centre).toBe('83.8');
    const latest = figuresForLondonWeek({
      now: new Date('2026-10-19T08:00:00.000Z'),
      logs: [],
      health: [{ kind: 'weight_kg', value: 83.8, recordedOn: '2026-09-01' }],
      checkIns: [],
      period: 'day',
    });
    expect(latest.weightKg).toBe(83.8);
  });

  it('uses the same active-minute total and period label on the fitness card', () => {
    const samples = [
      { kind: 'workout_minutes', value: 33, recordedOn: '2026-10-19' },
      { kind: 'workout_minutes', value: 40, recordedOn: '2026-10-16' },
      { kind: 'workout_minutes', value: 20, recordedOn: '2026-10-12' },
    ];
    const shared = periodActiveMinutes({ samples, today: '2026-10-19', start: '2026-10-13', end: '2026-10-19' });
    const view = buildFitnessSnapshot({
      today: '2026-10-19',
      goal: 'lose_fat_build_muscle',
      goalAge: 42,
      goalSex: 'male',
      scheduleWeekMinutes: 180,
      health: samples,
      permission: 'unknown',
      period: '7',
      now: new Date('2026-10-19T09:00:00.000Z'),
    });
    expect(shared.minutes).toBe(73);
    expect(view.minutes?.centre).toBe(String(shared.minutes));
    expect(view.minutes?.unit).toBe('min in last 7 days');
    const month = buildFitnessSnapshot({
      today: '2026-10-19',
      goal: null,
      goalAge: null,
      goalSex: null,
      scheduleWeekMinutes: null,
      health: samples,
      permission: 'unknown',
      period: '30',
      now: new Date('2026-10-19T09:00:00.000Z'),
    });
    expect(month.minutes?.unit).toBe('min in last 30 days');
    expect(month.minutes?.centre).toBe('93');
    const early = buildFitnessSnapshot({
      today: '2026-10-19',
      goal: null,
      goalAge: null,
      goalSex: null,
      scheduleWeekMinutes: 150,
      health: [{ kind: 'workout_minutes', value: 5, recordedOn: '2026-10-19' }],
      permission: 'unknown',
      period: 'day',
      now: new Date('2026-10-19T08:00:00.000Z'),
    });
    expect(early.minutes?.unit).toBe('min today');
    expect(early.minutes?.status).toBe('Early days');
    expect(early.minutes?.tone).not.toBe('watch');
  });
});
