import {
  AudioContext,
  AudioManager,
  AudioRecorder,
  type AudioBufferQueueSourceNode,
  type AudioEventSubscription,
} from 'react-native-audio-api';

import { GROK_VOICE, pcm16ToFloat, resampleLinear } from '@/domain/voice';

import type { VoiceAudio, VoiceMicHandlers } from './audioTypes';

/**
 * iOS capture and playback through react-native-audio-api 0.13.6.
 *
 * Software Mansion maintains it, it ships an Expo config plugin, and it runs in
 * an Expo prebuild or TestFlight binary. AudioRecorder.onAudioReady yields
 * Float32 PCM, converted here to the 16-bit little-endian frames xAI expects.
 * AudioBufferQueueSourceNode plays each response delta as it arrives.
 * clearBuffers drops anything not yet heard when the user barges in.
 *
 * The session is playAndRecord and voiceChat, with defaultToSpeaker and
 * Bluetooth HFP, so a headset microphone is used and the loudspeaker is the
 * default. scripts/enable-voice-processing.mjs turns on Apple's voice-processing
 * I/O (echo cancellation, noise suppression, automatic gain). This release has
 * no iosVoiceProcessing option yet. The simulator skips that patch because
 * voice processing there records silence.
 */
export function createVoiceAudio(): VoiceAudio {
  const recorder = new AudioRecorder();
  let context: AudioContext | null = null;
  let queue: AudioBufferQueueSourceNode | null = null;
  let interruption: AudioEventSubscription | null = null;
  let played = 0;
  let listening = false;
  const durations = new Map<string, number>();

  function ensureContext() {
    if (!context) context = new AudioContext({ sampleRate: GROK_VOICE.sampleRate });
    return context;
  }

  function ensureQueue() {
    const ctx = ensureContext();
    if (queue) return queue;
    const next = ctx.createBufferQueueSource();
    next.connect(ctx.destination);
    next.onBufferEnded = (event) => {
      const ms = durations.get(event.bufferId) ?? 0;
      durations.delete(event.bufferId);
      played += ms;
    };
    next.start();
    queue = next;
    return next;
  }

  return {
    async prepare() {
      AudioManager.setAudioSessionOptions({
        iosCategory: 'playAndRecord',
        iosMode: 'voiceChat',
        iosOptions: ['defaultToSpeaker', 'allowBluetoothHFP'],
      });
      AudioManager.observeAudioInterruptions(true);
      const permission = await AudioManager.requestRecordingPermissions();
      if (permission !== 'Granted') return 'denied';
      try {
        await AudioManager.setAudioSessionActivity(true);
      } catch {
        return 'unavailable';
      }
      return 'granted';
    },
    async start(handlers: VoiceMicHandlers) {
      interruption = AudioManager.addSystemEventListener('interruption', (event) => {
        handlers.onInterruption({ type: event.type, shouldResume: event.shouldResume });
      });
      const ready = recorder.onAudioReady(
        {
          sampleRate: GROK_VOICE.sampleRate,
          bufferLength: Math.round(GROK_VOICE.sampleRate * (GROK_VOICE.frameMs / 1000)),
          channelCount: 1,
        },
        ({ buffer }) => {
          const channel = buffer.getChannelData(0);
          const copy = new Float32Array(channel.length);
          copy.set(channel);
          handlers.onPcm(copy, buffer.sampleRate || GROK_VOICE.sampleRate);
        },
      );
      if (ready.status === 'error') throw new Error('mic');
      ensureQueue();
      const ctx = ensureContext();
      if (ctx.state === 'suspended') await ctx.resume();
      const started = await recorder.start();
      if (started.status === 'error') throw new Error('mic');
      listening = true;
    },
    playPcm16(pcm: Uint8Array) {
      if (!pcm.byteLength) return;
      const ctx = ensureContext();
      const playback = ensureQueue();
      const rate = ctx.sampleRate || GROK_VOICE.sampleRate;
      const source = pcm16ToFloat(pcm);
      const floats = rate === GROK_VOICE.sampleRate ? source : resampleLinear(source, GROK_VOICE.sampleRate, rate);
      const audioBuffer = ctx.createBuffer(1, floats.length, rate);
      audioBuffer.copyToChannel(floats as Float32Array<ArrayBuffer>, 0);
      const id = playback.enqueueBuffer(audioBuffer);
      durations.set(id, (source.length / GROK_VOICE.sampleRate) * 1000);
    },
    stopPlayback() {
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
    },
    playedMs() {
      return played;
    },
    resetPlayed() {
      played = 0;
    },
    pauseCapture() {
      if (listening && recorder.isRecording() && !recorder.isPaused()) recorder.pause();
    },
    resumeCapture() {
      if (listening && recorder.isPaused()) recorder.resume();
      if (context?.state === 'suspended') void context.resume();
    },
    async stop() {
      listening = false;
      interruption?.remove();
      interruption = null;
      try {
        if (recorder.isRecording()) await recorder.stop();
      } catch {
        // The session is already going away.
      }
      recorder.clearOnAudioReady();
      durations.clear();
      if (queue) {
        queue.clearBuffers();
        try {
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
