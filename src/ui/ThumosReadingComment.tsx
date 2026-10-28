import { useState } from 'react';

import { useRepository, useSnapshot } from '@/data';
import { isoDay } from '@/domain/dates';
import { compositionForAssessment, weightPointsFrom } from '@/domain/nutrition';
import {
  THUMOS_ANALYSE_AGAIN,
  THUMOS_EMPTY_LINE,
  THUMOS_FAILED_LINE,
  THUMOS_READING_LABEL,
  latestKind,
  sumKindSince,
  thumosReadingComment,
} from '@/domain/thumosReading';
import { VISIBLE_SAFETY_LINE } from '@/domain/visibleSafety';
import { refreshAppleHealth } from '@/health/catchUp';
import { reloadHealthSources, useHealthSources } from '@/health/useHealthSources';
import { MoreInfo } from '@/ui/MoreInfo';
import { Button, Card, T } from '@/ui/ui';

/** Ben's label. Re-reads Apple Health with the permission already granted. Nothing is sent. */
export function ThumosAnalyseButton() {
  const repo = useRepository();
  const [pending, setPending] = useState(false);
  return (
    <Button
      label={THUMOS_ANALYSE_AGAIN}
      pending={pending}
      pendingLabel="Reading..."
      onPress={() => {
        setPending(true);
        void refreshAppleHealth(repo, { authorize: false })
          .then(() => reloadHealthSources())
          .finally(() => setPending(false));
      }}
    />
  );
}

function earlierMeasure(
  rows: readonly { recordedOn: string; createdAt?: string; bodyFatPct?: number | null; leanMassKg?: number | null }[],
  key: 'bodyFatPct' | 'leanMassKg',
): number | null {
  const ordered = rows
    .filter((row) => row[key] != null)
    .sort((left, right) => left.recordedOn.localeCompare(right.recordedOn) || (left.createdAt ?? '').localeCompare(right.createdAt ?? ''));
  if (ordered.length < 2) return null;
  const value = ordered[0]?.[key];
  return value == null ? null : value;
}

function todayMeals(logs: readonly { eatenOn: string; portion: number; items: readonly { proteinG: number; kcal: number }[] }[], today: string) {
  const rows = logs.filter((log) => log.eatenOn.slice(0, 10) === today);
  let protein = 0;
  let calories = false;
  for (const log of rows) {
    const portion = log.portion > 0 ? log.portion : 1;
    for (const item of log.items) {
      protein += item.proteinG * portion;
      if (item.kcal > 0) calories = true;
    }
  }
  return { protein: rows.length ? Math.round(protein) : null, calories };
}

/** On-phone Thumos note. It does not call the coach and does not store a new reading. */
export function ThumosReadingComment({ analyse = false }: { analyse?: boolean }) {
  const snap = useSnapshot();
  const { samples } = useHealthSources();
  const profile = snap.profile;
  if (!profile) return null;
  const today = isoDay(new Date());
  const body = compositionForAssessment(snap.bodyComposition);
  const meals = todayMeals(snap.foodLogs ?? [], today);
  const view = thumosReadingComment({
    today,
    consentAi: profile.consentAi === true,
    consentHealth: profile.consentHealth === true,
    weights: weightPointsFrom(samples),
    bodyFatPct: body.bodyFatPct,
    leanMassKg: body.leanMassKg,
    bodyFatEarlier: earlierMeasure(snap.bodyComposition, 'bodyFatPct'),
    leanEarlier: earlierMeasure(snap.bodyComposition, 'leanMassKg'),
    waistCm: body.waistCm,
    heightCm: profile.heightCm,
    strengthMinutes7: sumKindSince(samples, 'strength_minutes', today),
    workoutMinutes7: sumKindSince(samples, 'workout_minutes', today),
    cardioMinutes7: sumKindSince(samples, 'cardio_minutes', today),
    goal: snap.nutrition.goal,
    targetKg: snap.nutrition.targetWeightKg,
    vo2: latestKind(samples, 'vo2_max', today),
    restingBpm: latestKind(samples, 'resting_heart_rate', today),
    sleepHours: latestKind(samples, 'sleep_hours', today),
    steps: latestKind(samples, 'steps', today),
    proteinG: meals.protein,
    caloriesStored: meals.calories,
    build: snap.nutrition.build,
  });
  const sentences = view.sentences[0] === THUMOS_FAILED_LINE ? [THUMOS_EMPTY_LINE] : view.sentences;
  return (
    <Card>
      <T variant="label">{THUMOS_READING_LABEL}</T>
      {sentences.map((line) => <T key={line}>{line}</T>)}
      <MoreInfo about="this Thumos note">
        {view.more.map((line) => <T key={line}>{line}</T>)}
      </MoreInfo>
      <T variant="muted">{VISIBLE_SAFETY_LINE}</T>
      {analyse ? <ThumosAnalyseButton /> : null}
    </Card>
  );
}
