import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  combineSocketCause,
  mapVoiceFailure,
  shortenVoiceCause,
  socketFailureCause,
  voiceCauseText,
  voiceDiagnosticsEnabled,
  voiceSocketAuth,
  VOICE_COPY,
} from './voice';
import { createVoiceRuntime, reduceVoiceEvent } from './voiceSession';

const ctx = {
  history: [],
  greeting: '',
  crisisInstructions: '',
  playedMs: 0,
};

describe('voice error mapping', () => {
  it('uses a microphone message for audio and a connection message for the socket', () => {
    const audio = mapVoiceFailure({
      kind: 'audio',
      cause: 'Restart after voice processing failed',
      showCause: true,
    });
    expect(audio.message).toBe(VOICE_COPY.audio);
    expect(audio.message).not.toBe(VOICE_COPY.failed);
    expect(audio.detail).toBe('Restart after voice processing failed');

    const hidden = mapVoiceFailure({ kind: 'audio', cause: 'mic', showCause: false });
    expect(hidden.message).toBe(VOICE_COPY.audio);
    expect(hidden.detail).toBeNull();
    expect(hidden.message).not.toBe('mic');

    const socket = mapVoiceFailure({
      kind: 'connection',
      cause: socketFailureCause({ code: 1006, reason: 'abnormal closure' }),
      showCause: true,
      configured: false,
    });
    expect(socket.message).toBe(VOICE_COPY.failed);
    expect(socket.detail).toBe('code 1006 · abnormal closure');

    const dropped = mapVoiceFailure({
      kind: 'connection',
      cause: 'code 1006',
      showCause: false,
      configured: true,
    });
    expect(dropped.message).toBe(VOICE_COPY.network);
    expect(dropped.detail).toBeNull();
  });

  it('keeps the technical cause short and reads an Error message', () => {
    expect(voiceCauseText(new Error('engine did not restart'))).toBe('engine did not restart');
    expect(voiceCauseText('  mic  ')).toBe('mic');
    expect(shortenVoiceCause(`x${'y'.repeat(400)}`)).toHaveLength(220);
    expect(combineSocketCause('socket error', 'code 1006 · reset')).toBe('code 1006 · reset');
    expect(combineSocketCause('timeout', 'code 1006')).toBe('timeout; code 1006');
  });

  it('shows the cause on dev and TestFlight, and hides it for a store build', () => {
    expect(voiceDiagnosticsEnabled({ dev: true, voiceDiagnostics: false })).toBe(true);
    expect(voiceDiagnosticsEnabled({ dev: false, voiceDiagnostics: true })).toBe(true);
    expect(voiceDiagnosticsEnabled({ dev: false, voiceDiagnostics: false })).toBe(false);
    expect(voiceDiagnosticsEnabled({ dev: false })).toBe(false);
  });

  it('sends the bearer header on native and the subprotocol on the web', () => {
    expect(voiceSocketAuth('web', 'abc')).toEqual({ protocols: ['xai-client-secret.abc'] });
    expect(voiceSocketAuth('native', 'abc')).toEqual({ headers: { Authorization: 'Bearer abc' } });
    expect(voiceSocketAuth('native', 'abc').protocols).toBeUndefined();
  });

  it('stores the socket cause only when diagnostics are on', () => {
    const shown = reduceVoiceEvent(
      createVoiceRuntime(),
      { type: 'local.socket-close', expected: false, cause: 'code 1006 · abnormal closure', showCause: true },
      ctx,
    );
    expect(shown.state.phase).toBe('error');
    expect(shown.state.message).toBe(VOICE_COPY.failed);
    expect(shown.state.detail).toContain('1006');

    const quiet = reduceVoiceEvent(
      createVoiceRuntime(),
      { type: 'local.socket-error', cause: 'TypeError: websocket', showCause: false },
      ctx,
    );
    expect(quiet.state.message).toBe(VOICE_COPY.failed);
    expect(quiet.state.detail).toBeNull();
    expect(quiet.state.message).not.toMatch(/TypeError|websocket/i);
  });
});

describe('voice call wiring', () => {
  it('starts the microphone before playback and authenticates native sockets with the bearer header', () => {
    const audio = readFileSync('src/voice/audio.native.ts', 'utf8');
    const call = readFileSync('src/voice/call.ts', 'utf8');
    const start = audio.slice(audio.indexOf('async start('));
    expect(start.indexOf('await openMic')).toBeGreaterThan(-1);
    expect(start.indexOf('await openMic')).toBeLessThan(start.indexOf('await openPlayback'));
    expect(start).toContain('retrying without voice processing');
    expect(call).toContain("console.warn('[voice] audio.start failed'");
    expect(call).toContain("console.warn('[voice] socket error'");
    expect(call).toContain("console.warn('[voice] socket close'");
    expect(call).toContain('new NativeSocket(url, undefined, auth.headers ? { headers: auth.headers } : undefined)');
    expect(call).toContain('voiceSocketAuth');
  });
});

describe('voice processing patch', () => {
  it('enables voice processing before the graph and falls back without it', () => {
    const script = readFileSync('scripts/enable-voice-processing.mjs', 'utf8');
    expect(script).toContain('charioteerEnableVoiceProcessingBeforeGraph');
    expect(script).toContain('charioteerVoiceProcessingDisabled');
    expect(script).toContain('Starting without voice processing');
    expect(script).toContain('Engine already running; leaving voice processing off');
    expect(script).toContain('charioteerVoiceProcessingRetrying');
    expect(script).not.toContain('const BOOL restartEngine');
  });
});
