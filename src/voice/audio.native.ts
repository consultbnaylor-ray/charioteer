import {
  AudioContext,
  AudioManager,
  AudioRecorder,
  type AudioBufferQueueSourceNode,
  type AudioEventSubscription,
} from 'react-native-audio-api';

import { GROK_VOICE, pcm16ToFloat, readChannelSamples, resampleLinear } from '@/domain/voice';

import type { VoiceAudio, VoiceMicHandlers } from './audioTypes';

/**
 * iOS capture and playback through react-native-audio-api 0.13.6.
 *
 * The session is playAndRecord with mode voiceChat, set once in prepare()
 * before the session is activated, and never changed while the engine is
 * running. That mode is the echo control. Voice processing is not turned on.
 * patch-package wraps AVAudioEngine prepare and start in @try/@catch and
 * returns false, so a thrown restart becomes a microphone error.
 *
 * The microphone records at the device rate. voiceChat often reports 24000 Hz;
 * that is the real rate and is passed through. 48 kHz is only the fallback
 * when the device does not report one. Speech frames are resampled to 24 kHz
 * by the call. Playback uses the context rate and resamples each spoken delta
 * on the way in.
 */
export function createVoiceAudio(): VoiceAudio {
  const recorder = new AudioRecorder();
  let context: AudioContext | null = null;
  let queue: AudioBufferQueueSourceNode | null = null;
  let interruption: AudioEventSubscription | null = null;
  let played = 0;
  let listening = false;
  const durations = new Map<string, number>();

  function causeText(error: unknown): string {
    if (error instanceof Error && error.message.trim()) return error.message.trim();
    if (typeof error === 'string' && error.trim()) return error.trim();
    return 'Microphone did not start.';
  }

  function captureRate(): number {
    try {
      return AudioManager.getDevicePreferredSampleRate() || 48000;
    } catch {
      return 48000;
    }
  }

  function ensureContext() {
    if (!context) context = new AudioContext();
    return context;
  }

  function ensureQueue() {
    const ctx = ensureContext();
    if (queue) return queue;
    const next = ctx.createBufferQueueSource();
    next.connect(ctx.destination);
    next.onBufferEnded = (event) => {
      try {
        const ms = durations.get(event.bufferId) ?? 0;
        durations.delete(event.bufferId);
        played += ms;
      } catch {
        // A late buffer event must not escape the native callback.
      }
    };
    // 0.13.6 defaults the offset to -1. `if (offset && offset < 0)` then
    // throws, so start() with no arguments always throws. stopPlayback()
    // builds this queue again, so barge-in uses the same call.
    next.start(0, 0);
    queue = next;
    return next;
  }

  async function openMic(handlers: VoiceMicHandlers) {
    interruption = AudioManager.addSystemEventListener('interruption', (event) => {
      try {
        handlers.onInterruption({ type: event.type, shouldResume: event.shouldResume });
      } catch (error) {
        handlers.onFailure?.(error);
      }
    });
    const rate = captureRate();
    console.warn('[voice] mic sample rate', rate);
    const ready = recorder.onAudioReady(
      {
        sampleRate: rate,
        bufferLength: Math.round(rate * 0.1),
        channelCount: 1,
      },
      ({ buffer }) => {
        try {
          // A fresh Float32Array via copyFromChannel. Viewing the native buffer
          // threw RangeError "offset must be a multiple of 4" on Hermes.
          const copy = readChannelSamples(buffer);
          handlers.onPcm(copy, buffer.sampleRate || rate);
        } catch (error) {
          handlers.onFailure?.(error);
        }
      },
    );
    if (ready.status === 'error') throw new Error(ready.message || 'Microphone callback was rejected.');
    const started = await recorder.start();
    if (started.status === 'error') throw new Error(started.message || 'Microphone did not start.');
    listening = true;
    handlers.onStep?.('mic', rate);
  }

  async function openPlayback(handlers: VoiceMicHandlers) {
    ensureQueue();
    const ctx = ensureContext();
    if (ctx.state === 'suspended') await ctx.resume();
    handlers.onStep?.('playback');
  }

  return {
    async prepare() {
      try {
        AudioManager.setAudioSessionOptions({
          iosCategory: 'playAndRecord',
          iosMode: 'voiceChat',
          iosOptions: ['defaultToSpeaker', 'allowBluetoothHFP'],
        });
        AudioManager.observeAudioInterruptions(true);
        const permission = await AudioManager.requestRecordingPermissions();
        if (permission !== 'Granted') return 'denied';
        await AudioManager.setAudioSessionActivity(true);
        return 'granted';
      } catch (error) {
        await this.stop();
        throw new Error(causeText(error));
      }
    },
    async start(handlers: VoiceMicHandlers) {
      try {
        await openMic(handlers);
        await openPlayback(handlers);
      } catch (error) {
        await this.stop();
        throw new Error(causeText(error));
      }
    },
    playPcm16(pcm: Uint8Array) {
      if (!pcm.byteLength) return;
      try {
        const ctx = ensureContext();
        const playback = ensureQueue();
        const rate = ctx.sampleRate || GROK_VOICE.sampleRate;
        const source = pcm16ToFloat(pcm);
        const floats = rate === GROK_VOICE.sampleRate ? source : resampleLinear(source, GROK_VOICE.sampleRate, rate);
        const audioBuffer = ctx.createBuffer(1, floats.length, rate);
        audioBuffer.copyToChannel(floats as Float32Array<ArrayBuffer>, 0);
        const id = playback.enqueueBuffer(audioBuffer);
        durations.set(id, (source.length / GROK_VOICE.sampleRate) * 1000);
      } catch (error) {
        throw new Error(causeText(error));
      }
    },
    stopPlayback() {
      try {
        durations.clear();
        if (!queue) return;
        queue.clearBuffers();
        try {
          queue.stop();
        } catch {
          // The node may already have been stopped.
        }
        queue = null;
        if (context && context.state !== 'closed') ensureQueue();
      } catch (error) {
        throw new Error(causeText(error));
      }
    },
    playedMs() {
      return played;
    },
    resetPlayed() {
      played = 0;
    },
    pauseCapture() {
      try {
        if (listening && recorder.isRecording() && !recorder.isPaused()) recorder.pause();
      } catch (error) {
        throw new Error(causeText(error));
      }
    },
    resumeCapture() {
      try {
        if (listening && recorder.isPaused()) recorder.resume();
        if (context?.state === 'suspended') void context.resume();
      } catch (error) {
        throw new Error(causeText(error));
      }
    },
    async stop() {
      listening = false;
      try {
        interruption?.remove();
      } catch {
        // The subscription may already be gone.
      }
      interruption = null;
      try {
        if (recorder.isRecording()) await recorder.stop();
      } catch {
        // The session is already going away.
      }
      try {
        recorder.clearOnAudioReady();
      } catch {
        // The recorder may already have dropped the callback.
      }
      durations.clear();
      if (queue) {
        try {
          queue.clearBuffers();
          queue.stop();
        } catch {
          // Already stopped.
        }
        queue = null;
      }
      if (context) {
        await context.close().catch(() => undefined);
        context = null;
      }
      await AudioManager.setAudioSessionActivity(false).catch(() => undefined);
    },
  };
}
