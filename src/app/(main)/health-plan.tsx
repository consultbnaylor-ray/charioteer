import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import { useRepository, useSnapshot } from '@/data';
import { formatUkCompactWhen } from '@/domain/dates';
import { PLAN_NOT_SAVED } from '@/domain/edgeRetry';
import { UserFacingError, shownError } from '@/domain/errors';
import { PLAN_DISCLAIMER, togglePlanAction, type PlanAction } from '@/domain/healthPlan';
import { planProgressFigure } from '@/domain/measureFigures';
import { buildStatsOverview } from '@/domain/statsOverview';
import { useStatPeriod } from '@/health/useStatPeriod';
import { StatPeriodToggle } from '@/ui/StatPeriodToggle';
import { GoalChoices } from '@/ui/GoalChoices';
import { ThumosStatsAnalysis } from '@/ui/ThumosStatsAnalysis';
import { useHealthSources } from '@/health/useHealthSources';
import { planDayFromSessionText } from '@/domain/plannedSession';
import { WorkoutsLink } from '@/ui/WorkoutsLink';
import { DailyTargets } from '@/ui/DailyTargets';
import { YourGoal } from '@/ui/YourGoal';
import { PlanTick } from '@/ui/PlanTick';
import { MeasureBarsView, MeasureRingView } from '@/ui/MeasuredFigure';
import { StatTile } from '@/ui/StatTile';
import { usePendingPress } from '@/ui/pendingAction';
import { AiCreditLine } from '@/ui/AiCreditLine';
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
  const [period] = useStatPeriod();
  const { run, isPending } = usePendingPress();
  const profile = snap.profile;
  const plan = snap.healthPlan;
  const [limits, setLimits] = useState(plan?.limits ?? '');
  const [error, setError] = useState<string | null>(null);
  const { samples: mergedHealth, workouts } = useHealthSources();
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
    >
      <ThumosStatsAnalysis />
      <GoalChoices />
      <YourGoal place="plan" />
      <DailyTargets />
      <Button label="Refresh plan" pending={refreshing} pendingLabel="Writing..." onPress={refresh} />
      <T variant="muted">This uses one AI credit and rewrites the plan from the current goal.</T>
      <AiCreditLine kind="plan" />
      <ErrorNote>{error}</ErrorNote>
      {error ? <Button label="Try again" pending={refreshing} onPress={refresh} /> : null}
      {plan ? (
        <>
          <Card>
            <T variant="label">This week's focus</T>
            <T variant="muted">Ticked automatically from your Garmin and Apple Health data where we can; tap to tick the rest.</T>
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
      <Card>
        <T variant="label">Progress</T>
        <StatPeriodToggle />
      </Card>
      <View style={{ gap: 10, alignSelf: 'stretch' }}>
        {tiles.map((item) => (
          <View key={item.id} style={{ alignSelf: 'stretch' }}>
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
      {plan ? <T variant="muted">{`Last updated ${formatUkCompactWhen(plan.updatedAt)}`}</T> : null}
      <T variant="muted">{plan?.disclaimer || PLAN_DISCLAIMER}</T>
    </Screen>
  );
}
