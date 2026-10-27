import { useEffect, useState, type ReactNode } from 'react';
import { Modal, Platform, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useRepository, useSnapshot } from '@/data';
import { shownError } from '@/domain/errors';
import {
  ADDED_NOT_REDUCED,
  fitnessView,
  MINUTES_WHAT,
  RESTING_WHAT,
  VO2_WHAT,
  whyCardioMatters,
  whyMinutesMatter,
  whyRestingMatters,
  CONDITIONING_NOTE,
  rebucketStoredMinutes,
  sessionSplitRows,
  sessionTypeCounts,
  withWorkoutBucket,
  WORKOUT_MIX_TITLE,
  type FitnessCompare,
  type FitnessSnapshot,
  type FitnessTone,
  type WorkoutSourceMinute,
} from '@/domain/fitnessSnapshot';
import { applyFitnessFocus } from '@/domain/healthPlan';
import { useHealthSources } from '@/health/useHealthSources';
import { loadWorkoutSources } from '@/health/workoutSources';
import { useStatPeriod } from '@/health/useStatPeriod';
import { fitnessSeriesChart } from '@/domain/chartSeries';
import { chartBucketForPeriod, type ChartAggregate } from '@/domain/readingChart';
import { londonDay } from '@/domain/healthInsights';
import { latestVo2Reading, VO2_CARD_LINE, vo2MeasuredLine } from '@/domain/vo2Estimate';
import { OUTSIDE_CRISIS_LINE, OUTSIDE_SAFETY_LINE } from '@/domain/outdoorRoute';
import { londonToday, periodHeading, rollingWindow } from '@/domain/statWindow';
import { StatPeriodToggle } from '@/ui/StatPeriodToggle';
import { closerToGoal, whyGoalMatters, WORKOUT_BUCKET_LABEL, WORKOUT_BUCKETS, type NutritionGoal, type WorkoutBucket } from '@/domain/nutrition';
import { GoalLine } from '@/ui/GoalLine';
import type { AppleHealthAccess } from '@/health/connection';
import { readAppleHealthAccess } from '@/health/link';
import { ReadingChart } from '@/ui/ReadingChart';
import { MeasureRingView } from '@/ui/MeasuredFigure';
import { IconLabel } from '@/ui/statIcons';
import { PlanTick } from '@/ui/PlanTick';
import { statsToneColors } from '@/ui/statsPalette';
import { useAppTheme } from '@/ui/theme';
import { GarminTip } from '@/ui/GarminTip';
import { Vo2EstimateNote, Vo2MeasureBanner } from '@/ui/Vo2EstimateNote';
import { TowardTargetActivity } from '@/ui/TowardTargetActivity';
import { MoreInfo as InfoDisclosure, MoreInfoButton } from '@/ui/MoreInfo';
import { Button, Card, Choice, T, playSavedHaptic } from '@/ui/ui';

/**
 * Fitness level, the measures that exist, and one to three goal-led lines.
 * A line can be ticked into this week's focus.
 */
export function YourFitness({ onPlanOutdoor }: { onPlanOutdoor: () => void }) {
  const snap = useSnapshot();
  const { samples: mergedHealth } = useHealthSources();
  const repo = useRepository();
  const theme = useAppTheme();
  const [period] = useStatPeriod();
  const [access, setAccess] = useState<AppleHealthAccess | null>(Platform.OS === 'ios' ? null : 'web');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<InfoFocus | null>(null);
  const [sourceApps, setSourceApps] = useState<WorkoutSourceMinute[]>([]);
  const [bucketNote, setBucketNote] = useState<string | null>(null);
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    void readAppleHealthAccess().then(setAccess).catch(() => setAccess('prompt'));
  }, []);
  useEffect(() => {
    void loadWorkoutSources().then(setSourceApps).catch(() => setSourceApps([]));
  }, [snap.health]);
  if (!snap.profile) return null;
  const view = fitnessView({ ...snap, health: mergedHealth }, access === 'denied' ? 'denied' : 'unknown', new Date(), sourceApps, period);

  async function saveBucket(activityType: number, bucket: WorkoutBucket) {
    setError(null);
    try {
      const current = repo.getSnapshot().nutrition;
      const workoutBuckets = withWorkoutBucket(current.workoutBuckets, activityType, bucket);
      await repo.setNutritionSettings({ ...current, workoutBuckets });
      const rewritten = rebucketStoredMinutes(repo.getSnapshot().health, workoutBuckets);
      if (rewritten.length && repo.getSnapshot().profile?.consentHealth) await repo.saveHealth(rewritten);
      setBucketNote(`That workout type now counts as ${WORKOUT_BUCKET_LABEL[bucket].toLowerCase()}.`);
      void playSavedHaptic();
    } catch (err) {
      setError(shownError(err, 'Could not save that workout type.'));
    }
  }
  if (!view) return null;
  const colors = statsToneColors(theme.scheme);
  const ink = (tone: FitnessTone) => colors[tone].ink;

  async function tick(text: string) {
    setError(null);
    try {
      const current = repo.getSnapshot().healthPlan;
      const next = applyFitnessFocus(current, text, new Date().toISOString());
      await repo.saveHealthPlan(next);
    } catch (err) {
      setError(shownError(err, 'Could not add that to this week.'));
    }
  }

  const vo2Reading = latestVo2Reading(mergedHealth);
  const goal = snap.nutrition?.goal ?? null;
  const focusState = (text: string) => {
    const saved = snap.healthPlan?.focus.find((action) => action.text.toLowerCase() === text.toLowerCase());
    return { saved: Boolean(saved), done: Boolean(saved?.done) };
  };

  return (
    <Card>
      <StatPeriodToggle />
      <T variant="label">Your fitness</T>
      <TowardTargetActivity />
      <GarminTip />
      {view.level ? <T style={{ color: ink(view.level === 'Developing' ? 'watch' : 'good'), fontFamily: theme.font.bodyStrong }}>{view.level}</T> : null}
      <T>{view.levelWords}</T>
      <MoreInfo about="your fitness" onPress={() => setInfo('card')} />
      {view.missing ? <T variant="muted">{view.missing}</T> : null}
      {view.cardio ? (
        <View style={{ alignItems: 'center', gap: 6 }}>
          <Vo2MeasureBanner />
          <MeasureRingView
            icon="gauge"
            label="VO2 max"
            ring={{
              centre: view.cardio.centre,
              unit: view.cardio.unit,
              fill: view.cardio.fill,
              status: view.cardio.status,
              tone: view.cardio.tone,
            }}
          />
          <T style={{ fontFamily: theme.font.bodyStrong }}>{`${view.cardio.centre} ${view.cardio.unit}`}</T>
          {vo2Reading ? (
            <T variant="muted">{vo2MeasuredLine(vo2Reading.day, vo2Reading.source)}</T>
          ) : (
            <T variant="muted">Latest reading</T>
          )}
          <T>{VO2_CARD_LINE}</T>
          <T variant="muted">{OUTSIDE_SAFETY_LINE}</T>
          <T variant="muted">{OUTSIDE_CRISIS_LINE}</T>
          <FitnessSeries points={view.cardio.series} unit="ml/kg/min" aggregate="mean" label="VO2 max chart" />
          <Vo2EstimateNote
            measuredOn={vo2Reading?.day ?? null}
            source={vo2Reading?.source ?? null}
            today={londonDay(new Date())}
            onPlan={onPlanOutdoor}
            showMeasured={false}
          />
          <InfoDisclosure about="VO2 max">
            <T>{VO2_WHAT}</T>
          </InfoDisclosure>
          <FitnessCompareBar compare={view.cardio.compare} tone={view.cardio.tone} />
        </View>
      ) : null}
      {view.minutes ? (
        <View style={{ alignSelf: 'stretch', gap: 6 }}>
          <MeasureRingView
            icon="timer"
            label="Workout minutes"
            ring={{
              centre: view.minutes.centre,
              unit: view.minutes.unit,
              fill: view.minutes.fill,
              status: view.minutes.status,
              tone: view.minutes.tone,
              signal: view.minutes.signal,
              neutral: view.minutes.neutral,
            }}
            detail={view.minutes.words}
          />
          <FitnessSeries points={view.minutes.series ?? []} unit="min" aggregate="sum" label="Workout minutes chart" />
          <MoreInfo about="workout minutes" onPress={() => setInfo('minutes')} />
        </View>
      ) : null}
      {view.resting ? (
        <View style={{ gap: 6 }}>
          <IconLabel name="heart">Resting heart rate</IconLabel>
          <T style={{ color: view.resting.neutral ? theme.colors.ink : ink(view.resting.tone), fontFamily: theme.font.bodyStrong }}>
            {view.resting.reading ? `${view.resting.reading} · ` : ''}{view.resting.period ? `${view.resting.period} · ` : ''}{view.resting.signal ?? (view.resting.tone === 'watch' ? 'Watch' : 'On track')}
          </T>
          <FitnessSeries points={view.resting.series ?? []} unit="bpm" aggregate="mean" label="Resting heart rate chart" />
          <MoreInfo about="resting heart rate" onPress={() => setInfo('resting')} />
        </View>
      ) : null}
      {view.mix ? <MixBar view={view} note={bucketNote} onSetBucket={(activityType, bucket) => void saveBucket(activityType, bucket)} /> : null}
      {view.recovery ? (
        <View style={{ gap: 4 }}>
          <T variant="label">Recovery</T>
          <T style={{ color: ink(view.recovery.tone), fontFamily: theme.font.bodyStrong }}>{view.recovery.status}</T>
          <T>{view.recovery.words}</T>
        </View>
      ) : null}
      {view.recommendations.length > 0 ? (
        <View style={{ gap: 4 }}>
          <T variant="label">{closerToGoal(goal)}</T>
          <T variant="muted">Check with a doctor before big changes.</T>
        </View>
      ) : null}
      {view.recommendations.map((item) => {
        const saved = snap.healthPlan?.focus.find((action) => action.text.toLowerCase() === item.text.toLowerCase());
        const done = Boolean(saved?.done);
        return (
          <Pressable
            key={item.id}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: done }}
            accessibilityLabel={saved ? item.text : `${item.text}. Add to this week's focus`}
            onPress={() => void tick(item.text)}
            style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 }}
          >
            <PlanTick done={done} />
            <T style={{ flex: 1 }}>{item.text}</T>
          </Pressable>
        );
      })}
      {error ? <T>{error}</T> : null}
      <FitnessInfoSheet
        focus={info}
        view={view}
        goal={goal}
        focusState={focusState}
        error={error}
        onClose={() => setInfo(null)}
        onTick={(text) => void tick(text)}
      />
    </Card>
  );
}

type InfoFocus = 'card' | 'cardio' | 'minutes' | 'resting';

function MoreInfo({ about, onPress }: { about: string; onPress: () => void }) {
  return (
    <MoreInfoButton
      label="More info"
      accessibilityLabel={`More info about ${about}`}
      onPress={onPress}
    />
  );
}

const INFO_TITLE: Record<InfoFocus, string> = {
  card: 'Your fitness',
  cardio: 'VO2 max',
  minutes: 'Workout minutes',
  resting: 'Resting heart rate',
};

function FitnessInfoSheet({
  focus,
  view,
  goal,
  focusState,
  error,
  onClose,
  onTick,
}: {
  focus: InfoFocus | null;
  view: FitnessSnapshot;
  goal: NutritionGoal | null;
  focusState: (text: string) => { saved: boolean; done: boolean };
  error: string | null;
  onClose: () => void;
  onTick: (text: string) => void;
}) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const bodyHeight = Math.max(280, Math.round(height * 0.92) - 168 - insets.bottom);
  const order: Array<'cardio' | 'minutes' | 'resting'> = focus === 'minutes'
    ? ['minutes', 'cardio', 'resting']
    : focus === 'resting'
      ? ['resting', 'cardio', 'minutes']
      : ['cardio', 'minutes', 'resting'];
  return (
    <Modal visible={focus != null} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" style={{ flex: 1 }} onPress={onClose} />
        <View
          style={{
            backgroundColor: theme.colors.bg,
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            paddingHorizontal: 20,
            paddingTop: 16,
            paddingBottom: 16 + insets.bottom,
            gap: 12,
            maxHeight: '92%',
          }}
        >
          <T variant="title">{focus ? INFO_TITLE[focus] : 'Your fitness'}</T>
          <GoalLine note={false} />
          <Button label="Close" tone="quiet" onPress={onClose} />
          <ScrollView style={{ flexGrow: 0, height: bodyHeight }}>
            <View style={{ gap: 18, paddingBottom: 8 }}>
              {order.map((key) => {
                if (key === 'cardio') {
                  return <CardioDetail key={key} view={view} goal={goal} />;
                }
                if (key === 'minutes' && view.minutes) {
                  return <MinutesDetail key={key} view={view} goal={goal} />;
                }
                if (key === 'resting' && view.resting) {
                  return <RestingDetail key={key} view={view} goal={goal} />;
                }
                return null;
              })}
              <View style={{ gap: 8 }}>
                <T variant="label">{closerToGoal(goal)}</T>
                <T variant="muted">Check with a doctor before big changes.</T>
                <T>{view.estimate}</T>
                <T>{ADDED_NOT_REDUCED}</T>
                {view.recommendations.length === 0 ? <T>Nothing extra to add. Keep the sessions you already do.</T> : null}
                {view.recommendations.map((item) => {
                  const state = focusState(item.text);
                  return (
                    <Pressable
                      key={item.id}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: state.done }}
                      accessibilityLabel={state.saved ? item.text : `${item.text}. Add to this week's focus`}
                      onPress={() => onTick(item.text)}
                      style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 }}
                    >
                      <PlanTick done={state.done} />
                      <T style={{ flex: 1 }}>{item.text}</T>
                    </Pressable>
                  );
                })}
                {error ? <T>{error}</T> : null}
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function CardioDetail({
  view,
  goal,
}: {
  view: FitnessSnapshot;
  goal: NutritionGoal | null;
}) {
  const cardio = view.cardio;
  return (
    <View style={{ alignItems: 'center', gap: 8, alignSelf: 'stretch' }}>
      <T variant="label">What this is</T>
      <T>{VO2_WHAT}</T>
      {cardio ? (
        <MeasureRingView
          icon="gauge"
          label="VO2 max"
          ring={{
            centre: cardio.centre,
            unit: cardio.unit,
            fill: cardio.fill,
            status: cardio.status,
            tone: cardio.tone,
          }}
        />
      ) : view.missing ? <T variant="muted">{view.missing}</T> : null}
      {cardio ? <FitnessSeries points={cardio.series} unit="ml/kg/min" aggregate="mean" label="VO2 max chart" /> : null}
      <T variant="label">What your number means</T>
      <T>{view.levelWords}</T>
      {cardio ? <T>{cardio.compare.words}</T> : null}
      {cardio ? <FitnessCompareBar compare={cardio.compare} tone={cardio.tone} /> : null}
      <T variant="label">{whyGoalMatters(goal)}</T>
      <T>{whyCardioMatters(goal)}</T>
    </View>
  );
}

function MinutesDetail({ view, goal }: { view: FitnessSnapshot; goal: NutritionGoal | null }) {
  const minutes = view.minutes;
  if (!minutes) return null;
  return (
    <View style={{ alignItems: 'center', gap: 8, alignSelf: 'stretch' }}>
      <T variant="label">What this is</T>
      <T>{MINUTES_WHAT}</T>
      <MeasureRingView
        icon="timer"
        label="Workout minutes"
        ring={{
          centre: minutes.centre,
          unit: minutes.unit,
          fill: minutes.fill,
          status: minutes.status,
          tone: minutes.tone,
        }}
        detail={minutes.words}
      />
      <FitnessSeries points={minutes.series ?? []} unit="min" aggregate="sum" label="Workout minutes chart" />
      <T variant="label">What your number means</T>
      <T>{minutes.words}</T>
      <T variant="label">{whyGoalMatters(goal)}</T>
      <T>{whyMinutesMatter()}</T>
    </View>
  );
}

function RestingDetail({ view, goal }: { view: FitnessSnapshot; goal: NutritionGoal | null }) {
  const resting = view.resting;
  if (!resting) return null;
  return (
    <View style={{ gap: 8, alignSelf: 'stretch' }}>
      <T variant="label">What this is</T>
      <T>{RESTING_WHAT}</T>
      <T variant="label">What your number means</T>
      <T>{resting.reading ? `${resting.reading}. ` : ''}{resting.words}</T>
      <FitnessSeries points={resting.series ?? []} unit="bpm" aggregate="mean" label="Resting heart rate chart" />
      <T variant="label">{whyGoalMatters(goal)}</T>
      <T>{whyRestingMatters()}</T>
    </View>
  );
}

function FitnessSeries({
  points,
  unit,
  aggregate,
  label,
}: {
  points: readonly { day: string; value: number }[];
  unit: string;
  aggregate: ChartAggregate;
  label: string;
}) {
  const [period] = useStatPeriod();
  const today = londonToday();
  const window = rollingWindow(today, period);
  if (points.length === 0) return null;
  return (
    <ReadingChart
      points={fitnessSeriesChart(points)}
      start={window.start}
      end={window.end}
      unit={unit}
      aggregate={aggregate}
      bucket={chartBucketForPeriod(period)}
      accessibilityLabel={label}
    />
  );
}

function Fold({ title, children }: { title: string; children: ReactNode }) {
  const theme = useAppTheme();
  const [open, setOpen] = useState(false);
  return (
    <View style={{ alignSelf: 'stretch', gap: 6 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
      >
        <T style={{ fontFamily: theme.font.bodyStrong, flex: 1 }}>{title}</T>
        <T variant="muted">{open ? 'Hide' : 'Show'}</T>
      </Pressable>
      {open ? children : null}
    </View>
  );
}

function FitnessCompareBar({
  compare,
  tone,
}: {
  compare: FitnessCompare;
  tone: FitnessTone;
}) {
  const theme = useAppTheme();
  const colors = statsToneColors(theme.scheme);
  const marks = [compare.value, compare.age?.low, compare.age?.high, compare.goal?.low, compare.goal?.high]
    .filter((point): point is number => point != null);
  const low = Math.min(...marks);
  const high = Math.max(...marks);
  const pad = Math.max(4, (high - low) * 0.15);
  const scaleMin = Math.max(0, low - pad);
  const span = high + pad - scaleMin || 1;
  const place = (point: number): `${number}%` => `${Math.max(0, Math.min(1, (point - scaleMin) / span)) * 100}%`;
  const band = (zone: { low: number; high: number } | null, fill: string, edge: string) => {
    if (!zone) return null;
    const start = Math.max(0, Math.min(1, (zone.low - scaleMin) / span));
    const end = Math.max(0, Math.min(1, (zone.high - scaleMin) / span));
    return (
      <View
        style={{
          position: 'absolute',
          left: `${start * 100}%`,
          width: `${Math.max(1.5, (end - start) * 100)}%`,
          top: 0,
          bottom: 0,
          backgroundColor: fill,
          borderLeftWidth: 2,
          borderRightWidth: 2,
          borderColor: edge,
        }}
      />
    );
  };
  return (
    <View style={{ alignSelf: 'stretch', gap: 8 }}>
      <View accessibilityElementsHidden style={{ height: 28, justifyContent: 'flex-end' }}>
        <View style={{ height: 14, borderRadius: 7, overflow: 'hidden', backgroundColor: theme.colors.line }}>
          {band(compare.age, colors.good.bg, colors.good.ink)}
          {band(compare.goal, colors.info.bg, colors.info.ink)}
        </View>
        <View
          style={{
            position: 'absolute',
            left: place(compare.value),
            marginLeft: -7,
            top: 7,
            width: 14,
            height: 14,
            borderRadius: 7,
            backgroundColor: colors[tone].ink,
            borderWidth: 2,
            borderColor: theme.colors.surface,
          }}
        />
      </View>
      <Legend swatch={colors[tone].ink} round label={`You, ${compare.value} ml/kg/min`} />
      <T variant="muted">A reference, not a target. These ranges are estimates from the studies named here. Not medical advice.</T>
      <InfoDisclosure about="these ranges">
        {compare.age ? (
          <Legend swatch={colors.good.ink} label={`${compare.age.label}, ${compare.age.low} to ${compare.age.high}`} />
        ) : null}
        {compare.goal ? (
          <Legend swatch={colors.info.ink} label={`${compare.goal.label}, approximate, ${compare.goal.low} to ${compare.goal.high}`} />
        ) : null}
        <T>{compare.words}</T>
        {compare.sources.map((source) => <T key={source.slice(0, 24)} variant="muted">{source}</T>)}
      </InfoDisclosure>
    </View>
  );
}

function Legend({ swatch, label, round = false }: { swatch: string; label: string; round?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <View style={{ width: 12, height: 12, borderRadius: round ? 6 : 2, backgroundColor: swatch }} />
      <T style={{ flex: 1 }}>{label}</T>
    </View>
  );
}

function MixBar({
  view,
  note,
  onSetBucket,
}: {
  view: FitnessSnapshot;
  note: string | null;
  onSetBucket: (activityType: number, bucket: WorkoutBucket) => void;
}) {
  const theme = useAppTheme();
  const [period] = useStatPeriod();
  const rows = view.mix ? sessionSplitRows(view.mix) : [];
  const counts = sessionTypeCounts(view.mix?.types ?? []);
  const caption = `${periodHeading(period)}.`;
  const spoken = [
    'Sessions',
    caption,
    ...rows.map((row) => `${row.label}, ${row.minutes} minutes, ${row.share} percent`),
    ...counts.map((row) => `${row.label}, ${row.minutes} minutes`),
    CONDITIONING_NOTE,
  ].join('. ');
  return (
    <View style={{ gap: 10 }} accessibilityLabel={spoken}>
      <T variant="label">Sessions</T>
      <View style={{ gap: 10, alignSelf: 'stretch' }}>
        {rows.map((row) => (
          <View key={row.key} style={{ gap: 4, alignSelf: 'stretch' }}>
            <T>{`${row.label} · ${row.minutes} min · ${row.share}%`}</T>
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={{ height: 8, borderRadius: 4, backgroundColor: theme.colors.line, overflow: 'hidden' }}
            >
              <View style={{
                width: row.minutes > 0 ? `${Math.max(row.share, 2)}%` : '0%',
                height: 8,
                borderRadius: 4,
                backgroundColor: theme.colors.ink,
              }} />
            </View>
          </View>
        ))}
      </View>
      <T variant="muted">{caption}</T>
      {counts.length > 0 ? (
        <View style={{ gap: 2 }}>
          {counts.map((row, index) => (
            <T key={`${row.label}-${index}`} variant="muted">{`${row.label} · ${row.minutes} min`}</T>
          ))}
        </View>
      ) : null}
      <T variant="muted">{CONDITIONING_NOTE}</T>
      <Fold title={WORKOUT_MIX_TITLE}>
        {(view.mix?.lines ?? []).map((line) => <T key={line}>{line}</T>)}
        {(view.mix?.types ?? []).map((row) => (
          <View key={row.activityType} style={{ gap: 6 }}>
            <T>Fix {row.label}</T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {WORKOUT_BUCKETS.map((bucket) => (
                <Choice
                  key={bucket}
                  label={WORKOUT_BUCKET_LABEL[bucket]}
                  selected={row.bucket === bucket}
                  onPress={() => {
                    if (row.bucket !== bucket) onSetBucket(row.activityType, bucket);
                  }}
                />
              ))}
            </View>
          </View>
        ))}
        {note ? <T>{note}</T> : null}
      </Fold>
    </View>
  );
}
