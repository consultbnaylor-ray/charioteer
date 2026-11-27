import { useEffect, useRef, useState } from 'react';

import { TESTFLIGHT_SPEECH_ON } from '@/activity/speakLine';
import { MEDITATION_SOURCES } from '@/audio/meditationSources';
import {
  MUSIC_STOP_FADE_MS,
  fadeOutVolume,
  findTrack,
  isListenOver,
  musicVolumeAt,
} from '@/domain/meditationTracks';

/**
 * Meditation music playback through expo-audio.
 * One short bundled file loops at runtime. Volume is driven from a pause-aware clock,
 * so the fade-in, the end fade and a pause never lose their place.
 *
 * Offline only: the file ships inside the app and nothing is fetched or sent.
 *
 * Lock screen: the iOS `audio` background mode follows the speech gate in app.config.ts.
 * TestFlight has it, so music keeps playing when the phone locks. The App Store build
 * drops it while the gate is false, so music pauses on lock and picks up again when the
 * app comes back. The breathing screens keep the screen awake while they run.
 */
export const MUSIC_PLAYS_WHEN_LOCKED = TESTFLIGHT_SPEECH_ON;

const TICK_MS = 200;

type Player = {
  play(): void;
  pause(): void;
  remove(): void;
  loop: boolean;
  volume: number;
};

type Clock = { carriedMs: number; startedAt: number | null };

function clockElapsed(clock: Clock, now: number): number {
  return clock.carriedMs + (clock.startedAt == null ? 0 : Math.max(0, now - clock.startedAt));
}

export type MusicStatus = 'stopped' | 'playing' | 'paused';

export type MeditationMusic = {
  status: MusicStatus;
  trackId: string | null;
  /** Ms played so far, paused time excluded. Read with the screen's own tick. */
  elapsedMs(now?: number): number;
  /** Starts the track from the top with a fade-in. `endMs` null loops until stopped. */
  start(trackId: string, endMs: number | null, onEnd?: () => void): void;
  pause(): void;
  resume(): void;
  /** Fades out over `fadeMs`, then stops. 0 stops at once. */
  stop(fadeMs?: number): void;
};

export function useMeditationMusic(): MeditationMusic {
  const [status, setStatus] = useState<MusicStatus>('stopped');
  const [trackId, setTrackId] = useState<string | null>(null);
  const playerRef = useRef<Player | null>(null);
  const clockRef = useRef<Clock>({ carriedMs: 0, startedAt: null });
  const endRef = useRef<number | null>(null);
  const onEndRef = useRef<(() => void) | undefined>(undefined);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fadeRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const generationRef = useRef(0);
  const statusRef = useRef<MusicStatus>('stopped');

  function set(next: MusicStatus) {
    statusRef.current = next;
    setStatus(next);
  }

  function clearTimers() {
    if (tickRef.current) clearInterval(tickRef.current);
    if (fadeRef.current) clearInterval(fadeRef.current);
    tickRef.current = null;
    fadeRef.current = null;
  }

  function release() {
    clearTimers();
    const player = playerRef.current;
    playerRef.current = null;
    if (player) {
      try {
        player.pause();
        player.remove();
      } catch {
        // Already released by the native side.
      }
    }
  }

  function applyVolume() {
    const player = playerRef.current;
    if (!player) return;
    const now = Date.now();
    const elapsed = clockElapsed(clockRef.current, now);
    if (isListenOver(elapsed, endRef.current)) {
      const done = onEndRef.current;
      hardStop();
      done?.();
      return;
    }
    player.volume = musicVolumeAt(elapsed, endRef.current);
  }

  function startTicking() {
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = setInterval(applyVolume, TICK_MS);
  }

  function hardStop() {
    generationRef.current += 1;
    release();
    clockRef.current = { carriedMs: 0, startedAt: null };
    endRef.current = null;
    onEndRef.current = undefined;
    setTrackId(null);
    set('stopped');
  }

  function start(id: string, endMs: number | null, onEnd?: () => void) {
    const track = findTrack(id);
    const source = track ? MEDITATION_SOURCES[track.id] : undefined;
    hardStop();
    if (!track || source == null) return;
    const generation = generationRef.current;
    endRef.current = endMs;
    onEndRef.current = onEnd;
    clockRef.current = { carriedMs: 0, startedAt: Date.now() };
    setTrackId(track.id);
    set('playing');
    void import('expo-audio')
      .then(async (audio) => {
        if (generation !== generationRef.current) return;
        try {
          await audio.setAudioModeAsync({
            playsInSilentMode: true,
            // Leaves other apps' audio alone. Spoken cues use their own iOS session.
            interruptionMode: 'mixWithOthers',
            allowsRecording: false,
            shouldPlayInBackground: MUSIC_PLAYS_WHEN_LOCKED,
          });
        } catch {
          // Playback still works with the default session.
        }
        if (generation !== generationRef.current) return;
        const player = audio.createAudioPlayer(source) as unknown as Player;
        player.loop = true;
        player.volume = 0;
        playerRef.current = player;
        if (statusRef.current === 'playing') {
          player.play();
          startTicking();
          applyVolume();
        }
      })
      .catch(() => {
        if (generation === generationRef.current) hardStop();
      });
  }

  function pause() {
    if (statusRef.current !== 'playing') return;
    clockRef.current = { carriedMs: clockElapsed(clockRef.current, Date.now()), startedAt: null };
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
    playerRef.current?.pause();
    set('paused');
  }

  function resume() {
    if (statusRef.current !== 'paused') return;
    clockRef.current = { ...clockRef.current, startedAt: Date.now() };
    set('playing');
    const player = playerRef.current;
    if (player) {
      player.play();
      startTicking();
      applyVolume();
    }
  }

  function stop(fadeMs = MUSIC_STOP_FADE_MS) {
    const player = playerRef.current;
    if (statusRef.current === 'stopped') return;
    if (!player || fadeMs <= 0 || statusRef.current === 'paused') {
      hardStop();
      return;
    }
    // Freeze the clock, then ramp from wherever the volume sits now.
    const generation = ++generationRef.current;
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
    const from = player.volume;
    const began = Date.now();
    endRef.current = null;
    onEndRef.current = undefined;
    setTrackId(null);
    set('stopped');
    fadeRef.current = setInterval(() => {
      if (generation !== generationRef.current) return;
      const since = Date.now() - began;
      const next = fadeOutVolume(from, since, fadeMs);
      if (next <= 0) {
        release();
        clockRef.current = { carriedMs: 0, startedAt: null };
        return;
      }
      player.volume = next;
    }, 50);
  }

  useEffect(() => () => {
    generationRef.current += 1;
    release();
  }, []);

  return {
    status,
    trackId,
    elapsedMs: (now = Date.now()) => clockElapsed(clockRef.current, now),
    start,
    pause,
    resume,
    stop,
  };
}
