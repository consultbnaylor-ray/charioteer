import { useState } from 'react';

import { useRepository, useSnapshot } from '@/data';
import { isoDay } from '@/domain/dates';
import { scheduleWeekMinutes } from '@/domain/fitnessSnapshot';
import { compositionForAssessment, weightPointsFrom } from '@/domain/nutrition';
import {
  THUMOS_ANALYSE_AGAIN,
  THUMOS_EMPTY_LINE,
  THUMOS_FAILED_LINE,
  THUMOS_READING_LABEL,
  countReadingDays,
  figuresForNote,
  thumosReadingComment,
} from '@/domain/thumosReading';
import { VISIBLE_SAFETY_LINE } from '@/domain/visibleSafety';
import { refreshAppleHealth } from '@/health/catchUp';
import { reloadHealthSources, useHealthSources } from '@/health/useHealthSources';
import { useStatPeriod } from '@/health/useStatPeriod';
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

/** On-phone Thumos note. It does not call the coach and does not store a new reading. */
export function ThumosReadingComment({ analyse = false }: { analyse?: boolean }) {
  const snap = useSnapshot();
  const { samples, readings } = useHealthSources();
  const [period] = useStatPeriod();
  const profile = snap.profile;
  if (!profile) return null;
  const today = isoDay(new Date());
  const body = compositionForAssessment(snap.bodyComposition);
  const figures = figuresForNote({
    samples,
    today,
    period,
    goalAge: snap.nutrition.goalAge,
    goalSex: snap.nutrition.goalSex,
    scheduleWeekMinutes: scheduleWeekMinutes(snap.trainingSchedule),
    workoutBuckets: snap.nutrition.workoutBuckets,
    plannedSessions: snap.plannedSessions,
    logs: snap.foodLogs ?? [],
    ownerId: profile.id,
    proteinTarget: snap.nutrition.proteinTarget,
    goal: snap.nutrition.goal,
    build: snap.nutrition.build,
    userMetrics: readings.userMetrics,
  });
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
    goal: snap.nutrition.goal,
    goalSex: snap.nutrition.goalSex,
    targetKg: snap.nutrition.targetWeightKg,
    build: snap.nutrition.build,
    storedDayCount: countReadingDays(samples, snap.bodyComposition.map((row) => row.recordedOn)),
    ...figures,
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
