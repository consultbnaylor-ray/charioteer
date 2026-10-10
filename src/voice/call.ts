import { AppState, type AppStateStatus } from 'react-native';

import {
  base64ToBytes,
  browserSocketProtocols,
  buildVoiceSessionUpdate,
  GROK_VOICE,
  inputAudioAppend,
  pcm16Base64FromFloat,
  VOICE_COPY,
  type VoiceBriefing,
} from '@/domain/voice';
import {
  createVoiceRuntime,
  reduceVoiceEvent,
  type VoiceCommand,
  type VoiceRuntime,
} from '@/domain/voiceSession';

import { createVoiceAudio } from './audio';
import type { VoiceAudio } from './audioTypes';

const PRE_ROLL_FRAMES = 20;

export type VoiceCallDeps = {
  token: string;
  briefing: VoiceBriefing;
  saveTurn: (turn: { user: string; assistant: string }) => Promise<void>;
  onChange: (state: VoiceRuntime) => void;
  audio?: VoiceAudio;
  socketFactory?: (url: string, protocols: string[]) => WebSocket;
};

export class VoiceCall {
  state: VoiceRuntime = createVoiceRuntime();
  private socket: WebSocket | null = null;
  private expectedClose = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private preRoll: string[] = [];
  private appState: { remove: () => void } | null = null;
  private stopped = false;
  private readonly audio: VoiceAudio;

  constructor(private readonly deps: VoiceCallDeps) {
    this.audio = deps.audio ?? createVoiceAudio();
  }

  async start(): Promise<void> {
    const permission = await this.audio.prepare();
    if (this.stopped) {
      await this.audio.stop().catch(() => undefined);
      return;
    }
    if (permission === 'denied') {
      this.fail(VOICE_COPY.permission);
      return;
    }
    if (permission !== 'granted') {
      this.fail(VOICE_COPY.unavailable);
      return;
    }
    try {
      if (this.stopped) return;
      await this.audio.start({
        onPcm: (samples, sampleRate) => this.onMic(samples, sampleRate),
        onInterruption: (event) => {
          this.apply({ type: 'local.interruption', phase: event.type, shouldResume: event.shouldResume });
          if (event.type === 'began') this.audio.pauseCapture();
          else if (event.shouldResume) this.audio.resumeCapture();
        },
      });
    } catch {
      this.fail(VOICE_COPY.failed);
      return;
    }
    if (this.stopped) {
      await this.audio.stop().catch(() => undefined);
      return;
    }
    this.watchAppState();
    this.openSocket();
  }

  mute() {
    this.apply({ type: 'local.mute', muted: !this.state.muted });
  }

  async end() {
    this.expectedClose = true;
    this.apply({ type: 'local.end' });
    await this.shutdown();
  }

  private watchAppState() {
    this.appState = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'background') {
        this.apply({ type: 'local.background' });
        this.audio.pauseCapture();
      } else if (next === 'active' && this.state.pauseReason === 'background') {
        this.apply({ type: 'local.foreground' });
        this.audio.resumeCapture();
      }
    });
  }

  private openSocket() {
    const factory = this.deps.socketFactory ?? ((url, protocols) => new WebSocket(url, protocols));
    const socket = factory(GROK_VOICE.socketUrl, browserSocketProtocols(this.deps.token));
    this.socket = socket;
    this.timer = setTimeout(() => this.apply({ type: 'local.timeout' }), 8000);
    socket.addEventListener('open', () => {
      socket.send(JSON.stringify(buildVoiceSessionUpdate(this.deps.briefing.instructions)));
    });
    socket.addEventListener('message', (event) => {
      const data = typeof event.data === 'string' ? event.data : '';
      if (!data) return;
      try {
        this.apply(JSON.parse(data) as unknown);
      } catch {
        // Binary or partial frames are ignored. Audio rides in JSON deltas.
      }
    });
    socket.addEventListener('error', () => this.apply({ type: 'local.socket-error' }));
    socket.addEventListener('close', () => this.apply({ type: 'local.socket-close', expected: this.expectedClose }));
  }

  private onMic(samples: Float32Array, sampleRate: number) {
    if (this.state.muted || this.state.phase === 'paused' || this.state.phase === 'ended' || this.state.phase === 'error') return;
    const audio = pcm16Base64FromFloat(samples, sampleRate);
    if (!audio) return;
    if (!this.state.configured || this.socket?.readyState !== WebSocket.OPEN) {
      this.preRoll.push(audio);
      if (this.preRoll.length > PRE_ROLL_FRAMES) this.preRoll.shift();
      return;
    }
    this.send(inputAudioAppend(audio));
  }

  private apply(event: unknown) {
    if (this.stopped) return;
    const wasConfigured = this.state.configured;
    const playedMs = this.audio.playedMs();
    const next = reduceVoiceEvent(this.state, event, {
      history: this.deps.briefing.history,
      greeting: this.deps.briefing.greeting,
      crisisInstructions: this.deps.briefing.crisisInstructions,
      playedMs,
    });
    this.state = next.state;
    for (const command of next.commands) this.run(command);
    if (!wasConfigured && this.state.configured) {
      if (this.timer) clearTimeout(this.timer);
      this.timer = null;
      this.audio.resetPlayed();
      for (const frame of this.preRoll) this.send(inputAudioAppend(frame));
      this.preRoll = [];
    }
    this.deps.onChange(this.state);
    if (this.state.phase === 'error' || this.state.phase === 'ended') {
      this.expectedClose = true;
      void this.shutdown();
    }
  }

  private run(command: VoiceCommand) {
    if (command.type === 'send') this.send(command.body);
    else if (command.type === 'play') this.audio.playPcm16(base64ToBytes(command.pcmBase64));
    else if (command.type === 'stopPlayback') {
      const heard = this.audio.playedMs();
      this.audio.stopPlayback();
      if (heard > 0) this.audio.resetPlayed();
    } else if (command.type === 'persist') {
      void this.deps.saveTurn({ user: command.user, assistant: command.assistant }).catch(() => {
        if (this.state.phase === 'ended' || this.state.phase === 'error') return;
        this.state = { ...this.state, message: VOICE_COPY.unsaved };
        this.deps.onChange(this.state);
      });
    }
  }

  private send(body: unknown) {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify(body));
  }

  private fail(message: string) {
    this.state = { ...this.state, phase: 'error', message };
    this.deps.onChange(this.state);
    this.expectedClose = true;
    void this.shutdown();
  }

  private async shutdown() {
    if (this.stopped) return;
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.appState?.remove();
    this.appState = null;
    try {
      this.socket?.close();
    } catch {
      // Already closed.
    }
    this.socket = null;
    await this.audio.stop().catch(() => undefined);
  }
}
