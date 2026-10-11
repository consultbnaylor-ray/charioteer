import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('your public profile on People', () => {
  const people = readFileSync('src/app/(main)/people.tsx', 'utf8');
  const card = readFileSync('src/ui/PublicProfileCard.tsx', 'utf8');
  const consent = readFileSync('src/ui/ConsentChoices.tsx', 'utf8');

  it('previews the public card and keeps private words off the People screen', () => {
    expect(people).toContain('<PublicProfileCard');
    expect(people).toContain('<CommunityProfile');
    expect(people).toContain('DISCOVER_EMPTY');
    expect(people).not.toContain('No one to show. People you have blocked stay hidden.');
    expect(people).not.toContain('Community is off');
    expect(people).not.toMatch(/gratitude/);
    expect(people).not.toMatch(/thumos|xai|progress-photos/i);
    expect(card).toContain('Your public profile');
    expect(card).toContain('Your profile is hidden from others');
    expect(card).toContain('Name and interests stay on');
    expect(card).toContain('projectPublicProfile');
    expect(card).toContain('Hidden:');
    expect(card).toContain('Chosen, but not visible until Community is on');
    expect(card).toContain('No one to show yet. As more people join near you or share your interests, they’ll appear here.');
    expect(card).toContain('Edit profile');
    expect(card).toContain('Saved ✓');
    expect(card).toContain('saveConsents');
    expect(card).toContain('consentHealth: me.consentHealth');
    expect(card).toContain('consentAi: me.consentAi');
    expect(card).toContain('COMMUNITY_CONSENT_BODY');
    expect(card).toContain('updateProfile({ displayName: next })');
    expect(card).toContain('updateProfile({ town: next })');
    expect(card).toContain('setInterestSelected');
    expect(card).toContain('validateTown');
    expect(card).toContain("visibility === 'community'");
    expect(card).toContain('progressPhotos');
    expect(card).not.toContain('communityPhotos');
    expect(card).not.toContain('Message privately');
    expect(card).not.toContain('reportUser');
    expect(card).not.toMatch(/\bbio\b/i);
    expect(card).not.toMatch(/gratitude_photos|gratitude-photos|progress-photos/);
    expect(consent).toContain('export const COMMUNITY_CONSENT_BODY');
    expect(consent).toContain('body={COMMUNITY_CONSENT_BODY}');
  });
});
