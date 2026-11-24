import { View } from 'react-native';

import { useSnapshot } from '@/data';
import { goalRingLabel } from '@/domain/compactLines';
import { buildGoalLed, goalLedFromSnapshot, type GoalTick } from '@/domain/goalLed';
import { useHealthSources } from '@/health/useHealthSources';
import { towardGoal } from '@/domain/nutrition';
import { GoalLine } from '@/ui/GoalLine';
import { GoalWeightRange } from '@/ui/GoalWeightRange';
import { ProgressRing } from '@/ui/DistanceCharts';
import { StatPeriodToggle } from '@/ui/StatPeriodToggle';
import { useStatPeriod } from '@/health/useStatPeriod';
import { useAppTheme } from '@/ui/theme';
import { TargetWeightProgress } from '@/ui/TargetWeightGoal';
import { MoreInfo } from '@/ui/MoreInfo';
import { Card, T } from '@/ui/ui';

/**
 * The saved goal, the measures that matter for it, and this period's check.
 * Today also shows a nudge when a logged figure is short.
 */
export function YourGoal({ place }: { place: 'today' | 'stats' | 'plan' }) {
  const snap = useSnapshot();
  const { samples: mergedHealth } = useHealthSources();
  const [period] = useStatPeriod();
  if (!snap.profile) return null;
  const view = buildGoalLed(goalLedFromSnapshot({ ...snap, health: mergedHealth }, new Date(), period));
  const showNudges = place === 'today';
  const met = view.ticks.filter((tick) => tick.done).length;
  return (
    <Card featured>
      <StatPeriodToggle />
      {place === 'stats' ? null : <GoalLine />}
      <T variant="label">{towardGoal(view.name)}</T>
      {view.ticks.length ? (
        <View style={{ gap: 14, alignSelf: 'stretch' }}>
          <ProgressRow
            centre={String(met)}
            unit={`of ${view.ticks.length}`}
            fill={view.ticks.length ? met / view.ticks.length : 0}
            label={view.progressWords}
            statusWord={`${met} of ${view.ticks.length} met`}
          />
          {view.ticks.map((tick) => {
            const measure = view.measures.find((item) => item.id === tick.id);
            return (
              <ProgressRow
                key={tick.id}
                centre={tick.centre}
                unit={tick.unit}
                fill={tick.fill}
                label={measure ? goalRingLabel(measure) : tick.label}
                statusWord={tick.statusWord}
              />
            );
          })}
        </View>
      ) : (
        <T numberOfLines={1}>Nothing logged yet</T>
      )}
      <TargetWeightProgress brief />
      {place === 'plan' ? null : <GoalWeightRange embedded />}
      <MoreInfo about={view.name || 'the saved aim'} title="About the goal">
        {goalAboutLines(view, showNudges).map((line) => (
          <T key={line}>{line}</T>
        ))}
      </MoreInfo>
    </Card>
  );
}

/** Safety caveats and the long sentences. Nothing here is dropped, only collapsed. */
function goalAboutLines(
  view: { caution: string | null; matters: string; nudges: string[]; measures: { words: string }[]; progressWords: string },
  showNudges: boolean,
): string[] {
  const lines: string[] = [];
  if (view.caution) lines.push(view.caution);
  if (view.matters) lines.push(view.matters);
  for (const measure of view.measures) {
    if (measure.words && !lines.some((line) => line.includes(measure.words))) lines.push(measure.words);
  }
  if (showNudges) {
    for (const nudge of view.nudges) {
      const plain = nudge.replace(/\.$/, '');
      if (!lines.some((line) => line.includes(plain))) lines.push(nudge);
    }
  }
  if (!view.measures.length && view.progressWords && !lines.includes(view.progressWords)) lines.push(view.progressWords);
  return lines;
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
        <T numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{label}</T>
        <T style={{ fontFamily: theme.font.bodyStrong }}>{statusWord}</T>
      </View>
    </View>
  );
}
