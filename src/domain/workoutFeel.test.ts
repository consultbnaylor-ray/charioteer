import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import type { FoodLog } from '@/domain/nutrition';
import { feelPatternLine, mealsBeforeSession, sleepHoursOnDay } from '@/domain/workoutFeel';
import { noteServerReached, offlineShouldShow, shownError } from '@/domain/errors';

describe('how a session felt', () => {
  it('uses sleep already stored and meals eaten before the session', () => {
    expect(sleepHoursOnDay('2026-11-03', [{ calendarDate: '2026-11-03', durationSeconds: 7.5 * 3600 }], [])).toBe(7.5);
    expect(sleepHoursOnDay('2026-11-03', [], [{ day: '2026-11-03', value: 6.2 }])).toBe(6.2);
    const meal = (eatenAt: string | null, kcal: number): FoodLog => ({
      id: eatenAt ?? 'day',
      userId: 'u',
      eatenOn: '2026-11-03',
      eatenAt,
      meal: 'lunch',
      source: 'manual',
      note: '',
      items: [{ name: 'Lunch', kcal, proteinG: 0, carbsG: 0, sugarG: 0, fibreG: 0, unsaturatedG: 0, saturatedG: 0, transG: 0, sodiumMg: 0, processed: false }],
      estimated: false,
      portion: 1,
      createdAt: '2026-11-03T12:00:00.000Z',
      previewUrl: null,
    });
    const before = mealsBeforeSession(
      [meal('2026-11-03T11:00:00.000Z', 400), meal('2026-11-03T19:00:00.000Z', 700)],
      '2026-11-03',
      '2026-11-03T18:00:00.000Z',
    );
    expect(before).toEqual({ count: 1, kcal: 400 });
    expect(feelPatternLine([
      { effort: 8, sleepHours: 7.5 },
      { effort: 7, sleepHours: 8 },
      { effort: 4, sleepHours: 5 },
      { effort: 5, sleepHours: 6 },
    ])).toBe('You rated sessions higher after 7h+ sleep');
    expect(feelPatternLine([{ effort: 8, sleepHours: 7.5 }])).toBeNull();
  });

  it('keeps the diary owner-only, and sends Thumos a summary rather than the table', () => {
    const sql = readFileSync('supabase/migrations/20261103140000_workout_feelings.sql', 'utf8');
    expect(sql).toContain('create table public.workout_feelings');
    expect(sql).toContain('user_id = auth.uid()');
    expect(sql).toContain('Not applied');
    expect(sql).not.toMatch(/grant .+ to anon/i);
    const untouched = [
      'supabase/functions/health-plan/index.ts',
      'supabase/functions/_shared/statsAnalysis.ts',
    ].map((path) => readFileSync(path, 'utf8')).join('\n');
    expect(untouched).not.toContain('workout_feelings');
    const chat = readFileSync('supabase/functions/thumos-chat/index.ts', 'utf8');
    const voice = readFileSync('supabase/functions/thumos-voice-token/index.ts', 'utf8');
    expect(chat).toContain('loadWorkoutReflections');
    expect(voice).toContain('loadWorkoutReflections');
    expect(chat).not.toContain('workout_feelings');
    expect(voice).not.toContain('workout_feelings');
    expect(readFileSync('src/ui/WorkoutList.tsx', 'utf8')).toContain('Workout History');
    expect(readFileSync('src/ui/WorkoutList.tsx', 'utf8')).toContain('endDay={day}');
    expect(readFileSync('src/ui/WorkoutList.tsx', 'utf8')).toContain('span={1}');
    expect(readFileSync('src/ui/WorkoutList.tsx', 'utf8')).not.toContain('Chart days');
  });
});

describe('a dropped call after a successful load', () => {
  it('stays quiet the first time and shows the warning only when it keeps failing', () => {
    noteServerReached();
    expect(shownError(new Error('The request timed out'), 'Could not save.')).toBe('');
    expect(shownError(new Error('Network request failed'), 'Could not save.')).toMatch(/reach Charioteer/i);
    noteServerReached(Date.now() - 16 * 60 * 1000);
    expect(offlineShouldShow()).toBe(true);
  });
});
