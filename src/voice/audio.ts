import type { VoiceAudio } from './audioTypes';

export type { VoiceAudio, VoiceInterrupt, VoiceMicHandlers } from './audioTypes';

/** Used where no platform audio file applies. iOS and web replace this module. */
export function createVoiceAudio(): VoiceAudio {
  return {
    async prepare() {
      return 'unavailable';
    },
    async start() {
      throw new Error('mic');
    },
    playPcm16() {},
    stopPlayback() {},
    playedMs() {
      return 0;
    },
    resetPlayed() {},
    pauseCapture() {},
    resumeCapture() {},
    async stop() {},
  };
}
