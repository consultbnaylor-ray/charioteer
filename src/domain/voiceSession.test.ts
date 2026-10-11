import { describe, expect, it } from 'vitest';

import { SELF_HARM_NOTICE, WITHDRAWAL_NOTICE } from './safety';
import { buildVoiceBriefing, bytesToBase64, floatToPcm16, pcm16Base64FromFloat, pcm16ToFloat, readChannelSamples, resampleLinear } from './voice';
import { assembleTranscript, createVoiceRuntime, reduceVoiceEvent, voiceStatusLabel, type VoiceRuntime } from './voiceSession';

const ctx = {
  history: [{ role: 'user' as const, content: 'Yesterday was hard.' }],
  greeting: 'How are you feeling?',
  crisisInstructions: 'Stay with them. Call 999 or the Samaritans on 116 123.',
  playedMs: 0,
};

function run(events: unknown[], state = createVoiceRuntime(), context = ctx) {
  const commands = [];
  let current = state;
  for (const event of events) {
    const next = reduceVoiceEvent(current, event, context);
    current = next.state;
    commands.push(...next.commands);
  }
  return { state: current, commands };
}

function ready(partial: Partial<VoiceRuntime> = {}): VoiceRuntime {
  return { ...createVoiceRuntime(), configured: true, phase: 'listening', ...partial };
}

describe('voice PCM', () => {
  it('encodes mono 16-bit little-endian samples and decodes them', () => {
    const pcm = floatToPcm16([0, 1, -1]);
    expect(pcm).toEqual(Uint8Array.of(0, 0, 0xff, 0x7f, 0x00, 0x80));
    const floats = pcm16ToFloat(pcm);
    expect(floats[0]).toBe(0);
    expect(floats[1]).toBeCloseTo(1, 3);
    expect(floats[2]).toBe(-1);
    const decoded = atob(bytesToBase64(pcm));
    expect(decoded.charCodeAt(2)).toBe(0xff);
    expect(decoded.charCodeAt(3)).toBe(0x7f);
  });

  it('resamples to the rate xAI expects', () => {
    const up = resampleLinear([0, 1], 2, 4);
    expect(Array.from(up).map((sample) => Math.round(sample * 10) / 10)).toEqual([0, 0.5, 1, 1]);
    const same = pcm16Base64FromFloat(Float32Array.of(0, 1, -1), 24000);
    expect(same.length).toBeGreaterThan(0);
    const fromDevice = pcm16Base64FromFloat(Float32Array.of(0, 0, 1, 1), 48000);
    expect(pcm16ToFloat(Uint8Array.from(atob(fromDevice), (char) => char.charCodeAt(0))).length).toBe(2);
  });

  it('reads an odd-offset PCM16 view and a getChannelData-shaped channel without throwing', () => {
    const pcm = floatToPcm16([0, 1, -1]);
    const padded = new Uint8Array(pcm.byteLength + 1);
    padded.set(pcm, 1);
    const odd = padded.subarray(1);
    expect(odd.byteOffset % 2).toBe(1);
    expect(() => new Int16Array(odd.buffer, odd.byteOffset, pcm.byteLength / 2)).toThrow(/multiple of 2|start offset/);
    const floats = pcm16ToFloat(odd);
    expect(floats[0]).toBe(0);
    expect(floats[1]).toBeCloseTo(1, 3);
    expect(floats[2]).toBe(-1);

    const channel = new Float32Array([0.25, -0.5, 1]);
    const libraryShape = new Float32Array(channel.buffer, channel.byteOffset, channel.length);
    expect(libraryShape.byteOffset % 4).toBe(0);
    const misaligned = new ArrayBuffer(16);
    expect(() => new Float32Array(misaligned, 1, 1)).toThrow(/multiple of 4|start offset/);
    const copied = readChannelSamples({
      length: libraryShape.length,
      copyFromChannel(destination) {
        destination.set(libraryShape);
      },
    });
    expect(Array.from(copied)).toEqual([0.25, -0.5, 1]);
    const indexed = readChannelSamples({ length: libraryShape.length, getChannelData: () => libraryShape });
    expect(Array.from(indexed)).toEqual([0.25, -0.5, 1]);
  });
});

describe('voice transcripts and safety', () => {
  it('seeds history, greets, and does not store the greeting', () => {
    const opened = run([{ type: 'session.updated' }]);
    expect(opened.commands.map((command) => command.type === 'send' && command.body.type)).toEqual([
      'conversation.item.create',
      'conversation.item.create',
    ]);
    expect(JSON.stringify(opened.commands)).toContain('Yesterday was hard.');
    expect(JSON.stringify(opened.commands)).toContain('How are you feeling?');
    const done = run(
      [
        { type: 'response.created', response: { id: 'greet' } },
        { type: 'response.output_audio_transcript.delta', response_id: 'greet', delta: 'How are you feeling?' },
        { type: 'response.done', response: { id: 'greet' } },
      ],
      opened.state,
    );
    expect(done.commands.some((command) => command.type === 'persist')).toBe(false);
    expect(done.state.phase).toBe('listening');
    expect(done.state.greetingPending).toBe(false);
  });

  it('keeps the safety line when it is spoken before the greeting finishes', () => {
    const opened = run([{ type: 'session.updated' }]);
    const { state, commands } = run(
      [
        { type: 'conversation.item.input_audio_transcription.completed', transcript: 'I want to die.' },
        { type: 'response.created', response: { id: 'greet' } },
        { type: 'response.output_audio_transcript.done', response_id: 'greet', transcript: 'How are you feeling?' },
        { type: 'response.done', response: { id: 'greet' } },
        { type: 'response.created', response: { id: 'safety' } },
        { type: 'response.output_audio_transcript.done', response_id: 'safety', transcript: 'I am glad you said it.' },
        { type: 'response.done', response: { id: 'safety' } },
      ],
      opened.state,
    );
    expect(state.greetingPending).toBe(false);
    expect(state.awaitingSafetySpeech).toBe(false);
    const saved = commands.find((command) => command.type === 'persist');
    expect(saved && saved.type === 'persist' ? saved.user : '').toBe('I want to die.');
    expect(saved && saved.type === 'persist' ? saved.assistant : '').toContain(SELF_HARM_NOTICE);
    expect(saved && saved.type === 'persist' ? saved.assistant : '').not.toContain('How are you feeling?');
  });

  it('assembles both sides and stores the pair', () => {
    const { state, commands } = run(
      [
        { type: 'conversation.item.input_audio_transcription.updated', transcript: 'I want' },
        { type: 'conversation.item.input_audio_transcription.completed', transcript: 'I want a walk.' },
        { type: 'response.created', response: { id: 'r1' }, item_id: 'a1' },
        { type: 'response.output_audio_transcript.delta', response_id: 'r1', delta: 'A walk ' },
        { type: 'response.output_audio_transcript.delta', response_id: 'r1', delta: 'sounds right.' },
        { type: 'response.output_audio.delta', response_id: 'r1', item_id: 'a1', delta: 'AQID' },
        { type: 'response.done', response: { id: 'r1' } },
      ],
      ready(),
    );
    expect(state.phase).toBe('listening');
    const saved = commands.find((command) => command.type === 'persist');
    expect(saved).toMatchObject({ type: 'persist', user: 'I want a walk.', assistant: 'A walk sounds right.' });
    expect(commands.some((command) => command.type === 'play' && command.pcmBase64 === 'AQID')).toBe(true);
    expect(assembleTranscript(['A walk ', 'sounds right.'], 'A walk sounds right.')).toBe('A walk sounds right.');
  });

  it('speaks and pins the self-harm notice whatever the model had started to say', () => {
    const { state, commands } = run(
      [
        { type: 'response.created', response: { id: 'model' }, item_id: 'a1' },
        { type: 'response.output_audio_transcript.delta', response_id: 'model', delta: 'Tell me more about your day count.' },
        {
          type: 'conversation.item.input_audio_transcription.completed',
          transcript: 'I want to die.',
        },
        { type: 'response.done', response: { id: 'model' } },
        { type: 'response.created', response: { id: 'safety' } },
        { type: 'response.output_audio_transcript.done', response_id: 'safety', transcript: 'I am glad you said it. Call 116 123.' },
        { type: 'response.done', response: { id: 'safety' } },
      ],
      ready({ responseActive: true, responseId: 'model', assistantItemId: 'a1' }),
    );
    const bodies = commands.filter((command) => command.type === 'send').map((command) => command.body);
    expect(bodies.some((body) => body.type === 'response.cancel')).toBe(true);
    const spoken = bodies.find((body) => body.type === 'conversation.item.create' && (body.item as { type?: string }).type === 'force_message');
    expect(JSON.stringify(spoken)).toContain('116 123');
    expect(JSON.stringify(spoken)).toContain('999');
    expect(JSON.stringify(spoken)).toContain('Samaritans');
    expect(state.notices).toContain(SELF_HARM_NOTICE);
    const saved = commands.find((command) => command.type === 'persist');
    expect(saved && saved.type === 'persist' ? saved.assistant : '').toContain(SELF_HARM_NOTICE);
    expect(saved && saved.type === 'persist' ? saved.user : '').toBe('I want to die.');
    expect(saved && saved.type === 'persist' ? saved.assistant : '').not.toContain('day count');
    expect(voiceStatusLabel(state)).toBe('Listening');
  });

  it('speaks the withdrawal line and shows the GP, NHS 111, and 999 notice', () => {
    const { state, commands } = run(
      [
        {
          type: 'conversation.item.input_audio_transcription.completed',
          transcript: 'I have been drinking every day and I want to stop tonight. I have the shakes.',
        },
        { type: 'response.created', response: { id: 'safety' } },
        { type: 'response.done', response: { id: 'safety' } },
      ],
      ready(),
    );
    const spoken = commands.find((command) => command.type === 'send' && command.body.type === 'conversation.item.create');
    expect(JSON.stringify(spoken)).toContain('NHS 111');
    expect(JSON.stringify(spoken)).toContain('999');
    expect(JSON.stringify(spoken)).toContain('GP');
    expect(state.notices).toContain(WITHDRAWAL_NOTICE);
    const saved = commands.find((command) => command.type === 'persist');
    expect(saved && saved.type === 'persist' ? saved.assistant : '').toContain(WITHDRAWAL_NOTICE);
  });

  it('stops playback and truncates the unheard assistant audio when the user barges in', () => {
    const { state, commands } = run(
      [{ type: 'input_audio_buffer.speech_started', item_id: 'user-1' }],
      ready({ phase: 'speaking', assistantItemId: 'assistant-1', responseActive: true }),
      { ...ctx, playedMs: 840 },
    );
    expect(state.phase).toBe('userSpeaking');
    expect(commands.some((command) => command.type === 'stopPlayback')).toBe(true);
    const truncate = commands.find((command) => command.type === 'send' && command.body.type === 'conversation.item.truncate');
    expect(truncate && truncate.type === 'send' ? truncate.body : {}).toMatchObject({
      item_id: 'assistant-1',
      audio_end_ms: 840,
    });
  });

  it('uses friendly copy for a dropped connection and a denied microphone is not a raw error', () => {
    const dropped = run([{ type: 'local.socket-error' }], ready());
    expect(dropped.state.message).toMatch(/Text chat is still here/);
    expect(dropped.state.message).not.toMatch(/TypeError|websocket/i);
    const paused = run([{ type: 'local.background' }], ready());
    expect(paused.state.phase).toBe('paused');
    expect(voiceStatusLabel(paused.state)).toBe('Paused');
    const back = run([{ type: 'local.foreground' }], paused.state);
    expect(back.state.phase).toBe('listening');
  });
});

describe('voice briefing', () => {
  it('uses the same stage guidance as text, adapted for speech', () => {
    const briefing = buildVoiceBriefing({
      requestedMode: 'steady',
      historyRows: [],
      context: {
        now: new Date('2026-10-10T12:00:00.000Z'),
        displayName: 'Alex',
        sobrietyStartedAt: null,
        reasons: ['Be there for my sister'],
        weeklySpendGbp: null,
        weeklyUnits: null,
        checkIns: [],
        health: [],
        mode: 'steady',
        safety: { selfHarm: false, withdrawal: false, reasons: [] },
        stage: 'trying_to_stop',
        plannedQuitAt: '2026-11-01',
      },
    });
    expect(briefing.instructions).toContain('trying to stop');
    expect(briefing.instructions).toContain('Be there for my sister');
    expect(briefing.instructions).toContain('SPEECH DELIVERY');
    expect(briefing.instructions).toContain('British English');
    expect(briefing.instructions).toContain('NHS 111');
    expect(briefing.crisisInstructions).toContain('116 123');
    expect(briefing.crisisInstructions).not.toContain('Be there for my sister');
    expect(briefing.greeting).toBe('How are you feeling?');
  });
});
