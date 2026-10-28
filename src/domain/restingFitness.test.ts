import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { publishedCardioBand } from '@/domain/fitnessSnapshot';
import { restingChartGuide } from '@/domain/garminCharts';
import {
  CARD_NOT_ADVICE,
  LOW_RATE_COULD_BE_FIT,
  NHS_RESTING_LOW,
  LOW_RESTING_FIT_LINE,
  LOW_RESTING_FIT_MORE,
  lowRestingFitText,
  RESTING_CARE,
  restingFitnessComment,
  restingReadingIsLow,
  type RestingActivityDay,
  type RestingReading,
} from '@/domain/restingFitness';

const today = '2026-10-25';

function days(count: number, bpm: number): RestingReading[] {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(`${today}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() - index);
    return { day: date.toISOString().slice(0, 10), bpm };
  });
}

function activeMonth(): RestingActivityDay[] {
  return Array.from({ length: 30 }, (_, index) => {
    const date = new Date(`${today}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() - index);
    const moving = index < 20;
    return {
      day: date.toISOString().slice(0, 10),
      moderateMinutes: moving ? 40 : 0,
      vigorousMinutes: moving ? 10 : 0,
    };
  });
}

describe('resting heart rate and fitness', () => {
  it('marks the figure on the fitness card as low only under 60 bpm', () => {
    expect(NHS_RESTING_LOW).toBe(60);
    expect(restingReadingIsLow('59 bpm')).toBe(true);
    expect(restingReadingIsLow('48 bpm')).toBe(true);
    expect(restingReadingIsLow('60 bpm')).toBe(false);
    expect(restingReadingIsLow('62 bpm')).toBe(false);
    expect(restingReadingIsLow(null)).toBe(false);
    expect(LOW_RESTING_FIT_LINE).toBe(
      'A low resting heart rate can be a sign you are very fit. Speak to a GP if you feel unwell, dizzy, or faint.',
    );
    expect(LOW_RESTING_FIT_MORE).toBe(
      'A resting heart rate under 60 beats a minute may come with regular training. It can also have other causes, so this is not a judgement on its own.',
    );
    expect(LOW_RESTING_FIT_LINE).toMatch(/\bcan\b/);
    expect(LOW_RESTING_FIT_MORE).toMatch(/\bmay\b/);
    expect(lowRestingFitText('57 bpm')).toBe(LOW_RESTING_FIT_LINE);
    expect(lowRestingFitText('59 bpm')).toBe(LOW_RESTING_FIT_LINE);
    expect(lowRestingFitText('57 bpm', true)).toBe(LOW_RESTING_FIT_MORE);
    expect(lowRestingFitText('60 bpm')).toBeNull();
    expect(lowRestingFitText('60 bpm', true)).toBeNull();
    expect(lowRestingFitText('62 bpm')).toBeNull();
    expect(lowRestingFitText(null)).toBeNull();
    expect(readFileSync('src/ui/LowRestingFitNote.tsx', 'utf8')).toContain('lowRestingFitText(reading, detail)');
    expect(readFileSync('src/ui/YourFitness.tsx', 'utf8')).toContain('<LowRestingFitNote reading={view.resting.reading} />');
    expect(readFileSync('src/ui/HealthStatBoard.tsx', 'utf8')).toContain('<LowRestingFitNote');
  });

  it('says a low rate might be normal for someone who exercises most days with a high VO2', () => {
    const band = publishedCardioBand(42, 'male');
    expect(band).not.toBeNull();
    const comment = restingFitnessComment({
      today,
      resting: days(24, 52),
      activity: activeMonth(),
      vo2Max: (band?.high ?? 0) + 1,
      age: 42,
      sex: 'male',
    });
    expect(comment.tier).toBe('might');
    expect(comment.warning).toBe(false);
    expect(comment.verdict).toBe('A low resting rate might be normal with your exercise and cardio fitness.');
    expect(comment.verdict).not.toContain(LOW_RATE_COULD_BE_FIT);
    expect(comment.text).toContain('might be normal');
    expect(comment.text).toContain('consistent with');
    expect(comment.text).toContain('not a diagnosis');
    expect(comment.text).toContain('not medical advice');
    expect(comment.text).not.toMatch(/athletes often sit below 60/i);
  });

  it('does not comment from a single reading, and warns only on a sustained rate above 100', () => {
    const oneLow = restingFitnessComment({
      today,
      resting: [{ day: today, bpm: 54 }],
      activity: [],
      vo2Max: 50,
      age: 42,
      sex: 'male',
    });
    expect(oneLow.tier).toBe('early');
    expect(oneLow.warning).toBe(false);
    expect(oneLow.text).toContain("isn't reliable yet");
    expect(oneLow.verdict).toBe(
      `There isn't enough data yet for a month view. A reading under 60 bpm might need a closer look. ${LOW_RATE_COULD_BE_FIT}`,
    );
    expect(oneLow.verdict).not.toMatch(/not used as a sign of fitness/);
    expect(oneLow.text).not.toMatch(/might be normal|GP or NHS 111/);

    const short = restingFitnessComment({
      today,
      resting: days(8, 64),
      activity: [],
      vo2Max: null,
      age: 42,
      sex: 'male',
    });
    expect(short.tier).toBe('early');
    expect(short.verdict).toBe("There isn't enough data yet for a month view, and 64 bpm is within the usual adult range of 60-100 bpm (NHS).");
    expect(short.verdict).not.toMatch(/under 60/i);
    expect(`${short.verdict} ${short.text}`).not.toMatch(/not used as a sign of fitness/i);

    const oneHigh = restingFitnessComment({
      today,
      resting: [{ day: today, bpm: 112 }],
      activity: [],
      vo2Max: null,
      age: 42,
      sex: 'male',
    });
    expect(oneHigh.warning).toBe(false);
    expect(oneHigh.text).not.toContain('Contact your GP');

    const sustained = restingFitnessComment({
      today,
      resting: days(20, 108),
      activity: activeMonth(),
      vo2Max: 55,
      age: 42,
      sex: 'male',
    });
    expect(sustained.tier).toBe('dangerous');
    expect(sustained.warning).toBe(true);
    expect(sustained.verdict).toBe('These resting readings have stayed above 100 bpm.');
    expect(sustained.verdict).not.toContain(LOW_RATE_COULD_BE_FIT);
    expect(sustained.text).toContain('Contact your GP or NHS 111');
    expect(sustained.text).toContain('999');
    expect(sustained.text).toContain('not a diagnosis');
    const highGuide = restingChartGuide('30', [{ value: 108 }], sustained);
    expect(highGuide.warning).toBe(true);
    expect(highGuide.cardCare).toBe('Contact your GP or NHS 111.');
    expect(highGuide.care).toBe(RESTING_CARE);
    expect(highGuide.verdict).toBe(sustained.verdict);
  });

  it('asks for guidance when a low rate is sustained without the fitness pattern', () => {
    const comment = restingFitnessComment({
      today,
      resting: days(20, 48),
      activity: days(20, 0).map((row) => ({ day: row.day, moderateMinutes: 0, vigorousMinutes: 0 })),
      vo2Max: 28,
      age: 42,
      sex: 'male',
    });
    expect(comment.tier).toBe('unhealthy');
    expect(comment.warning).toBe(false);
    expect(comment.verdict).toBe(
      `A resting rate that stays under 60 bpm might need a closer look. ${LOW_RATE_COULD_BE_FIT}`,
    );
    expect(comment.verdict.match(/could mean you are very fit/g)).toHaveLength(1);
    expect(comment.text).toContain('seek professional guidance');
    expect(comment.text).toContain('150 minutes');
    expect(comment.text).not.toContain('might be normal');
    const guide = restingChartGuide('30', days(20, 48).map((row) => ({ value: row.bpm })), comment);
    expect(guide.warning).toBe(false);
    expect(guide.cardCare).toBeNull();
    expect(guide.verdict).toBe(comment.verdict);
    expect(guide.care).toBe(RESTING_CARE);
    expect(guide.care).toContain('Call 999 if you have chest pain, shortness of breath, or feel faint');
    expect(CARD_NOT_ADVICE).toBe('Not medical advice. Not a diagnosis.');

    const latestLow = days(16, 70);
    latestLow[0] = { ...latestLow[0], bpm: 54 };
    const oneOfMany = restingFitnessComment({
      today,
      resting: latestLow,
      activity: [],
      vo2Max: 28,
      age: 42,
      sex: 'male',
    });
    expect(oneOfMany.warning).toBe(false);
    expect(oneOfMany.verdict).toBe(`A reading under 60 bpm might need a closer look. ${LOW_RATE_COULD_BE_FIT}`);
  });
});
