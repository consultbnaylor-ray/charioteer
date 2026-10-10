import { describe, expect, it } from 'vitest';
import { earnedMilestones, milestoneReached } from './milestones';
import { planRelapse, soberElapsed } from './sober';
import { formatGbp, savingsFromTypicalWeek, yearlyFromWeekly } from './savings';
import { detectSafety, ensureSafetyNotices, firstSafetyHit, pinnedSafetyNotices, SELF_HARM_NOTICE, WITHDRAWAL_NOTICE } from './safety';
import { encodeSse, parseSseBuffer } from './sse';
import { buildChatCompletionBody, buildSystemPrompt, buildThumosContext, completionDeltaText, conversationCues, detectCommittedAction, detectRisk, historyTurnsForModel, inferThumosMode, isThumosFollowUp, OFFLINE_COACH_MESSAGE, resolveThumosMode, THUMOS_CHAT, thumosReasoningEffort } from './thumos';
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

  it('uses the NHS 52-week year for a typical week', () => {
    expect(yearlyFromWeekly(5 * 222, 0)).toBe(57_720);
    expect(yearlyFromWeekly(-4, 2)).toBe(0);
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

  it('still shows the fixed notice when the model already named the helpline', () => {
    const hit = detectSafety('I want to kill myself. I am shaking and sweating because I stopped drinking.');
    const model = 'Please call the Samaritans on 116 123, NHS 111, or 999.';
    const reply = ensureSafetyNotices(model, hit);
    expect(reply).toContain(SELF_HARM_NOTICE);
    expect(reply).toContain(WITHDRAWAL_NOTICE);
    expect(reply).toContain('Contact your GP');
    expect(pinnedSafetyNotices(hit)).toEqual([SELF_HARM_NOTICE, WITHDRAWAL_NOTICE]);
    expect(firstSafetyHit(['I am fine', model, 'I want to die'])).toMatchObject({ selfHarm: true });
    expect(pinnedSafetyNotices({ selfHarm: false, withdrawal: false, reasons: [] })).toEqual([]);
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
    expect(inferThumosMode({
      sos: false,
      hasHistory: true,
      latestMood: 5,
      latestCraving: 1,
      userText: 'Mates are all going to the pub after football and I do not know if I can handle it.',
    })).toBe('support');
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
    expect(prompt).toContain('47 days, 6 hours');
    expect(OFFLINE_COACH_MESSAGE).toContain('not a reply from the model');
  });

  it('treats craving language as support even when the client asked for another mode', () => {
    const safety = { selfHarm: false, withdrawal: false };
    expect(resolveThumosMode({
      requested: 'steady',
      userText: 'The urge is loud tonight. I keep thinking about the off-licence.',
      safety,
    })).toBe('support');
    expect(resolveThumosMode({
      requested: 'growth',
      userText: 'I slept properly and went for a walk. I feel all right.',
      safety,
    })).toBe('growth');
    expect(resolveThumosMode({
      requested: 'growth',
      userText: 'I feel shaky and I had a seizure when I stopped.',
      safety: { selfHarm: false, withdrawal: true },
    })).toBe('support');
    expect(resolveThumosMode({
      requested: 'support',
      userText: 'Hello',
      safety,
    })).toBe('support');
    expect(resolveThumosMode({ requested: 'nope', userText: 'Hello', safety })).toBe('steady');
  });

  it('asks a craving reply to follow the support shape and a good day to ask a question', () => {
    const context = buildThumosContext(base);
    const support = buildSystemPrompt(context, 'support');
    expect(support).toContain('3 to 6 sentences');
    expect(support).toContain('end with one question');
    expect(support).toContain('Weave the aims below');
    expect(support).toContain('breathing exercise');
    expect(support).toContain('10-minute urge timer');
    expect(support).toContain('what they think will happen if they drink');
    expect(support).toContain('sober time');
    expect(support).toContain('at most one personal reason');
    expect(support).toContain('Name the breathing exercise, the 10-minute urge timer, and a walk, jog, or run');
    expect(support).toContain('Do not guess he or she');
    expect(support).toContain('not a result already achieved');
    expect(support).toContain('undo their progress');
    expect(support).toContain('I want to remember my evenings.');
    expect(support).toContain('47 days, 6 hours');
    expect(support).toContain('mood 4/5');
    expect(support).toContain('8400 steps');
    expect(support).not.toContain('120 words');
    expect(support).not.toContain('What will you do for the next ten minutes?');
    const growth = buildSystemPrompt(context, 'growth');
    expect(growth).toContain('Cite one real figure');
    expect(growth).toContain('one specific next step');
    expect(growth).toContain('8400 steps');
    expect(growth).toContain('End with one question');
    expect(growth).not.toContain('120 words');
    expect(growth).toContain('That is good');
  });

  it('uses a different instruction for a follow-up, and a plan when the risk is still ahead', () => {
    const context = buildThumosContext(base);
    const first = buildSystemPrompt(context, 'support', undefined, { followUp: false, supportShape: 'acute' });
    const follow = buildSystemPrompt(context, 'support', undefined, { followUp: true, supportShape: 'acute' });
    const plan = buildSystemPrompt(context, 'support', undefined, { followUp: false, supportShape: 'planning' });
    expect(first).not.toBe(follow);
    expect(first).toContain('Weave the aims below');
    expect(follow).toContain('This is a follow-up');
    expect(follow).toContain('usually wants more than one');
    expect(follow).toContain('one concrete thing to do now');
    expect(follow).toContain('breathing exercise');
    expect(follow).not.toContain('Weave the aims below');
    expect(plan).toContain('soft drink');
    expect(plan).toContain('way to leave');
    expect(plan).toContain('Do not mention the breathing exercise');
    expect(plan).not.toContain('Weave the aims below');
    expect(follow).not.toContain('soft drink they can order');
  });

  it('lets a committed action go without another question', () => {
    expect(detectCommittedAction('Fine. I\'ll do the breathing thing')).toBe('breathe');
    expect(detectCommittedAction('going for a walk')).toBe('walk');
    expect(detectCommittedAction('I\'ll set the timer')).toBe('timer');
    expect(detectCommittedAction('I went for a walk. I feel all right.')).toBeNull();
    expect(detectCommittedAction('I just think one won\'t hurt.')).toBeNull();
    const context = buildThumosContext(base);
    const sendOff = buildSystemPrompt(context, 'support', undefined, { followUp: true, committedAction: 'breathe' });
    expect(sendOff).toContain('1 or 2 sentences');
    expect(sendOff).toContain('Do not ask a question');
    expect(sendOff).toContain('breathing exercise on this screen');
    expect(sendOff).toContain('you will be here after');
    expect(sendOff).not.toContain('end with one question');
    expect(sendOff).toContain('Do not invite another activity');
    expect(sendOff).not.toContain('What else might you try');
    expect(buildSystemPrompt(context, 'support', undefined, { committedAction: 'walk' })).toContain('Affirm the walk');
    expect(buildSystemPrompt(context, 'support', undefined, { committedAction: 'timer' })).toContain('10-minute urge timer on this screen');
  });

  it('keeps a self-harm reply on the person and help, and withholds the sober count', () => {
    const crisisContext = buildThumosContext({ ...base, safety: { selfHarm: true, withdrawal: false, reasons: ['self-harm or suicidal language'] } });
    expect(crisisContext).not.toContain('47 days');
    expect(crisisContext).not.toContain('I want to remember my evenings.');
    const prompt = buildSystemPrompt(crisisContext, 'support', undefined, { selfHarm: true, supportShape: 'acute' });
    expect(prompt).toContain('getting help now');
    expect(prompt).toContain('116 123');
    expect(prompt).toContain('999');
    expect(prompt).toContain('someone they trust');
    expect(prompt).toContain('Do not mention sober time');
    expect(prompt).not.toContain('Weave the aims below');
    expect(prompt).not.toContain('47 days');
    expect(prompt).not.toContain('end with one question');
  });

  it('tells a later turn which sober count and reasons were already used', () => {
    const cues = conversationCues({
      history: [
        { role: 'assistant', content: 'You have nineteen days and three hours sober, for your kids.' },
        { role: 'user', content: 'I just think one won\'t hurt.' },
        { role: 'assistant', content: 'One usually turns into more. Your sleep is a reason to leave it.' },
      ],
      reasons: ['kids', 'sleep', 'anxiety'],
    });
    expect(cues.soberTimeAlreadySaid).toBe(true);
    expect(cues.reasonsAlreadyUsed).toEqual(['kids', 'sleep']);
    const prompt = buildSystemPrompt('CONTEXT', 'support', undefined, {
      followUp: true,
      soberTimeAlreadySaid: true,
      reasonsAlreadyUsed: cues.reasonsAlreadyUsed,
    });
    expect(prompt).toContain('already stated the sober time');
    expect(prompt).toContain('kids; sleep');
    expect(prompt).toContain('at most once in the whole conversation');
  });

  it('treats social pressure and permission-giving as support, and keeps a good day in growth', () => {
    const safety = { selfHarm: false, withdrawal: false };
    const pub = 'Mates are all going to the pub after football Saturday and I don\'t know if I can handle it.';
    expect(detectRisk(pub)).toBe('planning');
    expect(resolveThumosMode({ requested: 'growth', userText: pub, safety })).toBe('support');
    expect(detectRisk('The wedding is on Saturday and there will be a bar.')).toBe('planning');
    expect(detectRisk('It is a stag do and I am not sure I can handle it.')).toBe('planning');
    expect(detectRisk('I really want a drink tonight, it\'s been a rough day at work.')).toBe('acute');
    expect(detectRisk('I just think one won\'t hurt.')).toBe('acute');
    expect(detectRisk('I deserve a drink.')).toBe('acute');
    expect(detectRisk('A few won\'t matter.')).toBe('acute');
    expect(detectRisk('I slept properly and went for a walk. I feel all right.')).toBe('none');
    expect(resolveThumosMode({
      requested: 'growth',
      userText: 'I slept properly and went for a walk. I feel all right.',
      safety,
    })).toBe('growth');
  });

  it('sends the recent conversation, oldest first, and does not repeat the latest line', () => {
    const rows = [
      { role: 'assistant', content: 'Earlier reply about the rough day.', createdAt: '2026-03-02T18:01:00.000Z' },
      { role: 'user', content: 'I really want a drink tonight, it has been a rough day at work.', createdAt: '2026-03-02T18:00:00.000Z' },
      { role: 'guide', content: 'How are you feeling?', createdAt: '2026-03-02T17:00:00.000Z' },
    ];
    expect(isThumosFollowUp(rows)).toBe(true);
    expect(isThumosFollowUp([{ role: 'guide' }])).toBe(false);
    const history = historyTurnsForModel(rows);
    expect(history.map((turn) => turn.content)).toEqual([
      'How are you feeling?',
      'I really want a drink tonight, it has been a rough day at work.',
      'Earlier reply about the rough day.',
    ]);
    expect(history.map((turn) => turn.role)).toEqual(['assistant', 'user', 'assistant']);
    const body = buildChatCompletionBody({
      system: 'Stay with them.',
      history,
      user: 'I just think one won\'t hurt.',
      stream: true,
    });
    expect(body.messages.map((message) => message.role)).toEqual(['system', 'assistant', 'user', 'assistant', 'user']);
    expect(body.messages[2].content).toContain('rough day');
    expect(body.messages[3].content).toContain('Earlier reply');
    expect(body.messages[4].content).toBe('I just think one won\'t hurt.');
    const duplicated = buildChatCompletionBody({
      system: 'Stay with them.',
      history: [...history, { role: 'user', content: 'I just think one won\'t hurt.' }],
      user: 'I just think one won\'t hurt.',
      stream: true,
    });
    expect(duplicated.messages.filter((message) => message.content === 'I just think one won\'t hurt.')).toHaveLength(1);
  });

  it('asks grok-4.3 for low reasoning and streams the answer', () => {
    const body = buildChatCompletionBody({
      system: 'Be brief.',
      history: Array.from({ length: 12 }, (_, index) => ({ role: 'user' as const, content: `turn ${index}` })),
      user: 'The urge is loud',
      stream: true,
    });
    expect(body.model).toBe('grok-4.3');
    expect(body.model).toBe(THUMOS_CHAT.model);
    expect(body.reasoning_effort).toBe('low');
    expect(body.stream).toBe(true);
    expect(body.max_tokens).toBeUndefined();
    expect(body.messages.filter((message) => message.role === 'user')).toHaveLength(THUMOS_CHAT.historyLimit + 1);
    expect(thumosReasoningEffort('grok-4.3')).toBe('low');
    expect(thumosReasoningEffort('grok-4.3-latest')).toBe('low');
    expect(thumosReasoningEffort('grok-4.7')).toBe('low');
    const older = buildChatCompletionBody({ model: 'grok-4.7', system: 'Be brief.', history: [], user: 'Hi', stream: true });
    expect(older.reasoning_effort).toBe('low');
    expect(older.max_tokens).toBeUndefined();
    const unknown = buildChatCompletionBody({ model: 'grok-other', system: 'Be brief.', history: [], user: 'Hi', stream: false });
    expect(unknown.reasoning_effort).toBe('none');
    expect(unknown.max_tokens).toBe(THUMOS_CHAT.maxTokens);
    expect(GROK_VOICE.chatModel).toBe('grok-4.3');
  });

  it('streams answer text and ignores a reasoning trace', () => {
    expect(completionDeltaText({ choices: [{ delta: { reasoning_content: 'thinking', content: 'Hello' } }] })).toBe('Hello');
    expect(completionDeltaText({ choices: [{ delta: { reasoning_content: 'only thinking' } }] })).toBe('');
    const events: string[] = [];
    const first = parseSseBuffer(encodeSse({ type: 'delta', text: 'Hel' }), (event) => {
      if (event.type === 'delta') events.push(event.text);
    });
    expect(first).toBe('');
    expect(events).toEqual(['Hel']);
    const rest = parseSseBuffer(`data: ${JSON.stringify({ type: 'delta', text: 'lo' })}\n\ndata: {"type":"done","reply":"Hello","role":"assistant","ok":true}`, () => undefined);
    expect(rest.startsWith('data:')).toBe(true);
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
