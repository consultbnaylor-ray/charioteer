import { describe, expect, it } from 'vitest';
import { earnedMilestones, milestoneReached } from './milestones';
import { planRelapse, soberElapsed } from './sober';
import { formatGbp, savingsFromTypicalWeek } from './savings';
import { detectSafety, ensureSafetyNotices, SELF_HARM_NOTICE, WITHDRAWAL_NOTICE } from './safety';
import { buildSystemPrompt, buildThumosContext, inferThumosMode, OFFLINE_COACH_MESSAGE } from './thumos';
import { ALCOHOL_FACTS } from './facts';
import { browserSocketProtocols, buildVoiceSessionUpdate, GROK_VOICE } from './voice';

const at = (iso: string) => new Date(iso);

describe('sober counter', () => {
  it('counts whole days and leftover hours', () => {
    const started = at('2026-01-01T00:00:00.000Z');
    const now = at('2026-02-17T06:40:00.000Z');
    expect(soberElapsed(started, now)).toMatchObject({ days: 47, hours: 6 });
  });

  it('does not go negative if the start is in the future', () => {
    expect(soberElapsed(at('2026-05-02T00:00:00.000Z'), at('2026-05-01T00:00:00.000Z'))).toMatchObject({
      days: 0,
      hours: 0,
      totalMs: 0,
    });
  });

  it('keeps the previous stretch when the clock resets', () => {
    const started = at('2026-01-01T00:00:00.000Z');
    const now = at('2026-01-13T03:00:00.000Z');
    const plan = planRelapse(started, now, ' I had a drink. ');
    expect(plan.record.daysKept).toBe(12);
    expect(plan.record.note).toBe('I had a drink.');
    expect(plan.nextStartedAt.toISOString()).toBe(now.toISOString());
    expect(plan.record.previousStartedAt).toBe(started.toISOString());
  });
});

describe('savings', () => {
  it('pro-ratas a typical week', () => {
    const week = 7 * 24 * 60 * 60 * 1000;
    const saved = savingsFromTypicalWeek(70, 14, week * 2);
    expect(saved.moneyGbp).toBe(140);
    expect(saved.units).toBe(28);
  });

  it('counts a partial week and ignores negative inputs', () => {
    const threeAndAHalfDays = 3.5 * 24 * 60 * 60 * 1000;
    const saved = savingsFromTypicalWeek(70, 14, threeAndAHalfDays);
    expect(saved.moneyGbp).toBe(35);
    expect(saved.units).toBe(7);
    expect(savingsFromTypicalWeek(-10, -4, threeAndAHalfDays).moneyGbp).toBe(0);
  });

  it('formats sterling for the UK', () => {
    expect(formatGbp(12.5)).toBe('£12.50');
  });
});

describe('milestones', () => {
  const start = at('2026-01-15T08:00:00.000Z');

  it('awards 24 hours, 7, 30 and 90 days from elapsed time', () => {
    expect(milestoneReached('24h', start, at('2026-01-16T07:59:00.000Z'))).toBe(false);
    expect(milestoneReached('24h', start, at('2026-01-16T08:00:00.000Z'))).toBe(true);
    expect(milestoneReached('7d', start, at('2026-01-22T08:00:00.000Z'))).toBe(true);
    expect(milestoneReached('30d', start, at('2026-02-14T08:00:00.000Z'))).toBe(true);
    expect(milestoneReached('90d', start, at('2026-04-15T08:00:00.000Z'))).toBe(true);
    expect(earnedMilestones(start, at('2026-01-20T08:00:00.000Z')).map((item) => item.key)).toEqual(['24h']);
  });

  it('uses calendar months for six months and one year', () => {
    expect(milestoneReached('6m', start, at('2026-07-15T07:59:00.000Z'))).toBe(false);
    expect(milestoneReached('6m', start, at('2026-07-15T08:00:00.000Z'))).toBe(true);
    expect(milestoneReached('1y', start, at('2027-01-15T08:00:00.000Z'))).toBe(true);
  });

  it('clamps month-end dates', () => {
    const endOfMarch = at('2026-03-31T12:00:00.000Z');
    expect(milestoneReached('6m', endOfMarch, at('2026-09-30T12:00:00.000Z'))).toBe(true);
    expect(milestoneReached('6m', endOfMarch, at('2026-09-30T11:59:00.000Z'))).toBe(false);
  });
});

describe('safety triggers', () => {
  it('flags withdrawal symptoms in an alcohol context', () => {
    const hit = detectSafety("I'm shaking and sweating and I haven't had a drink since yesterday.");
    expect(hit.withdrawal).toBe(true);
    expect(hit.selfHarm).toBe(false);
  });

  it('flags heavy daily drinking with an abrupt stop', () => {
    const hit = detectSafety('I drink a bottle of spirits every day and I want to stop cold turkey tonight.');
    expect(hit.withdrawal).toBe(true);
  });

  it('does not treat an ordinary decision to stop as a medical emergency', () => {
    expect(detectSafety('I want to stop drinking.').withdrawal).toBe(false);
    expect(detectSafety("I'm 10 days sober and feeling good.").withdrawal).toBe(false);
    expect(detectSafety('I feel shaky about the job interview.').withdrawal).toBe(false);
    expect(detectSafety('I was sweating at the gym.').withdrawal).toBe(false);
  });

  it('flags suicidal language and ignores a figure of speech', () => {
    expect(detectSafety('I want to kill myself.').selfHarm).toBe(true);
    expect(detectSafety('I have been thinking about suicide.').selfHarm).toBe(true);
    expect(detectSafety('This deadline is killing me.').selfHarm).toBe(false);
  });

  it('adds the fixed helpline text when a model reply forgets it', () => {
    const withdrawal = ensureSafetyNotices('Try to rest.', detectSafety('I had a seizure when I stopped drinking.'));
    expect(withdrawal).toContain(WITHDRAWAL_NOTICE);
    expect(withdrawal).toContain('NHS 111');
    const crisis = ensureSafetyNotices('I hear you.', detectSafety('I do not want to be alive.'));
    expect(crisis).toContain(SELF_HARM_NOTICE);
    expect(crisis).toContain('116 123');
  });
});

describe('Thumos context', () => {
  const base = {
    now: at('2026-03-01T12:00:00.000Z'),
    displayName: 'Alex',
    sobrietyStartedAt: '2026-01-13T06:00:00.000Z',
    reasons: ['I want to remember my evenings.'],
    weeklySpendGbp: 45,
    weeklyUnits: 28,
    checkIns: [
      { createdAt: '2026-02-28T21:00:00.000Z', mood: 4, sleepHours: 7.5, craving: 2, note: 'Quiet night' },
    ],
    health: [{ kind: 'steps', latest: 8400, previous: 6100, unit: 'steps' }],
    mode: 'growth' as const,
    safety: { selfHarm: false, withdrawal: false, reasons: [] },
  };

  it('chooses support, growth, or an opening question', () => {
    expect(inferThumosMode({ sos: true, hasHistory: true })).toBe('support');
    expect(inferThumosMode({ sos: false, hasHistory: true, latestCraving: 8, latestMood: 2 })).toBe('support');
    expect(inferThumosMode({ sos: false, hasHistory: true, userText: 'The urge is loud', latestMood: 4 })).toBe('support');
    expect(inferThumosMode({ sos: false, hasHistory: true, latestMood: 5, latestCraving: 1 })).toBe('growth');
    expect(inferThumosMode({ sos: false, hasHistory: false })).toBe('opening');
  });

  it('puts sober time, reasons, check-ins, and health into the prompt', () => {
    const context = buildThumosContext(base);
    const prompt = buildSystemPrompt(context, 'growth');
    expect(context).toContain('I want to remember my evenings.');
    expect(context).toContain('mood 4/5');
    expect(context).toContain('8400 steps');
    expect(prompt).toContain('not a doctor');
    expect(prompt).toContain('116 123');
    expect(prompt).toContain('NHS 111');
    expect(prompt).toContain('CURATED FACTS');
    expect(prompt).toContain(ALCOHOL_FACTS[0].text.slice(0, 40));
    expect(buildSystemPrompt(context, 'opening')).toContain('Ask how they are feeling');
    expect(OFFLINE_COACH_MESSAGE).toContain('not a reply from the model');
  });

  it('does not ask the model to invent numbers', () => {
    const prompt = buildSystemPrompt('CONTEXT', 'support');
    expect(prompt).toMatch(/Do not invent statistics/i);
    expect(prompt).toContain('10,473');
  });
});

describe('voice session adapter', () => {
  it('uses the verified British voice and browser auth protocol', () => {
    expect(GROK_VOICE.voice).toBe('leo');
    expect(GROK_VOICE.languageHint).toBe('en');
    expect(browserSocketProtocols('abc')).toEqual(['xai-client-secret.abc']);
    expect(buildVoiceSessionUpdate('Stay steady.')).toMatchObject({
      type: 'session.update',
      session: {
        voice: 'leo',
        instructions: 'Stay steady.\n\nSpeak British English.',
        turn_detection: { type: 'server_vad' },
      },
    });
  });
});
