import { buildSystemPrompt, buildThumosContext, type ThumosContextInput } from '@/domain/thumos';
import { browserSocketProtocols, buildVoiceSessionUpdate, GROK_VOICE, type VoiceAdapterResult } from '@/domain/voice';

/**
 * Opens a Grok Voice socket with an ephemeral token and sends session.update.
 * Microphone capture and playback of response.output_audio.delta are intentionally
 * not implemented yet — see supabase/functions/_shared/voice.ts.
 */
export function openVoiceSession(token: string, instructions: string): Promise<VoiceAdapterResult> {
  if (typeof WebSocket === 'undefined') {
    return Promise.resolve({
      status: 'unavailable',
      message: 'This browser cannot open a voice socket.',
      microphoneLive: false,
    });
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: VoiceAdapterResult, socket?: WebSocket) => {
      if (settled) return;
      settled = true;
      socket?.close();
      resolve(result);
    };
    const socket = new WebSocket(GROK_VOICE.socketUrl, browserSocketProtocols(token));
    const timer = setTimeout(() => {
      finish({
        status: 'error',
        message: 'The voice session did not confirm in time.',
        microphoneLive: false,
      }, socket);
    }, 8000);

    socket.addEventListener('open', () => {
      socket.send(JSON.stringify(buildVoiceSessionUpdate(instructions)));
    });
    socket.addEventListener('message', (event) => {
      try {
        const payload = JSON.parse(String(event.data)) as { type?: string };
        if (payload.type === 'session.updated' || payload.type === 'session.created') {
          clearTimeout(timer);
          finish({
            status: 'configured',
            message:
              'Grok Voice accepted Leo, a British English voice. Speaking and listening are not wired up in this version yet, so use text. The socket has been closed so it does not stay open.',
            microphoneLive: false,
          }, socket);
        }
      } catch {
        // Ignore non-JSON frames.
      }
    });
    socket.addEventListener('error', () => {
      clearTimeout(timer);
      finish({
        status: 'error',
        message: 'The voice connection failed. Text chat is still available.',
        microphoneLive: false,
      }, socket);
    });
  });
}

export function voiceInstructions(input: ThumosContextInput): string {
  return buildSystemPrompt(buildThumosContext(input), input.mode, undefined, { stage: input.stage });
}
