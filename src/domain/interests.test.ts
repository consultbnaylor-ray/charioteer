import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import type { DirectoryCard, Profile } from '@/data/types';
import { INTEREST_CATALOGUE } from '../data/catalogue';
import {
  DEFAULT_INTERESTS,
  directoryWithOwnInterests,
  interestChipRemovable,
  interestChipVisible,
  interestSelectionUnchanged,
  isDefaultInterest,
  nextInterestIds,
  rolledBackInterestIds,
  snapshotWithOwnInterests,
} from './interests';

const profile = {
  id: 'me',
  email: 'me@example.com',
  displayName: 'Me',
  interestIds: ['cook'],
} as Profile;

function card(id: string, displayName: string, interestIds: string[]): DirectoryCard {
  return { id, displayName, town: null, interestIds, sharedInterestIds: [], avatarUrl: null };
}

describe('interest selection', () => {
  it('adds, removes, and leaves an unchanged choice alone', () => {
    expect(nextInterestIds(['cook'], 'run', true)).toEqual(['cook', 'run']);
    expect(nextInterestIds(['cook', 'run'], 'run', true)).toEqual(['cook', 'run']);
    expect(nextInterestIds(['cook', 'run'], 'run', false)).toEqual(['cook']);
    expect(nextInterestIds(['cook'], 'run', false)).toEqual(['cook']);
  });

  it('treats the same ids as unchanged regardless of order', () => {
    expect(interestSelectionUnchanged(['run', 'cook'], ['cook', 'run'])).toBe(true);
    expect(interestSelectionUnchanged(['cook'], ['cook', 'run'])).toBe(false);
  });

  it('rolls back only when a newer tap has not replaced the optimistic ids', () => {
    expect(rolledBackInterestIds(['cook', 'run'], ['cook', 'run'], ['cook'])).toEqual(['cook']);
    expect(rolledBackInterestIds(['cook', 'run', 'gym'], ['cook', 'run'], ['cook'])).toEqual(['cook', 'run', 'gym']);
  });
});

describe('people matching', () => {
  const directory = [card('amy', 'Amy', ['run', 'cook']), card('ben', 'Ben', ['cook'])];

  it('updates who is in common and puts the closest match first', () => {
    const running = directoryWithOwnInterests(directory, ['run']);
    expect(running.map((item) => item.id)).toEqual(['amy', 'ben']);
    expect(running[0].sharedInterestIds).toEqual(['run']);
    expect(running[1].sharedInterestIds).toEqual([]);

    const cooking = directoryWithOwnInterests(directory, ['cook', 'run']);
    expect(cooking.map((item) => item.id)).toEqual(['amy', 'ben']);
    expect(cooking[0].sharedInterestIds).toEqual(['run', 'cook']);
    expect(cooking[1].sharedInterestIds).toEqual(['cook']);
    expect(cooking[0].sharedInterestIds.length).toBeGreaterThan(cooking[1].sharedInterestIds.length);
  });

  it('writes the selection onto the profile and the directory together', () => {
    const next = snapshotWithOwnInterests({ profile, directory, ready: true }, ['run']);
    expect(next.profile?.interestIds).toEqual(['run']);
    expect(next.directory[0].sharedInterestIds).toEqual(['run']);
    expect(next.ready).toBe(true);
    expect(profile.interestIds).toEqual(['cook']);
  });
});

describe('default interests', () => {
  it('offers exercise, gym, health and fitness, and hiking in alphabetical order', () => {
    expect(DEFAULT_INTERESTS.map((item) => item.label)).toEqual(['Exercise', 'Gym', 'Health and Fitness', 'Hiking']);
    expect(INTEREST_CATALOGUE.map((item) => item.label)).toEqual(DEFAULT_INTERESTS.map((item) => item.label));
    expect(INTEREST_CATALOGUE.map((item) => item.slug)).toEqual(DEFAULT_INTERESTS.map((item) => item.slug));
    const labels = DEFAULT_INTERESTS.map((item) => item.label);
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b, 'en')));
  });

  it('treats an existing custom Gym or Health and Fitness row as a default chip', () => {
    expect(isDefaultInterest({ slug: 'gym', label: 'gym' })).toBe(true);
    expect(isDefaultInterest({ slug: 'weights', label: 'Health and Fitness' })).toBe(true);
    expect(isDefaultInterest({ slug: 'swimming', label: 'Swimming' })).toBe(false);
    expect(interestChipVisible({ slug: 'hiking', label: 'Hiking' }, false)).toBe(true);
    expect(interestChipVisible({ slug: 'cooking', label: 'Cooking' }, false)).toBe(false);
    expect(interestChipVisible({ slug: 'cooking', label: 'Cooking' }, true)).toBe(true);
    expect(interestChipRemovable({ slug: 'gym', label: 'Gym', custom: true })).toBe(false);
    expect(interestChipRemovable({ slug: 'choir', label: 'Choir', custom: true })).toBe(true);
  });

  it('reuses a live row by name and does not delete interest links', () => {
    const sql = readFileSync('supabase/migrations/20261010200000_default_interests.sql', 'utf8');
    expect(sql).toContain('on conflict (slug) do nothing');
    expect(sql).toContain('created_by = null');
    for (const label of ['Exercise', 'Gym', 'Health and Fitness', 'Hiking']) expect(sql).toContain(label);
    expect(sql.toLowerCase()).not.toMatch(/delete from public\.interests/);
    expect(sql.toLowerCase()).not.toMatch(/delete from public\.profile_interests/);
    const seed = readFileSync('supabase/seed.sql', 'utf8');
    expect(seed).toContain("'exercise', 'Exercise'");
    expect(seed).toContain("'health-and-fitness', 'Health and Fitness'");
    expect(seed).not.toContain('Sober raving');
  });
});

describe('you interest editor', () => {
  const screen = readFileSync('src/app/(main)/profile.tsx', 'utf8');
  const chip = readFileSync('src/ui/InterestChip.tsx', 'utf8');
  const repo = readFileSync('src/data/supabase-repository.ts', 'utf8');
  const save = screen.slice(screen.indexOf('async function saveDetails'), screen.indexOf('async function download'));
  const toggle = repo.slice(repo.indexOf('async setInterestSelected'), repo.indexOf('async addCustomInterest'));

  it('saves a chip straight away and does not send interests with the rest of the details', () => {
    expect(screen).toContain('Add your own interest');
    expect(screen).toContain('setInterestSelected');
    expect(screen).toContain('Could not update that interest.');
    expect(screen).toContain('Could not add that interest.');
    expect(screen).toContain('planCustomInterest');
    expect(save).not.toContain('interestIds');
    expect(chip).toContain('✓');
    expect(chip).toContain('#FFFFFF');
    expect(chip).toContain('Remove ');
    expect(chip).toContain('theme.colors.muted');
    expect(chip).toContain('theme.colors.ink');
  });

  it('inserts and deletes the caller’s profile_interests row, with rollback and no full reload', () => {
    expect(toggle).toContain(".from('profile_interests').insert");
    expect(toggle).toContain('.delete()');
    expect(toggle).toContain('rolledBackInterestIds');
    expect(toggle).toContain('snapshotWithOwnInterests');
    expect(toggle).not.toContain('this.refresh()');
    expect(toggle).not.toContain('replaceInterests');
    expect(toggle).toContain('23505');
  });

  it('already grants the owner delete on profile_interests, so no new migration is required', () => {
    const init = readFileSync('supabase/migrations/20261010120000_init.sql', 'utf8');
    const tighten = readFileSync('supabase/migrations/20261010130000_tighten_grants.sql', 'utf8');
    expect(init).toContain('grant select, insert, delete on public.profile_interests to authenticated');
    expect(tighten).toContain('grant select, insert, delete on public.profile_interests to authenticated');
    expect(init).toContain('create policy profile_interests_delete on public.profile_interests');
    expect(init).toContain('for delete to authenticated using (user_id = auth.uid())');
  });
});
