import Constants from 'expo-constants';
import { AppState, Platform, type AppStateStatus } from 'react-native';

import {
  base64ToBytes,
  buildVoiceSessionUpdate,
  combineSocketCause,
  GROK_VOICE,
  inputAudioAppend,
  pcm16Base64FromFloat,
  socketFailureCause,
  voiceCauseText,
  voiceDiagnosticsEnabled,
  voiceSocketAuth,
  VOICE_COPY,
  type VoiceBriefing,
} from '@/domain/voice';
import { formatVoiceDebug, type VoiceDebugStep } from '@/domain/voiceDebug';
import {
  createVoiceRuntime,
  reduceVoiceEvent,
  type VoiceCommand,
  type VoiceRuntime,
} from '@/domain/voiceSession';

import { createVoiceAudio } from './audio';
import type { VoiceAudio, VoiceCaptureStep } from './audioTypes';

const PRE_ROLL_FRAMES = 20;

export type VoiceCallDeps = {
  token: string;
  briefing: VoiceBriefing;
  saveTurn: (turn: { user: string; assistant: string }) => Promise<void>;
  onChange: (state: VoiceRuntime) => void;
  audio?: VoiceAudio;
  socketFactory?: (
    url: string,
    protocols: string[] | undefined,
    options?: { headers: { Authorization: string } },
  ) => WebSocket;
  /** When omitted, dev and TestFlight (`extra.voiceDiagnostics`) show the technical line. */
  showCause?: boolean;
};

export class VoiceCall {
  state: VoiceRuntime = createVoiceRuntime();
  private socket: WebSocket | null = null;
  private expectedClose = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private preRoll: string[] = [];
  private appState: { remove: () => void } | null = null;
  private stopped = false;
  private failing = false;
  private socketProblem: string | null = null;
  private socketErrorTimer: ReturnType<typeof setTimeout> | null = null;
  private step: VoiceDebugStep = 'token';
  private micRate: number | null = null;
  private lastError: string | null = null;
  private readonly audio: VoiceAudio;
  private readonly showCause: boolean;

  constructor(private readonly deps: VoiceCallDeps) {
    this.audio = deps.audio ?? createVoiceAudio();
    this.showCause = deps.showCause ?? diagnosticsEnabled();
  }

  async start(): Promise<void> {
    try {
      await this.begin();
    } catch (err) {
      this.crash(err);
    }
  }

  mute() {
    this.guard(() => this.apply({ type: 'local.mute', muted: !this.state.muted }));
  }

  async end() {
    try {
      this.expectedClose = true;
      this.apply({ type: 'local.end' });
      await this.shutdown();
    } catch (err) {
      this.crash(err);
      await this.shutdown();
    }
  }

  private async begin(): Promise<void> {
    this.note('token');
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
    this.note('session');
    if (this.stopped) return;
    try {
      await this.audio.start({
        onPcm: (samples, sampleRate) => this.guard(() => this.onMic(samples, sampleRate)),
        onInterruption: (event) => this.guard(() => {
          this.apply({ type: 'local.interruption', phase: event.type, shouldResume: event.shouldResume });
          if (event.type === 'began') this.audio.pauseCapture();
          else if (event.shouldResume) this.audio.resumeCapture();
        }),
        onStep: (step, sampleRate) => this.note(step, sampleRate),
        onFailure: (error) => this.crash(error),
      });
    } catch (err) {
      const cause = voiceCauseText(err);
      console.warn('[voice] audio.start failed', cause);
      this.lastError = cause;
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

  private watchAppState() {
    this.appState = AppState.addEventListener('change', (next: AppStateStatus) => {
      this.guard(() => {
        if (next === 'background') {
          this.apply({ type: 'local.background' });
          this.audio.pauseCapture();
        } else if (next === 'active' && this.state.pauseReason === 'background') {
          this.apply({ type: 'local.foreground' });
          this.audio.resumeCapture();
        }
      });
    });
  }

  private openSocket() {
    const url = GROK_VOICE.socketUrl;
    const auth = voiceSocketAuth(Platform.OS === 'web' ? 'web' : 'native', this.deps.token);
    const socket = this.deps.socketFactory
      ? this.deps.socketFactory(url, auth.protocols, auth.headers ? { headers: auth.headers } : undefined)
      : openVoiceSocket(url, auth);
    this.socket = socket;
    this.timer = setTimeout(() => this.guard(() => {
      if (this.stopped || this.state.configured || this.state.phase === 'error' || this.state.phase === 'ended') return;
      this.lastError = 'timed out';
      this.apply({ type: 'local.timeout' });
    }), 8000);
    socket.addEventListener('open', () => this.guard(() => {
      this.note('socket');
      socket.send(JSON.stringify(buildVoiceSessionUpdate(this.deps.briefing.instructions)));
    }));
    socket.addEventListener('message', (event) => this.guard(() => {
      const data = typeof event.data === 'string' ? event.data : '';
      if (!data) return;
      try {
        this.apply(JSON.parse(data) as unknown);
      } catch {
        // Binary or partial frames are ignored. Audio rides in JSON deltas.
      }
    }));
    socket.addEventListener('error', (event) => this.guard(() => {
      if (this.expectedClose) return;
      const cause = socketFailureCause(socketEventFields(event));
      const recorded = cause === 'socket closed' ? 'socket error' : cause;
      console.warn('[voice] socket error', recorded);
      this.socketProblem = recorded;
      this.lastError = recorded;
      // React Native follows the error with close, and that close carries the code and reason.
      this.socketErrorTimer = setTimeout(() => this.guard(() => {
        this.socketErrorTimer = null;
        if (this.stopped || this.state.phase === 'error' || this.state.phase === 'ended') return;
        this.apply({ type: 'local.socket-error', cause: this.socketProblem ?? 'socket error', showCause: this.showCause });
      }), 50);
    }));
    socket.addEventListener('close', (event) => this.guard(() => {
      if (this.socketErrorTimer) clearTimeout(this.socketErrorTimer);
      this.socketErrorTimer = null;
      const closeCause = socketFailureCause(socketEventFields(event));
      const cause = combineSocketCause(this.socketProblem, closeCause);
      if (!this.expectedClose) {
        console.warn('[voice] socket close', cause);
        this.lastError = cause;
      }
      this.apply({ type: 'local.socket-close', expected: this.expectedClose, cause, showCause: this.showCause });
    }));
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
      this.step = 'session.updated';
      if (this.timer) clearTimeout(this.timer);
      this.timer = null;
      this.audio.resetPlayed();
      for (const frame of this.preRoll) this.send(inputAudioAppend(frame));
      this.preRoll = [];
    }
    this.publish();
    if (this.state.phase === 'error' || this.state.phase === 'ended') {
      this.expectedClose = true;
      void this.shutdown();
    }
  }

  private run(command: VoiceCommand) {
    if (this.state.phase === 'error') return;
    if (command.type === 'send') this.send(command.body);
    else if (command.type === 'play') this.guard(() => this.audio.playPcm16(base64ToBytes(command.pcmBase64)));
    else if (command.type === 'stopPlayback') {
      this.guard(() => {
        const heard = this.audio.playedMs();
        this.audio.stopPlayback();
        if (heard > 0) this.audio.resetPlayed();
      });
    } else if (command.type === 'persist') {
      void this.deps.saveTurn({ user: command.user, assistant: command.assistant }).catch((err: unknown) => {
        this.guard(() => {
          if (this.state.phase === 'ended' || this.state.phase === 'error') return;
          this.lastError = voiceCauseText(err);
          this.state = { ...this.state, message: VOICE_COPY.unsaved };
          this.publish();
        });
      });
    }
  }

  private send(body: unknown) {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify(body));
  }

  private note(step: VoiceDebugStep | VoiceCaptureStep, sampleRate?: number) {
    this.step = step;
    if (sampleRate != null && Number.isFinite(sampleRate) && sampleRate > 0) this.micRate = sampleRate;
    this.publish();
  }

  private debugLine(): string | null {
    if (!this.showCause) return null;
    return formatVoiceDebug({ step: this.step, sampleRate: this.micRate, error: this.lastError });
  }

  /** Keeps a store build's detail untouched. TestFlight replaces it with the debug line. */
  private publish() {
    if (this.showCause) this.state = { ...this.state, detail: this.debugLine() };
    try {
      this.deps.onChange(this.state);
    } catch (err) {
      console.warn('[voice] onChange failed', voiceCauseText(err));
    }
  }

  private guard(work: () => void) {
    try {
      work();
    } catch (err) {
      this.crash(err);
    }
  }

  private crash(err: unknown) {
    const cause = voiceCauseText(err);
    console.warn('[voice] failed', cause);
    this.lastError = cause;
    if (this.failing || this.stopped || this.state.phase === 'error' || this.state.phase === 'ended') return;
    this.fail(VOICE_COPY.failed);
  }

  private fail(message: string) {
    if (this.failing) return;
    this.failing = true;
    this.state = { ...this.state, phase: 'error', message, detail: this.debugLine() };
    try {
      this.deps.onChange(this.state);
    } catch (err) {
      console.warn('[voice] onChange failed', voiceCauseText(err));
    }
    this.expectedClose = true;
    void this.shutdown();
  }

  private async shutdown() {
    if (this.stopped) return;
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.socketErrorTimer) clearTimeout(this.socketErrorTimer);
    this.socketErrorTimer = null;
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

function diagnosticsEnabled(): boolean {
  const extra = Constants.expoConfig?.extra;
  const flag = extra && typeof extra === 'object' && 'voiceDiagnostics' in extra
    ? (extra as { voiceDiagnostics?: boolean }).voiceDiagnostics
    : undefined;
  return voiceDiagnosticsEnabled({ dev: typeof __DEV__ !== 'undefined' && __DEV__, voiceDiagnostics: flag });
}

function socketEventFields(event: Event): { message?: string; code?: number; reason?: string } {
  const record = event as Event & { message?: unknown; code?: unknown; reason?: unknown };
  return {
    message: typeof record.message === 'string' ? record.message : undefined,
    code: typeof record.code === 'number' ? record.code : undefined,
    reason: typeof record.reason === 'string' ? record.reason : undefined,
  };
}

function openVoiceSocket(url: string, auth: { protocols?: string[]; headers?: { Authorization: string } }): WebSocket {
  if (auth.protocols) return new WebSocket(url, auth.protocols);
  const NativeSocket = WebSocket as unknown as new (
    url: string,
    protocols: undefined,
    options?: { headers: { Authorization: string } },
  ) => WebSocket;
  return new NativeSocket(url, undefined, auth.headers ? { headers: auth.headers } : undefined);
}
