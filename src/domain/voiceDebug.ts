import { shortenVoiceCause } from './voice';

/** Steps a TestFlight voice debug line can report. Order is the start-up path. */
export const VOICE_DEBUG_STEPS = ['token', 'session', 'mic', 'playback', 'socket', 'session.updated'] as const;

export type VoiceDebugStep = (typeof VOICE_DEBUG_STEPS)[number];

/** One line for TestFlight: the step reached, the microphone rate, and the last error. */
export function formatVoiceDebug(input: {
  step: VoiceDebugStep;
  sampleRate: number | null;
  error: string | null;
}): string {
  const rate = input.sampleRate != null && Number.isFinite(input.sampleRate) && input.sampleRate > 0
    ? `${Math.round(input.sampleRate)} Hz`
    : 'rate unknown';
  const error = input.error?.trim() ? ` · ${shortenVoiceCause(input.error)}` : '';
  return `Voice debug: ${input.step} · ${rate}${error}`;
}
