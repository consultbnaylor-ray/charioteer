import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState, View } from 'react-native';

import { useRepository, useSnapshot } from '@/data';
import type { NewHealthSample } from '@/data/types';
import { weightChart } from '@/domain/chartSeries';
import { formatUkLong, isoDay } from '@/domain/dates';
import { shownError } from '@/domain/errors';
import { boxingClassWindow } from '@/domain/goalWeightRange';
import { parseHeightCm } from '@/domain/guidance';
import { healthFigure } from '@/domain/measureFigures';
import { withPlannedMinutes } from '@/domain/plannedSession';
import { weightWaistWrite, type WaistSampleWrite, type WeightReadingDraft } from '@/domain/weightEntry';
import { catchUpAppleHealthReads } from '@/health/catchUp';
import { type AppleHealthTurnOn } from '@/health/connection';
import { turnOnAppleHealthReads } from '@/health/link';
import { useHealthSources } from '@/health/useHealthSources';
import { useStatPeriod } from '@/health/useStatPeriod';
import { HealthBoard, HealthReadings } from '@/ui/HealthBoard';
import { HealthStatBoard, type HealthTurnOnResult } from '@/ui/HealthStatBoard';
import { HealthFigureView } from '@/ui/MeasuredFigure';
import { WeightTrendChart } from '@/ui/NutritionCharts';
import { PlanTick } from '@/ui/PlanTick';
import { BodyCompositionCard } from '@/ui/BodyComposition';
import { ScrollTarget } from '@/ui/ScrollTarget';
import { StatPeriodToggle } from '@/ui/StatPeriodToggle';
import { WEIGHT_WAIST_TITLE } from '@/ui/WeightWaistLink';
import { IconLabel } from '@/ui/statIcons';
import { Button, Card, ErrorNote, Screen, T, playSavedHaptic } from '@/ui/ui';

/**
 * Body: weight, waist, height, and BMI.
 * Route: /weight-waist. Opened from the menu, the Health stats row, and You.
 */
export default function WeightWaistScreen() {
  const snap = useSnapshot();
  const repo = useRepository();
  const router = useRouter();
  const consent = Boolean(snap.profile?.consentHealth);
  const [period] = useStatPeriod();
  const { samples: mergedHealth } = useHealthSources();
  const healthSamples = withPlannedMinutes(mergedHealth, snap.plannedSessions);
  const [weightDraft, setWeightDraft] = useState<WeightReadingDraft | null>(null);
  const [weightReset, setWeightReset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [savePending, setSavePending] = useState(false);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const refreshLink = useCallback(() => {
    if (!consent) return;
    void catchUpAppleHealthReads(repo).then((result) => {
      if (result.error) setRefreshError(result.error);
      else setRefreshError(null);
    }).catch((err: unknown) => {
      setRefreshError(shownError(err, 'Could not refresh Apple Health.'));
    });
  }, [consent, repo]);

  useFocusEffect(useCallback(() => {
    refreshLink();
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') refreshLink();
    });
    return () => subscription.remove();
  }, [refreshLink]));

  useEffect(() => {
    if (!savedNote) return;
    const timer = setTimeout(() => setSavedNote(null), 2500);
    return () => clearTimeout(timer);
  }, [savedNote]);

  const reportWeight = useCallback((draft: WeightReadingDraft | null) => {
    setWeightDraft((current) => {
      if (current == null && draft == null) return current;
      if (
        current
        && draft
        && current.kg === draft.kg
        && current.recordedOn === draft.recordedOn
        && current.heightText === draft.heightText
        && current.waistCm === draft.waistCm
      ) {
        return current;
      }
      return draft;
    });
  }, []);

  async function turnOnMissing(types: readonly string[]): Promise<HealthTurnOnResult> {
    if (!consent) {
      router.push('/privacy' as never);
      return 'consent';
    }
    const result: AppleHealthTurnOn = await turnOnAppleHealthReads(types);
    if (result === 'prompted') refreshLink();
    return result;
  }

  function saveReading() {
    if (!weightDraft) return;
    const planned = weightWaistWrite(weightDraft, isoDay(new Date()));
    if (!planned.ok) {
      setError(planned.error);
      return;
    }
    const height = parseHeightCm(weightDraft.heightText);
    if (!height.ok) {
      setError(height.error);
      return;
    }
    const samples: NewHealthSample[] = [];
    if (planned.sample) samples.push(planned.sample);
    const nextHeight = height.value !== (snap.profile?.heightCm ?? null) ? height.value : undefined;
    const waistWrite: WaistSampleWrite | null = planned.waist;
    if (samples.length === 0 && nextHeight === undefined && waistWrite == null) return;
    setError(null);
    setSavePending(true);
    void (async () => {
      try {
        if (nextHeight !== undefined) await repo.updateProfile({ heightCm: nextHeight });
        if (samples.length) await repo.saveHealth(samples);
        if (waistWrite) await repo.saveBodyComposition(waistWrite);
        setWeightReset((token) => token + 1);
        setSavedNote('Saved');
        playSavedHaptic();
      } catch (err: unknown) {
        setError(shownError(err, 'Could not save.'));
      } finally {
        setSavePending(false);
      }
    })();
  }

  const saveBar = weightDraft != null || savePending || savedNote != null;
  const today = isoDay(new Date());
  const weights = weightChart(snap.health).map((point) => ({ day: point.day, kg: point.value }));

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/health' as never);
  }

  return (
    <Screen
      eyebrow="Health"
      title={WEIGHT_WAIST_TITLE}
      intro="Weight, waist and BMI."
      footer={saveBar ? (
        <View style={{ gap: 8 }}>
          {savedNote ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <PlanTick done />
              <T>{savedNote}</T>
            </View>
          ) : null}
          <Button
            label="Save reading"
            pending={savePending}
            disabled={!consent || savePending || weightDraft == null}
            disabledReason={!consent ? 'Turn on health data to save a reading.' : weightDraft != null ? undefined : 'Add a reading to save.'}
            onPress={saveReading}
          />
        </View>
      ) : undefined}
    >
      <HealthBoard
        weightPart="entry"
        samples={healthSamples.filter((sample) => sample.kind === 'weight_kg')}
        today={isoDay(new Date())}
        soberOn={snap.profile?.stage === 'stopped' && snap.profile.sobrietyStartedAt ? isoDay(new Date(snap.profile.sobrietyStartedAt)) : null}
        stage={snap.profile?.stage ?? null}
        heightCm={snap.profile?.heightCm ?? null}
        adult={snap.profile?.ageConfirmed18 !== false}
        canSaveHeight={consent}
        showWeek={false}
        kinds={['weight_kg']}
        onSaveHeight={async (heightCm) => {
          await repo.updateProfile({ heightCm });
        }}
        onWeightDraftChange={reportWeight}
        weightReset={weightReset}
      />
      <Button label="Back" tone="quiet" onPress={goBack} />
      <StatPeriodToggle />
      <HealthBoard
        weightPart="charts"
        samples={healthSamples.filter((sample) => sample.kind === 'weight_kg')}
        today={isoDay(new Date())}
        soberOn={snap.profile?.stage === 'stopped' && snap.profile.sobrietyStartedAt ? isoDay(new Date(snap.profile.sobrietyStartedAt)) : null}
        stage={snap.profile?.stage ?? null}
        heightCm={snap.profile?.heightCm ?? null}
        adult={snap.profile?.ageConfirmed18 !== false}
        canSaveHeight={consent}
        showWeek={false}
        kinds={['weight_kg']}
        onSaveHeight={async (heightCm) => {
          await repo.updateProfile({ heightCm });
        }}
        onWeightDraftChange={reportWeight}
        weightReset={weightReset}
      />
      <HealthStatBoard
        onlyTiles={['weight_kg', 'waist']}
        today={isoDay(new Date())}
        samples={healthSamples}
        body={snap.bodyComposition}
        activityEnergyKcal={snap.nutrition.activityEnergyKcal}
        heightCm={snap.profile?.heightCm ?? null}
        adult={snap.profile?.ageConfirmed18 !== false}
        goalAge={snap.nutrition.goalAge}
        goalSex={snap.nutrition.goalSex}
        goal={snap.nutrition.goal}
        build={snap.nutrition.build}
        workoutBuckets={snap.nutrition.workoutBuckets}
        period={period}
        onTurnOn={turnOnMissing}
      />
      <ScrollTarget id="body">
        <BodyCompositionCard />
      </ScrollTarget>
      <ScrollTarget id="weight-chart">
        <Card>
          <IconLabel name="scale">Weight</IconLabel>
          <HealthFigureView
            figure={healthFigure(
              'weight_kg',
              weights.map((point) => ({ day: point.day, value: point.kg })),
              today,
              { classWindow: boxingClassWindow(snap.nutrition.goal, snap.nutrition.goalSex) },
            )}
          />
          {weights.length === 0 ? <T variant="muted">No weight logged yet.</T> : (
            <>
              {weights.map((point) => (
                <T key={point.day}>{`${formatUkLong(point.day)} · ${point.kg} kg`}</T>
              ))}
              <WeightTrendChart points={weights} goal={snap.nutrition.goal} />
            </>
          )}
        </Card>
      </ScrollTarget>
      <HealthReadings samples={healthSamples} kinds={['weight_kg']} />
      <ErrorNote>{error ?? refreshError}</ErrorNote>
    </Screen>
  );
}
