import { useSnapshot } from '@/data';
import { isoDay } from '@/domain/dates';
import { compositionForAssessment, weightPointsFrom } from '@/domain/nutrition';
import {
  THUMOS_READING_LABEL,
  latestKind,
  sumKindSince,
  thumosReadingComment,
} from '@/domain/thumosReading';
import { VISIBLE_SAFETY_LINE } from '@/domain/visibleSafety';
import { MoreInfo } from '@/ui/MoreInfo';
import { Card, T } from '@/ui/ui';

/** On-phone Thumos note. It does not call the coach and does not store a new reading. */
export function ThumosReadingComment() {
  const snap = useSnapshot();
  const profile = snap.profile;
  if (!profile) return null;
  const today = isoDay(new Date());
  const body = compositionForAssessment(snap.bodyComposition);
  const view = thumosReadingComment({
    today,
    consentAi: profile.consentAi === true,
    consentHealth: profile.consentHealth === true,
    weights: weightPointsFrom(snap.health),
    bodyFatPct: body.bodyFatPct,
    leanMassKg: body.leanMassKg,
    strengthMinutes7: sumKindSince(snap.health, 'strength_minutes', today),
    workoutMinutes7: sumKindSince(snap.health, 'workout_minutes', today),
    goal: snap.nutrition.goal,
    targetKg: snap.nutrition.targetWeightKg,
    vo2: latestKind(snap.health, 'vo2_max', today),
    restingBpm: latestKind(snap.health, 'resting_heart_rate', today),
    build: snap.nutrition.build,
  });
  return (
    <Card>
      <T variant="label">{THUMOS_READING_LABEL}</T>
      {view.sentences.map((line) => <T key={line}>{line}</T>)}
      <MoreInfo about="this Thumos note">
        {view.more.map((line) => <T key={line}>{line}</T>)}
      </MoreInfo>
      <T variant="muted">{VISIBLE_SAFETY_LINE}</T>
    </Card>
  );
}
