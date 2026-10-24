import { View } from 'react-native';

import { useSnapshot } from '@/data';
import { buildGoalLed, goalLedFromSnapshot, type GoalTick } from '@/domain/goalLed';
import { towardGoal } from '@/domain/nutrition';
import { GoalLine } from '@/ui/GoalLine';
import { GoalWeightRange } from '@/ui/GoalWeightRange';
import { ProgressRing } from '@/ui/DistanceCharts';
import { StatPeriodToggle } from '@/ui/StatPeriodToggle';
import { useStatPeriod } from '@/health/useStatPeriod';
import { useAppTheme } from '@/ui/theme';
import { TargetWeightProgress } from '@/ui/TargetWeightGoal';
import { Card, T } from '@/ui/ui';

/**
 * The saved goal, the measures that matter for it, and this period's check.
 * Today also shows a nudge when a logged figure is short.
 */
export function YourGoal({ place }: { place: 'today' | 'stats' | 'plan' }) {
  const snap = useSnapshot();
  const [period] = useStatPeriod();
  if (!snap.profile) return null;
  const view = buildGoalLed(goalLedFromSnapshot(snap, new Date(), period));
  const showNudges = place === 'today';
  const met = view.ticks.filter((tick) => tick.done).length;
  return (
    <Card featured>
      <StatPeriodToggle />
      {place === 'stats' ? null : <GoalLine />}
      <T variant="muted">{view.matters}</T>
      {view.caution ? <T variant="muted">{view.caution}</T> : null}
      {showNudges ? view.nudges.map((line) => <T key={line}>{line}</T>) : null}
      <T variant="label">{towardGoal(view.name)}</T>
      <TargetWeightProgress />
      {view.ticks.length ? (
        <View style={{ gap: 14, alignSelf: 'stretch' }}>
          <ProgressRow
            centre={String(met)}
            unit={`of ${view.ticks.length}`}
            fill={view.ticks.length ? met / view.ticks.length : 0}
            label={view.progressWords}
            statusWord={`${met} of ${view.ticks.length} met`}
          />
          {view.ticks.map((tick) => (
            <ProgressRow
              key={tick.id}
              centre={tick.centre}
              unit={tick.unit}
              fill={tick.fill}
              label={tick.label}
              statusWord={tick.statusWord}
            />
          ))}
        </View>
      ) : (
        <T>{view.progressWords}</T>
      )}
      {place === 'plan' ? null : <GoalWeightRange embedded />}
    </Card>
  );
}

function ProgressRow({
  centre,
  unit,
  fill,
  label,
  statusWord,
}: {
  centre: string;
  unit: string;
  fill: number;
  label: string;
  statusWord: GoalTick['statusWord'] | string;
}) {
  const theme = useAppTheme();
  return (
    <View
      accessibilityLabel={`${label}. ${statusWord}.`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'stretch' }}
    >
      <ProgressRing
        centre={centre}
        unit={unit}
        fill={fill}
        status={statusWord}
        tone="info"
        surface="card"
        size={64}
        monochrome
        showStatus={false}
      />
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ flex: 1, gap: 2, minWidth: 0 }}>
        <T>{label}</T>
        <T style={{ fontFamily: theme.font.bodyStrong }}>{statusWord}</T>
      </View>
    </View>
  );
}
