import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { HIDDEN_SHARE_SECTIONS, hiddenShareHref, hiddenShareSection } from './hiddenShareTargets';
import { defaultProfileSharing, projectPublicProfile, type ShareSource } from './profileSharing';

function blankSource(): ShareSource {
  return {
    now: new Date('2026-10-14T12:00:00.000Z'),
    today: '2026-10-14',
    displayName: 'Alex Hart',
    bio: '',
    town: null,
    stage: 'stopped',
    sobrietyStartedAt: null,
    weeklySpendGbp: null,
    weeklyUnits: null,
    interestLabels: [],
    reasons: [],
    checkIns: [],
    health: [],
    gratitude: [],
    vision: [],
    progressPhotos: [],
    profilePhotos: [],
    pinnedQuoteId: null,
  };
}

describe('hidden profile names open What I share', () => {
  it('maps every label a fully hidden profile can list', () => {
    const view = projectPublicProfile(blankSource(), defaultProfileSharing());
    expect([...view.hiddenLabels].sort()).toEqual(Object.keys(HIDDEN_SHARE_SECTIONS).sort());
    for (const label of view.hiddenLabels) {
      expect(hiddenShareSection(label)).toBeTruthy();
    }
    expect(hiddenShareSection('Name')).toBeNull();
    expect(hiddenShareHref()).toBe('/sharing');
    expect(hiddenShareHref('Milestones')).toBe('/sharing?section=milestones');
    expect(hiddenShareHref('A hard moment')).toBe('/sharing?section=hardMoment');
    expect(hiddenShareHref('Progress photos')).toBe('/sharing?section=progressPhotos');
  });

  it('gives each name a scroll target, and keeps the People card free of photo table names', () => {
    const sharing = readFileSync('src/app/(main)/sharing.tsx', 'utf8');
    const card = readFileSync('src/ui/PublicProfileCard.tsx', 'utf8');
    for (const [label, id] of Object.entries(HIDDEN_SHARE_SECTIONS)) {
      expect(sharing).toContain(`id="${id}"`);
      expect(sharing).toContain(label);
    }
    expect(sharing).toContain('<ReviewSectionShare');
    expect(sharing).toContain('<PhotoSectionShare');
    expect(sharing.indexOf('<ReviewSectionShare')).toBeLessThan(sharing.indexOf('id="bio"'));
    expect(sharing.indexOf('id="progressPhotos"')).toBeLessThan(sharing.indexOf('<PhotoSectionShare'));
    expect(sharing).toContain('PROFILE_PHOTO_WORDING');
    expect(sharing).toContain('setProgressPhotoVisibility');
    expect(sharing).toContain("sensitiveShareConfirm('This progress photo')");
    expect(sharing).toContain('label="Share the wagon flag"');
    expect(sharing).toContain('id="hardMoment"');
    expect(card).toContain('Hidden:');
    expect(card).toContain('Change ›');
    expect(card).toContain('hiddenShareHref');
    expect(card).toContain('accessibilityRole="link"');
    expect(card).not.toMatch(/gratitude_photos|gratitude-photos|progress-photos/);
    expect(card).not.toContain('communityPhotos');
  });
});
