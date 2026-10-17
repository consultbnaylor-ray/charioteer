import { shortenVoiceCause } from './voice';

/** Steps a TestFlight voice debug line can report. Order is the start-up path. */
export const VOICE_DEBUG_STEPS = ['token', 'session', 'mic', 'playback', 'socket', 'session.updated'] as const;

export type VoiceDebugStep = (typeof VOICE_DEBUG_STEPS)[number];

/** The first stack frame's function name, for the TestFlight voice debug text. */
export function firstVoiceStackFrame(error: unknown): string | null {
  if (!(error instanceof Error) || !error.stack) return null;
  const message = error.message.trim();
  for (const raw of error.stack.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (message && (line === message || line.endsWith(`: ${message}`) || line.endsWith(message))) continue;
    if (line.startsWith('at ')) {
      const body = line.slice(3).trim();
      const named = body.match(/^(?:async\s+)?([^\s(]+)/);
      const called = named?.[1] ?? body;
      return called.slice(0, 80);
    }
    const hermes = line.match(/^([^\s@]+)@/);
    if (hermes && !/error$/i.test(hermes[1])) return hermes[1].slice(0, 80);
  }
  return null;
}

/** TestFlight voice debug text. Each part is its own line so a long error can wrap. */
export function formatVoiceDebug(input: {
  step: VoiceDebugStep;
  sampleRate: number | null;
  error: string | null;
  frame?: string | null;
}): string {
  const rate = input.sampleRate != null && Number.isFinite(input.sampleRate) && input.sampleRate > 0
    ? `${Math.round(input.sampleRate)} Hz`
    : 'rate unknown';
  const lines = [`Voice debug: ${input.step}`, rate];
  if (input.error?.trim()) lines.push(shortenVoiceCause(input.error));
  if (input.frame?.trim()) lines.push(input.frame.trim());
  return lines.join('\n');
}
