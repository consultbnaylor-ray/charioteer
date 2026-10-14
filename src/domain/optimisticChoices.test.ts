import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const repo = readFileSync('src/data/supabase-repository.ts', 'utf8');
const nutrition = readFileSync('src/app/(main)/nutrition.tsx', 'utf8');
const share = readFileSync('src/ui/ShareOnProfile.tsx', 'utf8');
const nutritionShare = readFileSync('src/ui/NutritionShare.tsx', 'utf8');
const card = readFileSync('src/ui/PublicProfileCard.tsx', 'utf8');
const checkIn = readFileSync('src/app/(main)/check-in.tsx', 'utf8');
const choice = readFileSync('src/ui/ui.tsx', 'utf8');
const units = readFileSync('src/ui/UnitsGuide.tsx', 'utf8');

function slice(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  return source.slice(from, to);
}

describe('optimistic choices', () => {
  it('saves a nutrition goal without reloading the account', () => {
    const method = slice(repo, 'async setNutritionSettings', 'async setWater');
    expect(method).toContain('this.emit');
    expect(method).toContain('lane.choose');
    expect(method).toContain("from('nutrition_settings').upsert");
    expect(method).not.toContain('this.refresh()');
    expect(nutrition).toContain('function chooseGoal');
    expect(nutrition).toContain('function chooseSex');
    expect(slice(nutrition, 'function chooseGoal', 'function suggest')).not.toContain('run(');
    expect(slice(nutrition, 'function chooseSex', 'function suggest')).not.toContain('run(');
    expect(nutrition).not.toContain("disabled={isPending('hide')}");
    expect(nutrition).toContain('<QuietNote>{choiceNote}</QuietNote>');
  });

  it('keeps share switches, the wagon flag, and Community moving before the write', () => {
    const sharing = slice(repo, 'async setProfileSharing', 'async publicProfile');
    const consents = slice(repo, 'async saveConsents', 'private async insertConsents');
    expect(sharing).toContain('this.emit');
    expect(sharing).not.toContain('this.refresh()');
    expect(consents).toContain('this.emit');
    expect(consents).not.toContain('this.refresh()');
    expect(share).not.toContain('disabled={pending}');
    expect(share).toContain('QuietNote');
    expect(nutritionShare).not.toContain("disabled={isPending('wagon')}");
    expect(nutritionShare).not.toContain('disabled={pending}');
    expect(nutritionShare).toContain('wagonOn: value');
    expect(card).toContain('saveConsents');
    expect(card).not.toContain('communityBusy');
    expect(card).toContain('QuietNote');
  });

  it('leaves mood, craving, and the units guide instant, with no spinner on a chip', () => {
    expect(checkIn).toContain('touch(setMood)');
    expect(checkIn).toContain('touch(setCraving)');
    expect(slice(checkIn, 'Mood, 1 to 10', 'Sleep last night')).not.toContain('pending');
    expect(units).not.toContain('useRepository');
    const chip = slice(choice, 'export function Choice', 'export function ErrorNote');
    expect(chip).not.toContain('ActivityIndicator');
    expect(chip).not.toContain('pending');
  });

  it('patches theme and interests in place and coalesces the interest write', () => {
    const profile = slice(repo, 'async updateProfile', 'async setReasons');
    const interest = slice(repo, 'async setInterestSelected', 'async addCustomInterest');
    expect(profile).toContain('profileWithPatch');
    expect(profile).toContain('column.theme_preference = patch.themePreference');
    expect(profile).not.toContain('this.refresh()');
    expect(interest).toContain('lane.choose');
    expect(interest).toContain('rolledBackInterestIds');
    expect(interest).not.toContain('this.refresh()');
  });
});
