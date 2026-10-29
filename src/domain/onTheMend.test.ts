import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import type { Resource } from '@/data/types';
import { libraryItems, ON_THE_MEND_APPS, ON_THE_MEND_ID, ON_THE_MEND_LINKS, ON_THE_MEND_PARAGRAPHS } from '@/domain/onTheMend';

const nhs: Resource = {
  id: 'nhs',
  category: 'health',
  title: 'Sleep and tiredness',
  detail: 'NHS',
  url: 'https://www.nhs.uk/live-well/sleep-and-tiredness/',
  phone: null,
  verification: 'partial',
  verificationNote: '',
};

describe('On The Mend', () => {
  it('pins the podcast at the top of All and keeps it in Health', () => {
    const all = libraryItems([nhs], 'all');
    expect(all[0]?.id).toBe(ON_THE_MEND_ID);
    expect(all[0]?.category).toBe('health');
    expect(all.map((item) => item.id)).toEqual([ON_THE_MEND_ID, 'nhs']);
    const health = libraryItems([nhs], 'health');
    expect(health.map((item) => item.id)).toEqual([ON_THE_MEND_ID, 'nhs']);
    expect(libraryItems([nhs], 'quit_lit')).toEqual([]);
    expect(libraryItems([{ ...nhs, id: ON_THE_MEND_ID }], 'all')).toHaveLength(1);
    expect(ON_THE_MEND_PARAGRAPHS.join('\n\n')).toContain('Matt Willis');
    expect(ON_THE_MEND_APPS).toBe('Available on Spotify, YouTube, Apple Podcasts and other podcast apps.');
    expect(ON_THE_MEND_LINKS?.map((link) => link.url)).toEqual([
      'https://open.spotify.com/show/0n5EkuynTmtA3ZckiZ5C7J',
      'https://www.youtube.com/@OnTheMendPodcast',
      'https://podcasts.apple.com/gb/podcast/on-the-mend/id1697309091',
    ]);
    const screen = readFileSync('src/app/(main)/library.tsx', 'utf8');
    expect(screen).toContain('ON_THE_MEND_LINKS');
    expect(screen).toContain('Linking.openURL');
  });
});
