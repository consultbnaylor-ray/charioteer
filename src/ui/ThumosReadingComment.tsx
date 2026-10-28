import { useEffect, useState } from 'react';

import { useRepository, useSnapshot } from '@/data';
import type { Repository } from '@/data/types';
import { isoDay } from '@/domain/dates';
import { compositionForAssessment, weightPointsFrom } from '@/domain/nutrition';
import {
  THUMOS_ANALYSE_AGAIN,
  THUMOS_EMPTY_LINE,
  THUMOS_FAILED_LINE,
  THUMOS_NOTE_ASK,
  THUMOS_READING_LABEL,
  countReadingDays,
  latestKind,
  shouldRequestThumosNote,
  sumKindSince,
  thumosReadingComment,
  visibleCoachNote,
} from '@/domain/thumosReading';
import { VISIBLE_SAFETY_LINE } from '@/domain/visibleSafety';
import { refreshAppleHealth } from '@/health/catchUp';
import { reloadHealthSources, useHealthSources } from '@/health/useHealthSources';
import { MoreInfo } from '@/ui/MoreInfo';
import { Button, Card, T } from '@/ui/ui';

type NoteSlot = {
  key: string;
  text: string | null;
  done: boolean;
  listeners: Set<(text: string | null) => void>;
};

let noteSlot: NoteSlot | null = null;

/** One request per analyse press. The body is the fixed ask and the note mode. */
function askForNote(repo: Repository, key: string, onText: (text: string | null) => void): () => void {
  if (!noteSlot || noteSlot.key !== key) {
    const slot: NoteSlot = { key, text: null, done: false, listeners: new Set() };
    noteSlot = slot;
    void repo.sendThumos(THUMOS_NOTE_ASK, 'note', (text) => {
      const usable = visibleCoachNote(text);
      if (!usable || noteSlot !== slot) return;
      slot.text = usable;
      for (const listener of slot.listeners) listener(usable);
    }).then(() => {
      if (noteSlot !== slot) return;
      slot.done = true;
      slot.text = visibleCoachNote(slot.text);
      for (const listener of slot.listeners) listener(slot.text);
    }).catch(() => {
      if (noteSlot !== slot) return;
      slot.done = true;
      slot.text = null;
      for (const listener of slot.listeners) listener(null);
    });
  }
  const slot = noteSlot;
  slot.listeners.add(onText);
  if (slot.text || slot.done) onText(slot.text);
  return () => {
    slot.listeners.delete(onText);
  };
}

/** Re-reads Apple Health with the permission already granted, then asks again. */
export function ThumosAnalyseButton({ onDone }: { onDone?: () => void }) {
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
          .finally(() => {
            setPending(false);
            onDone?.();
          });
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

function noteLines(text: string): string[] {
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  return lines.length ? lines : [text];
}

/** Thumos note. The coach writes it when both switches are on and 7 days are stored. */
export function ThumosReadingComment({ analyse = false }: { analyse?: boolean }) {
  const repo = useRepository();
  const snap = useSnapshot();
  const { samples } = useHealthSources();
  const [attempt, setAttempt] = useState(0);
  const [coachText, setCoachText] = useState<string | null>(null);
  const profile = snap.profile;
  const storedDayCount = countReadingDays(samples, (snap.bodyComposition ?? []).map((row) => row.recordedOn));
  const ask = snap.mode === 'supabase' && profile != null && shouldRequestThumosNote({
    consentAi: profile.consentAi === true,
    consentHealth: profile.consentHealth === true,
    storedDayCount,
  });
  useEffect(() => {
    if (!ask) {
      setCoachText(null);
      return;
    }
    return askForNote(repo, String(attempt), setCoachText);
  }, [ask, attempt, repo]);
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
    storedDayCount,
  });
  const localSentences = view.sentences[0] === THUMOS_FAILED_LINE ? [THUMOS_EMPTY_LINE] : view.sentences;
  const coachLines = coachText ? noteLines(coachText) : [];
  const sentences = coachLines.length ? coachLines : localSentences;
  return (
    <Card>
      <T variant="label">{THUMOS_READING_LABEL}</T>
      {sentences.map((line) => <T key={line}>{line}</T>)}
      <MoreInfo about="this Thumos note">
        {view.more.map((line) => <T key={line}>{line}</T>)}
      </MoreInfo>
      <T variant="muted">{VISIBLE_SAFETY_LINE}</T>
      {analyse ? <ThumosAnalyseButton onDone={() => setAttempt((value) => value + 1)} /> : null}
    </Card>
  );
}
