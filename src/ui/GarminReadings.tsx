import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { useRepository } from '@/data';
import { emptyGarminReadings, garminFigures, type GarminFigure, type GarminReadings } from '@/domain/garminConnect';
import { useAppTheme } from '@/ui/theme';
import { Card, T } from '@/ui/ui';

/** Garmin summaries beside Apple Health. Grey ink. Oldest bar on the left. */
export function GarminReadings() {
  const repo = useRepository();
  const [readings, setReadings] = useState<GarminReadings>(emptyGarminReadings);

  const load = useCallback(() => {
    void repo.loadGarmin().then(setReadings).catch(() => setReadings(emptyGarminReadings()));
  }, [repo]);

  useFocusEffect(load);

  const shown = garminFigures(readings);
  const figures = [shown.heartRate, shown.sleep, ...shown.sleepStages, shown.effort, shown.anaerobic].filter(
    (item): item is GarminFigure => item != null,
  );

  return (
    <Card>
      <T variant="label">Garmin Connect</T>
      {readings.connected ? <T>Connected</T> : <T variant="muted">Not connected. Connect it from You.</T>}
      {figures.map((item) => <Figure key={`${item.name}-${item.period}`} item={item} />)}
      {shown.workouts.map((item) => <Figure key={`${item.name}-${item.value}-${item.period}`} item={item} />)}
      <Bars values={shown.heartChart} label="Resting heart rate, beats per minute, 14 days, oldest on the left." />
      <Bars values={shown.sleepChart} label="Sleep, hours, 14 nights, oldest on the left." />
      <Bars values={shown.effortChart} label="Training effect, score, oldest on the left." />
    </Card>
  );
}

function Figure({ item }: { item: GarminFigure }) {
  return (
    <View accessibilityLabel={`${item.name} ${item.value} ${item.unit}, ${item.period}`}>
      <T>{item.name}</T>
      <T>{item.value} {item.unit}</T>
      <T variant="muted">{item.period}</T>
    </View>
  );
}

function Bars({ values, label }: { values: number[]; label: string }) {
  const theme = useAppTheme();
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  return (
    <View accessibilityLabel={label} style={{ gap: 6 }}>
      <T variant="muted">{label}</T>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 48 }}>
        {values.map((value, index) => (
          <View
            key={`${index}-${value}`}
            style={{
              flex: 1,
              height: Math.max(2, Math.round((value / max) * 48)),
              backgroundColor: theme.colors.ink,
            }}
          />
        ))}
      </View>
    </View>
  );
}
