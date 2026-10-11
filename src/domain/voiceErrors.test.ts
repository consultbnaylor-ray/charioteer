import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { firstVoiceStackFrame, formatVoiceDebug } from './voiceDebug';
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

describe('voice debug line', () => {
  it('names the step, the microphone rate, and the last error on separate lines', () => {
    expect(formatVoiceDebug({ step: 'token', sampleRate: null, error: null })).toBe('Voice debug: token\nrate unknown');
    expect(formatVoiceDebug({ step: 'mic', sampleRate: 48000, error: null })).toBe('Voice debug: mic\n48000 Hz');
    expect(formatVoiceDebug({ step: 'session.updated', sampleRate: 44100.4, error: 'engine format' })).toBe(
      'Voice debug: session.updated\n44100 Hz\nengine format',
    );
    expect(formatVoiceDebug({ step: 'mic', sampleRate: 24000, error: 'offset must be a multiple of 4', frame: 'getChannelData' })).toBe(
      'Voice debug: mic\n24000 Hz\noffset must be a multiple of 4\ngetChannelData',
    );
    const long = formatVoiceDebug({ step: 'playback', sampleRate: 48000, error: `x${'y'.repeat(400)}` });
    expect(long.split('\n')[2]?.length).toBeLessThan(230);
    const thrown = new Error('offset must be a multiple of 4');
    thrown.stack = 'RangeError: offset must be a multiple of 4\n    at getChannelData (AudioBuffer.ts:35:12)\n    at readMic (audio.native.ts:89:24)';
    expect(firstVoiceStackFrame(thrown)).toBe('getChannelData');
    const hermes = new Error('offset must be a multiple of 2');
    hermes.stack = 'RangeError: offset must be a multiple of 2\ngetChannelData@89:24\nanonymous@100:1';
    expect(firstVoiceStackFrame(hermes)).toBe('getChannelData');
  });
});

describe('voice call wiring', () => {
  it('starts the microphone before playback and authenticates native sockets with the bearer header', () => {
    const audio = readFileSync('src/voice/audio.native.ts', 'utf8');
    const call = readFileSync('src/voice/call.ts', 'utf8');
    const screen = readFileSync('src/app/(main)/thumos.tsx', 'utf8');
    const prepare = audio.slice(audio.indexOf('async prepare('), audio.indexOf('async start('));
    const start = audio.slice(audio.indexOf('async start('), audio.indexOf('playPcm16('));
    expect(prepare).toContain('setAudioSessionOptions');
    expect(prepare.indexOf('setAudioSessionOptions')).toBeLessThan(prepare.indexOf('setAudioSessionActivity(true)'));
    expect(start).not.toContain('setAudioSessionOptions');
    expect(start).not.toContain('applySession');
    expect(start.indexOf('await openMic')).toBeGreaterThan(-1);
    expect(start.indexOf('await openMic')).toBeLessThan(start.indexOf('await openPlayback'));
    expect(start).toContain('await this.stop()');
    expect(audio).toContain('getDevicePreferredSampleRate() || 48000');
    expect(audio).toContain('readChannelSamples');
    expect(audio).not.toContain('getChannelData');
    const queue = audio.slice(audio.indexOf('function ensureQueue'), audio.indexOf('async function openMic'));
    expect(queue).toContain('next.start(0, 0)');
    expect(queue).not.toContain('next.start()');
    expect(queue).toContain('offset to -1');
    const web = readFileSync('src/voice/audio.web.ts', 'utf8');
    expect(web).toContain('node.start(start)');
    expect(web).not.toContain('createBufferQueueSource');
    expect(audio).toContain('rate * 0.1');
    expect(audio).toContain('channelCount: 1');
    expect(audio).toContain('new AudioContext()');
    expect(audio).not.toContain('new AudioContext({');
    expect(audio).not.toContain('retrying without voice processing');
    expect(audio).not.toContain('setVoiceProcessingEnabled');
    expect(call).toContain('VOICE_COPY.failed');
    expect(call).toContain('formatVoiceDebug');
    expect(call).toContain("console.warn('[voice] audio.start failed'");
    expect(call).toContain("console.warn('[voice] socket error'");
    expect(call).toContain("console.warn('[voice] socket close'");
    expect(call).toContain('this.guard(');
    expect(call.match(/socket\.addEventListener\(/g)).toHaveLength(4);
    expect(call).toContain('new NativeSocket(url, undefined, auth.headers ? { headers: auth.headers } : undefined)');
    expect(call).toContain('voiceSocketAuth');
    expect(screen).toContain('VOICE_COPY.failed');
    expect(screen).toContain('voice.detail');
  });
});

describe('voice processing patch', () => {
  it('is gone, so a clean AudioEngine.mm is what the phone builds', () => {
    expect(existsSync('scripts/enable-voice-processing.mjs')).toBe(false);
    const pkg = readFileSync('package.json', 'utf8');
    expect(pkg).not.toContain('enable-voice-processing');
    expect(pkg).toContain('"postinstall": "patch-package"');
    const patch = readFileSync('patches/react-native-audio-api+0.13.6.patch', 'utf8');
    expect(patch).toContain('charioteerPrepareAndStartEngine');
    expect(patch).toContain('@try');
    expect(patch).toContain('@catch');
    expect(patch).not.toContain('setVoiceProcessingEnabled');
    const engine = 'node_modules/react-native-audio-api/ios/audioapi/ios/system/AudioEngine.mm';
    if (existsSync(engine)) {
      const source = readFileSync(engine, 'utf8');
      expect(source).toContain('charioteerPrepareAndStartEngine');
      expect(source).toContain('@try');
      expect(source).not.toContain('setVoiceProcessingEnabled');
      expect(source).not.toContain('charioteerEnableVoiceProcessingBeforeGraph');
    }
  });
});
