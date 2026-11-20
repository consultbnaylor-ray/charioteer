import { describe, expect, it } from 'vitest';

import { coachRestingNote, currentRestingHeartRate, currentRestingLine, healthWithRestingNote } from '@/domain/currentResting';
import { emptyGarminReadings } from '@/domain/garminConnect';
import { buildStatsAnalysis } from '@/domain/statsAnalysis';

const today = '2026-11-20';

describe('current resting heart rate', () => {
  const garmin = [
    { day: '2026-11-14', value: 53 },
    { day: '2026-11-15', value: 51 },
    { day: '2026-11-16', value: 50 },
    { day: '2026-11-17', value: 43 },
    { day: '2026-11-18', value: 48 },
    { day: '2026-11-19', value: 49 },
    { day: '2026-11-20', value: 52 },
  ];
  const apple = [
    { kind: 'resting_heart_rate', recordedOn: '2026-10-17', value: 59 },
    { kind: 'resting_heart_rate', recordedOn: '2026-10-18', value: 59 },
    { kind: 'resting_heart_rate', recordedOn: '2026-10-19', value: 63 },
    { kind: 'resting_heart_rate', recordedOn: '2026-10-20', value: 63 },
    { kind: 'resting_heart_rate', recordedOn: '2026-10-21', value: 59 },
    { kind: 'resting_heart_rate', recordedOn: '2026-10-22', value: 64 },
    { kind: 'resting_heart_rate', recordedOn: '2026-10-23', value: 59 },
    { kind: 'resting_heart_rate', recordedOn: '2026-10-14', value: 61 },
  ];

  it('uses the latest Garmin resting reading, not the Apple average of 61', () => {
    const reading = currentRestingHeartRate({ today, garmin, samples: apple });
    expect(reading).toEqual({ value: 52, day: '2026-11-20', source: 'garmin' });
    expect(currentRestingLine(reading!)).toBe('latest resting heart rate 52 bpm (Garmin, 20 Nov)');
    const appleMean = Math.round(apple.slice(0, 7).reduce((sum, row) => sum + row.value, 0) / 7);
    expect(appleMean).toBe(61);
    expect(reading!.value).not.toBe(appleMean);
    expect(reading!.value).not.toBe(61);
  });

  it('falls back to the latest Apple reading only when Garmin has none in the last 60 days', () => {
    expect(currentRestingHeartRate({ today, samples: apple })).toEqual({ value: 59, day: '2026-10-23', source: 'apple' });
    expect(currentRestingLine({ value: 59, day: '2026-10-23', source: 'apple' })).toBe('latest resting heart rate 59 bpm (Apple Health, 23 Oct)');
    expect(currentRestingHeartRate({
      today,
      garmin: [{ day: '2026-08-01', value: 48 }],
      samples: apple,
    })).toEqual({ value: 59, day: '2026-10-23', source: 'apple' });
  });

  it('treats a merged Garmin sample as Garmin and does not average it with Apple', () => {
    expect(currentRestingHeartRate({
      today,
      samples: [
        { id: 'merged:resting_heart_rate:2026-11-20', kind: 'resting_heart_rate', recordedOn: '2026-11-20', value: 52 },
        { kind: 'resting_heart_rate', recordedOn: '2026-10-23', value: 59 },
        { kind: 'resting_heart_rate', recordedOn: '2026-10-22', value: 64 },
      ],
    })).toEqual({ value: 52, day: '2026-11-20', source: 'garmin' });
  });

  it('puts that one line into Thumos health context', () => {
    const note = coachRestingNote({ today, garmin, samples: apple });
    const health = healthWithRestingNote([
      { kind: 'resting_heart_rate', latest: 59, previous: 64, unit: 'bpm', note: 'Resting heart rate 59 bpm, down 8% vs your 30-day average' },
      { kind: 'steps', latest: 8000, previous: 7000, unit: 'steps', note: null },
    ], note);
    expect(health.find((item) => item.kind === 'resting_heart_rate')).toMatchObject({
      latest: null,
      previous: null,
      note: 'latest resting heart rate 52 bpm (Garmin, 20 Nov)',
    });
    expect(health.find((item) => item.kind === 'steps')?.latest).toBe(8000);
  });

  it('sends the latest Garmin reading to the coach, not the mean of the last Apple days', () => {
    const readings = emptyGarminReadings();
    readings.dailies = garmin.map((row) => ({
      calendarDate: row.day,
      restingHeartRateBpm: row.value,
      averageHeartRateBpm: 70,
      moderateMinutes: 10,
      vigorousMinutes: 0,
    }));
    const payload = buildStatsAnalysis({
      today,
      age: 45,
      sex: 'male',
      goal: null,
      heightCm: 180,
      samples: apple,
      readings,
    });
    const resting = payload.stats.find((stat) => stat.id === 'resting_heart_rate');
    expect(resting?.value).toBe(52);
    expect(resting?.latest).toBe(52);
    expect(resting?.value).not.toBe(61);
    expect(payload.restingReading).toBe('latest resting heart rate 52 bpm (Garmin, 20 Nov)');
  });
});
