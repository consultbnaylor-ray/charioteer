import { useEffect, useState } from 'react';
import { Switch, View } from 'react-native';

import {
  ACTIVITY_UPDATE_FALLBACK,
  readActivityUpdates,
  writeActivityUpdates,
  type ActivityUpdateChoice,
} from '@/activity/updateDefaults';
import { AUDIO_DUCK_LINE, SPEECH_GATE_NOTE } from '@/domain/activitySession';
import { useAppTheme } from '@/ui/theme';
import { Card, Choice, T } from '@/ui/ui';

/** The lasting default for an outing and a gym session. It starts off. */
export function ActivityUpdatesCard() {
  const theme = useAppTheme();
  const [choice, setChoice] = useState<ActivityUpdateChoice>(ACTIVITY_UPDATE_FALLBACK);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let gone = false;
    void readActivityUpdates().then((stored) => {
      if (gone) return;
      setChoice(stored);
      setReady(true);
    }).catch(() => setReady(true));
    return () => {
      gone = true;
    };
  }, []);

  function save(next: ActivityUpdateChoice) {
    setChoice(next);
    if (!ready) return;
    void writeActivityUpdates(next).catch(() => undefined);
  }

  return (
    <Card>
      <T variant="label">Activity updates</T>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
        <T style={{ flex: 1 }}>Thumos updates</T>
        <Switch
          accessibilityLabel="Activity updates"
          value={choice.enabled}
          onValueChange={(enabled) => save({ ...choice, enabled })}
          trackColor={{ true: theme.colors.ink, false: theme.colors.line }}
          thumbColor={theme.colors.surface}
        />
      </View>
      <T variant="muted">The default for a walk, run, cycle, or a live session in Workouts. Each one can still change it for that session.</T>
      {choice.enabled ? (
        <>
          {([
            [3, '3 minutes'],
            [5, '5 minutes'],
            [10, '10 minutes'],
          ] as const).map(([value, label]) => (
            <Choice
              key={label}
              label={label}
              selected={choice.intervalMin === value}
              onPress={() => save({ ...choice, intervalMin: value })}
            />
          ))}
          <Choice label="Spoken and on screen" selected={choice.spoken} onPress={() => save({ ...choice, spoken: true })} />
          <Choice label="On screen only" selected={!choice.spoken} onPress={() => save({ ...choice, spoken: false })} />
        </>
      ) : null}
      {choice.enabled && choice.spoken ? <T variant="muted">{AUDIO_DUCK_LINE}</T> : null}
      {choice.enabled && choice.spoken ? <T variant="muted">{SPEECH_GATE_NOTE}</T> : null}
    </Card>
  );
}
