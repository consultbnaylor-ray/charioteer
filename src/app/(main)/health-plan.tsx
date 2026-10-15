import { useEffect, useRef, useState } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';

import { useRepository, useSnapshot } from '@/data';
import { formatUkCompactWhen } from '@/domain/dates';
import { shownError } from '@/domain/errors';
import { PLAN_DISCLAIMER, togglePlanAction, type PlanAction } from '@/domain/healthPlan';
import { buildStatsOverview } from '@/domain/statsOverview';
import { StatTile } from '@/ui/StatTile';
import { usePendingPress } from '@/ui/pendingAction';
import { useAppTheme } from '@/ui/theme';
import { Button, Card, ErrorNote, Field, Screen, T } from '@/ui/ui';

const PROGRESS_IDS = ['sober', 'mood', 'calories', 'protein', 'body', 'weight'];

function ActionRow({ action, disabled, onToggle }: { action: PlanAction; disabled: boolean; onToggle: (id: string) => void }) {
  const theme = useAppTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: action.done, disabled }}
      aria-checked={action.done}
      accessibilityLabel={action.text}
      disabled={disabled}
      onPress={() => onToggle(action.id)}
      style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 }}
    >
      <View
        style={{
          width: 22,
          height: 22,
          borderWidth: 1.5,
          borderColor: theme.colors.ink,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {action.done ? <View style={{ width: 12, height: 12, backgroundColor: theme.colors.ink }} /> : null}
      </View>
      <T style={{ flex: 1, textDecorationLine: action.done ? 'line-through' : 'none' }}>{action.text}</T>
    </Pressable>
  );
}

export default function HealthPlanScreen() {
  const snap = useSnapshot();
  const repo = useRepository();
  const theme = useAppTheme();
  const { width } = useWindowDimensions();
  const { run, isPending } = usePendingPress();
  const profile = snap.profile;
  const plan = snap.healthPlan;
  const [limits, setLimits] = useState(plan?.limits ?? '');
  const [error, setError] = useState<string | null>(null);
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
    stage: profile.stage,
    sobrietyStartedAt: profile.sobrietyStartedAt,
    plannedQuitAt: profile.plannedQuitAt,
    drinkFreeOn: profile.drinkFreeOn,
    drinkFreeDaysGoal: profile.drinkFreeDaysGoal,
    checkIns: snap.checkIns,
    health: snap.health,
    heightCm: profile.heightCm,
    nutrition: snap.nutrition,
    foodLogs: snap.foodLogs,
    waterDays: snap.waterDays,
    bodyComposition: snap.bodyComposition,
    gratitude: snap.gratitude,
  }).filter((tile) => PROGRESS_IDS.includes(tile.id));
  const columns = width >= 720 ? 3 : 2;

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
        setError(shownError(err, 'Could not write a plan.'));
      }
    });
  }

  return (
    <Screen
      eyebrow="Thumos"
      title="Health Plan"
      intro="Thumos reads the figures you already keep and writes a short plan. It is not a diagnosis."
    >
      <ErrorNote>{error}</ErrorNote>
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
              <ActionRow key={action.id} action={action} disabled={refreshing} onToggle={tick} />
            ))}
          </Card>
          <Card>
            <T variant="label">Wellbeing</T>
            {plan.wellbeing.habits.map((action) => (
              <ActionRow key={action.id} action={action} disabled={refreshing} onToggle={tick} />
            ))}
          </Card>
        </>
      ) : (
        <Card>
          <T>Thumos has not written a plan yet. Refresh to use the figures you already keep.</T>
        </Card>
      )}
      <T variant="label">Progress</T>
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
      <T variant="muted" style={{ fontFamily: theme.font.body }}>This stays on your account.</T>
    </Screen>
  );
}
