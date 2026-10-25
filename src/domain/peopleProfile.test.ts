import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { COMMUNITY_PROMPT_SNOOZE_MS, communityPromptSnoozed, withCommunityPromptSnooze } from './communityPrompt';
import { buddyOnlyShareLine, buddyShareEmptyMessage } from './buddies';
import { communityProfileClosedMessage } from './profileSharing';

describe('your public profile on People', () => {
  const people = readFileSync('src/app/(main)/people.tsx', 'utf8');
  const card = readFileSync('src/ui/PublicProfileCard.tsx', 'utf8');
  const consent = readFileSync('src/ui/ConsentChoices.tsx', 'utf8');

  it('previews the public card and keeps private words off the People screen', () => {
    expect(people).toContain('label="View public profile"');
    expect(people).toContain("router.push('/public-profile'");
    expect(people.indexOf('<YourProfileRow')).toBeLessThan(people.indexOf('lists.community.slice'));
    expect(people).not.toContain('<PublicProfileCard');
    expect(people).not.toContain('scrollTo');
    expect(people).toContain('<BuddyProfileButton');
    expect(readFileSync('src/ui/CommunityProfile.tsx', 'utf8')).toContain('<CommunityProfile userId={userId} name={name} />');
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
    expect(card).toContain('label="Bio"');
    expect(card).toContain('placeholder={BIO_EXAMPLE}');
    expect(card).toContain('multiline');
    expect(card).toContain('{bio.length}/{BIO_LIMIT}');
    expect(card).toContain('Saved ✓');
    expect(readFileSync('src/domain/profileSharing.ts', 'utf8')).toContain('Dad of two, gym most mornings, 90 days sober and counting.');
    expect(card).not.toMatch(/gratitude_photos|gratitude-photos|progress-photos/);
    expect(consent).toContain('export const COMMUNITY_CONSENT_BODY');
    expect(consent).toContain('body={COMMUNITY_CONSENT_BODY}');
  });

  it('opens that same preview from the top of You, above the pinned quote', () => {
    const you = readFileSync('src/app/(main)/profile.tsx', 'utf8');
    const preview = readFileSync('src/app/(main)/public-profile.tsx', 'utf8');
    const link = you.indexOf('View my public profile');
    expect(link).toBeGreaterThan(-1);
    expect(link).toBeLessThan(you.indexOf('Pinned quote'));
    expect(link).toBeLessThan(you.indexOf('Pin a quote'));
    expect(you).toContain('<MemberAvatar');
    expect(you).toContain("router.push('/public-profile'");
    expect(preview).toContain('<PublicProfileCard');
    expect(preview).not.toContain('CommunityProfile');
    expect(preview).not.toContain('Message privately');
  });

  it('puts the same wagon flag under the profile, quote, and share links', () => {
    const you = readFileSync('src/app/(main)/profile.tsx', 'utf8');
    const nutrition = readFileSync('src/app/(main)/nutrition.tsx', 'utf8');
    const wagon = readFileSync('src/ui/NutritionShare.tsx', 'utf8');
    const pin = you.indexOf('Pin a quote');
    const share = you.indexOf('What I share');
    const flag = you.indexOf('<WagonFlag');
    expect(you.indexOf('View my public profile')).toBeLessThan(pin);
    expect(pin).toBeLessThan(share);
    expect(share).toBeLessThan(flag);
    expect(flag).toBeLessThan(you.indexOf('Your details'));
    expect(nutrition).toContain('<WagonFlag');
    expect(wagon).toContain('export function WagonFlag');
    expect(wagon).toContain('I’ve fallen off the wagon');
    expect(wagon).toContain('Share the wagon flag');
    expect(wagon).toContain('WAGON_SUPPORT');
    expect(wagon).toContain('will not shame you');
    expect(wagon).toContain('wagonOn: value');
    expect(wagon).not.toMatch(/failed|relapse|weak/i);
  });

  it('says Community shares only a way to be found, and leaves the switch off by default', () => {
    const consent = readFileSync('src/ui/ConsentChoices.tsx', 'utf8');
    expect(consent).toContain('Show me in the Community list');
    expect(consent).toContain('find you in People');
    expect(consent).toContain('name, interests and profile picture');
    expect(consent).toContain('private message');
    expect(consent).toContain('You can still search for other members');
    expect(consent).toContain('You choose what each buddy sees');
    expect(consent).toContain('Nothing else is shared');
    expect(consent).toContain('wagon flag');
    expect(consent).toContain('turn Community off at any time');
    expect(consent).toContain('Nothing else is shared until you switch it on');
    expect(consent).not.toContain('Other adults can see your name and interests');
    const onboarding = readFileSync('src/app/onboarding.tsx', 'utf8');
    expect(onboarding).toContain('const [community, setCommunity] = useState(false)');
    expect(onboarding).toContain('<ConsentChoices');
    expect(readFileSync('src/app/consent.tsx', 'utf8')).toContain('profile?.communityVisible ?? false');
    expect(readFileSync('src/app/(main)/sharing.tsx', 'utf8')).toContain('COMMUNITY_CONSENT_BODY');
    expect(readFileSync('src/ui/PublicProfileCard.tsx', 'utf8')).toContain('COMMUNITY_CONSENT_BODY');
    expect(readFileSync('src/ui/PublicProfileCard.tsx', 'utf8')).toContain('COMMUNITY_SWITCH_TITLE');
    const people = readFileSync('src/app/(main)/people.tsx', 'utf8');
    expect(people).toContain('<CommunityPrompt');
    expect(people).toContain('!me.communityVisible && me.ageConfirmed18');
    expect(people).not.toContain('Community is off');
    const prompt = readFileSync('src/ui/CommunityPrompt.tsx', 'utf8');
    expect(prompt).toContain('Turn on Community');
    expect(prompt).toContain('Not now');
    expect(prompt).toContain("router.push('/privacy'");
    expect(prompt).toContain('tone="quiet"');
    expect(prompt).not.toContain('danger');
    const now = Date.parse('2026-10-14T12:00:00.000Z');
    expect(communityPromptSnoozed(null, 'user', now)).toBe(false);
    const stored = withCommunityPromptSnooze(null, 'user', now);
    expect(communityPromptSnoozed(stored, 'user', now + COMMUNITY_PROMPT_SNOOZE_MS - 1)).toBe(true);
    expect(communityPromptSnoozed(stored, 'user', now + COMMUNITY_PROMPT_SNOOZE_MS)).toBe(false);
    expect(communityPromptSnoozed(stored, 'someone-else', now)).toBe(false);
  });

  it('opens an accepted buddy on their private share, not the community profile', () => {
    const people = readFileSync('src/app/(main)/people.tsx', 'utf8');
    const accepted = people.slice(people.indexOf("show('accepted'"), people.lastIndexOf('SENT_HEADING'));
    expect(accepted).toContain('const other = connectionOtherId(connection, me.id)');
    expect(accepted).toContain('<BuddyShareButton userId={other} name={nameOf(other)} />');
    expect(accepted).not.toContain('BuddyProfileButton');
    expect(accepted).not.toContain('CommunityProfile');
    const incoming = people.slice(people.lastIndexOf('REQUESTS_HEADING'), people.indexOf("show('accepted'"));
    expect(incoming).not.toContain('BuddyShareButton');
    expect(people).toContain('<BuddyProfileButton userId={card.id} name={card.displayName} />');

    const panel = readFileSync('src/ui/BuddySharePanel.tsx', 'utf8');
    expect(panel).toContain('repo.sharedBuddyData(userId)');
    expect(panel).not.toContain('publicProfile');
    expect(panel).toContain("label={open ? 'Hide profile' : 'Profile'}");
    expect(panel).toContain('tone="quiet"');
    expect(panel).toContain('buddyShareEmptyMessage(name)');
    expect(panel).toContain('What ${view.displayName} shares with you');
    expect(readFileSync('src/app/(main)/chat/[id].tsx', 'utf8')).toContain('<BuddyShareButton userId={otherId} name={other} />');

    const editor = readFileSync('src/ui/BuddyScope.tsx', 'utf8');
    expect(editor).toContain('buddyOnlyShareLine(buddyName)');
    expect(editor).toContain('One switch per box.');
    const shareScreen = readFileSync('src/app/(main)/sharing.tsx', 'utf8');
    expect(shareScreen).toContain('Each switch here is for Community members');
    expect(shareScreen).toContain('It does not change what a buddy sees');
    expect(shareScreen).not.toContain('Only the person you invite can see this');

    expect(buddyOnlyShareLine('Emma')).toBe('Only Emma can see this. Community members cannot.');
    expect(buddyOnlyShareLine('')).toBe('Only the person who accepts this can see this. Community members cannot.');
    expect(buddyShareEmptyMessage('Paul')).toBe("Paul hasn't shared anything with you yet.");
    expect(buddyShareEmptyMessage('Paul')).not.toMatch(/block|community/i);
    expect(communityProfileClosedMessage('Jordan Ellis')).toBe("Jordan Ellis hasn't turned on Community, so there's no profile to show yet.");
  });
});
