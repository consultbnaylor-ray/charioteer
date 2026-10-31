import { describe, expect, it } from 'vitest';

import { exerciseReadingLines } from '@/domain/exerciseAnalysis';

describe('exercise reading', () => {
  it('uses the real sessions, the NHS week, and does not invent zone minutes', () => {
    const lines = exerciseReadingLines({
      today: '2026-10-31',
      age: 45,
      sessions: [
        {
          name: 'Run',
          startedAt: '2026-10-31T18:00:00.000Z',
          durationMinutes: 40,
          averageHeartRate: 155,
          trainingEffect: 3.4,
          origin: 'garmin',
        },
        {
          name: 'Traditional strength',
          startedAt: '2026-10-29T18:00:00.000Z',
          durationMinutes: 35,
          averageHeartRate: 120,
          trainingEffect: 2.1,
          origin: 'apple',
        },
      ],
    });
    const text = lines.join(' ');
    expect(text).toContain('Run 40 min');
    expect(text).toContain('Traditional strength 35 min');
    expect(text).toContain('Garmin');
    expect(text).toContain('Apple Health');
    expect(text).toContain('150 moderate minutes or 75 vigorous minutes');
    expect(text).toContain('Garmin training effect');
    expect(text).toContain('second strength day');
    expect(text).toContain('not medical advice');
    expect(text).not.toMatch(/time in zone|minutes in zone 2/i);
  });
});