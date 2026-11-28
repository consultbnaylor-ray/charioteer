import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';

import { useMeditationMusic } from '@/audio/meditationMusic';
import {
  DEFAULT_LISTEN_LENGTH,
  LISTEN_LENGTHS,
  MEDITATION_TRACKS,
  findTrack,
  listenLengthMs,
  minutesSecondsText,
  musicChoices,
  type ListenLength,
  type MusicChoice,
} from '@/domain/meditationTracks';
import { Button, Card, Choice, T } from '@/ui/ui';
import { useAppTheme } from '@/ui/theme';

/** Keeps the screen on while `active`, so music and the breathing clock carry on. */
export function useKeepAwakeWhile(active: boolean, tag: string) {
  useEffect(() => {
    if (!active) return undefined;
    let gone = false;
    void import('expo-keep-awake').then(async (mod) => {
      if (gone) return;
      try {
        await mod.activateKeepAwakeAsync(tag);
      } catch {
        // A browser can refuse the wake lock.
      }
    }).catch(() => undefined);
    return () => {
      gone = true;
      void import('expo-keep-awake').then((mod) => mod.deactivateKeepAwake(tag)).catch(() => undefined);
    };
  }, [active, tag]);
}

/** The optional Music choice inside a breathing exercise. Off, or one of the tracks, as big buttons. */
export function MusicChoiceRow({ value, onChange }: { value: MusicChoice; onChange: (next: MusicChoice) => void }) {
  return (
    <View style={{ gap: 6 }}>
      <T variant="label">Music</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {musicChoices().map((item) => (
          <View key={item.id} style={{ flexGrow: 1, flexBasis: '45%' }}>
            <Choice label={item.label} selected={value === item.id} onPress={() => onChange(item.id)} />
          </View>
        ))}
      </View>
    </View>
  );
}

/** Just listen: pick a track and a length, then Play. Fades in, and fades out at the end of 10 minutes. */
export function MeditationListen() {
  const theme = useAppTheme();
  const music = useMeditationMusic();
  const [trackId, setTrackId] = useState(MEDITATION_TRACKS[0]?.id ?? '');
  const [length, setLength] = useState<ListenLength>(DEFAULT_LISTEN_LENGTH);
  const [now, setNow] = useState(Date.now());
  const playing = music.status !== 'stopped';
  const endMs = listenLengthMs(length);
  const track = findTrack(trackId);

  useKeepAwakeWhile(music.status === 'playing', 'charioteer-music');

  useEffect(() => {
    if (music.status !== 'playing') return undefined;
    const tick = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(tick);
  }, [music.status]);

  function tap() {
    if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  function play() {
    tap();
    if (music.status === 'paused') {
      music.resume();
      return;
    }
    music.start(trackId, endMs);
    setNow(Date.now());
  }

  const elapsed = music.elapsedMs(now);
  const status =
    music.status === 'stopped'
      ? null
      : endMs == null
        ? `${music.status === 'paused' ? 'Paused' : 'Playing'}. Loops until you tap Stop.`
        : `${music.status === 'paused' ? 'Paused' : 'Playing'}. ${minutesSecondsText(endMs - elapsed)} left.`;
  const control = music.status === 'playing' ? 'Pause' : music.status === 'paused' ? 'Resume' : 'Play';

  return (
    <Card>
      <T variant="title">Meditation music</T>
      <T variant="muted">Calm music to sit with. It also plays, if you choose it, under any breathing exercise.</T>
      <T variant="label">Track</T>
      <View style={{ gap: 8 }}>
        {MEDITATION_TRACKS.map((item) => (
          <Choice
            key={item.id}
            label={item.title}
            selected={trackId === item.id}
            onPress={() => {
              if (playing && item.id !== trackId) music.stop(0);
              setTrackId(item.id);
            }}
          />
        ))}
      </View>
      <T variant="label">How long</T>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {LISTEN_LENGTHS.map((item) => (
          <View key={item.id} style={{ flex: 1 }}>
            <Choice
              label={item.label}
              selected={length === item.id}
              onPress={() => {
                if (playing && item.id !== length) music.stop(0);
                setLength(item.id);
              }}
            />
          </View>
        ))}
      </View>
      {status ? <T>{status}</T> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={track ? `${control} ${track.title}` : control}
        onPress={() => (music.status === 'playing' ? (tap(), music.pause()) : play())}
        hitSlop={8}
        style={({ pressed }) => ({
          minHeight: 52,
          borderRadius: theme.radius.md,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 18,
          backgroundColor: pressed ? theme.colors.muted : theme.colors.ink,
          opacity: pressed ? 0.86 : 1,
        })}
      >
        <T style={{ color: theme.colors.bg, fontFamily: theme.font.bodyStrong }}>{control}</T>
      </Pressable>
      {playing ? (
        <Button
          label="Stop"
          tone="quiet"
          accessibilityLabel="Stop music"
          onPress={() => {
            tap();
            music.stop();
          }}
        />
      ) : null}
    </Card>
  );
}
