import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Platform, View } from 'react-native';

import { useRepository, useSnapshot } from '@/data';
import type { HealthKind, NewHealthSample } from '@/data/types';
import { isoDay, startOfLocalDay } from '@/domain/dates';
import { shownError } from '@/domain/errors';
import {
  HEALTH_SHEET_ASKED,
  HEALTH_SHEET_WONT_SHOW,
} from '@/domain/healthStatTiles';
import { rebucketStoredMinutes, withWorkoutBucket } from '@/domain/fitnessSnapshot';
import { withPlannedMinutes } from '@/domain/plannedSession';
import type { BodyEntrySource, WorkoutBucket } from '@/domain/nutrition';
import {
  APPLE_HEALTH_CONSENT,
  APPLE_HEALTH_DENIED,
  APPLE_HEALTH_READ_TYPES,
  APPLE_HEALTH_UNAVAILABLE,
  APPLE_HEALTH_WEB,
  isHealthAccessDenied,
  type AppleHealthAccess,
  type AppleHealthTurnOn,
} from '@/health/connection';
import { healthMissingReadings, type HealthVisibilityReport } from '@/domain/healthVisibility';
import { catchUpAppleHealthReads, refreshAppleHealth } from '@/health/catchUp';
import { connectAppleHealth, openAppSettings, openHealthApp, readAppleHealthAccess, turnOnAppleHealthReads, askAppleHealthReads } from '@/health/link';
import { readHealthVisibility } from '@/health/visibility';
import type { HealthTurnOnResult } from '@/ui/HealthStatBoard';
import { useStatPeriod } from '@/health/useStatPeriod';
import { loadLastSynced } from '@/health/syncedAt';
import { AppleHealthCard } from '@/ui/AppleHealthCard';
import { appleDayValues } from '@/domain/dailyActivity';
import { garminStoredMark } from '@/domain/healthRefresh';
import { londonDay } from '@/domain/healthInsights';
import { activeMinutesByDay } from '@/domain/healthSources';
import { useHealthSources } from '@/health/useHealthSources';
import { GarminTip } from '@/ui/GarminTip';
import { HealthVisibility } from '@/ui/HealthVisibility';
import { GoalLine } from '@/ui/GoalLine';
import { StatPeriodToggle } from '@/ui/StatPeriodToggle';
import { HealthStatBoard } from '@/ui/HealthStatBoard';
import { HealthSectionShare } from '@/ui/SectionShare';
import { HealthBoard, HealthReadings } from '@/ui/HealthBoard';
import { DateField } from '@/ui/DateField';
import { PlanTick } from '@/ui/PlanTick';
import { useAppTheme } from '@/ui/theme';
import { MovementCharts } from '@/ui/DailyActivity';
import { HealthRefreshBar, useManualHealthRefresh } from '@/ui/HealthRefresh';
import { WeightWaistLink } from '@/ui/WeightWaistLink';
import { healthStatsOmittedTiles, SHOW_WEIGHT_SECTION } from '@/domain/weightSection';
import { Button, Card, Choice, ErrorNote, Field, playSavedHaptic, Screen, T } from '@/ui/ui';

const KINDS: { id: HealthKind; unit: string; label: string }[] = [
  { id: 'steps', unit: 'steps', label: 'Steps' },
  { id: 'sleep_hours', unit: 'h', label: 'Sleep (hours)' },
  { id: 'resting_heart_rate', unit: 'bpm', label: 'Resting heart rate' },
  { id: 'hrv_sdnn', unit: 'ms', label: 'HRV (SDNN)' },
  { id: 'workout_minutes', unit: 'min', label: 'Workout minutes' },
];

export default function Health() {
  const snap = useSnapshot();
  const repo = useRepository();
  const router = useRouter();
  const theme = useAppTheme();
  const ios = Platform.OS === 'ios';
  const consent = Boolean(snap.profile?.consentHealth);
  const [kind, setKind] = useState<HealthKind>('steps');
  const [value, setValue] = useState('');
  const [day, setDay] = useState(() => startOfLocalDay(new Date()));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [savePending, setSavePending] = useState(false);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const sectionParam = useLocalSearchParams<{ section?: string | string[] }>().section;
  const section = Array.isArray(sectionParam) ? sectionParam[0] : sectionParam;
  const [access, setAccess] = useState<AppleHealthAccess | null>(ios ? null : 'web');
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<HealthVisibilityReport | null>(ios ? null : { kind: 'web' });
  const [visibilityPending, setVisibilityPending] = useState(false);
  const [period] = useStatPeriod();
  const { readings, samples: mergedHealth } = useHealthSources();
  const manual = useManualHealthRefresh(readings.connected);
  const healthSamples = withPlannedMinutes(mergedHealth, snap.plannedSessions);
  const activeSeries = readings.activities.length > 0 || readings.dailies.some((day) => day.moderateMinutes != null || day.vigorousMinutes != null)
    ? activeMinutesByDay(healthSamples, readings.dailies)
    : [];
  const activeMinutes = activeSeries.length > 0 ? activeSeries : undefined;
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [turnOnNote, setTurnOnNote] = useState<string | null>(null);
  const [seeRequest, setSeeRequest] = useState(0);
  const chosen = KINDS.find((item) => item.id === kind) ?? KINDS[0];

  const refreshLink = useCallback(() => {
    if (!ios) return;
    void readAppleHealthAccess().then(setAccess).catch(() => setAccess('prompt'));
    void loadLastSynced().then(setSyncedAt);
    if (!consent) return;
    void catchUpAppleHealthReads(repo).then((result) => {
      if (result.error) {
        setRefreshError(result.error);
        setUpdatedAt(null);
        return;
      }
      if (!result.imported || !result.syncedAt) return;
      setSyncedAt(result.syncedAt);
      setAccess('connected');
      setRefreshError(null);
      setUpdatedAt(result.syncedAt);
    }).catch((error: unknown) => {
      setRefreshError(shownError(error, 'Could not refresh Apple Health.'));
      setUpdatedAt(null);
    });
  }, [consent, ios, repo]);

  useFocusEffect(useCallback(() => {
    refreshLink();
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') refreshLink();
    });
    return () => subscription.remove();
  }, [refreshLink]));

  const loadVisibility = useCallback(() => {
    setVisibilityPending(true);
    void readHealthVisibility()
      .then(setVisibility)
      .catch(() => setVisibility(ios ? { kind: 'unavailable' } : { kind: 'web' }))
      .finally(() => setVisibilityPending(false));
  }, [ios]);

  async function pullFromHealth(): Promise<{ ok: true; syncedAt: string } | { ok: false; message: string }> {
    const pulled = await refreshAppleHealth(repo);
    if (pulled.ok) {
      setSyncedAt(pulled.syncedAt);
      setAccess('connected');
    } else if (isHealthAccessDenied(pulled.message)) {
      setAccess('denied');
    }
    return pulled;
  }

  function noteForTurnOn(result: HealthTurnOnResult): string | null {
    if (result === 'web') return APPLE_HEALTH_WEB;
    if (result === 'unavailable') return APPLE_HEALTH_UNAVAILABLE;
    if (result === 'consent') return APPLE_HEALTH_CONSENT;
    if (result === 'opened') return HEALTH_SHEET_WONT_SHOW;
    if (result === 'prompted') return HEALTH_SHEET_ASKED;
    return null;
  }

  async function turnOnFromRow() {
    setTurnOnNote(null);
    setRefreshError(null);
    try {
      const result = await turnOnMissing([...APPLE_HEALTH_READ_TYPES]);
      setTurnOnNote(noteForTurnOn(result));
    } catch (err: unknown) {
      setRefreshError(shownError(err, 'Could not open Apple Health.'));
    }
  }

  async function turnOnMissing(types: readonly string[]): Promise<HealthTurnOnResult> {
    if (!consent) {
      router.push('/privacy' as never);
      return 'consent';
    }
    const result: AppleHealthTurnOn = await turnOnAppleHealthReads(types);
    if (result === 'prompted') {
      const pulled = await pullFromHealth();
      if (!pulled.ok) setRefreshError(pulled.message);
      else setUpdatedAt(pulled.syncedAt);
    }
    loadVisibility();
    return result;
  }

  async function askUnasked(types: readonly string[]): Promise<HealthTurnOnResult> {
    if (!consent) {
      router.push('/privacy' as never);
      return 'consent';
    }
    const result = await askAppleHealthReads(types);
    if (result === 'prompted') {
      const pulled = await pullFromHealth();
      if (!pulled.ok) setRefreshError(pulled.message);
      else setUpdatedAt(pulled.syncedAt);
    }
    loadVisibility();
    return result;
  }

  async function saveBodyGap(reading: { recordedOn: string; bodyFatPct: number | null; leanMassKg: number | null; source: BodyEntrySource }) {
    await repo.saveBodyComposition({
      recordedOn: reading.recordedOn,
      bodyFatPct: reading.bodyFatPct,
      leanMassKg: reading.leanMassKg,
      waistCm: null,
      source: reading.source,
    });
  }

  async function setWorkoutBucket(activityType: number, bucket: WorkoutBucket) {
    const current = repo.getSnapshot().nutrition;
    const workoutBuckets = withWorkoutBucket(current.workoutBuckets, activityType, bucket);
    await repo.setNutritionSettings({ ...current, workoutBuckets });
    const rewritten = rebucketStoredMinutes(repo.getSnapshot().health, workoutBuckets);
    if (rewritten.length && repo.getSnapshot().profile?.consentHealth) {
      await repo.saveHealth(rewritten);
    }
    void playSavedHaptic();
  }

  async function connect() {
    setPending(true);
    setError(null);
    try {
      const next = await connectAppleHealth();
      setAccess(next);
      if (next === 'connected') {
        const pulled = await pullFromHealth();
        if (!pulled.ok) setRefreshError(pulled.message);
        else setUpdatedAt(pulled.syncedAt);
      } else if (next === 'denied') setRefreshError(APPLE_HEALTH_DENIED);
      else if (next === 'unavailable') setRefreshError(APPLE_HEALTH_UNAVAILABLE);
    } catch (err) {
      setRefreshError(shownError(err, 'Could not connect to Apple Health.'));
    } finally {
      setPending(false);
    }
  }

  useEffect(() => {
    if (!savedNote) return;
    const timer = setTimeout(() => setSavedNote(null), 2500);
    return () => clearTimeout(timer);
  }, [savedNote]);

  useEffect(() => {
    if (section === 'weight') router.replace('/weight-waist' as never);
  }, [section, router]);

  function saveReading() {
    const amount = Number(value);
    if (!value.trim() || !Number.isFinite(amount) || amount < 0) {
      setError('Enter a number that is zero or more.');
      return;
    }
    if (isoDay(day) > isoDay(new Date())) {
      setError('Choose today or an earlier day.');
      return;
    }
    const samples: NewHealthSample[] = [
      { kind, value: amount, unit: chosen.unit, recordedOn: isoDay(day), source: 'manual' },
    ];
    setError(null);
    setSavePending(true);
    void (async () => {
      try {
        await repo.saveHealth(samples);
        setValue('');
        setSavedNote('Saved');
        playSavedHaptic();
      } catch (err: unknown) {
        setError(shownError(err, 'Could not save.'));
      } finally {
        setSavePending(false);
      }
    })();
  }

  const saveBar = Boolean(value.trim()) || savePending || savedNote != null;

  return (
    <Screen
      eyebrow="Health Stats"
      title="What your body is doing."
      refreshing={manual.refreshing}
      onRefresh={() => void manual.run()}
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
            disabled={!consent || savePending || !value.trim()}
            disabledReason={!consent ? 'Turn on health data to save a reading.' : value.trim() ? undefined : 'Add a reading to save.'}
            onPress={saveReading}
          />
        </View>
      ) : undefined}
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
      <AppleHealthCard
        consent={consent}
        ios={ios}
        access={access}
        syncedAt={syncedAt}
        gaps={healthMissingReadings(visibility)}
        pending={pending}
        updatedAt={updatedAt}
        refreshError={refreshError}
        turnOnNote={turnOnNote}
        onSignIn={() => router.push('/sign-in' as never)}
        onConnect={() => void connect()}
        onManage={() => void openHealthApp()}
        onSettings={() => void openAppSettings()}
        onPrivacy={() => router.push('/privacy' as never)}
        onSee={() => setSeeRequest((current) => current + 1)}
        onTurnOn={turnOnFromRow}
      />
      <GarminTip />
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
      <HealthVisibility
        report={visibility}
        pending={visibilityPending}
        request={seeRequest}
        onOpen={loadVisibility}
        onCheck={loadVisibility}
        onAsk={askUnasked}
      />
      <Card>
        <StatPeriodToggle />
      </Card>
      <Card>
        <GoalLine />
      </Card>
      <HealthSectionShare />
      {SHOW_WEIGHT_SECTION ? <WeightWaistLink samples={healthSamples} /> : null}
      <HealthStatBoard
        omitTiles={healthStatsOmittedTiles()}
        today={isoDay(new Date())}
        samples={healthSamples}
        activeMinutes={activeMinutes}
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
        onSaveBody={SHOW_WEIGHT_SECTION ? saveBodyGap : undefined}
        onPlanOutdoor={() => router.push(`/workouts?planOutdoor=${Date.now()}` as never)}
        onSetWorkoutBucket={setWorkoutBucket}
      />
      <HealthBoard
        samples={healthSamples}
        today={isoDay(new Date())}
        soberOn={snap.profile?.stage === 'stopped' && snap.profile.sobrietyStartedAt ? isoDay(new Date(snap.profile.sobrietyStartedAt)) : null}
        stage={snap.profile?.stage ?? null}
        heightCm={snap.profile?.heightCm ?? null}
        adult={snap.profile?.ageConfirmed18 !== false}
        canSaveHeight={consent}
        omitKinds={['weight_kg']}
      />
      <Card>
        <T style={{ fontFamily: theme.font.bodyStrong }}>Or add a reading yourself</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {KINDS.map((item) => (
            <Choice key={item.id} label={item.label} selected={kind === item.id} onPress={() => setKind(item.id)} />
          ))}
        </View>
        <Field label={`Value (${chosen.unit})`} value={value} onChangeText={setValue} keyboardType="decimal-pad" />
        <DateField label="Date" value={day} onChange={setDay} maximumDate={new Date()} />
        <ErrorNote>{error}</ErrorNote>
      </Card>
      <HealthReadings samples={healthSamples.filter((sample) => sample.kind !== 'weight_kg')} />
    </Screen>
  );
}
