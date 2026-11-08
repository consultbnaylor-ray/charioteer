import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  formatGratitudeHeader,
  gratitudeDiaryDay,
  gratitudeFromRows,
  groupGratitudeByDay,
  type GratitudeEntry,
} from './gratitude';

function entry(partial: Partial<GratitudeEntry> & Pick<GratitudeEntry, 'id' | 'body' | 'entryDate'>): GratitudeEntry {
  return {
    category: null,
    isFavourite: false,
    createdAt: `${partial.entryDate}T12:00:00.000Z`,
    updatedAt: `${partial.entryDate}T12:00:00.000Z`,
    photos: [],
    ...partial,
  };
}

describe('gratitude diary order', () => {
  it('lists newest diary days first and ignores an edit time', () => {
    const groups = groupGratitudeByDay([
      entry({
        id: 'old-edit',
        body: 'Edited today',
        entryDate: '2026-10-11',
        createdAt: '2026-10-11T08:00:00.000Z',
        updatedAt: '2026-11-02T18:00:00.000Z',
        checkInId: 'check-1',
      }),
      entry({
        id: 'oct-31',
        body: 'Last day of October',
        entryDate: '2026-10-31',
        createdAt: '2026-10-31T21:00:00.000Z',
        updatedAt: '2026-10-31T21:00:00.000Z',
      }),
      entry({
        id: 'nov-early',
        body: 'Morning line',
        entryDate: '2026-11-02',
        createdAt: '2026-11-02T08:00:00.000Z',
        updatedAt: '2026-11-02T20:00:00.000Z',
      }),
      entry({
        id: 'nov-later',
        body: 'Evening line',
        entryDate: '2026-11-02',
        createdAt: '2026-11-02T19:00:00.000Z',
        updatedAt: '2026-11-02T19:00:00.000Z',
      }),
    ]);
    expect(groups.map((group) => group.entryDate)).toEqual(['2026-11-02', '2026-10-31', '2026-10-11']);
    expect(groups[0]?.entries.map((item) => item.id)).toEqual(['nov-later', 'nov-early']);
    expect(groups.map((group) => formatGratitudeHeader(group.entryDate))).toEqual([
      '2 November 2026',
      '31 October 2026',
      '11 October 2026',
    ]);
  });

  it('reads a near-midnight instant as the London calendar day', () => {
    expect(gratitudeDiaryDay({ entryDate: '2026-10-24T23:30:00.000Z', createdAt: '' })).toBe('2026-10-25');
    expect(formatGratitudeHeader('2026-10-24T23:30:00.000Z')).toBe('25 October 2026');
    expect(formatGratitudeHeader('2026-11-02')).toBe('2 November 2026');
    const rows = gratitudeFromRows([{
      id: 'night',
      body: 'After midnight in London',
      entry_date: '2026-10-24T23:30:00.000Z',
      created_at: '2026-10-24T23:30:00.000Z',
      updated_at: '2026-11-02T12:00:00.000Z',
    }]);
    expect(rows[0]?.entryDate).toBe('2026-10-25');
    expect(groupGratitudeByDay(rows).map((group) => group.entryDate)).toEqual(['2026-10-25']);
  });

  it('keeps the memory card above the dated list', () => {
    const page = readFileSync('src/app/(main)/gratitude.tsx', 'utf8');
    const memory = page.indexOf('From a while ago');
    const headers = page.indexOf('formatGratitudeHeader(group.entryDate)');
    expect(memory).toBeGreaterThan(-1);
    expect(headers).toBeGreaterThan(memory);
    expect(page).toContain('It is not the next day in the list.');
    expect(page).toContain('<Card featured>');
    expect(page).not.toContain("'A while ago'");
    expect(page).toContain('londonDay(new Date())');
  });
});
