import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { actualEffortWords, sessionEntryWords } from './workoutDay';
import type { DeviceWorkout } from './workoutRoute';
import {
  londonWallTime,
  matchedSessionWorkouts,
  nextSessionClock,
  plannedDoneSamples,
  plannedEffortFrom,
  plannedEffortToDb,
  plannedSessionFromRow,
  sessionClock,
  snapSessionClock,
  withPlannedMinutes,
  type PlannedSession,
} from './plannedSession';

function session(partial: Partial<PlannedSession> = {}): PlannedSession {
  return {
    id: '22222222-2222-2222-2222-222222222222',
    sessionType: 'boxing',
    startsAt: '2026-10-21T17:00:00.000Z',
    durationMinutes: 45,
    note: 'Pads',
    plannedEffort: null,
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

  it('defaults a new session to the next quarter hour, or 18:00 on another day', () => {
    expect(nextSessionClock(new Date('2026-10-20T05:43:00.000Z'), '2026-10-20')).toBe('06:45');
    expect(nextSessionClock(new Date('2026-10-20T16:01:00.000Z'), '2026-10-20')).toBe('17:15');
    expect(nextSessionClock(new Date('2026-10-20T16:50:00.000Z'), '2026-10-20')).toBe('18:00');
    expect(nextSessionClock(new Date('2026-10-20T17:00:00.000Z'), '2026-10-20')).toBe('18:00');
    expect(nextSessionClock(new Date('2026-10-20T22:50:00.000Z'), '2026-10-20')).toBe('18:00');
    expect(nextSessionClock(new Date('2026-10-20T05:43:00.000Z'), '2026-10-21')).toBe('18:00');
    expect(snapSessionClock('18:07')).toBe('18:05');
    expect(snapSessionClock('18:58')).toBe('19:00');
    expect(snapSessionClock('bad')).toBe('18:00');
  });

  it('picks the time from a wheel and keeps duration on the number pad', () => {
    const calendar = readFileSync('src/ui/WorkoutCalendar.tsx', 'utf8');
    const time = readFileSync('src/ui/SessionTimeField.tsx', 'utf8');
    expect(calendar).toContain('<SessionTimeField');
    expect(calendar).not.toContain('label="Time"');
    expect(calendar).toContain('keyboardType="number-pad"');
    expect(calendar).toContain('dismissOnSubmit');
    expect(calendar).toContain("['30', '45', '60']");
    expect(calendar).toContain('revealSessionFields');
    expect(time).toContain('display="spinner"');
    expect(time).toContain('locale="en_GB"');
    expect(time).toContain('minuteInterval={5}');
    expect(time).toContain('is24Hour');
    expect(time).toContain('Morning 07:00');
    expect(time).toContain('Lunch 12:30');
    expect(time).toContain('Evening 18:00');
    expect(time).toContain("type: 'time'");
    expect(time).toContain('step: 300');
    expect(time).not.toContain('TextInput');
    expect(time).not.toContain('keyboardType');
  });

  it('stores planned workouts for the owner only, and does not apply the migration from here', () => {
    const sql = readFileSync('supabase/migrations/20261019180000_planned_sessions.sql', 'utf8');
    expect(sql).toContain('Not applied from this repo');
    expect(sql).toContain('create table public.planned_sessions');
    expect(sql).toContain('planned_sessions_own');
    expect(sql).toContain('user_id = auth.uid()');
    expect(sql).toContain("session_type in ('run', 'outdoor', 'cardio', 'strength', 'boxing', 'other')");
    const widened = readFileSync('supabase/migrations/20261020143000_outdoor_session_type.sql', 'utf8');
    expect(widened).toContain('Not applied from this repo');
    expect(widened).toContain("'outdoor'");
    expect(widened.toLowerCase()).not.toMatch(/grant\s+(?:select|insert|update|delete)|latitude|longitude/);
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
    const effort = readFileSync('supabase/migrations/20261021180000_planned_session_effort.sql', 'utf8');
    expect(effort).toContain('Not applied from this repo');
    expect(effort).toContain('add column if not exists planned_effort text');
    expect(effort).toContain("planned_effort in ('easy', 'moderate', 'hard', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10')");
    expect(effort).toContain('grant select (planned_effort) on table public.planned_sessions to authenticated');
    expect(effort).toContain('does not change export_my_data');
    expect(effort).not.toContain('create or replace function public.export_my_data');
    expect(effort.toLowerCase()).not.toMatch(/grant\s+(?:select|insert|update|delete)[^;]*\bto anon\b/i);
    expect(effort.toLowerCase()).not.toMatch(/drop table|latitude|longitude/);
    expect(repo).toContain('planned_effort');
  });

  it('keeps an optional planned effort and shows it against the same difficulty reading as the chart', () => {
    expect(plannedEffortFrom(null)).toBeNull();
    expect(plannedEffortFrom('')).toBeNull();
    expect(plannedEffortFrom('Easy')).toBe('easy');
    expect(plannedEffortFrom('moderate')).toBe('moderate');
    expect(plannedEffortFrom('hard')).toBe('hard');
    expect(plannedEffortFrom('7')).toBe(7);
    expect(plannedEffortFrom(10)).toBe(10);
    expect(plannedEffortFrom(0)).toBeNull();
    expect(plannedEffortFrom(11)).toBeNull();
    expect(plannedEffortFrom('11')).toBeNull();
    expect(plannedEffortToDb('easy')).toBe('easy');
    expect(plannedEffortToDb(7)).toBe('7');
    expect(plannedEffortToDb(null)).toBeNull();
    const row = plannedSessionFromRow({
      id: '22222222-2222-2222-2222-222222222222',
      session_type: 'boxing',
      starts_at: '2026-10-21T17:00:00.000Z',
      duration_minutes: 30,
      note: '',
      planned_effort: 'moderate',
      done_at: null,
    });
    expect(row?.plannedEffort).toBe('moderate');
    expect(plannedSessionFromRow({
      id: '22222222-2222-2222-2222-222222222222',
      session_type: 'boxing',
      starts_at: '2026-10-21T17:00:00.000Z',
      duration_minutes: 30,
      note: '',
      planned_effort: 'sprint',
      done_at: null,
    })?.plannedEffort).toBeNull();

    const boxing = workout();
    expect(actualEffortWords(boxing, 42)).toBe('Effort 7/10');
    expect(actualEffortWords({ ...boxing, effortScore: 7.5 }, null)).toBe('Effort 7.5/10');
    expect(actualEffortWords({ ...boxing, effortScore: null, averageHeartRate: 118 }, 42)).toBe('Avg HR 66% of max');
    expect(actualEffortWords({ ...boxing, effortScore: null, averageHeartRate: 118 }, null)).toBeNull();
    expect(actualEffortWords({ ...boxing, effortScore: 0, averageHeartRate: null }, 42)).toBeNull();

    const future = session({ plannedEffort: 'moderate', startsAt: '2026-10-22T17:00:00.000Z' });
    const now = new Date('2026-10-21T12:00:00.000Z');
    expect(sessionEntryWords(future, boxing, 42, now)).toBe('Boxing · 18:00 · about 45 min. Pads · Planned Moderate');
    const past = session({ plannedEffort: 6, startsAt: '2026-10-21T17:00:00.000Z', note: '' });
    expect(sessionEntryWords(past, boxing, 42, new Date('2026-10-21T18:00:00.000Z'))).toBe('Boxing · 18:00 · about 45 min · Planned 6/10 · Effort 7/10');
    const done = session({ plannedEffort: 'hard', doneAt: '2026-10-22T18:00:00.000Z', note: '', startsAt: '2026-10-22T17:00:00.000Z' });
    expect(sessionEntryWords(done, { ...boxing, effortScore: null, averageHeartRate: 118 }, 42, now)).toBe('Boxing · 18:00 · about 45 min · Done · Planned Hard · Avg HR 66% of max');
    expect(sessionEntryWords(session({ note: '', startsAt: '2026-10-21T17:00:00.000Z' }), null, 42, new Date('2026-10-21T18:00:00.000Z'))).toBe('Boxing · 18:00 · about 45 min');

    const walk = workout({ id: 'walk', activityType: 52, label: 'Walking', startedAt: '2026-10-21T09:00:00.000Z' });
    const early = workout({ id: 'early', startedAt: '2026-10-21T16:00:00.000Z' });
    const late = workout({ id: 'late', startedAt: '2026-10-21T18:30:00.000Z' });
    const morning = session({ id: 'morning', note: '', startsAt: '2026-10-21T16:10:00.000Z' });
    const evening = session({ id: 'evening', note: '', startsAt: '2026-10-21T18:00:00.000Z' });
    const outdoor = session({ id: 'outdoor', sessionType: 'outdoor', note: '', startsAt: '2026-10-21T09:05:00.000Z' });
    const matches = matchedSessionWorkouts([morning, evening, outdoor], [walk, early, late]);
    expect(matches.get('morning')?.id).toBe('early');
    expect(matches.get('evening')?.id).toBe('late');
    expect(matches.get('outdoor')?.id).toBe('walk');
    const shared = matchedSessionWorkouts(
      [morning, session({ id: 'other', note: '', startsAt: '2026-10-21T16:20:00.000Z' })],
      [early],
    );
    expect(shared.get('morning')?.id).toBe('early');
    expect(shared.get('other')).toBeUndefined();

    const calendar = readFileSync('src/ui/WorkoutCalendar.tsx', 'utf8');
    expect(calendar).toContain('Planned effort');
    expect(calendar).toContain('Easy, Moderate, Hard, or 1 to 10.');
    expect(calendar).toContain('sessionEntryWords');
    expect(calendar).toContain('workoutTypeColor(colorLabel)');
    const entryRow = calendar.slice(calendar.indexOf('workoutTypeColor(colorLabel)'), calendar.indexOf('accessibilityLabel="Reminder set"'));
    expect(entryRow).toContain('{line}');
    expect(entryRow.indexOf('workoutTypeColor(colorLabel)')).toBeLessThan(entryRow.indexOf('{line}'));
  });
});

function workout(partial: Partial<DeviceWorkout> = {}): DeviceWorkout {
  return {
    id: 'w1',
    activityType: 8,
    label: 'Boxing',
    startedAt: '2026-10-21T17:00:00.000Z',
    durationMinutes: 30,
    distanceMetres: null,
    energyKcal: null,
    averageHeartRate: 150,
    effortScore: 7,
    routeExpected: false,
    ...partial,
  };
}
