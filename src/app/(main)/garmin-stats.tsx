import { useRouter } from 'expo-router';

import { useSnapshot } from '@/data';
import { appleDayValues } from '@/domain/dailyActivity';
import { londonDay } from '@/domain/healthInsights';
import { useHealthSources } from '@/health/useHealthSources';
import { MovementCharts } from '@/ui/DailyActivity';
import { Button, Screen } from '@/ui/ui';

export default function GarminStats() {
  const snap = useSnapshot();
  const router = useRouter();
  const { readings } = useHealthSources();
  if (!snap.profile) return null;
  return (
    <Screen eyebrow="Garmin" title="More Garmin Stats">
      <Button label="Back" tone="quiet" onPress={() => router.back()} />
      <MovementCharts
        detailsOnly
        endDay={londonDay(new Date())}
        steps={appleDayValues(snap.health, 'steps')}
        restingHeart={appleDayValues(snap.health, 'resting_heart_rate')}
        dailies={readings.dailies}
        sleep={readings.sleep}
        respiration={readings.respiration}
        pulseOx={readings.pulseOx}
        hrv={readings.hrv}
        appleHrvSdnn={appleDayValues(snap.health, 'hrv_sdnn')}
        userMetrics={readings.userMetrics}
        bloodPressure={readings.bloodPressure}
        bodyComp={readings.bodyComp}
        skinTemp={readings.skinTemp}
        stress={readings.stress}
        epochs={readings.epochs}
        healthSnapshot={readings.healthSnapshot}
        moveIq={readings.moveIq}
        activityDetails={readings.activityDetails}
        age={snap.nutrition.goalAge}
        sex={snap.nutrition.goalSex}
        goal={snap.nutrition.goal}
        showIntensity={false}
        showVo2Chart={false}
      />
    </Screen>
  );
}
