import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { gratefulForLine, planCheckInGratitude, planCheckInGratitudeSync, recentCheckInDays } from './checkIns';

describe('recent check-ins', () => {
  const today = new Date(2026, 9, 11, 15, 0);

  it('labels the seven days ending today and keeps the latest check-in on each day', () => {
    const days = recentCheckInDays(
      [
        { mood: 2, craving: 6, createdAt: new Date(2026, 9, 11, 8, 0).toISOString() },
        { mood: 4, craving: 1, createdAt: new Date(2026, 9, 11, 14, 0).toISOString() },
        { mood: 3, craving: 2, createdAt: new Date(2026, 9, 10, 9, 0).toISOString() },
        { mood: 1, craving: 9, createdAt: new Date(2026, 9, 1, 9, 0).toISOString() },
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
    expect(days[6]).toMatchObject({ mood: 4, craving: 1 });
    expect(days[5]).toMatchObject({ mood: 3, craving: 2 });
    expect(days.slice(0, 5).every((day) => day.mood == null && day.craving == null)).toBe(true);
  });

  it('still prefers the later check-in when an older one is listed after it', () => {
    const days = recentCheckInDays(
      [
        { mood: 4, craving: 1, createdAt: new Date(2026, 9, 11, 14, 0).toISOString() },
        { mood: 2, craving: 6, createdAt: new Date(2026, 9, 11, 8, 0).toISOString() },
      ],
      today,
    );
    expect(days[6]).toMatchObject({ mood: 4, craving: 1 });
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
    expect(home).toContain('Mood ${today.mood}/5 · craving ${today.craving}/10');
    expect(home).not.toContain('Meter');
    expect(screen).toContain('RefreshControl');
    expect(screen).not.toContain('function Meter');
  });

  it('draws narrow bars with day labels instead of a stretched fill', () => {
    expect(chart).toContain('width: 8');
    expect(chart).toContain('flexGrow: 0');
    expect(chart).not.toContain('flex: 1');
    expect(chart).toContain('No check-ins in the last 7 days.');
    expect(chart).toContain('{day.label}');
  });
});
