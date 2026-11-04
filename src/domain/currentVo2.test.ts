import { describe, expect, it } from 'vitest';

import { currentVo2Line, currentVo2Max } from '@/domain/currentVo2';
import { emptyGarminReadings } from '@/domain/garminConnect';
import { buildStatsAnalysis } from '@/domain/statsAnalysis';
import { localStatsVerdict } from '../../supabase/functions/_shared/statsAnalysis.ts';

const today = '2026-11-04';

describe('current VO2 max', () => {
  const garmin = [
    { day: '2026-10-29', value: 44 },
    { day: '2026-10-25', value: 45 },
  ];
  const apple = [
    { kind: 'vo2_max', recordedOn: '2026-10-21', value: 41.4 },
    { kind: 'vo2_max', recordedOn: '2026-10-18', value: 41.7 },
    { kind: 'vo2_max', recordedOn: '2026-10-05', value: 42.6 },
    { kind: 'vo2_max', recordedOn: '2026-10-04', value: 43.5 },
    { kind: 'vo2_max', recordedOn: '2026-10-03', value: 43.9 },
    { kind: 'vo2_max', recordedOn: '2026-10-02', value: 44.3 },
  ];

  it('picks the latest Garmin running reading when both sources are fresh', () => {
    const reading = currentVo2Max({ today, garmin, samples: apple });
    expect(reading).toEqual({ value: 44, day: '2026-10-29', source: 'garmin' });
    expect(currentVo2Line(reading!)).toBe('latest VO2 max 44.0 (Garmin, 29 Oct)');
    expect(Math.round((52.1 - reading!.value) * 10) / 10).toBe(8.1);
  });

  it('uses Garmin on its own and Apple on its own', () => {
    expect(currentVo2Max({ today, garmin, samples: [] })).toEqual({ value: 44, day: '2026-10-29', source: 'garmin' });
    expect(currentVo2Max({ today, samples: apple })).toEqual({ value: 41.4, day: '2026-10-21', source: 'apple' });
    expect(currentVo2Line({ value: 41.4, day: '2026-10-21', source: 'apple' })).toBe('latest VO2 max 41.4 (Apple Health, 21 Oct)');
  });

  it('lets a stale Garmin fall back to Apple and ignores cycling', () => {
    const stale = currentVo2Max({
      today,
      garmin: [{ day: '2026-08-01', value: 50 }],
      samples: apple,
    });
    expect(stale).toEqual({ value: 41.4, day: '2026-10-21', source: 'apple' });
    expect(currentVo2Max({
      today,
      garmin: [{ day: '2026-10-29', value: null }],
      samples: [{ id: 'merged:vo2_max:2026-10-29', kind: 'vo2_max', recordedOn: '2026-10-29', value: 44 }],
    })).toEqual({ value: 44, day: '2026-10-29', source: 'garmin' });
  });

  it('rates the Health Plan gap from the latest Garmin reading, not the mixed average', () => {
    const readings = emptyGarminReadings();
    readings.userMetrics = [
      { summaryId: 'g1', calendarDate: '2026-10-25', vo2Max: 45, vo2MaxCycling: 40, fitnessAge: null },
      { summaryId: 'g2', calendarDate: '2026-10-29', vo2Max: 44, vo2MaxCycling: 39, fitnessAge: null },
    ];
    const payload = buildStatsAnalysis({
      today,
      age: 45,
      sex: 'male',
      goal: null,
      fitnessGoal: 'elite',
      heightCm: 180,
      samples: apple,
      readings,
    });
    const vo2 = payload.stats.find((stat) => stat.id === 'vo2');
    expect(vo2?.value).toBe(44);
    expect(vo2?.goalTarget).toBe('52.1 ml/kg/min');
    expect(vo2?.goalGap).toBe(8.1);
    expect(vo2?.average).not.toBe(44);
    expect(payload.vo2Reading).toBe('latest VO2 max 44.0 (Garmin, 29 Oct)');
    const text = localStatsVerdict(payload);
    expect(text).toContain('latest VO2 max 44.0 (Garmin, 29 Oct), short of the 52.1 goal by 8.1');
    expect(text).not.toContain('VO2 max is 43.2');
  });
});
