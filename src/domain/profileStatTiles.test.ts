import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { defaultProfileSharing, parsePublicProfile, projectPublicProfile, toggleHealthKind, type ShareSource } from './profileSharing';
import { PROFILE_NOT_SHARED, profileStatBoard } from './profileStatTiles';

const secret = {
  reason: 'I want to be here for my daughter',
  note: 'craving was awful last night',
  mood: 4,
};

function source(overrides: Partial<ShareSource> = {}): ShareSource {
  return {
    now: new Date('2026-10-11T12:00:00.000Z'),
    today: '2026-10-11',
    displayName: 'Alex Hart',
    bio: '',
    town: 'Bristol',
    stage: 'stopped',
    sobrietyStartedAt: '2026-07-13T09:00:00.000Z',
    weeklySpendGbp: 40,
    weeklyUnits: 20,
    interestLabels: ['Hiking'],
    reasons: [{ body: secret.reason, sortOrder: 0 }],
    checkIns: [
      { createdAt: '2026-10-11T08:00:00.000Z' },
      { createdAt: '2026-10-10T08:00:00.000Z' },
    ],
    health: [
      { kind: 'steps', value: 8000, recordedOn: '2026-10-11' },
      { kind: 'steps', value: 4000, recordedOn: '2026-10-10' },
      { kind: 'sleep_hours', value: 5, recordedOn: '2026-10-11' },
      { kind: 'resting_heart_rate', value: 110, recordedOn: '2026-10-11' },
      { kind: 'weight_kg', value: 74.2, recordedOn: '2026-10-11' },
      { kind: 'weight_kg', value: 74.8, recordedOn: '2026-10-10' },
    ],
    gratitude: [{ id: 'g1', body: 'A quiet cup of tea', entryDate: '2026-10-11', photos: [] }],
    vision: [],
    progressPhotos: [],
    pinnedQuoteId: null,
    ...overrides,
  };
}

describe('profile stat tiles', () => {
  it('shows shared figures and names the rest as not shared, without the hidden numbers', () => {
    const sharing = toggleHealthKind({ ...defaultProfileSharing(), soberDays: true, moodStreak: true }, 'steps', true);
    const view = projectPublicProfile(source(), sharing);
    const board = profileStatBoard(view, { audience: 'owner', sharing });
    const packed = JSON.stringify(board);

    expect(board.tiles.map((tile) => tile.label)).toEqual(['Days sober', 'Mood streak', 'Steps']);
    expect(board.tiles.find((tile) => tile.id === 'sober')?.chart).toEqual({ kind: 'ring', fill: expect.any(Number) });
    expect(board.tiles.find((tile) => tile.id === 'sober')?.value).toMatch(/days$/);
    expect(board.tiles.find((tile) => tile.id === 'mood')).toMatchObject({
      value: '2 days in a row',
      caption: 'Check-in days. Mood scores stay private.',
      chart: { kind: 'ring', fill: 2 / 7 },
    });
    expect(board.tiles.find((tile) => tile.id === 'steps')).toMatchObject({
      value: '6,000 steps',
      caption: 'This week',
      chart: { kind: 'bars', values: [4000, 8000] },
    });
    expect(board.notShared).toContain('Sleep');
    expect(board.notShared).toContain('Weight');
    expect(board.notShared).toContain('Money saved');
    expect(board.notShared).toContain('Gratitude');
    expect(board.notShared).not.toContain('Days sober');
    expect(board.notShared).not.toContain('Steps');
    expect(packed).not.toContain('110');
    expect(packed).not.toContain('74.2');
    expect(packed).not.toContain('74.8');
    expect(packed).not.toContain('£');
    expect(packed).not.toContain(secret.reason);
    expect(packed).not.toContain(secret.note);
    expect(board.tiles.find((tile) => tile.id === 'sleep_hours')).toBeUndefined();
    expect(board.tiles.find((tile) => tile.id === 'mood')?.value).toBe('2 days in a row');
  });

  it('gives another member only the shared tiles, with no not-shared list and no other health series', () => {
    const sharing = toggleHealthKind(defaultProfileSharing(), 'weight_kg', true);
    const view = projectPublicProfile(source(), sharing);
    const board = profileStatBoard(view, { audience: 'member', sharing: { ...defaultProfileSharing(), soberDays: true, healthKinds: ['steps', 'sleep_hours', 'weight_kg'] } });
    expect(board.notShared).toEqual([]);
    expect(board.tiles.map((tile) => tile.id)).toEqual(['weight_kg']);
    expect(board.tiles[0]?.chart).toEqual({ kind: 'line', values: [74.8, 74.2] });
    const packed = JSON.stringify(board);
    expect(packed).not.toContain('8,000');
    expect(packed).not.toContain('8000');
    expect(packed).not.toContain('110');
    expect(packed).not.toContain('Days sober');
    expect(packed).not.toContain(PROFILE_NOT_SHARED);
  });

  it('draws a headline bar when the shared profile has an average and no series yet', () => {
    const view = parsePublicProfile({
      displayName: 'Jordan',
      health: ['Sleep average 7.2 hours'],
      moodStreak: 0,
      gratitude: [{ id: 'g1', body: 'Tea', entryDate: '2026-10-11' }],
      healthPlan: {
        headline: 'Maintain',
        focus: [{ text: 'Walk on Monday', done: true }, { text: 'Keep lunch at the same time', done: false }],
        ticked: 1,
        total: 2,
      },
    });
    expect(view).not.toBeNull();
    if (!view) return;
    const board = profileStatBoard(view, { audience: 'member' });
    expect(board.tiles.find((tile) => tile.id === 'sleep_hours')).toMatchObject({
      value: 'Sleep average 7.2 hours',
      chart: { kind: 'bars', values: [7.2] },
    });
    expect(board.tiles.find((tile) => tile.id === 'mood')?.value).toBe('0 days in a row');
    expect(board.tiles.find((tile) => tile.id === 'gratitude')?.value).toBe('1 line');
    expect(board.tiles.find((tile) => tile.id === 'plan')).toMatchObject({
      value: '1 of 2 ticked',
      chart: { kind: 'ring', fill: 0.5 },
    });
    expect(board.tiles.find((tile) => tile.id === 'steps')).toBeUndefined();
    expect(JSON.stringify(board)).not.toContain('Tea');
  });

  it('drops an unknown health series and a zero-only chart', () => {
    const view = parsePublicProfile({
      displayName: 'Alex',
      healthTrends: [
        { kind: 'mood', points: [{ day: '2026-10-11', value: 4 }] },
        { kind: 'steps', points: [{ day: '2026-10-11', value: 0 }, { day: 'not-a-day', value: 10 }] },
      ],
    });
    expect(view?.healthTrends).toEqual([{ kind: 'steps', points: [{ day: '2026-10-11', value: 0 }] }]);
    const board = profileStatBoard(view!, { audience: 'member' });
    expect(board.tiles.find((tile) => tile.id === 'steps')?.chart).toBeNull();
    expect(JSON.stringify(board)).not.toContain('mood');
  });

  it('keeps the tiles monochrome and off the hidden profile state', () => {
    const card = readFileSync('src/ui/PublicProfileCard.tsx', 'utf8');
    const other = readFileSync('src/ui/CommunityProfile.tsx', 'utf8');
    const tiles = readFileSync('src/ui/ProfileStatTiles.tsx', 'utf8');
    const hiddenStart = card.indexOf('{hidden ? (');
    const visibleStart = card.indexOf('Name and interests stay on');
    expect(card.slice(hiddenStart, visibleStart)).not.toContain('ProfileStatBoard');
    expect(card.slice(visibleStart)).toContain('ProfileStatBoard');
    expect(card).toContain("audience: 'owner'");
    expect(card).toContain('sharing: snap.sharing');
    expect(other).toContain("audience: 'member'");
    expect(other).not.toContain('sharing:');
    expect(tiles).toContain('theme.colors.ink');
    expect(tiles).toContain('theme.colors.line');
    expect(tiles).toContain('PROFILE_NOT_SHARED');
    expect(`${card}\n${other}\n${tiles}`).not.toMatch(/statsPalette|statsTone/);
  });

  it('returns last-week points only for health kinds already shared', () => {
    const sql = readFileSync('supabase/migrations/20261016120000_shared_health_trends.sql', 'utf8');
    const trendStart = sql.indexOf('into shown_trends');
    const trends = sql.slice(trendStart, sql.indexOf(') grouped;', trendStart));
    expect(sql.toLowerCase()).toContain('create or replace function public.public_profile(user_id uuid)');
    expect(sql.toLowerCase()).toContain('security definer');
    expect(sql).toContain("'healthTrends', shown_trends");
    expect(trends).toContain('s.kind = any(health_kinds)');
    expect(trends).toContain('s.recorded_on');
    expect(trends).toContain('s.value');
    expect(trends).not.toContain('check_ins');
    expect(trends).not.toContain('mood');
    expect(trends).not.toContain('craving');
    expect(trends).not.toContain('source');
    expect(sql).not.toMatch(/grant select on public\.health_samples/i);
    expect(viewOf(sql)).not.toContain('height_cm');
  });
});

function viewOf(sql: string): string {
  return sql.slice(sql.indexOf('function public.public_profile'));
}
