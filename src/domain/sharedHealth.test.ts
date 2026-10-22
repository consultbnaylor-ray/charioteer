import { readFileSync } from 'node:fs';

import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';

import type { HealthSample } from '@/data/types';
import { emptyGarminReadings } from '@/domain/garminConnect';
import { mergeHealthSamples, mergeWorkouts } from '@/domain/healthSources';
import { defaultProfileSharing, projectPublicProfile, type ShareSource } from '@/domain/profileSharing';
import type { DeviceWorkout } from '@/domain/workoutRoute';

const SQL = readFileSync('supabase/migrations/20261022200000_shared_health_merge.sql', 'utf8');
const CALLER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const TARGET = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';

function sample(partial: Partial<HealthSample> & Pick<HealthSample, 'kind' | 'value' | 'recordedOn'>): HealthSample {
  return {
    id: `${partial.kind}-${partial.recordedOn}`,
    unit: 'min',
    source: 'healthkit',
    ...partial,
  };
}

describe('shared health uses the merged series', () => {
  it('shows the same totals a member already sees from Apple Health, with Garmin folded in', () => {
    const appleWorkouts: DeviceWorkout[] = [
      {
        id: 'hk-run',
        activityType: 37,
        label: 'Running',
        startedAt: '2026-10-21T07:00:00.000Z',
        durationMinutes: 40,
        distanceMetres: 5000,
        energyKcal: 320,
        averageHeartRate: null,
        effortScore: null,
        routeExpected: true,
      },
      {
        id: 'hk-walk',
        activityType: 52,
        label: 'Walking',
        startedAt: '2026-10-22T12:00:00.000Z',
        durationMinutes: 30,
        distanceMetres: null,
        energyKcal: null,
        averageHeartRate: null,
        effortScore: null,
        routeExpected: false,
      },
    ];
    const workouts = mergeWorkouts(appleWorkouts, [
      {
        summaryId: 'g-run',
        activityType: 'RUNNING',
        activityName: 'Morning run',
        startedAt: '2026-10-21T07:00:30.000Z',
        durationSeconds: 40 * 60,
        averageHeartRateBpm: 148,
        trainingEffect: 3.2,
        anaerobicEffect: 0.4,
      },
      {
        summaryId: 'g-cycle',
        activityType: 'CYCLING',
        activityName: 'Cycle',
        startedAt: '2026-10-22T18:00:00.000Z',
        durationSeconds: 25 * 60,
        averageHeartRateBpm: 130,
        trainingEffect: null,
        anaerobicEffect: null,
      },
    ]);
    const merged = mergeHealthSamples([
      sample({ kind: 'resting_heart_rate', value: 70, recordedOn: '2026-10-21' }),
      sample({ kind: 'sleep_hours', value: 6, recordedOn: '2026-10-21' }),
      sample({ kind: 'workout_minutes', value: 40, recordedOn: '2026-10-21' }),
      sample({ kind: 'workout_minutes', value: 30, recordedOn: '2026-10-22' }),
      sample({ kind: 'steps', value: 8000, recordedOn: '2026-10-21' }),
    ], {
      ...emptyGarminReadings(),
      connected: true,
      dailies: [{
        calendarDate: '2026-10-21',
        restingHeartRateBpm: 58,
        averageHeartRateBpm: null,
        moderateMinutes: 20,
        vigorousMinutes: 10,
      }],
      sleep: [{
        summaryId: 'night',
        calendarDate: '2026-10-21',
        durationSeconds: 7.5 * 3600,
        deepSeconds: null,
        lightSeconds: null,
        remSeconds: null,
        awakeSeconds: null,
        sleepScore: null,
      }],
    }, workouts);
    const source: ShareSource = {
      now: new Date('2026-10-22T12:00:00.000Z'),
      today: '2026-10-22',
      displayName: 'Alex Hart',
      bio: '',
      town: null,
      stage: '',
      sobrietyStartedAt: null,
      weeklySpendGbp: null,
      weeklyUnits: null,
      interestLabels: [],
      reasons: [],
      checkIns: [],
      health: merged.map((row) => ({ kind: row.kind, value: row.value, recordedOn: row.recordedOn })),
      gratitude: [],
      vision: [],
      progressPhotos: [],
      pinnedQuoteId: null,
    };
    const view = projectPublicProfile(source, {
      ...defaultProfileSharing(),
      healthKinds: ['resting_heart_rate', 'sleep_hours', 'workout_minutes', 'steps'],
    });
    expect(view.health).toEqual(expect.arrayContaining([
      'Resting heart rate average 58 bpm',
      'Sleep average 7h 30m',
      'Workouts average 48 min',
      'Steps average 8,000 steps',
    ]));
    expect(view.health.join(' ')).not.toMatch(/Garmin|summary_id|token/i);
    const quiet = projectPublicProfile(source, { ...defaultProfileSharing(), healthKinds: ['steps'] });
    expect(quiet.health).toEqual(['Steps average 8,000 steps']);
  });

  it('keeps the share function to aggregates and leaves the raw tables closed', () => {
    expect(SQL).toContain('create or replace function public.shared_health_days(target uuid)');
    expect(SQL).toContain('security definer');
    expect(SQL).toContain('set search_path = public');
    expect(SQL).toContain('from public.shared_health_days(target) h');
    expect(SQL).toContain('from public.shared_health_days(target) s');
    expect(SQL).toContain('revoke all on function public.shared_health_days(uuid) from public, anon');
    expect(SQL).toContain('grant execute on function public.shared_health_days(uuid) to authenticated');
    expect(SQL).toContain('user_id = auth.uid()');
    expect(SQL).toContain('grant select, insert, delete on table public.apple_workout_spans to authenticated');
    expect(SQL).not.toMatch(/grant select on table public\.garmin_/);
    expect(SQL).not.toMatch(/access_token|refresh_token|garmin_user_id|code_verifier/);
    expect(SQL).not.toMatch(/latitude|longitude/);
    const card = readFileSync('src/ui/PublicProfileCard.tsx', 'utf8');
    expect(card).toContain('useHealthSources');
    expect(card).toContain('health: mergedHealth.map');
    expect(readFileSync('src/health/catchUp.ts', 'utf8')).not.toContain('replaceAppleWorkoutSpans');
    expect(readFileSync('src/health/sync.ios.ts', 'utf8')).not.toContain('workoutSpans');
    expect(readFileSync('src/data/supabase-repository.ts', 'utf8')).not.toContain('apple_workout_spans');
    expect(readFileSync('src/app/(main)/workout/[id].tsx', 'utf8')).toContain('workoutSourceLine');
  });

  it('returns the merged days to another member and hides a box that is off', async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        create schema if not exists auth;
        create role anon nologin;
        create role authenticated nologin;
        create or replace function auth.uid() returns uuid
        language sql stable as $$
          select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
        $$;
        create or replace function public.viewer_in_community() returns boolean
        language sql stable as $$ select true $$;
        create table public.profiles (
          id uuid primary key,
          community_visible boolean not null default false,
          age_confirmed_18 boolean not null default false
        );
        create table public.blocks (blocker_id uuid, blocked_id uuid);
        create table public.profile_sharing (user_id uuid primary key, settings jsonb not null default '{}'::jsonb);
        create table public.health_samples (
          user_id uuid,
          kind text,
          value numeric,
          recorded_on date,
          created_at timestamptz not null default now()
        );
        create table public.garmin_dailies (
          user_id uuid,
          calendar_date date,
          resting_heart_rate_bpm integer,
          average_heart_rate_bpm integer,
          moderate_minutes integer,
          vigorous_minutes integer
        );
        create table public.garmin_sleep (
          user_id uuid,
          summary_id text,
          calendar_date date,
          duration_seconds integer
        );
        create table public.garmin_activities (
          user_id uuid,
          summary_id text,
          started_at timestamptz,
          duration_seconds integer,
          average_heart_rate_bpm integer,
          training_effect numeric,
          anaerobic_effect numeric
        );
      `);
      const helper = SQL.slice(0, SQL.indexOf('CREATE OR REPLACE FUNCTION public.public_profile'));
      await db.exec(helper);
      const today = await db.query<{ day: string }>(`select (timezone('Europe/London', now()))::date::text as day`);
      const day = today.rows[0]?.day ?? '';
      const previous = await db.query<{ day: string }>(`select ((timezone('Europe/London', now()))::date - 1)::text as day`);
      const prior = previous.rows[0]?.day ?? '';
      await db.exec(`
        insert into public.profiles (id, community_visible, age_confirmed_18)
        values ('${TARGET}', true, true);
        insert into public.profile_sharing (user_id, settings) values (
          '${TARGET}',
          '{"healthKinds":["resting_heart_rate","sleep_hours","workout_minutes","steps"]}'::jsonb
        );
        insert into public.health_samples (user_id, kind, value, recorded_on) values
          ('${TARGET}', 'resting_heart_rate', 70, '${day}'),
          ('${TARGET}', 'resting_heart_rate', 62, '${prior}'),
          ('${TARGET}', 'sleep_hours', 6, '${day}'),
          ('${TARGET}', 'sleep_hours', 8, '${prior}'),
          ('${TARGET}', 'workout_minutes', 40, '${day}'),
          ('${TARGET}', 'workout_minutes', 30, '${prior}'),
          ('${TARGET}', 'steps', 8000, '${day}'),
          ('${TARGET}', 'hrv_sdnn', 44, '${day}');
        insert into public.garmin_dailies (user_id, calendar_date, resting_heart_rate_bpm, average_heart_rate_bpm)
        values ('${TARGET}', '${day}', 58, 72);
        insert into public.garmin_sleep (user_id, summary_id, calendar_date, duration_seconds)
        values ('${TARGET}', 'night', '${day}', ${7.5 * 3600});
        insert into public.apple_workout_spans (user_id, workout_id, started_at, duration_minutes) values
          ('${TARGET}', 'hk-run', '${day} 08:00:00+01', 40),
          ('${TARGET}', 'hk-walk', '${prior} 13:00:00+01', 30);
        insert into public.garmin_activities (
          user_id, summary_id, started_at, duration_seconds, average_heart_rate_bpm, training_effect, anaerobic_effect
        ) values
          ('${TARGET}', 'g-run', '${day} 08:00:30+01', ${40 * 60}, 148, 3.2, 0.4),
          ('${TARGET}', 'g-cycle', '${prior} 19:00:00+01', ${25 * 60}, 130, null, null);
      `);
      await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [CALLER]);
      const rows = await db.query<{ kind: string; recorded_on: string; value: number }>(
        `select kind, recorded_on::text, value::float8 as value
         from public.shared_health_days($1::uuid)
         order by kind, recorded_on`,
        [TARGET],
      );
      const byKind = (kind: string) => rows.rows.filter((row) => row.kind === kind);
      expect(byKind('resting_heart_rate').map((row) => row.value)).toEqual([62, 58]);
      expect(byKind('sleep_hours').map((row) => row.value)).toEqual([8, 7.5]);
      expect(byKind('workout_minutes').map((row) => row.value)).toEqual([55, 40]);
      expect(byKind('steps').map((row) => row.value)).toEqual([8000]);
      expect(byKind('hrv_sdnn')).toEqual([]);
      expect(JSON.stringify(rows.rows)).not.toMatch(/g-run|g-cycle|night|token|Garmin/);

      await db.exec(`update public.profile_sharing set settings = '{"healthKinds":["steps"]}'::jsonb where user_id = '${TARGET}'`);
      const stepsOnly = await db.query<{ kind: string }>(
        `select kind from public.shared_health_days($1::uuid)`,
        [TARGET],
      );
      expect(stepsOnly.rows.map((row) => row.kind)).toEqual(['steps']);

      await db.query(`select set_config('request.jwt.claim.sub', '', false)`);
      const hidden = await db.query(`select * from public.shared_health_days($1::uuid)`, [TARGET]);
      expect(hidden.rows).toEqual([]);
    } finally {
      await db.close();
    }
  }, 30_000);
});
