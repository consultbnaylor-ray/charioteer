import { GROK_VOICE, pcm16ToFloat } from '@/domain/voice';

import type { VoiceAudio, VoiceMicHandlers } from './audioTypes';

type AudioContextCtor = typeof AudioContext;

/**
 * Web is a fallback. The browser Web Audio API captures mic PCM with echo
 * cancellation requested, and plays 24 kHz PCM16 with scheduled buffers.
 * A phone call or backgrounding is not something the browser session can mirror.
 */
export function createVoiceAudio(): VoiceAudio {
  let context: AudioContext | null = null;
  let stream: MediaStream | null = null;
  let processor: ScriptProcessorNode | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let played = 0;
  let nextAt = 0;
  const active: AudioBufferSourceNode[] = [];
  let paused = false;

  function ctor(): AudioContextCtor | null {
    if (typeof window === 'undefined') return null;
    const webkit = (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
    return window.AudioContext ?? webkit ?? null;
  }

  return {
    async prepare() {
      const Ctor = ctor();
      if (!Ctor || !navigator.mediaDevices?.getUserMedia) return 'unavailable';
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
      } catch (error) {
        const name = error && typeof error === 'object' && 'name' in error ? String(error.name) : '';
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') return 'denied';
        return 'unavailable';
      }
      try {
        context = new Ctor({ sampleRate: GROK_VOICE.sampleRate });
      } catch {
        context = new Ctor();
      }
      return 'granted';
    },
    async start(handlers: VoiceMicHandlers) {
      if (!context || !stream) throw new Error('mic');
      if (context.state === 'suspended') await context.resume();
      source = context.createMediaStreamSource(stream);
      const size = 4096;
      processor = context.createScriptProcessor(size, 1, 1);
      processor.onaudioprocess = (event) => {
        try {
          if (paused) return;
          const channel = event.inputBuffer.getChannelData(0);
          const copy = new Float32Array(channel.length);
          copy.set(channel);
          handlers.onPcm(copy, context?.sampleRate || event.inputBuffer.sampleRate || GROK_VOICE.sampleRate);
        } catch (error) {
          handlers.onFailure?.(error);
        }
      };
      source.connect(processor);
      const mute = context.createGain();
      mute.gain.value = 0;
      processor.connect(mute);
      mute.connect(context.destination);
      void handlers;
    },
    playPcm16(pcm: Uint8Array) {
      if (!context || !pcm.byteLength || paused) return;
      const floats = pcm16ToFloat(pcm);
      const buffer = context.createBuffer(1, floats.length, GROK_VOICE.sampleRate);
      buffer.copyToChannel(floats as Float32Array<ArrayBuffer>, 0);
      const node = context.createBufferSource();
      node.buffer = buffer;
      node.connect(context.destination);
      const start = Math.max(context.currentTime, nextAt);
      node.start(start);
      nextAt = start + buffer.duration;
      active.push(node);
      node.onended = () => {
        played += buffer.duration * 1000;
        const index = active.indexOf(node);
        if (index >= 0) active.splice(index, 1);
      };
    },
    stopPlayback() {
      for (const node of active) {
        try {
          node.stop();
        } catch {
          // Already stopped.
        }
      }
      active.length = 0;
      nextAt = context?.currentTime ?? 0;
      played = 0;
    },
    playedMs() {
      return played;
    },
    resetPlayed() {
      played = 0;
    },
    pauseCapture() {
      paused = true;
      this.stopPlayback();
    },
    resumeCapture() {
      paused = false;
      if (context?.state === 'suspended') void context.resume();
    },
    async stop() {
      paused = true;
      this.stopPlayback();
      processor?.disconnect();
      source?.disconnect();
      processor = null;
      source = null;
      stream?.getTracks().forEach((track) => track.stop());
      stream = null;
      await context?.close().catch(() => undefined);
      context = null;
    },
  };
}
