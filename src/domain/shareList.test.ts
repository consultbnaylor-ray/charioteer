import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { SHARE_LIST_PAGE, compareNewest, shareListHasMore, shareListLabel, visibleShareCount } from './shareList';

describe('collapsed share lists', () => {
  it('names how many are shared and pages ten at a time', () => {
    expect(shareListLabel('Gratitude entries', 2, 14)).toBe('Gratitude entries — 2 shared of 14  ›');
    expect(SHARE_LIST_PAGE).toBe(10);
    expect(visibleShareCount(0, 14)).toBe(10);
    expect(visibleShareCount(10, 14)).toBe(10);
    expect(visibleShareCount(20, 14)).toBe(14);
    expect(shareListHasMore(10, 14)).toBe(true);
    expect(shareListHasMore(14, 14)).toBe(false);
    expect(shareListHasMore(10, 3)).toBe(false);
  });

  it('orders newer stamps first', () => {
    const ordered = [
      { id: 'old', stamp: '2026-01-01' },
      { id: 'new', stamp: '2026-10-01' },
      { id: 'same-b', stamp: '2026-10-01T09:00:00.000Z' },
      { id: 'same-a', stamp: '2026-10-01T09:00:00.000Z' },
    ].sort(compareNewest);
    expect(ordered.map((item) => item.id)).toEqual(['same-b', 'same-a', 'new', 'old']);
  });

  it('collapses the long lists on What I share and leaves the gratitude master outside them', () => {
    const sharing = readFileSync('src/app/(main)/sharing.tsx', 'utf8');
    const list = readFileSync('src/ui/ShareSwitchList.tsx', 'utf8');
    expect(shareListLabel('Gratitude entries', 0, 3)).toContain('Gratitude entries — ');
    expect(sharing).toContain('title="Gratitude entries"');
    expect(sharing).toContain('title="Gratitude photos"');
    expect(sharing).toContain('lines={2}');
    expect(sharing).toContain('numberOfLines={2}');
    const gratitude = sharing.slice(sharing.indexOf('<GratitudeSectionShare'));
    const photos = sharing.slice(sharing.indexOf('<PhotoSectionShare'));
    const vision = sharing.slice(sharing.indexOf('<VisionSectionShare'));
    expect(gratitude.indexOf('title="Gratitude entries"')).toBeGreaterThan(0);
    expect(photos.indexOf('<ShareSwitchList')).toBeGreaterThan(0);
    expect(vision.indexOf('<ShareSwitchList')).toBeGreaterThan(0);
    expect(sharing.indexOf('<ReviewSectionShare')).toBeLessThan(sharing.indexOf('<GratitudeSectionShare'));
    expect(list).toContain('Show more');
    expect(list).toContain('SHARE_LIST_PAGE');
    expect(list).not.toContain('<ShareOnProfile');
    expect(list).toContain('expanded: open');
    expect(list).toContain('aria-expanded={open}');
  });
});
