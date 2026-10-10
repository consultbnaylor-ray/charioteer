import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { earnedMilestones } from './milestones';
import { savingsFromTypicalWeek } from './savings';
import { soberElapsed } from './sober';
import { correctedSoberStart } from './correctStart';

describe('corrected sober start', () => {
  const now = new Date(2026, 9, 10, 18, 0, 0);
  const wrongToday = new Date(2026, 9, 10, 9, 0, 0).toISOString();

  it('moves a wrong today back by months and leaves a relapse out of it', () => {
    const corrected = correctedSoberStart(new Date(2026, 3, 10, 8, 0, 0), wrongToday, now);
    const started = new Date(corrected);
    expect(started.getFullYear()).toBe(2026);
    expect(started.getMonth()).toBe(3);
    expect(started.getDate()).toBe(10);
    const elapsed = soberElapsed(started, now);
    expect(elapsed.days).toBeGreaterThan(170);
    expect(savingsFromTypicalWeek(40, 20, elapsed.totalMs).moneyGbp).toBeGreaterThan(40);
    expect(earnedMilestones(started, now).map((item) => item.key)).toEqual(expect.arrayContaining(['24h', '7d', '30d', '90d']));
    expect(corrected).not.toBe(now.toISOString());
  });

  it('keeps the stored instant when the calendar day is unchanged', () => {
    const previous = new Date(2026, 3, 10, 15, 30, 0).toISOString();
    expect(correctedSoberStart(new Date(2026, 3, 10, 1, 0, 0), previous, now)).toBe(previous);
  });

  it('refuses a future day', () => {
    expect(() => correctedSoberStart(new Date(2026, 9, 11), wrongToday, now)).toThrow(/earlier/);
  });
});

describe('detail editors', () => {
  const home = readFileSync('src/app/(main)/home.tsx', 'utf8');
  const profile = readFileSync('src/app/(main)/profile.tsx', 'utf8');
  const correction = home.slice(home.indexOf('async function saveCorrection'), home.indexOf('async function saveWeek'));

  it('corrects the sober date from the home card without recording a relapse', () => {
    expect(home).toContain('accessibilityLabel="Correct the sober start date"');
    expect(home).toContain('Correct the start date');
    expect(home).toContain('not a relapse');
    expect(home).toContain('maximumDate={new Date()}');
    expect(correction).toContain('correctedSoberStart');
    expect(correction).toContain('updateProfile');
    expect(correction).not.toContain('recordRelapse');
    expect(correction).not.toContain('relapses');
  });

  it('edits spend and units, with the NHS guide, from the savings cards', () => {
    expect(home).toContain('accessibilityLabel="Edit weekly spend"');
    expect(home).toContain('accessibilityLabel="Edit weekly units"');
    expect(home).toContain('<UnitsGuide');
    expect(home).toContain('<EditMark');
    expect(home).toContain('async function saveWeek');
    expect(home.slice(home.indexOf('async function saveWeek'), home.indexOf('if (!profile) return null'))).toContain('weeklySpendGbp');
  });

  it('keeps name, stage, date, money, reasons, interests, town, and consents in Your details', () => {
    expect(profile).toContain('Your details');
    expect(profile).toContain('label="Name"');
    expect(profile).toContain('label="Sober since"');
    expect(profile).toContain('label="Typical spend per week (£)"');
    expect(profile).toContain('label="Typical units per week"');
    expect(profile).toContain('label="Reasons, one per line"');
    expect(profile).toContain('label="Town or area"');
    expect(profile).toContain('<UnitsGuide');
    expect(profile).toContain('<ConsentChoices');
    expect(profile).toContain('Save your details');
    expect(profile).toContain('correctedSoberStart');
    expect(profile).toContain('saveConsents');
    expect(profile).not.toContain('recordRelapse');
  });
});

describe('detail columns already granted', () => {
  const tighten = readFileSync('supabase/migrations/20261010130000_tighten_grants.sql', 'utf8');
  const stage = readFileSync('supabase/migrations/20261010170000_profile_stage.sql', 'utf8');
  const granted = `${tighten}\n${stage}`;

  it('covers every profile column Your details writes', () => {
    for (const column of [
      'display_name',
      'sobriety_started_at',
      'weekly_spend_gbp',
      'weekly_units',
      'town',
      'community_visible',
      'consent_health',
      'consent_ai',
      'stage',
      'planned_quit_at',
      'weekly_units_goal',
      'drink_free_days_goal',
    ]) {
      expect(granted).toContain(column);
    }
    expect(tighten).toContain('grant select, insert, delete on public.reasons to authenticated');
    expect(tighten).toContain('grant select, insert, delete on public.profile_interests to authenticated');
  });
});
