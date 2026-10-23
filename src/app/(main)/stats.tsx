import { useRouter } from 'expo-router';
import { useWindowDimensions, View } from 'react-native';

import { useSnapshot } from '@/data';
import { useHealthSources } from '@/health/useHealthSources';
import { buildStatsOverview } from '@/domain/statsOverview';
import { useStatPeriod } from '@/health/useStatPeriod';
import { StatTile } from '@/ui/StatTile';
import { StatPeriodToggle } from '@/ui/StatPeriodToggle';
import { statsToneColors } from '@/ui/statsPalette';
import { useAppTheme } from '@/ui/theme';
import { GoalLine } from '@/ui/GoalLine';
import { YourFitness } from '@/ui/YourFitness';
import { WorkoutsLink } from '@/ui/WorkoutsLink';
import { YourGoal } from '@/ui/YourGoal';
import { HealthRefreshBar, useManualHealthRefresh } from '@/ui/HealthRefresh';
import { Card, Screen, T } from '@/ui/ui';

const LEGEND = [
  ['good', 'On track'],
  ['watch', 'Watch'],
  ['info', 'Note'],
  ['attention', 'Needs attention'],
] as const;

export default function Stats() {
  const snap = useSnapshot();
  const theme = useAppTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [period] = useStatPeriod();
  const { samples: mergedHealth, workouts, readings } = useHealthSources();
  const manual = useManualHealthRefresh(readings.connected);
  const profile = snap.profile;
  if (!profile) return null;
  const tiles = buildStatsOverview({
    now: new Date(),
    period,
    stage: profile.stage,
    sobrietyStartedAt: profile.sobrietyStartedAt,
    plannedQuitAt: profile.plannedQuitAt,
    drinkFreeOn: profile.drinkFreeOn,
    drinkFreeDaysGoal: profile.drinkFreeDaysGoal,
    checkIns: snap.checkIns,
    health: mergedHealth,
    heightCm: profile.heightCm,
    nutrition: snap.nutrition,
    foodLogs: snap.foodLogs,
    waterDays: snap.waterDays,
    bodyComposition: snap.bodyComposition,
    gratitude: snap.gratitude,
  });
  const columns = width >= 720 ? 3 : 2;
  const colors = statsToneColors(theme.scheme);

  return (
    <Screen
      eyebrow="Overview"
      title="Stats"
      intro="A plain look at the figures you already keep. The words say what the colour means."
      refreshing={manual.refreshing}
      onRefresh={() => void manual.run()}
    >
      <HealthRefreshBar
        label={manual.label}
        lastLine={manual.lastLine}
        refreshing={manual.refreshing}
        updated={manual.updated}
        error={manual.error}
        garminNote={manual.garminNote}
        onPress={() => void manual.run()}
      />
      <StatPeriodToggle />
      <GoalLine />
      <YourGoal place="stats" />
      <YourFitness />
      <WorkoutsLink workouts={workouts} />
      <Card accessibilityLabel="Open Health Plan" onPress={() => router.push('/health-plan' as never)}>
        <T style={{ fontFamily: theme.font.bodyStrong }}>Health Plan</T>
        <T variant="muted">A short plan from the figures you already keep.</T>
      </Card>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {LEGEND.map(([tone, label]) => (
          <View key={tone} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: colors[tone].bg, borderWidth: 1, borderColor: colors[tone].ink }} />
            <T>{label}</T>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {tiles.map((item) => (
          <View key={item.id} style={{ flexGrow: 1, flexBasis: columns === 3 ? '30%' : '46%', minWidth: 148 }}>
            <StatTile tile={item} />
          </View>
        ))}
      </View>
    </Screen>
  );
}
