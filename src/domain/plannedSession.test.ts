import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { londonWallTime, plannedDoneSamples, sessionClock, withPlannedMinutes, type PlannedSession } from './plannedSession';

function session(partial: Partial<PlannedSession> = {}): PlannedSession {
  return {
    id: '22222222-2222-2222-2222-222222222222',
    sessionType: 'boxing',
    startsAt: '2026-10-21T17:00:00.000Z',
    durationMinutes: 45,
    note: 'Pads',
    doneAt: null,
    ...partial,
  };
}

describe('planned sessions', () => {
  it('adds done minutes to the same workout total and leaves a plan that is not done out', () => {
    expect(plannedDoneSamples([session()])).toEqual([]);
    const done = plannedDoneSamples([session({ doneAt: '2026-10-21T18:00:00.000Z' })]);
    expect(done).toEqual([
      { kind: 'workout_minutes', value: 45, recordedOn: '2026-10-21', source: 'manual' },
      { kind: 'workout_type_8', value: 45, recordedOn: '2026-10-21', source: 'manual' },
    ]);
    const merged = withPlannedMinutes(
      [{ kind: 'workout_minutes', value: 30, recordedOn: '2026-10-20' }],
      [session({ doneAt: '2026-10-21T18:00:00.000Z' })],
    );
    expect(merged.map((row) => row.value)).toEqual([30, 45, 45]);
  });

  it('reads the clock as London time', () => {
    const startsAt = londonWallTime('2026-10-21', '18:00');
    expect(startsAt).toBe('2026-10-21T17:00:00.000Z');
    expect(sessionClock({ startsAt: startsAt ?? '' })).toBe('18:00');
    expect(londonWallTime('2026-10-21', '24:00')).toBeNull();
  });

  it('stores planned workouts for the owner only, and does not apply the migration from here', () => {
    const sql = readFileSync('supabase/migrations/20261019180000_planned_sessions.sql', 'utf8');
    expect(sql).toContain('Not applied from this repo');
    expect(sql).toContain('create table public.planned_sessions');
    expect(sql).toContain('planned_sessions_own');
    expect(sql).toContain('user_id = auth.uid()');
    expect(sql).toContain("session_type in ('run', 'cardio', 'strength', 'boxing', 'other')");
    expect(sql).toContain('duration_minutes between 10 and 240');
    expect(sql).toContain('char_length(note) <= 280');
    expect(sql).toContain('grant delete on table public.planned_sessions to authenticated');
    expect(sql).toContain('Owner only. Not shared.');
    expect(sql.toLowerCase()).not.toMatch(/drop table|delete from|community|buddy/i);
    expect(sql).not.toMatch(/grant\s+(?:select|insert|update|delete)[^;]*\bto anon\b/i);
    expect(sql).toContain('does not change export_my_data');
    expect(sql).not.toContain('create or replace function public.export_my_data');
    const repo = readFileSync('src/data/supabase-repository.ts', 'utf8');
    expect(repo).toContain(".from('planned_sessions').insert(");
    expect(repo).toContain(".from('planned_sessions').update(");
    expect(repo).toContain(".from('planned_sessions').delete(");
    expect(repo).not.toContain(".from('planned_sessions').upsert(");
  });
});
