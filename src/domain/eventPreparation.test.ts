import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  buildSystemPrompt,
  buildThumosContext,
  detectRisk,
  interestLabelsFromRows,
  resolveThumosMode,
} from './thumos';
import { buildVoiceBriefing } from './voice';

const example = 'a little apprehensive about a birthday celebration meal tonight';

const safety = { selfHarm: false, withdrawal: false, reasons: [] as string[] };

describe('event preparation', () => {
  const base = {
    now: new Date('2026-10-11T18:00:00.000Z'),
    displayName: 'Alex',
    sobrietyStartedAt: '2026-07-13T06:00:00.000Z',
    reasons: ['I want to remember my evenings.'],
    weeklySpendGbp: 40,
    weeklyUnits: 20,
    checkIns: [
      { createdAt: '2026-10-11T07:00:00.000Z', mood: 3, sleepHours: 5.5, craving: 2, note: 'A bit flat' },
    ],
    health: [],
    mode: 'steady' as const,
    safety,
    stage: 'stopped' as const,
    interests: ['Gym', 'Hiking'],
  };

  it('treats Ben’s birthday meal as event preparation, not a craving happening now', () => {
    expect(detectRisk(example)).toBe('planning');
    expect(resolveThumosMode({ requested: 'steady', userText: example, safety })).toBe('support');
    expect(detectRisk('I really want a drink at the birthday meal.')).toBe('acute');
    expect(detectRisk('There is a work do on Friday.')).toBe('planning');
    expect(detectRisk('Family gathering on Sunday.')).toBe('planning');
    expect(detectRisk('We are on holiday next week.')).toBe('planning');
    expect(detectRisk('I have a date tonight.')).toBe('planning');
    expect(detectRisk('A stressful meeting this afternoon.')).toBe('planning');
    expect(detectRisk('What is the date today?')).toBe('none');
  });

  it('asks for exercise, alternatives, and a drink plan, and keeps the safety rules', () => {
    const shape = detectRisk(example) === 'planning' ? 'planning' : 'acute';
    const prompt = buildSystemPrompt(buildThumosContext(base), 'support', undefined, {
      followUp: false,
      supportShape: shape,
      stage: 'stopped',
    });
    expect(shape).toBe('planning');
    expect(prompt).toContain('EVENT PREPARATION');
    expect(prompt).toContain('not just one tool');
    expect(prompt).toContain('3 to 5 concise');
    expect(prompt).toContain('Often end with no question');
    expect(prompt).toContain('short, specific follow-up');
    expect(prompt).toContain('set a reminder');
    expect(prompt).toContain('come back afterwards');
    expect(prompt).toContain('Gym, Hiking');
    expect(prompt).toContain('sleep 5.5h');
    expect(prompt).toContain('I want to remember my evenings.');
    expect(prompt).toContain('brisk walk');
    expect(prompt).toContain('endorphins');
    expect(prompt).toContain('general wellbeing advice, not medical advice');
    expect(prompt).toContain('cold shower');
    expect(prompt).toContain('breathing exercise in the app');
    expect(prompt).toContain('short walk outside');
    expect(prompt).toContain('proper meal');
    expect(prompt).toContain('alcohol-free options');
    expect(prompt).toContain("I'm driving");
    expect(prompt).toContain("I'm on a health kick");
    expect(prompt).toContain('Not tonight');
    expect(prompt).toContain('exit plan and transport');
    expect(prompt).toContain('ally who knows');
    expect(prompt).toContain('time to leave');
    expect(prompt).toContain('urge timer');
    expect(prompt).toContain('Gratitude Diary');
    expect(prompt).toContain('116 123');
    expect(prompt).toContain('NHS 111');
    expect(prompt).toContain('not a doctor');
    expect(prompt).not.toContain('Weave the aims below');
    expect(prompt).not.toContain('Do not mention the breathing exercise');
  });

  it('shares the same preparation prompt with voice, and withholds it on a self-harm turn', () => {
    const briefing = buildVoiceBriefing({
      requestedMode: 'steady',
      historyRows: [],
      context: base,
    });
    expect(briefing.instructions).toContain('EVENT PREPARATION');
    expect(briefing.instructions).toContain('brisk walk');
    expect(briefing.instructions).toContain('alcohol-free options');
    expect(briefing.instructions).toContain('exercise or an alternative and a drink plan');
    expect(briefing.instructions).toContain('Gym, Hiking');
    expect(briefing.crisisInstructions).toContain('116 123');
    expect(briefing.crisisInstructions).not.toContain('EVENT PREPARATION');
    expect(briefing.crisisInstructions).not.toContain('alcohol-free options');
    expect(briefing.crisisInstructions).not.toContain('I want to remember my evenings.');

    const crisis = buildSystemPrompt('CONTEXT', 'support', undefined, { selfHarm: true, supportShape: 'planning' });
    expect(crisis).toContain('Safety rules, follow exactly');
    expect(crisis).not.toContain('EVENT PREPARATION');
  });

  it('reads interest labels for the prompt, and both functions load them', () => {
    expect(interestLabelsFromRows([
      { interests: { label: ' Gym ' } },
      { interests: [{ label: 'Hiking' }, { label: 'Gym' }] },
    ])).toEqual(['Gym', 'Hiking']);
    expect(interestLabelsFromRows(null)).toEqual([]);
    const chat = readFileSync('supabase/functions/thumos-chat/index.ts', 'utf8');
    const voice = readFileSync('supabase/functions/thumos-voice-token/index.ts', 'utf8');
    const briefing = readFileSync('src/voice/briefing.ts', 'utf8');
    for (const source of [chat, voice]) {
      expect(source).toContain("from('profile_interests').select('interests(label)')");
      expect(source).toContain('interestLabelsFromRows');
    }
    expect(chat).toContain("detectRisk(content) === 'planning'");
    expect(briefing).toContain('profile.interestIds');
    expect(readFileSync('supabase/functions/_shared/voice.ts', 'utf8')).toContain('buildSystemPrompt');
  });
});
