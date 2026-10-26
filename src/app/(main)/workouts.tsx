import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';

import { useSnapshot } from '@/data';
import { appleDayValues } from '@/domain/dailyActivity';
import { garminStoredMark } from '@/domain/healthRefresh';
import { exercisePermissionMissing, type HealthVisibilityReport } from '@/domain/healthVisibility';
import { readHealthVisibility } from '@/health/visibility';
import { useHealthSources } from '@/health/useHealthSources';
import { HealthRefreshBar, useManualHealthRefresh } from '@/ui/HealthRefresh';
import { GarminPermissionNotice } from '@/ui/GarminPermissionNotice';
import { WorkoutCalendar } from '@/ui/WorkoutCalendar';
import { WorkoutList } from '@/ui/WorkoutList';
import { Button, Screen } from '@/ui/ui';

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

export default function WorkoutsScreen() {
  const router = useRouter();
  const snap = useSnapshot();
  const { workouts, readings, activity } = useHealthSources();
  const manual = useManualHealthRefresh(readings.connected);
  const params = useLocalSearchParams<{ planDay?: string; planNonce?: string; planOutdoor?: string }>();
  const [visibility, setVisibility] = useState<HealthVisibilityReport | null>(null);
  useFocusEffect(useCallback(() => {
    let live = true;
    void readHealthVisibility()
      .then((report) => {
        if (live) setVisibility(report);
      })
      .catch(() => {
        if (live) setVisibility(null);
      });
    return () => {
      live = false;
    };
  }, []));
  if (!snap.profile) return null;
  const planDayRaw = one(params.planDay);
  const planDay = /^\d{4}-\d{2}-\d{2}$/.test(planDayRaw) ? planDayRaw : null;
  const planNonce = Number(one(params.planNonce)) || 0;
  const planOutdoorNonce = Number(one(params.planOutdoor)) || 0;

  return (
    <Screen
      eyebrow="Health"
      title="Workouts"
      intro="Your workout calendar and history."
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
      <GarminPermissionNotice />
      <Button label="Start live session" onPress={() => router.push('/gym-session' as never)} />
      <Button label="Back" tone="quiet" onPress={() => router.back()} />
      <WorkoutList
        workouts={workouts}
        age={snap.nutrition.goalAge}
        consent={snap.profile.consentHealth}
        exerciseMinutes={activity.exerciseMinutes}
        activeKcal={activity.activeKcal}
        dailies={readings.dailies}
        steps={appleDayValues(snap.health, 'steps')}
        restingHeart={appleDayValues(snap.health, 'resting_heart_rate')}
        sleep={readings.sleep}
        respiration={readings.respiration}
        pulseOx={readings.pulseOx}
        hrv={readings.hrv}
        userMetrics={readings.userMetrics}
        sex={snap.nutrition.goalSex}
        exercisePermissionMissing={exercisePermissionMissing(visibility)}
      />
      <WorkoutCalendar
        planDay={planDay}
        planNonce={planNonce}
        planOutdoorNonce={planOutdoorNonce}
        workouts={workouts}
        age={snap.nutrition.goalAge}
      />
    </Screen>
  );
}
