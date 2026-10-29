import type { Resource, ResourceCategory } from '@/data/types';

export const ON_THE_MEND_ID = '20000000-0000-4000-8000-000000000039';

export const ON_THE_MEND_PARAGRAPHS = [
  'On The Mend is the podcast where we look back at life\'s hardest moments to understand how to move forward, with honesty, heart, and hope. In each episode, Matt Willis explores recovery, resilience, and mental strength through open and honest conversations.',
  'Some episodes feature guests sharing powerful stories of personal transformation. Others bring in expert voices offering practical tools and insights, and in solo episodes, Matt reflects on his own journey through addiction, identity, and healing.',
  'This is a space for anyone navigating life\'s challenges. On The Mend is your companion through the highs, lows, and everything in between.',
] as const;

export const ON_THE_MEND_APPS = 'Available on Spotify, YouTube, Apple Podcasts and other podcast apps.';

/**
 * Official show pages, checked 29 October 2026.
 * Apple Podcasts (GB) names Matt Willis as host and uses this description.
 * The Spotify show uses the same description.
 * The YouTube channel title is On The Mend with Matt Willis.
 * Set this to null to remove the links.
 */
export const ON_THE_MEND_LINKS: readonly { label: string; url: string }[] | null = [
  { label: 'Spotify', url: 'https://open.spotify.com/show/0n5EkuynTmtA3ZckiZ5C7J' },
  { label: 'YouTube', url: 'https://www.youtube.com/@OnTheMendPodcast' },
  { label: 'Apple Podcasts', url: 'https://podcasts.apple.com/gb/podcast/on-the-mend/id1697309091' },
];

export function onTheMendResource(): Resource {
  return {
    id: ON_THE_MEND_ID,
    category: 'health',
    title: 'On The Mend',
    detail: ON_THE_MEND_PARAGRAPHS.join('\n\n'),
    url: null,
    phone: null,
    verification: 'verified',
    verificationNote: 'Checked 29 October 2026 against Apple Podcasts, the Spotify show, and the YouTube channel On The Mend with Matt Willis.',
  };
}

/** Health includes the podcast. All pins it first. A copy already in the list is not repeated. */
export function libraryItems(resources: readonly Resource[], category: ResourceCategory | 'all'): Resource[] {
  const rest = resources.filter((item) => item.id !== ON_THE_MEND_ID);
  const podcast = onTheMendResource();
  if (category === 'all') return [podcast, ...rest];
  const matched = rest.filter((item) => item.category === category);
  return category === 'health' ? [podcast, ...matched] : matched;
}
