import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { convertStoredMoods, formatMoodAverage, gratefulForLine, moodOnTen, planCheckInGratitude, planCheckInGratitudeSync, recentCheckInDays, weeklyMoodAverage } from './checkIns';
import { moodStreakCount } from './profileSharing';

describe('recent check-ins', () => {
  const today = new Date(2026, 9, 11, 15, 0);

  it('labels the seven days ending today and keeps the latest check-in on each day', () => {
    const days = recentCheckInDays(
      [
        { mood: 4, craving: 6, createdAt: new Date(2026, 9, 11, 8, 0).toISOString() },
        { mood: 8, craving: 1, createdAt: new Date(2026, 9, 11, 14, 0).toISOString() },
        { mood: 6, craving: 2, createdAt: new Date(2026, 9, 10, 9, 0).toISOString() },
        { mood: 2, craving: 9, createdAt: new Date(2026, 9, 1, 9, 0).toISOString() },
      ],
      today,
    );
    expect(days.map((day) => day.label)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    expect(days.map((day) => day.day)).toEqual([
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
      '2026-10-08',
      '2026-10-09',
      '2026-10-10',
      '2026-10-11',
    ]);
    expect(days[6]).toMatchObject({ mood: 8, craving: 1 });
    expect(days[5]).toMatchObject({ mood: 6, craving: 2 });
    expect(days.slice(0, 5).every((day) => day.mood == null && day.craving == null)).toBe(true);
  });

  it('still prefers the later check-in when an older one is listed after it', () => {
    const days = recentCheckInDays(
      [
        { mood: 8, craving: 1, createdAt: new Date(2026, 9, 11, 14, 0).toISOString() },
        { mood: 4, craving: 6, createdAt: new Date(2026, 9, 11, 8, 0).toISOString() },
      ],
      today,
    );
    expect(days[6]).toMatchObject({ mood: 8, craving: 1 });
  });

  it('leaves every day empty when nothing was logged this week', () => {
    const days = recentCheckInDays([], today);
    expect(days.every((day) => day.mood == null && day.craving == null)).toBe(true);
  });
});

describe('check-in gratitude', () => {
  const checkIn = { id: 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1', createdAt: '2026-06-15T23:30:00.000Z' };
  const now = new Date('2026-10-12T08:00:00.000Z');

  it('keeps an empty field off the diary and accepts up to three short lines', () => {
    expect(planCheckInGratitude('  \n  ')).toEqual({ ok: true, body: '' });
    expect(planCheckInGratitude(' A quiet morning ')).toEqual({ ok: true, body: 'A quiet morning' });
    expect(planCheckInGratitude('Tea\n\nA walk\nProper sleep')).toEqual({ ok: true, body: 'Tea\nA walk\nProper sleep' });
    expect(planCheckInGratitude('One\nTwo\nThree\nFour')).toEqual({ ok: false, message: 'Keep it to three short lines.' });
    expect(planCheckInGratitude('x'.repeat(201))).toEqual({ ok: false, message: 'Keep each line to 200 characters.' });
    expect(gratefulForLine('Tea\nA walk')).toBe('Grateful for... Tea · A walk');
    expect(gratefulForLine('  ')).toBeNull();
  });

  it('updates the same diary row when the check-in is saved again', () => {
    const first = planCheckInGratitudeSync(null, checkIn, 'Tea', now, () => 'entry-1');
    expect(first).toEqual({
      ok: true,
      sync: {
        kind: 'write',
        id: 'entry-1',
        body: 'Tea',
        entryDate: '2026-06-16',
        createdAt: checkIn.createdAt,
        updatedAt: now.toISOString(),
        fresh: true,
      },
    });
    const second = planCheckInGratitudeSync(
      { id: 'entry-1', createdAt: checkIn.createdAt },
      checkIn,
      'Tea\nA walk',
      now,
      () => 'entry-2',
    );
    expect(second.ok && second.sync.kind === 'write' && second.sync.id).toBe('entry-1');
    expect(second.ok && second.sync.kind === 'write' && second.sync.fresh).toBe(false);
    const cleared = planCheckInGratitudeSync({ id: 'entry-1', createdAt: checkIn.createdAt }, checkIn, '   ', now, () => 'entry-3');
    expect(cleared).toEqual({ ok: true, sync: { kind: 'remove' } });
    const stillEmpty = planCheckInGratitudeSync(null, checkIn, '', now, () => 'entry-4');
    expect(stillEmpty).toEqual({ ok: true, sync: { kind: 'skip' } });
  });

  it('shows the diary line on the check-in, and follows an edit or a delete', () => {
    const entries = [{ checkInId: checkIn.id, body: 'Tea' }];
    const line = (rows: { checkInId?: string | null; body: string }[]) =>
      gratefulForLine(rows.find((entry) => entry.checkInId === checkIn.id)?.body ?? '');
    expect(line(entries)).toBe('Grateful for... Tea');
    expect(line([{ ...entries[0], body: 'A walk' }])).toBe('Grateful for... A walk');
    expect(line([])).toBeNull();
    const screen = readFileSync('src/app/(main)/check-in.tsx', 'utf8');
    const noteAt = screen.indexOf('label="Note, if you want"');
    const gratefulAt = screen.indexOf('label="Grateful for, if you want"');
    const recentAt = screen.indexOf('>Recent<');
    expect(noteAt).toBeGreaterThan(-1);
    expect(gratefulAt).toBeGreaterThan(noteAt);
    expect(recentAt).toBeGreaterThan(gratefulAt);
    expect(screen).toContain('entry.checkInId === item.id');
    expect(screen).toContain('gratefulForLine');
    expect(screen).toContain('draftId');
    const repo = readFileSync('src/data/supabase-repository.ts', 'utf8');
    const save = repo.slice(repo.indexOf('async addCheckIn'), repo.indexOf('async recordRelapse'));
    expect(save).toContain("rpc('save_check_in'");
    expect(save).not.toContain('gratitude_entries');
    const sql = readFileSync('supabase/migrations/20261010330000_check_in_gratitude.sql', 'utf8');
    expect(sql).toContain('add column check_in_id uuid unique references public.check_ins (id) on delete cascade');
    expect(sql).toContain('on conflict (check_in_id) do update');
    expect(sql).toContain('on conflict (id) do update');
    expect(sql).toContain("(stamp at time zone 'Europe/London')::date");
    expect(sql).toContain('delete from public.gratitude_entries');
    expect(sql).toContain('grant select (check_in_id) on public.gratitude_entries to authenticated');
    expect(sql).toContain('security definer');
    expect(sql).toContain('set search_path = public');
    expect(sql.toLowerCase()).toContain('revoke all on function public.save_check_in(uuid, smallint, numeric, smallint, text, text) from public, anon, authenticated');
    expect(sql.toLowerCase()).toContain('grant execute on function public.save_check_in(uuid, smallint, numeric, smallint, text, text) to authenticated');
    expect(sql.toLowerCase()).not.toContain('grant execute on function public.save_check_in(uuid, smallint, numeric, smallint, text, text) to anon');
    expect(sql).not.toMatch(/function public\.public_profile/);
    expect(sql).not.toMatch(/drop table/i);
    expect(sql).toContain('Keep it to three short lines.');
  });
});

describe('Today refresh and chart', () => {
  const home = readFileSync('src/app/(main)/home.tsx', 'utf8');
  const chart = readFileSync('src/ui/CheckInWeek.tsx', 'utf8');
  const screen = readFileSync('src/ui/ui.tsx', 'utf8');

  it('refetches Today on focus and on pull to refresh, and shows the latest mood', () => {
    expect(home).toContain('useFocusEffect');
    expect(home).toContain('repo.reload()');
    expect(home).toContain('onRefresh');
    expect(home).toContain('CheckInWeek');
    expect(home).toContain('Mood ${today.mood}/10 · craving ${today.craving}/10');
    expect(home).not.toContain('/5');
    expect(home).not.toContain('Meter');
    expect(screen).toContain('RefreshControl');
    expect(screen).not.toContain('function Meter');
  });

  it('draws narrow bars with day labels instead of a stretched fill', () => {
    expect(chart).toContain('max={10}');
    expect(chart).not.toContain('max={5}');
    expect(chart).toContain('weeklyMoodAverage');
    expect(chart).toContain('formatMoodAverage');
    expect(chart).toContain('width: 8');
    expect(chart).toContain('flexGrow: 0');
    expect(chart).not.toContain('flex: 1');
    expect(chart).toContain('No check-ins in the last 7 days.');
    expect(chart).toContain('{day.label}');
  });
});

describe('mood on a 1 to 10 scale', () => {
  it('doubles a stored 1-5 score and keeps a mood_10 score', () => {
    expect(moodOnTen(4, null)).toBe(8);
    expect(moodOnTen(1, null)).toBe(2);
    expect(moodOnTen(2, null)).toBe(4);
    expect(moodOnTen(3, null)).toBe(6);
    expect(moodOnTen(5, null)).toBe(10);
    expect(moodOnTen(4, 7)).toBe(7);
    expect(moodOnTen(null, 8)).toBe(8);
    expect(moodOnTen(7, null)).toBe(7);
    expect(moodOnTen('4', undefined)).toBe(8);
  });

  it('averages the logged days and leaves a blank day out', () => {
    expect(weeklyMoodAverage([{ mood: 8 }, { mood: 6 }, { mood: null }])).toBe(7);
    expect(weeklyMoodAverage([{ mood: 8 }, { mood: 6 }, { mood: 4 }])).toBe(6);
    expect(formatMoodAverage(6)).toBe('Average 6/10');
    expect(formatMoodAverage(6.45)).toBe('Average 6.5/10');
    expect(weeklyMoodAverage([{ mood: null }])).toBeNull();
  });

  it('converts an old sample once, then leaves a real 4 alone', () => {
    const first = convertStoredMoods([{ mood: 4 }, { mood: 3 }, { mood: 2 }], undefined);
    expect(first.converted).toBe(true);
    expect(first.moodScale).toBe(10);
    expect(first.checkIns.map((item) => item.mood)).toEqual([8, 6, 4]);
    const second = convertStoredMoods(first.checkIns, first.moodScale);
    expect(second.converted).toBe(false);
    expect(second.checkIns.map((item) => item.mood)).toEqual([8, 6, 4]);
  });

  it('counts the mood streak from check-in days, not from the score', () => {
    expect(moodStreakCount([
      { createdAt: '2026-10-11T08:00:00.000Z' },
      { createdAt: '2026-10-10T08:00:00.000Z' },
    ], '2026-10-11')).toBe(2);
    const sharing = readFileSync('src/domain/profileSharing.ts', 'utf8');
    expect(sharing).toContain('The number only');
    expect(sharing).toContain('`${view.moodStreak} days`');
    expect(sharing).not.toContain('/5');
    expect(sharing).not.toContain('/10');
  });

  it('shows a 1 to 10 row, recent cards as Mood 8/10, and does not offer the old tags', () => {
    const screen = readFileSync('src/app/(main)/check-in.tsx', 'utf8');
    expect(screen).toContain('Mood, 1 to 10');
    expect(screen).toContain('MOOD_SCORES');
    expect(screen).toContain('Mood {item.mood}/10');
    expect(screen).not.toContain('MOODS');
    expect(screen).not.toContain('/5');
    expect(screen).not.toContain('Low');
    expect(screen).not.toContain('Bright');
    const repo = readFileSync('src/data/supabase-repository.ts', 'utf8');
    expect(repo).toContain('moodOnTen(row.mood, row.mood_10)');
    const chat = readFileSync('supabase/functions/thumos-chat/index.ts', 'utf8');
    const voice = readFileSync('supabase/functions/thumos-voice-token/index.ts', 'utf8');
    expect(chat).toContain("select('mood, mood_10, sleep_hours, craving, note, created_at')");
    expect(chat).toContain('moodOnTen(row.mood, row.mood_10)');
    expect(voice).toContain('moodOnTen(row.mood, row.mood_10)');
    const insights = readFileSync('supabase/functions/_shared/healthInsights.ts', 'utf8');
    expect(insights).not.toContain('mood');
  });

  it('adds mood_10, copies mood times two, and does not delete or rewrite tester rows', () => {
    const sql = readFileSync('supabase/migrations/20261012120000_mood_10.sql', 'utf8');
    expect(sql).toContain('add column mood_10 smallint');
    expect(sql).toContain('set mood_10 = mood * 2');
    expect(sql).toContain('where mood_10 is null');
    expect(sql).toContain('and mood between 1 and 5');
    expect(sql).toContain('alter column mood_10 set not null');
    expect(sql).toContain('check (mood_10 between 1 and 10)');
    expect(sql).toContain('alter column mood drop not null');
    expect(sql).toContain('Choose a mood from 1 to 10.');
    expect(sql).toContain('values (check_in_id, uid, null, mood, sleep_hours, craving, note_text)');
    expect(sql).toContain('set mood_10 = excluded.mood_10');
    expect(sql).not.toMatch(/set mood =/);
    expect(sql).not.toMatch(/drop column/i);
    expect(sql).not.toMatch(/delete from public\.check_ins/i);
    expect(sql).not.toMatch(/update public\.check_ins[\s\S]*set mood[^\w_]/i);
    const older = readFileSync('supabase/migrations/20261010120000_init.sql', 'utf8');
    expect(older).toContain('mood smallint not null check (mood between 1 and 5)');
    const exported = readFileSync('supabase/migrations/20261010300000_profile_photos.sql', 'utf8');
    const exportFn = exported.slice(exported.indexOf('function public.export_my_data'));
    expect(exportFn).toContain('to_jsonb(c) order by c.created_at');
    expect(sql).not.toMatch(/function public\.export_my_data/);
    expect(sql).not.toMatch(/function public\.public_profile/);
  });
});
