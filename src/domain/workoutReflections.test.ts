import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { buildSystemPrompt, buildThumosContext } from './thumos';
import { loadWorkoutReflections, type WorkoutReflectionClient } from '../../supabase/functions/_shared/workoutReflectionLoad';
import {
  buildWorkoutReflections,
  WORKOUT_NOTE_CHARS,
  type ReflectionFeeling,
  type ReflectionMeal,
  type ReflectionSession,
} from '../../supabase/functions/_shared/workoutReflections';

const today = '2026-11-03';

function feeling(partial: Partial<ReflectionFeeling> & Pick<ReflectionFeeling, 'recordedOn'>): ReflectionFeeling {
  return {
    workoutKey: '',
    note: '',
    effort: null,
    mood: null,
    ...partial,
  };
}

function session(partial: Partial<ReflectionSession> & Pick<ReflectionSession, 'id' | 'day'>): ReflectionSession {
  return {
    startedAt: null,
    type: 'HIIT',
    durationMinutes: 20,
    source: 'device',
    ...partial,
  };
}

describe('workout diary sent to Thumos', () => {
  it('keeps the last 30 days, ten notes, a UK date, and a sleep trend', () => {
    const note = `${'Heavy '.repeat(50)}finish`;
    expect(note.length).toBeGreaterThan(WORKOUT_NOTE_CHARS);
    const feelings: ReflectionFeeling[] = [
      feeling({ recordedOn: '2026-11-03', workoutKey: 'garmin:new', effort: 8, mood: 6, note }),
      feeling({ recordedOn: '2026-11-02', workoutKey: 'garmin:old', effort: 7, mood: 5, note: 'Fine' }),
      feeling({ recordedOn: '2026-10-20', effort: 4, mood: 4 }),
      feeling({ recordedOn: '2026-10-19', effort: 5, mood: 5 }),
      feeling({ recordedOn: '2026-09-01', effort: 9, mood: 9, note: 'Too old' }),
    ];
    const sessions: ReflectionSession[] = [
      session({
        id: 'garmin:new',
        day: '2026-11-03',
        startedAt: '2026-11-03T18:00:00.000Z',
        type: 'HIIT',
        durationMinutes: 20,
      }),
      session({
        id: 'garmin:old',
        day: '2026-11-02',
        startedAt: '2026-11-02T18:00:00.000Z',
        type: 'Strength',
        durationMinutes: 40,
      }),
      session({ id: 'plan-same', day: '2026-11-03', startedAt: '2026-11-03T18:10:00.000Z', type: 'HIIT', durationMinutes: 20, source: 'plan' }),
      ...Array.from({ length: 8 }, (_, index) => session({
        id: `extra-${index}`,
        day: `2026-10-${String(28 - index).padStart(2, '0')}`,
        startedAt: `2026-10-${String(28 - index).padStart(2, '0')}T12:00:00.000Z`,
        type: 'Run',
        durationMinutes: 30,
        source: 'device',
      })),
      session({ id: 'stale', day: '2026-10-04', startedAt: '2026-10-04T12:00:00.000Z', type: 'Archery', durationMinutes: 15 }),
    ];
    const meals: ReflectionMeal[] = [
      { eatenOn: '2026-11-03', eatenAt: '2026-11-03T11:00:00.000Z', kcal: 400 },
      { eatenOn: '2026-11-03', eatenAt: '2026-11-03T19:00:00.000Z', kcal: 700 },
    ];
    const lines = buildWorkoutReflections({
      today,
      feelings,
      sessions,
      sleep: [
        { day: '2026-11-03', hours: 7.5 },
        { day: '2026-11-02', hours: 8 },
        { day: '2026-10-20', hours: 5 },
        { day: '2026-10-19', hours: 6 },
      ],
      meals,
    });
    const joined = lines.join('\n');
    expect(lines[0]).toBe('Average effort 7.5 after 7h or more of sleep (2 sessions), and 4.5 after less (2).');
    expect(lines[1]).toContain('3 Nov 2026, HIIT, 20 min');
    expect(lines[1]).toContain('Effort 8/10');
    expect(lines[1]).toContain('Mood 6/10');
    expect(lines[1]).toContain('Sleep the night before 7.5 h');
    expect(lines[1]).toContain('Before the session: 1 meal, 400 kcal');
    expect(lines[1]).not.toContain('700');
    expect(lines[1]).not.toContain('2026-11-03');
    expect(lines[1]).not.toContain('T18:00');
    const clipped = lines[1].slice(lines[1].indexOf('Note: ') + 'Note: '.length);
    expect(clipped.length).toBeLessThanOrEqual(WORKOUT_NOTE_CHARS);
    expect(clipped.endsWith('…')).toBe(true);
    expect(joined).not.toContain('Too old');
    expect(joined).not.toContain('Archery');
    expect(joined).not.toContain('plan-same');
    expect(joined.indexOf('3 Nov 2026')).toBeLessThan(joined.indexOf('2 Nov 2026'));
    const edge = buildWorkoutReflections({
      today,
      feelings: [],
      sessions: [
        session({ id: 'edge', day: '2026-10-05', type: 'Boxing', durationMinutes: 12 }),
        session({ id: 'out', day: '2026-10-04', type: 'Archery', durationMinutes: 12 }),
      ],
      sleep: [],
      meals: [],
    }).join('\n');
    expect(edge).toContain('5 Oct 2026, Boxing, 12 min');
    expect(edge).not.toContain('Archery');
    expect(lines.filter((line) => line.startsWith('Average')).length).toBe(1);
    expect(lines.length).toBe(1 + 10);
    expect(lines[1].indexOf('3 Nov 2026')).toBeLessThan(lines.at(-1)?.indexOf('2026') ?? 0);
  });

  it('hides calories when asked, and skips a trend from one short night', () => {
    const lines = buildWorkoutReflections({
      today,
      feelings: [feeling({ recordedOn: '2026-11-01', workoutKey: 'garmin:a', effort: 6 })],
      sessions: [session({ id: 'garmin:a', day: '2026-11-01', startedAt: '2026-11-01T07:00:00.000Z', type: 'Run', durationMinutes: 25 })],
      sleep: [{ day: '2026-11-01', hours: 6 }],
      meals: [{ eatenOn: '2026-11-01', eatenAt: '2026-11-01T06:30:00.000Z', kcal: 200 }],
      hideCalories: true,
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('Before the session: 1 meal');
    expect(lines[0]).not.toContain('kcal');
    expect(lines[0]).not.toContain('Average effort');
  });

  it('withholds the diary on a self-harm turn and tells Thumos when to use it', () => {
    const base = {
      now: new Date('2026-11-03T12:00:00.000Z'),
      displayName: 'Alex',
      sobrietyStartedAt: '2026-01-01T00:00:00.000Z',
      reasons: ['Evenings'],
      weeklySpendGbp: 20,
      weeklyUnits: 10,
      checkIns: [],
      health: [],
      mode: 'steady' as const,
      safety: { selfHarm: false, withdrawal: false, reasons: [] },
      workoutReflections: ['3 Nov 2026, HIIT, 20 min. Note: secret diary line'],
    };
    const context = buildThumosContext(base);
    expect(context).toContain('Workout diary, last 30 days');
    expect(context).toContain('Not a diagnosis');
    expect(context).toContain('secret diary line');
    const crisis = buildThumosContext({
      ...base,
      safety: { selfHarm: true, withdrawal: false, reasons: ['self-harm or suicidal language'] },
    });
    expect(crisis).not.toContain('secret diary line');
    expect(crisis).not.toContain('HIIT');
    expect(crisis).toContain('workout diary');
    const prompt = buildSystemPrompt(context, 'steady');
    expect(prompt).toContain('how a session felt');
    expect(prompt).toContain('short paragraphs');
    expect(prompt).toContain('not a diagnosis');
    const crisisPrompt = buildSystemPrompt(crisis, 'support', undefined, { selfHarm: true });
    expect(crisisPrompt).toContain('workout diary');
    expect(crisisPrompt).not.toContain('how a session felt');
  });

  it('reads the diary tables only when allowed, and never location or raw files', () => {
    const loader = readFileSync('supabase/functions/_shared/workoutReflectionLoad.ts', 'utf8');
    expect(loader).toContain("from('workout_feelings')");
    expect(loader).toContain('summary_id, activity_type, activity_name, started_at, duration_seconds');
    expect(loader).not.toMatch(/latitude|longitude|garmin_activity_file|garmin_activity_detail|menstrual/i);
    const chat = readFileSync('supabase/functions/thumos-chat/index.ts', 'utf8');
    const voice = readFileSync('supabase/functions/thumos-voice-token/index.ts', 'utf8');
    const chatHandler = chat.slice(chat.indexOf('Deno.serve'));
    const voiceHandler = voice.slice(voice.indexOf('Deno.serve'));
    expect(loader).toContain('done_at');
    expect(chatHandler).toContain('const diaryAllowed = !safety.selfHarm && garminAllowedForCoach({');
    expect(chatHandler.indexOf('const diaryAllowed')).toBeLessThan(chatHandler.indexOf('loadWorkoutReflections(userClient'));
    expect(chatHandler.indexOf('loadWorkoutReflections(userClient')).toBeLessThan(chatHandler.indexOf('buildThumosContext({'));
    expect(voiceHandler).toContain('loadWorkoutReflections(userClient, userId, healthToday, garminAllowedForCoach({');
    expect(readFileSync('src/voice/briefing.ts', 'utf8')).toContain('workoutReflectionsFromDiary');
    const calls: string[] = [];
    const chain = (table: string, columns: string) => {
      calls.push(`${table}:${columns}`);
      const result = { data: table === 'nutrition_settings' ? [{ hide_calories: false }] : [], error: null };
      const query = {
        eq: () => query,
        gte: () => query,
        like: () => query,
        limit: () => query,
        then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject),
      };
      return query;
    };
    return loadWorkoutReflections({
      from(table: string) {
        return { select: (columns: string) => chain(table, columns) };
      },
    } as WorkoutReflectionClient, 'user', today, false).then((lines) => {
      expect(lines).toEqual([]);
      expect(calls).toEqual([]);
    });
  });

  it('builds a UK line from a finished session and ignores an undone plan', () => {
    const tables: Record<string, unknown[]> = {
      workout_feelings: [{ recorded_on: '2026-11-03', workout_key: 'garmin:abc', note: 'Steady', effort: 7, mood: 6 }],
      planned_sessions: [{ id: 'plan-1', session_type: 'hiit', starts_at: '2026-11-03T18:00:00.000Z', duration_minutes: 20, done_at: null }],
      garmin_activities: [{ summary_id: 'abc', activity_type: 'HIIT', activity_name: 'HIIT', started_at: '2026-11-03T18:00:00.000Z', duration_seconds: 1200 }],
      garmin_sleep: [{ calendar_date: '2026-11-03', duration_seconds: 7.5 * 3600 }],
      health_samples: [{ kind: 'menstrual_flow', value: 1, recorded_on: '2026-11-03' }],
      food_logs: [{ eaten_on: '2026-11-03', eaten_at: '2026-11-03T12:00:00.000Z', items: [{ kcal: 300 }], portion: 1 }],
      nutrition_settings: [{ hide_calories: false }],
    };
    const query = (table: string) => {
      const result = { data: tables[table] ?? [], error: table === 'workout_feelings' ? null : null };
      const chain = {
        eq: () => chain,
        gte: () => chain,
        like: () => chain,
        limit: () => chain,
        then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject),
      };
      return chain;
    };
    return loadWorkoutReflections({
      from(table: string) {
        return { select: () => query(table) };
      },
    } as WorkoutReflectionClient, 'user', today, true).then((lines) => {
      const text = lines.join('\n');
      expect(text).toContain('3 Nov 2026, HIIT, 20 min');
      expect(text).toContain('Effort 7/10');
      expect(text).toContain('Sleep the night before 7.5 h');
      expect(text).toContain('Before the session: 1 meal, 300 kcal');
      expect(text).toContain('Note: Steady');
      expect(text).not.toContain('menstrual');
      expect(text).not.toContain('2026-11-03T');
    });
  });
});
