import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { buildThumosContext } from './thumos';
import {
  buildHealthInsights,
  formatHealthValue,
  formatReadingLine,
  formatSleepHours,
  groupedReadings,
  londonDay,
  seriesForWindow,
  type HealthPoint,
} from './healthInsights';

const today = '2026-10-11';

function point(kind: string, value: number, recordedOn: string): HealthPoint {
  return { kind, value, recordedOn };
}

function days(kind: string, pairs: [string, number][]): HealthPoint[] {
  return pairs.map(([recordedOn, value]) => point(kind, value, recordedOn));
}

describe('health insight formatting', () => {
  it('writes UK numbers, sleep as hours and minutes, and a compact reading line', () => {
    expect(formatHealthValue('steps', 4682)).toBe('4,682 steps');
    expect(formatSleepHours(7 + 10 / 60)).toBe('7h 10m');
    expect(formatHealthValue('sleep_hours', 7)).toBe('7h');
    expect(formatHealthValue('resting_heart_rate', 62.4)).toBe('62 bpm');
    expect(formatHealthValue('hrv_sdnn', 46)).toBe('46 ms');
    expect(formatHealthValue('workout_minutes', 32)).toBe('32 min');
    expect(formatHealthValue('weight_kg', 74.2)).toBe('74.2 kg');
    expect(formatReadingLine('steps', 4682, '2026-10-10', 'healthkit')).toBe('4,682 steps · 10 Oct 2026 · Apple Health');
    expect(formatReadingLine('steps', 1000, '2026-10-10', 'manual')).toContain('Logged here');
    expect(londonDay('2026-06-15T23:30:00.000Z')).toBe('2026-06-16');
  });
});

describe('health insights', () => {
  it('compares this week with the previous week', () => {
    const samples = days('steps', [
      ['2026-10-05', 5800],
      ['2026-10-08', 6000],
      ['2026-09-28', 4800],
      ['2026-10-02', 5200],
    ]);
    const report = buildHealthInsights({ today, samples, soberOn: null, stage: 'exploring' });
    const steps = report.kinds.find((kind) => kind.kind === 'steps');
    expect(steps?.lines[0]).toBe('Steps up 18% on last week');
    expect(report.headlines).toContain('Steps up 18% on last week');
  });

  it('says about the same when the change is under 5%, and skips a zero previous week', () => {
    const flat = buildHealthInsights({
      today,
      soberOn: null,
      samples: days('weight_kg', [
        ['2026-10-05', 74],
        ['2026-10-08', 74.2],
        ['2026-09-28', 74.1],
        ['2026-10-02', 73.9],
      ]),
    });
    expect(flat.kinds.find((kind) => kind.kind === 'weight_kg')?.lines[0]).toBe('Weight is about the same as last week');
    expect(flat.headlines).not.toContain('Weight is about the same as last week');

    const zero = buildHealthInsights({
      today,
      soberOn: null,
      samples: days('steps', [
        ['2026-10-05', 1000],
        ['2026-10-08', 1200],
        ['2026-09-28', 0],
        ['2026-10-02', 0],
      ]),
    });
    expect(zero.kinds.find((kind) => kind.kind === 'steps')?.lines.some((line) => line.includes('%'))).toBe(false);
  });

  it('counts a streak of days at or above the person\'s own average, and stops at a gap', () => {
    const samples = days('steps', [
      ['2026-10-08', 9000],
      ['2026-10-09', 9000],
      ['2026-10-10', 9000],
      ['2026-10-11', 9000],
      ['2026-10-01', 2000],
      ['2026-10-02', 2000],
    ]);
    const report = buildHealthInsights({ today, samples, soberOn: null });
    expect(report.kinds.find((kind) => kind.kind === 'steps')?.lines).toContain(
      'Steps have been at or above your own recent average for 4 days.',
    );

    const gapped = buildHealthInsights({
      today,
      soberOn: null,
      samples: days('steps', [
        ['2026-10-11', 9000],
        ['2026-10-10', 9000],
        ['2026-10-08', 9000],
        ['2026-10-01', 2000],
      ]),
    });
    expect(gapped.kinds.find((kind) => kind.kind === 'steps')?.lines.join(' ')).not.toContain('for 3 days');
  });

  it('names the best day in the last 30 days and does not call a weight the best', () => {
    const report = buildHealthInsights({
      today,
      soberOn: null,
      samples: [
        ...days('steps', [['2026-10-02', 5000], ['2026-10-10', 8420], ['2026-09-01', 20000]]),
        ...days('resting_heart_rate', [['2026-10-03', 70], ['2026-10-09', 58]]),
        ...days('weight_kg', [['2026-10-01', 70], ['2026-10-10', 80]]),
      ],
    });
    expect(report.kinds.find((kind) => kind.kind === 'steps')?.lines).toContain(
      'Your highest step count was 8,420 on 10 Oct 2026.',
    );
    expect(report.kinds.find((kind) => kind.kind === 'resting_heart_rate')?.lines).toContain(
      'Your lowest resting heart rate was 58 bpm on 9 Oct 2026.',
    );
    expect(report.kinds.find((kind) => kind.kind === 'weight_kg')?.lines.join(' ')).not.toMatch(/best|highest|lowest/);
  });

  it('compares readings before and after the sober date, and sleep with the first sober month', () => {
    const report = buildHealthInsights({
      today,
      stage: 'stopped',
      soberOn: '2026-09-01',
      samples: days('resting_heart_rate', [
        ['2026-08-01', 70],
        ['2026-08-15', 66],
        ['2026-09-10', 64],
        ['2026-10-01', 60],
      ]),
    });
    expect(report.kinds.find((kind) => kind.kind === 'resting_heart_rate')?.lines).toContain(
      'Since you stopped drinking, your resting heart rate has dropped from 68 to 62 bpm.',
    );

    const sleep = buildHealthInsights({
      today,
      stage: 'stopped',
      soberOn: '2026-06-01',
      samples: days('sleep_hours', [
        ['2026-06-02', 6.5],
        ['2026-06-10', 6.5],
        ['2026-09-20', 7 + 10 / 60],
        ['2026-10-05', 7 + 10 / 60],
      ]),
    });
    expect(sleep.kinds.find((kind) => kind.kind === 'sleep_hours')?.lines).toContain(
      'Sleep is averaging 7h 10m, 40 minutes more than your first sober month.',
    );

    const exploring = buildHealthInsights({
      today,
      stage: 'exploring',
      soberOn: '2026-09-01',
      samples: days('resting_heart_rate', [
        ['2026-08-01', 70],
        ['2026-08-15', 66],
        ['2026-09-10', 64],
        ['2026-10-01', 60],
      ]),
    });
    expect(exploring.headlines.join(' ')).not.toContain('stopped drinking');
  });

  it('raises gentle flags from NHS figures and the person\'s own readings', () => {
    const resting = buildHealthInsights({
      today,
      soberOn: null,
      samples: days('resting_heart_rate', [
        ['2026-10-09', 110],
        ['2026-10-10', 108],
        ['2026-10-11', 104],
        ['2026-10-01', 70],
        ['2026-10-02', 72],
      ]),
    });
    const heart = resting.kinds.find((kind) => kind.kind === 'resting_heart_rate');
    const high = heart?.flags.find((flag) => flag.id === 'resting_high');
    expect(high?.detail).toContain('60 to 100');
    expect(high?.detail).toContain('tachycardia');
    expect(high?.detail).toContain('not medical advice');
    expect(high?.sourceUrl).toBe('https://www.royalpapworth.nhs.uk/our-services/cardiology/Heart-rhythm-disturbances');
    expect(high?.step).toContain('999');
    expect(high?.step).toContain('NHS 111');
    const rise = heart?.flags.find((flag) => flag.id === 'resting_rise');
    expect(rise?.headline).toContain('higher than last week');
    expect(rise?.detail).toContain('your own readings');

    const sleep = buildHealthInsights({
      today,
      soberOn: null,
      samples: days('sleep_hours', [
        ['2026-10-09', 5],
        ['2026-10-10', 5.5],
        ['2026-10-11', 4],
      ]),
    });
    const short = sleep.kinds.find((kind) => kind.kind === 'sleep_hours')?.flags[0];
    expect(short?.detail).toContain('7 to 9 hours');
    expect(short?.detail).toContain('not medical advice');
    expect(short?.sourceUrl).toBe('https://www.nhs.uk/conditions/insomnia/');
    expect(short?.step).toContain('Thumos');
    expect(short?.step).toContain('GP');

    const hrvSamples: HealthPoint[] = [
      point('hrv_sdnn', 40, '2026-09-10'),
      point('hrv_sdnn', 42, '2026-09-20'),
      point('hrv_sdnn', 38, '2026-10-01'),
      point('hrv_sdnn', 20, '2026-10-10'),
      point('hrv_sdnn', 22, '2026-10-11'),
    ];
    const hrv = buildHealthInsights({ today, soberOn: null, samples: hrvSamples });
    expect(hrv.kinds.find((kind) => kind.kind === 'hrv_sdnn')?.flags).toEqual([]);

    const lowRun = buildHealthInsights({
      today,
      soberOn: null,
      samples: [
        ...hrvSamples,
        point('hrv_sdnn', 21, '2026-10-09'),
      ],
    });
    const low = lowRun.kinds.find((kind) => kind.kind === 'hrv_sdnn')?.flags[0];
    expect(low?.headline).toContain('below your usual level');
    expect(low?.detail).toContain('your own');
    expect(low?.detail).toContain('3 of the last 7 days');
    expect(low?.detail).toContain('not a diagnosis');
    expect(low?.detail).not.toMatch(/\d+\s*ms is normal/);
    expect(low?.sourceUrl).toBe('');
    expect(low?.step).toContain('breathing exercise');
    expect(low?.step).toContain('GP');
    expect(low?.step).toContain('rest day');

    const sparse = buildHealthInsights({
      today,
      soberOn: null,
      samples: [
        point('hrv_sdnn', 18, '2026-10-09'),
        point('hrv_sdnn', 16, '2026-10-10'),
        point('hrv_sdnn', 15, '2026-10-11'),
      ],
    });
    const sparseHrv = sparse.kinds.find((kind) => kind.kind === 'hrv_sdnn');
    expect(sparseHrv?.flags).toEqual([]);
    expect(sparseHrv?.lines.join(' ')).not.toMatch(/down \d+%/);
    expect(sparse.headlines.join(' ')).not.toMatch(/Heart rate variability down/);

    const loss = buildHealthInsights({
      today,
      soberOn: null,
      samples: days('weight_kg', [
        ['2026-07-01', 80],
        ['2026-10-11', 74],
      ]),
    });
    const weight = loss.kinds.find((kind) => kind.kind === 'weight_kg')?.flags[0];
    expect(weight?.detail).toContain('5% to 10%');
    expect(weight?.detail).toContain('not medical advice');
    expect(weight?.sourceUrl).toBe('https://www.nhs.uk/conditions/malnutrition/');
    expect(weight?.step).toContain('GP');

    const gain = buildHealthInsights({
      today,
      soberOn: null,
      samples: days('weight_kg', [
        ['2026-07-01', 70],
        ['2026-10-11', 80],
      ]),
    });
    expect(gain.kinds.find((kind) => kind.kind === 'weight_kg')?.flags).toEqual([]);
  });

  it('keeps the week summary to three headlines, with flags first', () => {
    const report = buildHealthInsights({
      today,
      stage: 'stopped',
      soberOn: '2026-09-01',
      samples: [
        ...days('resting_heart_rate', [
          ['2026-10-09', 110],
          ['2026-10-10', 112],
          ['2026-10-11', 108],
          ['2026-10-01', 80],
          ['2026-10-02', 82],
          ['2026-08-01', 70],
          ['2026-08-15', 66],
        ]),
        ...days('sleep_hours', [
          ['2026-10-09', 5],
          ['2026-10-10', 5],
          ['2026-10-11', 5],
        ]),
        ...days('steps', [
          ['2026-10-05', 8000],
          ['2026-10-08', 8000],
          ['2026-09-28', 5000],
          ['2026-10-02', 5000],
        ]),
      ],
    });
    expect(report.headlines).toHaveLength(3);
    expect(report.headlines[0]).toContain('above 100');
    expect(report.headlines[1]).toContain('higher than last week');
    expect(report.headlines.join(' ')).not.toContain('Steps up');
  });

  it('uses one value per day and only plots the chosen window', () => {
    const samples = [
      point('steps', 1000, '2026-10-11'),
      point('steps', 9000, '2026-10-11'),
      point('steps', 2000, '2026-09-01'),
    ];
    expect(seriesForWindow(samples, 'steps', today, 7).map((item) => item.value)).toEqual([1000]);
    const grouped = groupedReadings(samples);
    expect(grouped[0]?.rows.map((row) => row.value)).toEqual([1000, 9000, 2000]);
  });
});

describe('Thumos health insights', () => {
  const base = {
    now: new Date('2026-03-01T12:00:00.000Z'),
    displayName: 'Alex',
    sobrietyStartedAt: '2026-01-13T06:00:00.000Z',
    reasons: ['I want to remember my evenings.'],
    weeklySpendGbp: 45,
    weeklyUnits: 28,
    checkIns: [],
    health: [{ kind: 'steps', latest: 8400, previous: 6100, unit: 'steps' }],
    mode: 'growth' as const,
    safety: { selfHarm: false, withdrawal: false, reasons: [] },
  };

  it('adds the summary when health consent produced insights, and withholds it on self-harm', () => {
    const context = buildThumosContext({ ...base, healthInsights: ['Steps up 18% on last week'] });
    expect(context).toContain('8400 steps');
    expect(context).toContain('Health insights, not medical advice:');
    expect(context).toContain('Steps up 18% on last week');
    expect(context).toContain('What does HRV mean?');
    expect(context).toContain('rough examples, not a target');
    expect(context).toContain('not a diagnosis');
    const crisis = buildThumosContext({
      ...base,
      healthInsights: ['Steps up 18% on last week'],
      safety: { selfHarm: true, withdrawal: false, reasons: ['self-harm or suicidal language'] },
    });
    expect(crisis).not.toContain('Steps up 18%');
    expect(crisis).not.toContain('8400 steps');
    expect(crisis).not.toContain('What does HRV mean?');
    expect(crisis).toContain('health insights');
  });

  it('sends insights only when health consent is on', () => {
    const chat = readFileSync('supabase/functions/thumos-chat/index.ts', 'utf8');
    const voice = readFileSync('supabase/functions/thumos-voice-token/index.ts', 'utf8');
    const briefing = readFileSync('src/voice/briefing.ts', 'utf8');
    const chatHandler = chat.slice(chat.indexOf('Deno.serve'));
    const voiceHandler = voice.slice(voice.indexOf('Deno.serve'));
    expect(chatHandler).toContain('consent_health');
    expect(chatHandler.indexOf('consent_health')).toBeLessThan(chatHandler.indexOf('buildThumosContext'));
    expect(chatHandler).toContain('healthInsights');
    expect(chatHandler).toContain('.limit(1000)');
    expect(voiceHandler).toContain('consent_health');
    expect(voiceHandler).toContain('healthInsights');
    expect(voiceHandler).toContain('recorded_on');
    expect(briefing).toContain('consentHealth');
    expect(briefing).toContain('healthInsights');
    expect(briefing).not.toMatch(/progress_photos|progressPhotos|progress-photos/);
  });
});
