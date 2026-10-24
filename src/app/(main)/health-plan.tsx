import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';

import { useRepository, useSnapshot } from '@/data';
import { formatUkCompactWhen } from '@/domain/dates';
import { PLAN_NOT_SAVED } from '@/domain/edgeRetry';
import { UserFacingError, shownError } from '@/domain/errors';
import { PLAN_DISCLAIMER, togglePlanAction, type PlanAction } from '@/domain/healthPlan';
import { planProgressFigure } from '@/domain/measureFigures';
import { applyWeightAndBodyShare, communitySharingOn } from '@/domain/profileSharing';
import { buildStatsOverview } from '@/domain/statsOverview';
import { useStatPeriod } from '@/health/useStatPeriod';
import { StatPeriodToggle } from '@/ui/StatPeriodToggle';
import { GoalChoices } from '@/ui/GoalChoices';
import { GoalWeightRange } from '@/ui/GoalWeightRange';
import { YourFitness } from '@/ui/YourFitness';
import { useHealthSources } from '@/health/useHealthSources';
import { planDayFromSessionText } from '@/domain/plannedSession';
import { WorkoutsLink } from '@/ui/WorkoutsLink';
import { YourGoal } from '@/ui/YourGoal';
import { PlanTick } from '@/ui/PlanTick';
import { ShareOnProfile } from '@/ui/ShareOnProfile';
import { MeasureBarsView, MeasureRingView } from '@/ui/MeasuredFigure';
import { StatTile } from '@/ui/StatTile';
import { usePendingPress } from '@/ui/pendingAction';
import { appleDayValues } from '@/domain/dailyActivity';
import { londonDay } from '@/domain/healthInsights';
import { garminStoredMark } from '@/domain/healthRefresh';
import { MovementCharts } from '@/ui/DailyActivity';
import { HealthRefreshBar, useManualHealthRefresh } from '@/ui/HealthRefresh';
import { Button, Card, ErrorNote, Field, Screen, T } from '@/ui/ui';

const PROGRESS_IDS = ['sober', 'mood', 'calories', 'protein', 'body', 'weight'];

function ActionRow({ action, disabled, onToggle }: { action: PlanAction; disabled: boolean; onToggle: (id: string) => void }) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: action.done, disabled }}
      aria-checked={action.done}
      accessibilityLabel={action.done ? `${action.text}, Done` : action.text}
      disabled={disabled}
      onPress={() => onToggle(action.id)}
      style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 }}
    >
      <PlanTick done={action.done} />
      <T style={{ flex: 1 }}>{action.text}</T>
    </Pressable>
  );
}

export default function HealthPlanScreen() {
  const snap = useSnapshot();
  const repo = useRepository();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [period] = useStatPeriod();
  const { run, isPending } = usePendingPress();
  const profile = snap.profile;
  const plan = snap.healthPlan;
  const [limits, setLimits] = useState(plan?.limits ?? '');
  const [error, setError] = useState<string | null>(null);
  const { samples: mergedHealth, workouts, readings } = useHealthSources();
  const manual = useManualHealthRefresh(readings.connected);
  const limitsRef = useRef(limits);
  const planRef = useRef(plan);
  const queue = useRef(Promise.resolve());
  limitsRef.current = limits;
  planRef.current = plan;
  const refreshing = isPending('refresh');

  useEffect(() => {
    setLimits(plan?.limits ?? '');
  }, [plan?.updatedAt]);

  if (!profile) return null;
  const communityOn = communitySharingOn(profile);

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
  }).filter((tile) => PROGRESS_IDS.includes(tile.id));
  const columns = width >= 720 ? 3 : 2;
  const progress = plan
    ? planProgressFigure([
      { key: 'focus', label: 'Focus', done: plan.focus.filter((item) => item.done).length, total: plan.focus.length },
      { key: 'habits', label: 'Habits', done: plan.nutrition.habits.filter((item) => item.done).length, total: plan.nutrition.habits.length },
      { key: 'swaps', label: 'Swaps', done: plan.nutrition.swaps.filter((item) => item.done).length, total: plan.nutrition.swaps.length },
      { key: 'fitness', label: 'Fitness', done: plan.fitness.sessions.filter((item) => item.done).length, total: plan.fitness.sessions.length },
      { key: 'wellbeing', label: 'Wellbeing', done: plan.wellbeing.habits.filter((item) => item.done).length, total: plan.wellbeing.habits.length },
    ])
    : null;

  function tick(id: string) {
    if (!planRef.current || refreshing) return;
    setError(null);
    queue.current = queue.current.then(async () => {
      const current = planRef.current;
      if (!current) return;
      const next = togglePlanAction({ ...current, limits: limitsRef.current.slice(0, 280) }, id);
      planRef.current = next;
      await repo.saveHealthPlan(next);
    }).catch((err: unknown) => {
      setError(shownError(err, 'Could not save that tick.'));
    });
  }

  function refresh() {
    setError(null);
    run('refresh', async () => {
      try {
        await queue.current;
        await repo.refreshHealthPlan(limitsRef.current);
      } catch (err) {
        if (err instanceof UserFacingError && err.message === PLAN_NOT_SAVED) {
          setError(PLAN_NOT_SAVED);
        } else {
          setError(shownError(err, 'Could not write a plan.'));
        }
      }
    });
  }

  return (
    <Screen
      eyebrow="Thumos"
      title="Health Plan"
      intro="Thumos reads the figures you already keep and writes a short plan. It is not a diagnosis."
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
      <GoalChoices />
      <YourGoal place="plan" />
      <YourFitness onPlanOutdoor={() => router.push(`/workouts?planOutdoor=${Date.now()}` as never)} />
      <View style={{ gap: 8 }}>
        <ShareOnProfile
          boxed
          label="Share on profile"
          item="Health plan"
          sensitive
          on={snap.sharing.healthPlan}
          apply={(sharing, selected) => ({ ...sharing, healthPlan: selected })}
        />
        <T variant="muted">Other members see the goal, this week's focus, and how many are ticked.</T>
        <ShareOnProfile
          boxed
          label="Share weight and body figures"
          item="Weight and body figures"
          sensitive
          on={snap.sharing.shareBodyFigures}
          apply={applyWeightAndBodyShare}
        />
        <T variant="muted">Other members see the weight average, and body fat, waist, or lean mass. Height stays private.</T>
        {communityOn ? null : (
          <T>Community is off. Other members can see what you share here only when Community is on.</T>
        )}
      </View>
      <ErrorNote>{error}</ErrorNote>
      {error ? <Button label="Try again" pending={refreshing} onPress={refresh} /> : null}
      {plan ? (
        <>
          <Card>
            <T variant="label">This week's focus</T>
            {plan.focus.map((action) => (
              <ActionRow key={action.id} action={action} disabled={refreshing} onToggle={tick} />
            ))}
          </Card>
          <Card>
            <T variant="label">Nutrition</T>
            <T>{plan.nutrition.targets}</T>
            {plan.nutrition.habits.map((action) => (
              <ActionRow key={action.id} action={action} disabled={refreshing} onToggle={tick} />
            ))}
            <T variant="label">Swaps</T>
            {plan.nutrition.swaps.map((action) => (
              <ActionRow key={action.id} action={action} disabled={refreshing} onToggle={tick} />
            ))}
          </Card>
          <Card>
            <T variant="label">Fitness</T>
            <T>{plan.fitness.intro}</T>
            {plan.fitness.sessions.map((action) => (
              <View key={action.id}>
                <ActionRow action={action} disabled={refreshing} onToggle={tick} />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Plan ${action.text}`}
                  onPress={() => {
                    const day = planDayFromSessionText(action.text);
                    if (!day) return;
                    router.push(`/workouts?planDay=${encodeURIComponent(day)}&planNonce=${Date.now()}` as never);
                  }}
                  style={{ minHeight: 44, justifyContent: 'center' }}
                >
                  <T variant="muted">Plan this day</T>
                </Pressable>
              </View>
            ))}
          </Card>
          <WorkoutsLink workouts={workouts} />
          <Card>
            <T variant="label">Wellbeing</T>
            {plan.wellbeing.habits.map((action) => (
              <ActionRow key={action.id} action={action} disabled={refreshing} onToggle={tick} />
            ))}
          </Card>
        </>
      ) : (
        <>
          <Card>
            <T>Thumos has not written a plan yet. Refresh to use the figures you already keep.</T>
          </Card>
          <WorkoutsLink workouts={workouts} />
        </>
      )}
      {progress ? (
        <Card>
          <MeasureRingView label="Plan progress" ring={progress.ring} />
          <MeasureBarsView label="By section" bars={progress.bars} />
        </Card>
      ) : null}
      <GoalWeightRange />
      <T variant="label">Progress</T>
      <StatPeriodToggle />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {tiles.map((item) => (
          <View key={item.id} style={{ flexGrow: 1, flexBasis: columns === 3 ? '30%' : '46%', minWidth: 148 }}>
            <StatTile tile={item} />
          </View>
        ))}
      </View>
      <Field
        label="Anything to work around"
        value={limits}
        onChangeText={setLimits}
        placeholder="A sore knee, a shift pattern, a doctor’s note"
        maxLength={280}
        multiline
      />
      <Button label="Refresh plan" pending={refreshing} pendingLabel="Writing..." onPress={refresh} />
      {plan ? <T variant="muted">{`Last updated ${formatUkCompactWhen(plan.updatedAt)}`}</T> : null}
      <T variant="muted">{plan?.disclaimer || PLAN_DISCLAIMER}</T>
    </Screen>
  );
}
