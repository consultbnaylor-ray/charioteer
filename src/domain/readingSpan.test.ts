import { describe, expect, it } from 'vitest';

import { chartPlot } from '@/domain/readingChart';
import { formatReadingSpan, formatSpanAmount, readingSpan } from '@/domain/readingSpan';

const today = '2026-11-24';

describe('reading span', () => {
  it('names the latest, lowest, and highest inside the range', () => {
    const span = readingSpan([
      { day: '2026-08-01', value: 90 },
      { day: '2026-11-03', value: 81.2 },
      { day: '2026-11-12', value: 84.1 },
      { day: '2026-11-20', value: 83 },
    ], { start: '2026-10-26', end: '2026-11-24' });
    expect(span).toEqual({
      latest: { day: '2026-11-20', value: 83 },
      lowest: { day: '2026-11-03', value: 81.2 },
      highest: { day: '2026-11-12', value: 84.1 },
    });
    expect(formatReadingSpan(span!, 'kg', today)).toEqual({
      latest: 'Latest 83.0 kg on 20 Nov',
      lowest: 'Lowest 81.2 kg on 3 Nov',
      highest: 'Highest 84.1 kg on 12 Nov',
    });
    expect(formatSpanAmount(83, 'kg')).toBe('83.0 kg');
  });

  it('keeps the earliest day when the low or the high is tied', () => {
    const span = readingSpan([
      { day: '2026-11-12', value: 84.1 },
      { day: '2026-11-03', value: 81.2 },
      { day: '2026-11-15', value: 84.1 },
      { day: '2026-11-10', value: 81.2 },
      { day: '2026-11-20', value: 83 },
    ], { start: '2026-11-01', end: '2026-11-24' });
    expect(span).toEqual({
      latest: { day: '2026-11-20', value: 83 },
      lowest: { day: '2026-11-03', value: 81.2 },
      highest: { day: '2026-11-12', value: 84.1 },
    });
    const sameDay = readingSpan([
      { day: '2026-11-12', value: 84.1 },
      { day: '2026-11-12', value: 81.2 },
    ]);
    expect(sameDay).toEqual({
      latest: { day: '2026-11-12', value: 81.2 },
      lowest: { day: '2026-11-12', value: 81.2 },
      highest: { day: '2026-11-12', value: 84.1 },
    });
  });

  it('uses the only reading as latest, lowest, and highest', () => {
    const span = readingSpan([
      { day: '2025-11-03', value: 83 },
    ], { start: '2025-11-01', end: '2025-11-24' });
    expect(span).toEqual({
      latest: { day: '2025-11-03', value: 83 },
      lowest: { day: '2025-11-03', value: 83 },
      highest: { day: '2025-11-03', value: 83 },
    });
    expect(formatReadingSpan(span!, 'kg', today)).toEqual({
      latest: 'Latest 83.0 kg on 3 Nov 2025',
      lowest: 'Lowest 83.0 kg on 3 Nov 2025',
      highest: 'Highest 83.0 kg on 3 Nov 2025',
    });
  });

  it('drops readings outside the range and ignores a value that is not finite', () => {
    expect(readingSpan([
      { day: '2026-11-02', value: 80 },
      { day: '2026-11-03', value: Number.NaN },
      { day: '2026-11-26', value: 99 },
    ], { start: '2026-11-03', end: '2026-11-24' })).toBeNull();
    const edges = readingSpan([
      { day: '2026-11-02', value: 70 },
      { day: '2026-11-03', value: 81 },
      { day: '2026-11-24', value: 82 },
      { day: '2026-11-25', value: 99 },
    ], { start: '2026-11-24', end: '2026-11-03' });
    expect(edges).toEqual({
      latest: { day: '2026-11-24', value: 82 },
      lowest: { day: '2026-11-03', value: 81 },
      highest: { day: '2026-11-24', value: 82 },
    });
    expect(readingSpan([])).toBeNull();
  });

  it('matches the points a daily chart plots for that range', () => {
    const plotted = chartPlot({
      points: [
        { day: '2026-08-01', value: 90 },
        { day: '2026-11-03', value: 81.24 },
        { day: '2026-11-12', value: 84.06 },
      ],
      start: '2026-10-26',
      end: '2026-11-24',
      bucket: 'day',
      aggregate: 'mean',
    }).points;
    expect(plotted.map((point) => point.day)).toEqual(['2026-11-03', '2026-11-12']);
    expect(formatReadingSpan(readingSpan(plotted)!, 'kg', today).highest).toBe('Highest 84.1 kg on 12 Nov');
    expect(formatReadingSpan(readingSpan(plotted)!, '%', today).lowest).toBe('Lowest 81.2 % on 3 Nov');
  });
});
