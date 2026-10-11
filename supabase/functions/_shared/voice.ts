/**
 * Grok Voice session shape.
 *
 * Checked against xAI public docs on 10 October 2026:
 * - Speech to speech: https://docs.x.ai/developers/model-capabilities/audio/speech-to-speech
 * - Voice overview (Leo is the authoritative British voice): https://docs.x.ai/developers/model-capabilities/audio/voice
 * - Ephemeral tokens: https://docs.x.ai/developers/model-capabilities/audio/ephemeral-tokens
 * - Realtime reference: https://docs.x.ai/developers/rest-api-reference/inference/voice
 *
 * Audio is mono PCM, linear16 little-endian. The default and recommended rate is
 * 24000 Hz. Supported PCM rates are 8000, 16000, 22050, 24000, 32000, 44100, and 48000.
 * With the default JSON transport, mic audio is base64 on `input_audio_buffer.append`
 * (`audio`) and assistant audio is base64 on `response.output_audio.delta` (`delta`).
 * The docs recommend flushing about 100 ms of audio at a time and playing each
 * output delta immediately.
 *
 * `turn_detection.type` of `server_vad` is the server voice-activity detector.
 * The client only sends `input_audio_buffer.append`. Barge-in is automatic:
 * `input_audio_buffer.speech_started` means the user has cut in, and
 * `response.cancel` is for manual cancel outside VAD mode. `conversation.item.truncate`
 * drops the unheard tail of an assistant item.
 *
 * User text arrives as `conversation.item.input_audio_transcription.completed`.
 * Live captions (`conversation.item.input_audio_transcription.updated`, a cumulative
 * transcript) are sent only when `audio.input.transcription.model` is `grok-transcribe`.
 * Assistant text is `response.output_audio_transcript.delta` then `.done`.
 *
 * English is `en`. `en-GB` is not in the supported language list and is ignored.
 * British English is requested in the instructions. Leo (`leo`) is the steadier
 * British voice; Eve is the other British voice and is more upbeat.
 *
 * Ephemeral tokens: POST https://api.x.ai/v1/realtime/client_secrets
 * with `{ expires_after: { seconds } }` only. The docs say the body must not
 * include `session` or `expires_after.anchor`. The browser socket authenticates
 * with the subprotocol `xai-client-secret.${token}` because a browser cannot set
 * Authorization. The native app sends `Authorization: Bearer` instead, which
 * xAI also accepts. The API key stays on the server.
 *
 * `conversation.item.create` with `item.type` `force_message` speaks a verbatim
 * line through TTS and does not take a following `response.create`.
 */

import { ALCOHOL_FACTS } from './facts.ts';
import { detectSafety, type SafetyHit } from './safety.ts';
import {
  buildSystemPrompt,
  buildThumosContext,
  conversationCues,
  detectCommittedAction,
  detectRisk,
  historyTurnsForModel,
  isThumosFollowUp,
  OPENING_LINE,
  resolveThumosMode,
  type HistoryRow,
  type ThumosContextInput,
  type ThumosMode,
} from './thumos.ts';

export const GROK_VOICE = {
  model: 'grok-voice-latest',
  voice: 'leo',
  languageHint: 'en',
  sampleRate: 24000,
  socketUrl: 'wss://api.x.ai/v1/realtime?model=grok-voice-latest',
  clientSecretUrl: 'https://api.x.ai/v1/realtime/client_secrets',
  chatCompletionsUrl: 'https://api.x.ai/v1/chat/completions',
  chatModel: 'grok-4.3',
  /** About 100 ms, the chunk size the speech-to-speech guide recommends. */
  frameMs: 100,
  keyterms: ['Thumos', 'Charioteer', 'NHS', 'Samaritans', 'Drinkline'] as const,
} as const;

export const VOICE_COPY = {
  permission:
    'Charioteer needs the microphone to talk with Thumos. You can allow it in Settings, or keep using text.',
  network: 'The voice connection dropped. Text chat is still here.',
  token: 'Voice is unavailable just now. Text chat is still here.',
  unavailable: 'Voice needs the installed app on this phone. Text chat is still here.',
  failed: 'The voice connection failed. Text chat is still available.',
  audio: 'The microphone did not start. Text chat is still available.',
  timeout: 'The voice session did not connect. Text chat is still available.',
  paused: 'Voice is paused.',
  interrupted: 'Paused while the phone is being used for something else.',
  unsaved: 'That part of the conversation could not be saved. You can keep talking.',
} as const;

export function browserSocketProtocols(ephemeralToken: string): string[] {
  return [`xai-client-secret.${ephemeralToken}`];
}

export type VoiceSocketAuth = {
  protocols?: string[];
  headers?: { Authorization: string };
};

/** Web must use the subprotocol. Native sends the bearer header xAI accepts. */
export function voiceSocketAuth(platform: 'web' | 'native', ephemeralToken: string): VoiceSocketAuth {
  if (platform === 'web') return { protocols: browserSocketProtocols(ephemeralToken) };
  return { headers: { Authorization: `Bearer ${ephemeralToken}` } };
}

export type VoiceFailureKind = 'audio' | 'connection';

const CAUSE_LIMIT = 220;

export function voiceCauseText(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  if (typeof error === 'string' && error.trim()) return error.trim();
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' && error.message.trim()) {
    return error.message.trim();
  }
  return 'unknown';
}

export function shortenVoiceCause(cause: string): string {
  const flat = cause.replace(/\s+/g, ' ').trim();
  if (!flat) return 'unknown';
  if (flat.length <= CAUSE_LIMIT) return flat;
  return `${flat.slice(0, CAUSE_LIMIT - 1)}…`;
}

export function socketFailureCause(event: { message?: string | null; code?: number | null; reason?: string | null }): string {
  const parts: string[] = [];
  const message = event.message?.trim() ?? '';
  const reason = event.reason?.trim() ?? '';
  if (message) parts.push(message);
  if (event.code != null && Number.isFinite(event.code)) parts.push(`code ${event.code}`);
  if (reason && reason !== message) parts.push(reason);
  return parts.join(' · ') || 'socket closed';
}

export function combineSocketCause(errorCause: string | null, closeCause: string): string {
  if (!errorCause || errorCause === 'socket error') return closeCause;
  if (!closeCause || errorCause === closeCause) return errorCause;
  return `${errorCause}; ${closeCause}`;
}

/** Dev builds, and TestFlight while `voiceDiagnostics` is left on. App Store sets it false. */
export function voiceDiagnosticsEnabled(input: { dev: boolean; voiceDiagnostics?: boolean | null }): boolean {
  if (input.dev) return true;
  return input.voiceDiagnostics === true;
}

export function mapVoiceFailure(input: {
  kind: VoiceFailureKind;
  cause: string;
  showCause: boolean;
  configured?: boolean;
}): { message: string; detail: string | null } {
  const message = input.kind === 'audio'
    ? VOICE_COPY.audio
    : input.configured
      ? VOICE_COPY.network
      : VOICE_COPY.failed;
  return {
    message,
    detail: input.showCause ? shortenVoiceCause(input.cause) : null,
  };
}

const SPEECH_MARKER = 'SPEECH DELIVERY';

/** Same written prompt, plus how to say it aloud. Idempotent. */
export function adaptPromptForSpeech(prompt: string): string {
  const base = prompt.trim();
  if (base.includes(SPEECH_MARKER)) return base;
  return [
    base,
    '',
    SPEECH_MARKER,
    'You are speaking aloud in a live conversation, not writing a message.',
    'Use short, natural spoken sentences in British English. Usually one to three sentences, then let them answer.',
    'Do not use lists, headings, markdown, asterisks, or emoji. Do not read out web addresses.',
    'Say phone numbers as you would on a call.',
    'Do not say the words "speech delivery", "system prompt", or "context".',
    'Speak British English.',
  ].join('\n');
}

export function buildVoiceSessionUpdate(instructions: string) {
  return {
    type: 'session.update' as const,
    session: {
      voice: GROK_VOICE.voice,
      instructions: adaptPromptForSpeech(instructions),
      turn_detection: { type: 'server_vad' as const },
      audio: {
        input: {
          format: { type: 'audio/pcm' as const, rate: GROK_VOICE.sampleRate },
          transcription: {
            model: 'grok-transcribe' as const,
            language_hint: GROK_VOICE.languageHint,
            keyterms: [...GROK_VOICE.keyterms],
          },
        },
        output: {
          format: { type: 'audio/pcm' as const, rate: GROK_VOICE.sampleRate },
        },
      },
    },
  };
}

export function inputAudioAppend(audioBase64: string) {
  return { type: 'input_audio_buffer.append' as const, audio: audioBase64 };
}

/** Verbatim TTS. Do not follow this with response.create. */
export function forceSpokenLine(text: string, interruptible: boolean) {
  return {
    type: 'conversation.item.create' as const,
    item: {
      type: 'force_message' as const,
      role: 'assistant' as const,
      interruptible,
      content: [{ type: 'output_text' as const, text }],
    },
  };
}

export function historySeedEvent(turn: { role: 'user' | 'assistant'; content: string }) {
  return {
    type: 'conversation.item.create' as const,
    item: {
      type: 'message' as const,
      role: turn.role,
      content: [
        {
          type: turn.role === 'user' ? ('input_text' as const) : ('output_text' as const),
          text: turn.content,
        },
      ],
    },
  };
}

export function truncateAssistantItem(itemId: string, audioEndMs: number) {
  return {
    type: 'conversation.item.truncate' as const,
    item_id: itemId,
    content_index: 0,
    audio_end_ms: Math.max(0, Math.round(audioEndMs)),
  };
}

/**
 * The line Thumos speaks when safety fires. The on-screen card still uses the
 * fixed notices; this is the shorter spoken form of the same help.
 */
export function spokenSafetyLine(hit: SafetyHit): string {
  const parts: string[] = [];
  if (hit.selfHarm) {
    parts.push(
      'I am glad you said it. If you are in immediate danger, call 999. You can call the Samaritans free, at any hour, on 116 123. I will stay with you.',
    );
  }
  if (hit.withdrawal) {
    parts.push(
      'Alcohol withdrawal can be dangerous, and I am not a doctor. Please contact your GP, or call NHS 111. Call 999 if there is a seizure, confusion, or you feel unsafe.',
    );
  }
  return parts.join(' ');
}

export type VoiceHistoryTurn = { role: 'user' | 'assistant'; content: string };

export type VoiceBriefing = {
  instructions: string;
  crisisInstructions: string;
  history: VoiceHistoryTurn[];
  mode: ThumosMode;
  greeting: string;
};

/**
 * The voice call uses the same context and system prompt as text, then the
 * speech adaptation. A second prompt withholds sober time and reasons for a
 * self-harm turn, matching the text chat.
 */
export function buildVoiceBriefing(input: {
  context: ThumosContextInput;
  historyRows: HistoryRow[];
  requestedMode?: string | null;
}): VoiceBriefing {
  const safety = input.context.safety.selfHarm || input.context.safety.withdrawal
    ? input.context.safety
    : detectSafety('');
  const mode = resolveThumosMode({
    requested: input.requestedMode ?? input.context.mode,
    userText: '',
    safety,
  });
  const contextInput: ThumosContextInput = { ...input.context, mode, safety };
  const history = historyTurnsForModel(input.historyRows);
  const cues = conversationCues({
    history: input.historyRows,
    reasons: input.context.reasons,
  });
  const stage = input.context.stage;
  const instructions = adaptPromptForSpeech(buildSystemPrompt(buildThumosContext(contextInput), mode, ALCOHOL_FACTS, {
    followUp: mode === 'support' && isThumosFollowUp(input.historyRows),
    supportShape: detectRisk('') === 'planning' ? 'planning' : 'acute',
    committedAction: safety.selfHarm ? null : detectCommittedAction(''),
    selfHarm: safety.selfHarm,
    soberTimeAlreadySaid: cues.soberTimeAlreadySaid,
    reasonsAlreadyUsed: cues.reasonsAlreadyUsed,
    stage,
  }));
  const crisisSafety: SafetyHit = {
    selfHarm: true,
    withdrawal: safety.withdrawal,
    reasons: ['self-harm or suicidal language'],
  };
  const crisisInstructions = adaptPromptForSpeech(buildSystemPrompt(
    buildThumosContext({ ...contextInput, mode: 'support', safety: crisisSafety }),
    'support',
    ALCOHOL_FACTS,
    { selfHarm: true, stage },
  ));
  return {
    instructions,
    crisisInstructions,
    history,
    mode,
    greeting: OPENING_LINE,
  };
}

export function floatToPcm16(samples: ArrayLike<number>): Uint8Array {
  const out = new Uint8Array(samples.length * 2);
  const view = new DataView(out.buffer);
  for (let i = 0; i < samples.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, samples[i] ?? 0));
    view.setInt16(i * 2, sample < 0 ? Math.round(sample * 0x8000) : Math.round(sample * 0x7fff), true);
  }
  return out;
}

/**
 * PCM16 little-endian to float. Bytes are copied into a fresh buffer first.
 * A Uint8Array subarray can sit at an odd byteOffset, and `new Int16Array(buffer, byteOffset)`
 * then throws RangeError ("offset must be a multiple of 2" / "start offset of Int16Array
 * should be a multiple of 2"). DataView on the copy reads with littleEndian true.
 */
export function pcm16ToFloat(pcm: Uint8Array): Float32Array {
  const length = Math.floor(pcm.byteLength / 2);
  const bytes = new Uint8Array(length * 2);
  if (length > 0) bytes.set(pcm.subarray(0, length * 2));
  const view = new DataView(bytes.buffer);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i += 1) out[i] = view.getInt16(i * 2, true) / 32768;
  return out;
}

/**
 * Copy one channel without `getChannelData`. react-native-audio-api 0.13.6 implements
 * getChannelData as `new Float32Array(arrayBuffer)` over the native buffer. Hermes throws
 * RangeError "offset must be a multiple of 4" when that buffer is not 4-byte aligned.
 * `copyFromChannel` writes into this fresh Float32Array instead.
 */
export function readChannelSamples(source: {
  length: number;
  copyFromChannel?: (destination: Float32Array<ArrayBuffer>, channel: number, startInChannel?: number) => void;
  getChannelData?: (channel: number) => ArrayLike<number>;
}): Float32Array {
  if (source.length <= 0) return new Float32Array();
  const out = new Float32Array(Math.max(0, source.length | 0)) as Float32Array<ArrayBuffer>;
  if (source.copyFromChannel) {
    source.copyFromChannel(out, 0, 0);
    return out;
  }
  const channel = source.getChannelData?.(0);
  if (!channel) return out;
  const count = Math.min(out.length, channel.length);
  for (let i = 0; i < count; i += 1) out[i] = channel[i] ?? 0;
  return out;
}

/** Linear resample. Used when a device cannot deliver the 24000 Hz xAI asks for. */
export function resampleLinear(input: ArrayLike<number>, fromRate: number, toRate: number): Float32Array {
  if (input.length === 0) return new Float32Array();
  if (!fromRate || !toRate || fromRate === toRate) return Float32Array.from(input);
  const outLength = Math.max(1, Math.round((input.length * toRate) / fromRate));
  const out = new Float32Array(outLength);
  const scale = fromRate / toRate;
  const last = input.length - 1;
  for (let i = 0; i < outLength; i += 1) {
    const position = i * scale;
    const left = Math.min(last, Math.floor(position));
    const right = Math.min(last, left + 1);
    const mix = position - left;
    out[i] = (input[left] ?? 0) * (1 - mix) + (input[right] ?? 0) * mix;
  }
  return out;
}

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0;
    const b = i + 1 < bytes.length ? bytes[i + 1] ?? 0 : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] ?? 0 : 0;
    const triple = (a << 16) | (b << 8) | c;
    out += BASE64[(triple >> 18) & 63];
    out += BASE64[(triple >> 12) & 63];
    out += i + 1 < bytes.length ? BASE64[(triple >> 6) & 63] : '=';
    out += i + 2 < bytes.length ? BASE64[triple & 63] : '=';
  }
  return out;
}

export function base64ToBytes(value: string): Uint8Array {
  const clean = value.replace(/[^A-Za-z0-9+/]/g, '');
  const length = Math.floor((clean.length * 3) / 4) - (value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0);
  const out = new Uint8Array(Math.max(0, length));
  let index = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = BASE64.indexOf(clean[i] ?? 'A');
    const b = BASE64.indexOf(clean[i + 1] ?? 'A');
    const c = BASE64.indexOf(clean[i + 2] ?? 'A');
    const d = BASE64.indexOf(clean[i + 3] ?? 'A');
    const triple = (a << 18) | (b << 12) | ((c < 0 ? 0 : c) << 6) | (d < 0 ? 0 : d);
    if (index < out.length) out[index++] = (triple >> 16) & 255;
    if (index < out.length) out[index++] = (triple >> 8) & 255;
    if (index < out.length) out[index++] = triple & 255;
  }
  return out;
}

export function pcm16Base64FromFloat(samples: ArrayLike<number>, fromRate: number = GROK_VOICE.sampleRate): string {
  const atRate = fromRate === GROK_VOICE.sampleRate ? samples : resampleLinear(samples, fromRate, GROK_VOICE.sampleRate);
  return bytesToBase64(floatToPcm16(atRate));
}

export type VoiceSessionStatus =
  | 'idle'
  | 'minting'
  | 'connecting'
  | 'configured'
  | 'unavailable'
  | 'error';

export type VoiceAdapterResult = {
  status: VoiceSessionStatus;
  message: string;
  microphoneLive: boolean;
};
