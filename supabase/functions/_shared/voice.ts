/**
 * Grok Voice session shape.
 *
 * Verified from xAI public docs (docs.x.ai, retrieved 10 October 2026):
 * - Text chat: POST https://api.x.ai/v1/chat/completions with model grok-4.7
 *   (legacy Chat Completions; the docs also recommend the newer Responses API).
 * - Ephemeral browser token: POST https://api.x.ai/v1/realtime/client_secrets
 *   body { expires_after: { seconds } }. Response includes value and expires_at.
 *   The docs say the body must not include session or expires_after.anchor.
 * - Browser WebSocket (browsers cannot set Authorization):
 *   new WebSocket("wss://api.x.ai/v1/realtime?model=grok-voice-latest",
 *     [`xai-client-secret.${token}`])
 * - session.update session fields include voice, instructions, and
 *   turn_detection.type = "server_vad".
 * - language_hint uses a code from the published list. English is `en`.
 *   `en-GB` is not in that list; unrecognised codes are ignored.
 * - British-accent voices named in the voice table: `eve` (energetic and upbeat)
 *   and `leo` (authoritative and strong). Thumos uses `leo` as the steadier of the two.
 *
 * Not finished in V1 (TODO): capturing the microphone, resampling to the
 * documented PCM rate, sending input audio frames, and playing
 * response.output_audio.delta. The session can be opened and configured;
 * full duplex audio still needs a device pass.
 */

export const GROK_VOICE = {
  model: 'grok-voice-latest',
  voice: 'leo',
  languageHint: 'en',
  socketUrl: 'wss://api.x.ai/v1/realtime?model=grok-voice-latest',
  clientSecretUrl: 'https://api.x.ai/v1/realtime/client_secrets',
  chatCompletionsUrl: 'https://api.x.ai/v1/chat/completions',
  chatModel: 'grok-4.7',
} as const;

export function browserSocketProtocols(ephemeralToken: string): string[] {
  return [`xai-client-secret.${ephemeralToken}`];
}

export function buildVoiceSessionUpdate(instructions: string) {
  return {
    type: 'session.update' as const,
    session: {
      voice: GROK_VOICE.voice,
      instructions: `${instructions}\n\nSpeak British English.`,
      turn_detection: { type: 'server_vad' as const },
      audio: {
        input: {
          transcription: {
            language_hint: GROK_VOICE.languageHint,
          },
        },
      },
    },
  };
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
  /** True only when microphone audio is actually streaming. V1 leaves this false. */
  microphoneLive: boolean;
};
