/**
 * Pure Grok Voice event handling: transcripts, barge-in, and safety.
 * No sockets and no audio devices. The call controller applies the commands.
 */
import { ensureSafetyNotices, pinnedSafetyNotices, type SafetyHit } from './safety.ts';
import { safetyFromText } from './thumos.ts';
import {
  buildVoiceSessionUpdate,
  forceSpokenLine,
  historySeedEvent,
  spokenSafetyLine,
  truncateAssistantItem,
  VOICE_COPY,
  type VoiceHistoryTurn,
} from './voice.ts';

export type VoicePhase =
  | 'connecting'
  | 'listening'
  | 'userSpeaking'
  | 'speaking'
  | 'paused'
  | 'ended'
  | 'error';

export type VoiceRuntime = {
  phase: VoicePhase;
  muted: boolean;
  configured: boolean;
  liveUser: string;
  liveAssistant: string;
  userText: string;
  assistantText: string;
  userReady: boolean;
  assistantReady: boolean;
  greetingPending: boolean;
  /** Set once the greeting's response.created has been seen, so a later safety response is not mistaken for it. */
  greetingBound: boolean;
  greetingResponseId: string | null;
  responseActive: boolean;
  responseId: string | null;
  assistantItemId: string | null;
  droppedResponseId: string | null;
  awaitingSafetySpeech: boolean;
  /** True once the verbatim safety line has its own response.created. */
  safetyResponseSeen: boolean;
  safety: SafetyHit;
  notices: string[];
  message: string | null;
  pauseReason: 'background' | 'interruption' | null;
};

export type VoiceCommand =
  | { type: 'send'; body: Record<string, unknown> }
  | { type: 'play'; pcmBase64: string }
  | { type: 'stopPlayback' }
  | { type: 'persist'; user: string; assistant: string }
  | { type: 'fail'; message: string };

export type VoiceReduceContext = {
  history: VoiceHistoryTurn[];
  greeting: string;
  crisisInstructions: string;
  playedMs: number;
};

const EMPTY_SAFETY: SafetyHit = { selfHarm: false, withdrawal: false, reasons: [] };

export function createVoiceRuntime(): VoiceRuntime {
  return {
    phase: 'connecting',
    muted: false,
    configured: false,
    liveUser: '',
    liveAssistant: '',
    userText: '',
    assistantText: '',
    userReady: false,
    assistantReady: false,
    greetingPending: false,
    greetingBound: false,
    greetingResponseId: null,
    responseActive: false,
    responseId: null,
    assistantItemId: null,
    droppedResponseId: null,
    awaitingSafetySpeech: false,
    safetyResponseSeen: false,
    safety: EMPTY_SAFETY,
    notices: [],
    message: null,
    pauseReason: null,
  };
}

export function voiceStatusLabel(state: Pick<VoiceRuntime, 'phase' | 'muted' | 'pauseReason'>): string {
  if (state.phase === 'connecting') return 'Connecting';
  if (state.phase === 'error') return 'Voice unavailable';
  if (state.phase === 'ended') return 'Call ended';
  if (state.phase === 'paused') {
    return state.pauseReason === 'interruption' ? 'Paused' : 'Paused';
  }
  if (state.muted && state.phase !== 'speaking') return 'Muted';
  if (state.phase === 'userSpeaking') return 'Hearing you';
  if (state.phase === 'speaking') return 'Thumos is speaking';
  return 'Listening';
}

function clone(state: VoiceRuntime): VoiceRuntime {
  return { ...state, safety: { ...state.safety, reasons: [...state.safety.reasons] }, notices: [...state.notices] };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function text(event: Record<string, unknown>, key: string): string {
  const value = event[key];
  return typeof value === 'string' ? value : '';
}

function responseIdOf(event: Record<string, unknown>): string | null {
  if (typeof event.response_id === 'string' && event.response_id) return event.response_id;
  const response = asRecord(event.response);
  if (response && typeof response.id === 'string' && response.id) return response.id;
  return null;
}

function itemIdOf(event: Record<string, unknown>): string | null {
  if (typeof event.item_id === 'string' && event.item_id) return event.item_id;
  const item = asRecord(event.item);
  if (item && typeof item.id === 'string' && item.id) return item.id;
  return null;
}

/** User transcript from a completed or cumulative update event. */
export function userTranscriptText(event: Record<string, unknown>): string {
  if (typeof event.transcript === 'string') return event.transcript.trim();
  const item = asRecord(event.item);
  const content = item && Array.isArray(item.content) ? item.content : [];
  for (const part of content) {
    const row = asRecord(part);
    if (row && typeof row.transcript === 'string' && row.transcript.trim()) return row.transcript.trim();
  }
  return '';
}

function canPlay(state: VoiceRuntime): boolean {
  return state.phase !== 'paused' && state.phase !== 'ended' && state.phase !== 'error' && state.phase !== 'userSpeaking';
}

function maybePersist(state: VoiceRuntime, commands: VoiceCommand[]) {
  if (!state.userReady || !state.assistantReady || state.awaitingSafetySpeech) return;
  const user = state.userText.trim();
  if (!user) return;
  const assistant = ensureSafetyNotices(state.assistantText.trim() || 'I am here.', state.safety).trim();
  state.userReady = false;
  state.assistantReady = false;
  state.userText = '';
  state.assistantText = '';
  state.liveUser = '';
  state.liveAssistant = '';
  commands.push({ type: 'persist', user, assistant });
}

function armSafety(state: VoiceRuntime, commands: VoiceCommand[], ctx: VoiceReduceContext) {
  const spoken = spokenSafetyLine(state.safety);
  if (!spoken || state.awaitingSafetySpeech) return;
  state.awaitingSafetySpeech = true;
  state.safetyResponseSeen = false;
  state.assistantReady = false;
  state.assistantText = '';
  state.liveAssistant = '';
  state.droppedResponseId = state.responseActive ? state.responseId : null;
  if (state.responseActive) commands.push({ type: 'send', body: { type: 'response.cancel' } });
  if (state.safety.selfHarm && ctx.crisisInstructions.trim()) {
    commands.push({ type: 'send', body: buildVoiceSessionUpdate(ctx.crisisInstructions) as unknown as Record<string, unknown> });
  }
  commands.push({ type: 'send', body: forceSpokenLine(spoken, false) as unknown as Record<string, unknown> });
  commands.push({ type: 'stopPlayback' });
  state.phase = 'speaking';
}

export function reduceVoiceEvent(
  current: VoiceRuntime,
  event: unknown,
  ctx: VoiceReduceContext,
): { state: VoiceRuntime; commands: VoiceCommand[] } {
  const state = clone(current);
  const commands: VoiceCommand[] = [];
  const record = asRecord(event);
  const type = record ? text(record, 'type') : '';
  if (!type) return { state, commands };

  if (type === 'local.end') {
    state.phase = 'ended';
    commands.push({ type: 'stopPlayback' });
    return { state, commands };
  }
  if (type === 'local.mute') {
    state.muted = Boolean(record?.muted);
    return { state, commands };
  }
  if (type === 'local.background') {
    if (state.phase === 'ended' || state.phase === 'error') return { state, commands };
    state.phase = 'paused';
    state.pauseReason = 'background';
    state.message = VOICE_COPY.paused;
    commands.push({ type: 'stopPlayback' });
    return { state, commands };
  }
  if (type === 'local.interruption') {
    if (state.phase === 'ended' || state.phase === 'error') return { state, commands };
    if (text(record!, 'phase') === 'began') {
      state.phase = 'paused';
      state.pauseReason = 'interruption';
      state.message = VOICE_COPY.interrupted;
      commands.push({ type: 'stopPlayback' });
      return { state, commands };
    }
    if (record?.shouldResume === false) {
      state.message = VOICE_COPY.paused;
      return { state, commands };
    }
    state.phase = state.muted ? 'listening' : 'listening';
    state.pauseReason = null;
    state.message = null;
    return { state, commands };
  }
  if (type === 'local.foreground') {
    if (state.pauseReason !== 'background') return { state, commands };
    state.phase = 'listening';
    state.pauseReason = null;
    state.message = null;
    return { state, commands };
  }
  if (type === 'local.socket-error' || type === 'local.socket-close') {
    if (type === 'local.socket-close' && record?.expected === true) {
      state.phase = 'ended';
      return { state, commands };
    }
    if (state.phase === 'ended' || state.phase === 'error') return { state, commands };
    state.phase = 'error';
    state.message = state.configured ? VOICE_COPY.network : VOICE_COPY.failed;
    commands.push({ type: 'stopPlayback' });
    commands.push({ type: 'fail', message: state.message });
    return { state, commands };
  }
  if (type === 'local.timeout') {
    if (state.configured || state.phase === 'ended') return { state, commands };
    state.phase = 'error';
    state.message = VOICE_COPY.timeout;
    commands.push({ type: 'fail', message: state.message });
    return { state, commands };
  }

  if (type === 'session.updated' && !state.configured) {
    state.configured = true;
    state.greetingPending = Boolean(ctx.greeting.trim());
    state.greetingBound = false;
    state.greetingResponseId = null;
    state.phase = state.greetingPending ? 'speaking' : 'listening';
    for (const turn of ctx.history) {
      if (turn.content.trim()) commands.push({ type: 'send', body: historySeedEvent(turn) as unknown as Record<string, unknown> });
    }
    if (ctx.greeting.trim()) {
      commands.push({ type: 'send', body: forceSpokenLine(ctx.greeting, true) as unknown as Record<string, unknown> });
    }
    return { state, commands };
  }

  if (type === 'input_audio_buffer.speech_started') {
    if (state.assistantItemId && ctx.playedMs > 0) {
      commands.push({
        type: 'send',
        body: truncateAssistantItem(state.assistantItemId, ctx.playedMs) as unknown as Record<string, unknown>,
      });
    }
    commands.push({ type: 'stopPlayback' });
    if (state.phase !== 'paused' && state.phase !== 'ended' && state.phase !== 'error') state.phase = 'userSpeaking';
    return { state, commands };
  }

  if (type === 'input_audio_buffer.speech_stopped') {
    if (state.phase === 'userSpeaking') state.phase = 'listening';
    return { state, commands };
  }

  if (
    type === 'conversation.item.input_audio_transcription.updated'
    || type === 'conversation.item.input_audio_transcription.completed'
  ) {
    const transcript = userTranscriptText(record!);
    if (!transcript) return { state, commands };
    state.liveUser = transcript;
    if (type.endsWith('.updated')) return { state, commands };
    state.userText = transcript;
    state.userReady = true;
    const hit = safetyFromText(transcript);
    if (hit.selfHarm || hit.withdrawal) {
      state.safety = hit;
      state.notices = pinnedSafetyNotices(hit);
      armSafety(state, commands, ctx);
    }
    maybePersist(state, commands);
    return { state, commands };
  }

  if (type === 'response.created') {
    const id = responseIdOf(record!);
    state.responseActive = true;
    state.responseId = id ?? state.responseId;
    const itemId = itemIdOf(record!);
    if (itemId) state.assistantItemId = itemId;
    const cancelled = Boolean(id && id === state.droppedResponseId);
    const safetySupersedes = state.awaitingSafetySpeech
      && state.droppedResponseId != null
      && id != null
      && id !== state.droppedResponseId;
    // The greeting is the first response after session start, unless safety already
    // cancelled a known in-flight response and this id is the replacement.
    if (state.greetingPending && !state.greetingBound && !cancelled && !safetySupersedes) {
      state.greetingBound = true;
      state.greetingResponseId = id;
      return { state, commands };
    }
    const safetyTurn = state.awaitingSafetySpeech
      && (state.droppedResponseId == null || (id != null && id !== state.droppedResponseId));
    if (safetyTurn) state.safetyResponseSeen = true;
    if (!state.greetingPending && (safetyTurn || !state.awaitingSafetySpeech)) {
      state.assistantText = '';
      state.liveAssistant = '';
      state.assistantReady = false;
    }
    return { state, commands };
  }

  if (type === 'response.output_audio.delta' || type === 'response.audio.delta') {
    const id = responseIdOf(record!);
    if (id && id === state.droppedResponseId) return { state, commands };
    const itemId = itemIdOf(record!);
    if (itemId) state.assistantItemId = itemId;
    state.responseActive = true;
    if (state.awaitingSafetySpeech && !state.safetyResponseSeen) return { state, commands };
    const delta = text(record!, 'delta') || text(record!, 'audio');
    if (delta && canPlay(state)) {
      state.phase = 'speaking';
      commands.push({ type: 'play', pcmBase64: delta });
    } else if (state.phase !== 'paused' && state.phase !== 'userSpeaking' && state.phase !== 'error' && state.phase !== 'ended') {
      state.phase = 'speaking';
    }
    return { state, commands };
  }

  if (type === 'response.output_audio_transcript.delta' || type === 'response.audio_transcript.delta') {
    const id = responseIdOf(record!);
    if (id && id === state.droppedResponseId) return { state, commands };
    if (state.greetingPending || (state.awaitingSafetySpeech && !state.safetyResponseSeen)) return { state, commands };
    const delta = text(record!, 'delta');
    if (!delta) return { state, commands };
    state.assistantText += delta;
    state.liveAssistant = state.assistantText;
    return { state, commands };
  }

  if (type === 'response.output_audio_transcript.done' || type === 'response.audio_transcript.done') {
    const id = responseIdOf(record!);
    if (id && id === state.droppedResponseId) return { state, commands };
    if (state.greetingPending || (state.awaitingSafetySpeech && !state.safetyResponseSeen)) return { state, commands };
    const full = text(record!, 'transcript');
    if (full.trim()) {
      state.assistantText = full.trim();
      state.liveAssistant = state.assistantText;
    }
    return { state, commands };
  }

  if (type === 'response.done') {
    const id = responseIdOf(record!);
    state.responseActive = false;
    const isGreetingDone = state.greetingPending && state.greetingBound && (
      (state.greetingResponseId != null && id === state.greetingResponseId)
      || (state.greetingResponseId == null && !state.safetyResponseSeen)
    );
    if (id && id === state.droppedResponseId) {
      state.droppedResponseId = null;
      if (state.greetingResponseId != null && id === state.greetingResponseId) state.greetingPending = false;
      return { state, commands };
    }
    if (isGreetingDone) {
      state.greetingPending = false;
      state.assistantText = '';
      state.liveAssistant = '';
      if (state.phase === 'speaking') state.phase = 'listening';
      return { state, commands };
    }
    if (state.awaitingSafetySpeech && !state.safetyResponseSeen) {
      return { state, commands };
    }
    if (state.greetingPending) state.greetingPending = false;
    if (state.awaitingSafetySpeech) {
      const spoken = spokenSafetyLine(state.safety);
      if (!state.assistantText.trim() && spoken) state.assistantText = spoken;
      state.awaitingSafetySpeech = false;
    }
    state.assistantReady = true;
    if (state.phase === 'speaking') state.phase = 'listening';
    maybePersist(state, commands);
    return { state, commands };
  }

  return { state, commands };
}

/** Join transcript deltas the way the socket delivers them, for tests and the call. */
export function assembleTranscript(deltas: string[], done?: string): string {
  if (done && done.trim()) return done.trim();
  return deltas.join('');
}
