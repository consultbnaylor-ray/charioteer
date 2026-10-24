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
import { appleDayValues } from '@/domain/dailyActivity';
import { londonDay } from '@/domain/healthInsights';
import { garminStoredMark } from '@/domain/healthRefresh';
import { MovementCharts } from '@/ui/DailyActivity';
import { HealthRefreshBar, useManualHealthRefresh } from '@/ui/HealthRefresh';
import { MoreInfo } from '@/ui/MoreInfo';
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
      intro={(
        <MoreInfo about="Stats">
          <T variant="muted">A plain look at the figures you already keep. The words say what the colour means.</T>
        </MoreInfo>
      )}
      refreshing={manual.refreshing}
      onRefresh={() => void manual.run()}
    >
      <HealthRefreshBar
        refreshing={manual.refreshing}
        appleCheckedAt={manual.appleCheckedAt}
        garminConnected={readings.connected}
        garminReceivedAt={readings.lastPushAt}
        garminMark={garminStoredMark(readings)}
        error={manual.error}
        permission={manual.permission}
        history={manual.history}
        garminNote={manual.garminNote}
        onPress={() => void manual.run()}
      />
      <MovementCharts
        endDay={londonDay(new Date())}
        steps={appleDayValues(snap.health, 'steps')}
        restingHeart={appleDayValues(snap.health, 'resting_heart_rate')}
        dailies={readings.dailies}
        sleep={readings.sleep}
        respiration={readings.respiration}
        pulseOx={readings.pulseOx}
        hrv={readings.hrv}
        userMetrics={readings.userMetrics}
        age={snap.nutrition.goalAge}
        sex={snap.nutrition.goalSex}
      />
      <Card>
        <StatPeriodToggle />
      </Card>
      <Card>
        <GoalLine />
      </Card>
      <YourGoal place="stats" />
      <YourFitness />
      <WorkoutsLink workouts={workouts} />
      <Card accessibilityLabel="Open Health Plan" onPress={() => router.push('/health-plan' as never)}>
        <T style={{ fontFamily: theme.font.bodyStrong }}>Health Plan</T>
        <T variant="muted">A short plan from the figures you already keep.</T>
      </Card>
      <Card>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          {LEGEND.map(([tone, label]) => (
            <View key={tone} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: colors[tone].bg, borderWidth: 1, borderColor: colors[tone].ink }} />
              <T>{label}</T>
            </View>
          ))}
        </View>
      </Card>
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
