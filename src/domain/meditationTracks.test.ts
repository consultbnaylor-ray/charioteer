import { existsSync, readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  LISTEN_LENGTHS,
  LISTEN_TEN_MINUTES_MS,
  MEDITATION_TRACKS,
  MUSIC_END_FADE_MS,
  MUSIC_FADE_IN_MS,
  MUSIC_OFF,
  MUSIC_VOLUME,
  fadeOutVolume,
  findTrack,
  isListenOver,
  listenLengthMs,
  minutesSecondsText,
  musicChoices,
  musicVolumeAt,
  passesFor,
} from '@/domain/meditationTracks';
import { APP_SECTIONS, BREATHE_SECTION_TITLE, TAB_SECTIONS } from '@/domain/sections';

describe('meditation track list', () => {
  it('has unique ids and a bundled file under 5 MB for every track', () => {
    const ids = MEDITATION_TRACKS.map((track) => track.id);
    expect(new Set(ids).size).toBe(ids.length);
    const sources = readFileSync('src/audio/meditationSources.ts', 'utf8');
    for (const track of MEDITATION_TRACKS) {
      const path = `assets/audio/meditation/${track.file}`;
      expect(existsSync(path)).toBe(true);
      expect(statSync(path).size).toBeLessThan(5 * 1024 * 1024);
      expect(track.file).toMatch(/\.m4a$/);
      expect(sources).toContain(`'${track.id}': require('../../assets/audio/meditation/${track.file}')`);
      expect(track.durationMs).toBeGreaterThan(60_000);
      expect(track.title.length).toBeGreaterThan(0);
    }
  });

  it('starts with Calm Waters', () => {
    expect(findTrack('calm-waters')?.title).toBe('Calm Waters');
    expect(findTrack('nope')).toBeNull();
    expect(findTrack(MUSIC_OFF)).toBeNull();
  });

  it('offers Off first, then every track, for the Music choice', () => {
    expect(musicChoices()).toEqual([{ id: 'off', label: 'Off' }, ...MEDITATION_TRACKS.map((t) => ({ id: t.id, label: t.title }))]);
  });

  it('offers 10 minutes and a continuous loop', () => {
    expect(LISTEN_LENGTHS.map((item) => item.label)).toEqual(['10 minutes', 'Continuous loop']);
    expect(listenLengthMs('ten')).toBe(600_000);
    expect(listenLengthMs('loop')).toBeNull();
  });
});

describe('loop and fade timing', () => {
  it('fades in from silence, then holds under the cues', () => {
    expect(musicVolumeAt(0, null)).toBe(0);
    expect(musicVolumeAt(MUSIC_FADE_IN_MS / 2, null)).toBeCloseTo(MUSIC_VOLUME / 2);
    expect(musicVolumeAt(MUSIC_FADE_IN_MS, null)).toBe(MUSIC_VOLUME);
    // Nonstop: still at full music volume hours in.
    expect(musicVolumeAt(5 * 3_600_000, null)).toBe(MUSIC_VOLUME);
    expect(MUSIC_VOLUME).toBeLessThan(1);
  });

  it('fades out over the last stretch of a 10 minute listen and is silent at the end', () => {
    const end = LISTEN_TEN_MINUTES_MS;
    expect(musicVolumeAt(end - MUSIC_END_FADE_MS - 1, end)).toBe(MUSIC_VOLUME);
    expect(musicVolumeAt(end - MUSIC_END_FADE_MS / 2, end)).toBeCloseTo(MUSIC_VOLUME / 2);
    expect(musicVolumeAt(end - 1, end)).toBeLessThan(0.01);
    expect(musicVolumeAt(end, end)).toBe(0);
    expect(isListenOver(end - 1, end)).toBe(false);
    expect(isListenOver(end, end)).toBe(true);
    expect(isListenOver(10 * end, null)).toBe(false);
  });

  it('never lets the end fade push the volume above the fade-in on a very short listen', () => {
    expect(musicVolumeAt(1_000, 4_000, { fadeInMs: 3_000, endFadeMs: 10_000 })).toBeLessThanOrEqual(MUSIC_VOLUME / 3 + 0.001);
  });

  it('loops the 5 minute file twice and a bit to fill 10 minutes', () => {
    const track = MEDITATION_TRACKS[0];
    expect(passesFor(track, LISTEN_TEN_MINUTES_MS)).toBe(2);
    expect(passesFor({ ...track, durationMs: 240_000 }, LISTEN_TEN_MINUTES_MS)).toBe(3);
    expect(passesFor(track, null)).toBeNull();
  });

  it('ramps a stop down to nothing', () => {
    expect(fadeOutVolume(0.8, 0, 1_500)).toBe(0.8);
    expect(fadeOutVolume(0.8, 750, 1_500)).toBeCloseTo(0.4);
    expect(fadeOutVolume(0.8, 1_500, 1_500)).toBe(0);
    expect(fadeOutVolume(0.8, 100, 0)).toBe(0);
  });

  it('shows the time left as minutes and seconds', () => {
    expect(minutesSecondsText(600_000)).toBe('10:00');
    expect(minutesSecondsText(452_100)).toBe('7:33');
    expect(minutesSecondsText(-5)).toBe('0:00');
  });
});

describe('Breath Work and Meditation screen', () => {
  const breathe = readFileSync('src/app/(main)/breathe.tsx', 'utf8');
  const wimHof = readFileSync('src/ui/WimHofBreathing.tsx', 'utf8');
  const music = readFileSync('src/ui/MeditationMusic.tsx', 'utf8');
  const player = readFileSync('src/audio/meditationMusic.ts', 'utf8');

  it('uses the full name on the screen and in the menu, and the short tab label', () => {
    expect(BREATHE_SECTION_TITLE).toBe('Breath Work and Meditation');
    expect(APP_SECTIONS.find((s) => s.id === 'breathe')?.label).toBe('Breath Work and Meditation');
    expect(TAB_SECTIONS.find((s) => s.id === 'breathe')?.tabLabel).toBe('Breathe');
    expect(breathe).toContain('title={BREATHE_SECTION_TITLE}');
  });

  it('lists the music to just listen to, and offers it in every breathing exercise', () => {
    expect(breathe).toContain('<MeditationListen />');
    expect(breathe).toContain('<MusicChoiceRow value={musicChoice} onChange={setMusicChoice} />');
    expect(wimHof).toContain('<MusicChoiceRow value={musicChoice} onChange={setMusicChoice} />');
    // Music is off unless chosen.
    expect(breathe).toContain('useState<MusicChoice>(MUSIC_OFF)');
    expect(wimHof).toContain('useState<MusicChoice>(MUSIC_OFF)');
  });

  it('loops for the whole Wim Hof session, pauses with Pause, and fades out at the end or on Stop', () => {
    expect(wimHof).toContain('music.start(musicChoice, null)');
    expect(wimHof).toContain('music.pause()');
    expect(wimHof).toContain('music.resume()');
    expect(wimHof).toContain('music.stop(MUSIC_DONE_FADE_MS)');
    expect(wimHof).toContain('music.stop()');
  });

  it('plays a short bundled file on a runtime loop, with no scrolling pickers', () => {
    expect(player).toContain('player.loop = true');
    expect(player).toContain("import('expo-audio')");
    expect(player).toContain("interruptionMode: 'mixWithOthers'");
    expect(player).toContain('shouldPlayInBackground: MUSIC_PLAYS_WHEN_LOCKED');
    expect(player).not.toMatch(/https?:\/\//);
    for (const source of [breathe, wimHof, music]) expect(source).not.toMatch(/Picker|ScrollView/);
  });

  it('does not list the expo-audio config plugin, so the plist and background modes stay as they are', () => {
    const app = JSON.parse(readFileSync('app.json', 'utf8')) as { expo: { plugins: unknown[] } };
    const names = app.expo.plugins.map((entry) => (Array.isArray(entry) ? entry[0] : entry));
    expect(names).not.toContain('expo-audio');
  });
});
