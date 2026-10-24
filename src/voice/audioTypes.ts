export type VoiceInterrupt = { type: 'began' | 'ended'; shouldResume: boolean };

export type VoiceCaptureStep = 'mic' | 'playback';

export type VoiceMicHandlers = {
  onPcm: (samples: Float32Array, sampleRate: number) => void;
  onInterruption: (event: VoiceInterrupt) => void;
  /** Reports mic (with the capture rate) then playback. Failures stay in the caller. */
  onStep?: (step: VoiceCaptureStep, sampleRate?: number) => void;
  /** A native callback threw. The caller ends the call without letting it escape. */
  onFailure?: (error: unknown) => void;
};

/** Capture and playback. Native and web each supply their own createVoiceAudio. */
export type VoiceAudio = {
  prepare(): Promise<'granted' | 'denied' | 'unavailable'>;
  start(handlers: VoiceMicHandlers): Promise<void>;
  playPcm16(pcm: Uint8Array): void;
  stopPlayback(): void;
  /** Milliseconds of assistant audio that have finished playing. */
  playedMs(): number;
  resetPlayed(): void;
  pauseCapture(): void;
  resumeCapture(): void;
  stop(): Promise<void>;
};
