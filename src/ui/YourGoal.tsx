import { View } from 'react-native';

import { useSnapshot } from '@/data';
import { buildGoalLed, goalLedFromSnapshot } from '@/domain/goalLed';
import { MeasureRingView } from '@/ui/MeasuredFigure';
import { PlanTick } from '@/ui/PlanTick';
import { Card, T } from '@/ui/ui';

/**
 * The saved goal, the measures that matter for it, and this week's check.
 * Today also shows a nudge when a logged figure is short.
 */
export function YourGoal({ place }: { place: 'today' | 'stats' | 'plan' }) {
  const snap = useSnapshot();
  if (!snap.profile) return null;
  const view = buildGoalLed(goalLedFromSnapshot(snap));
  const showRings = place !== 'plan';
  const showNudges = place === 'today';
  return (
    <Card>
      <T variant="label">Your goal</T>
      {view.name ? <T>{view.name}</T> : null}
      <T variant="muted">{view.matters}</T>
      {view.caution ? <T variant="muted">{view.caution}</T> : null}
      {showRings && view.measures.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-around' }}>
          {view.measures.map((measure) => (
            <View key={measure.id} style={{ flexGrow: 1, flexBasis: 140, maxWidth: 200 }}>
              <MeasureRingView
                label={measure.label}
                ring={{
                  centre: measure.centre,
                  unit: measure.unit,
                  fill: measure.fill,
                  status: measure.status,
                  tone: measure.tone,
                }}
                detail={measure.words}
              />
            </View>
          ))}
        </View>
      ) : null}
      {showNudges ? view.nudges.map((line) => <T key={line}>{line}</T>) : null}
      <T variant="label">How you're doing toward your goal</T>
      <T>{view.progressWords}</T>
      {view.ticks.map((tick) => (
        <View key={tick.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <PlanTick done={tick.done} />
          <T style={{ flex: 1 }}>{tick.label}</T>
        </View>
      ))}
    </Card>
  );
}
