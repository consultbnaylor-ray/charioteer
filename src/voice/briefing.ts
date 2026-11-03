import type { AppSnapshot } from '@/data/types';
import { isoDay } from '@/domain/dates';
import { buildHealthInsights, healthChangeNoteFromReadings } from '@/domain/healthInsights';
import { buildFitnessSnapshot, fitnessFromSnapshot } from '@/domain/fitnessSnapshot';
import { withPlannedMinutes } from '@/domain/plannedSession';
import { goalLedFromSnapshot, goalProgressLine } from '@/domain/goalLed';
import { goalWeightRange } from '@/domain/goalWeightRange';
import { buildDailyTargets } from '@/domain/dailyTargets';
import { compositionForAssessment, defaultNutritionSettings, nutritionContextLines, proteinGramsFor, weightPointsFrom } from '@/domain/nutrition';
import { nutritionBriefFromLogs, nutritionReviewLines } from '@/domain/statsAnalysis';
import { activityReadingsFromSamples } from '@/domain/targetActivity';
import { savingsFromTypicalWeek } from '@/domain/savings';
import { soberElapsed } from '@/domain/sober';
import { visionContextFrom } from '@/domain/visionBoard';
import { drinkFreeThisWeek } from '@/domain/stage';
import { quoteById } from '@/domain/stoicQuotes';
import { buildVoiceBriefing, type VoiceBriefing } from '@/domain/voice';
import type { HealthTrend, ThumosMode } from '@/domain/thumos';
import { workoutReflectionsFromDiary } from '@/domain/workoutReflections';

function healthTrends(samples: AppSnapshot['health'], today: string): HealthTrend[] {
  const ordered = [...samples].sort((left, right) => (left.recordedOn < right.recordedOn ? 1 : left.recordedOn > right.recordedOn ? -1 : 0));
  const byKind = new Map<string, typeof ordered>();
  for (const sample of ordered) {
    const list = byKind.get(sample.kind) ?? [];
    list.push(sample);
    byKind.set(sample.kind, list);
  }
  return [...byKind.entries()].map(([kind, rows]) => ({
    kind,
    latest: rows[0]?.value ?? null,
    previous: rows[1]?.value ?? null,
    unit: rows[0]?.unit ?? '',
    note: healthChangeNoteFromReadings(kind, rows, today),
  }));
}

function nutritionLinesFrom(snap: AppSnapshot, now: Date): string[] {
  const profile = snap.profile;
  if (!profile) return [];
  const started = profile.stage === 'stopped' && profile.sobrietyStartedAt ? new Date(profile.sobrietyStartedAt) : null;
  const elapsed = started && !Number.isNaN(started.getTime()) ? soberElapsed(started, now) : null;
  const units = elapsed && profile.weeklyUnits != null
    ? savingsFromTypicalWeek(profile.weeklySpendGbp ?? 0, profile.weeklyUnits, elapsed.totalMs).units
    : 0;
  const today = isoDay(now);
  const water = (snap.waterDays ?? []).find((day) => day.day === today)?.waterMl ?? 0;
  const weights = weightPointsFrom(snap.health);
  const latest = weights.length ? weights[weights.length - 1] : undefined;
  const figures = compositionForAssessment(snap.bodyComposition ?? []);
  const lines = nutritionContextLines({
    logs: snap.foodLogs ?? [],
    settings: snap.nutrition ?? defaultNutritionSettings(),
    waterMl: water,
    checkIns: snap.checkIns.map((item) => ({ createdAt: item.createdAt, mood: item.mood, sleepHours: item.sleepHours })),
    soberDays: elapsed ? elapsed.days : null,
    unitsAvoided: units,
    today,
    body: {
      weightKg: latest?.kg ?? null,
      heightCm: profile.heightCm,
      weights,
      bodyFatPct: figures.bodyFatPct,
      leanMassKg: figures.leanMassKg,
      waistCm: figures.waistCm,
    },
    activity: activityReadingsFromSamples(snap.health),
  });
  const progress = goalProgressLine(goalLedFromSnapshot(snap, now));
  const fitness = profile.consentHealth
    ? buildFitnessSnapshot(fitnessFromSnapshot(snap, 'unknown', now)).contextLine
    : null;
  const settings = snap.nutrition ?? defaultNutritionSettings();
  const weightRange = goalWeightRange({
    goal: settings.goal,
    phase: settings.goalPhase,
    weightClassKg: settings.weightClassKg,
    weightKg: latest?.kg ?? null,
    heightCm: profile.heightCm,
    age: settings.goalAge,
    sex: settings.goalSex,
    build: settings.build,
    bodyFatPct: figures.bodyFatPct,
    waistCm: figures.waistCm,
  }).contextLine;
  const shareHealth = profile.consentHealth === true;
  const weightKg = shareHealth && latest && latest.kg >= 30 ? latest.kg : null;
  const plan = weightKg != null && settings.targetWeightKg != null && settings.targetOn
    ? buildDailyTargets({
      currentKg: weightKg,
      targetKg: settings.targetWeightKg,
      targetOn: settings.targetOn,
      today,
      heightCm: profile.heightCm,
      age: settings.goalAge,
      sex: settings.goalSex,
      activeEnergyKcal: settings.activityEnergyKcal,
      startKg: null,
      startDay: null,
    })
    : null;
  const review = profile.consentAi
    ? nutritionReviewLines(nutritionBriefFromLogs({
      today,
      logs: (snap.foodLogs ?? []).map((log) => ({
        eatenOn: log.eatenOn,
        meal: log.meal,
        note: log.note,
        estimated: log.estimated || log.source === 'photo' || log.source === 'text',
        portion: log.portion,
        items: log.items.map((item) => ({ name: item.name, kcal: item.kcal, proteinG: item.proteinG })),
      })),
      weightKg,
      calorieTarget: settings.hideCalories ? null : (shareHealth ? plan?.targetKcal ?? settings.kcalTarget : settings.kcalTarget),
      proteinTargetG: settings.proteinTarget,
      goalProteinG: weightKg != null && settings.goal ? proteinGramsFor(settings.goal, weightKg, settings.build, settings.goalPhase) : null,
      hideCalories: settings.hideCalories,
    }))
    : [];
  return [...review, progress, fitness, weightRange, ...lines].filter((line): line is string => Boolean(line));
}

/** Client copy of the voice prompt, used when the token function has not been redeployed yet. */
export function briefingFromSnapshot(snap: AppSnapshot, requestedMode: ThumosMode): VoiceBriefing | null {
  const profile = snap.profile;
  if (!profile) return null;
  const now = new Date();
  const shareHealth = profile.consentAi && profile.consentHealth;
  const soberOn = shareHealth && profile.stage === 'stopped' && profile.sobrietyStartedAt
    ? isoDay(new Date(profile.sobrietyStartedAt))
    : null;
  const healthInsights = shareHealth
    ? buildHealthInsights({
        today: isoDay(now),
        samples: withPlannedMinutes(snap.health, snap.plannedSessions),
        soberOn,
        stage: profile.stage,
      }).headlines
    : [];
  return buildVoiceBriefing({
    requestedMode,
    historyRows: snap.thumos.map((message) => ({
      role: message.role,
      content: message.content,
      createdAt: message.createdAt,
    })),
    context: {
      now,
      displayName: profile.displayName,
      sobrietyStartedAt: profile.sobrietyStartedAt,
      stage: profile.stage,
      plannedQuitAt: profile.plannedQuitAt,
      weeklyUnitsGoal: profile.weeklyUnitsGoal,
      drinkFreeDaysGoal: profile.drinkFreeDaysGoal,
      drinkFreeThisWeek: drinkFreeThisWeek(profile.drinkFreeOn, now),
      reasons: snap.reasons.map((reason) => reason.body),
      weeklySpendGbp: profile.weeklySpendGbp,
      weeklyUnits: profile.weeklyUnits,
      checkIns: snap.checkIns.slice(0, 7).map((item) => ({
        createdAt: item.createdAt,
        mood: item.mood,
        sleepHours: item.sleepHours,
        craving: item.craving,
        note: item.note,
      })),
      health: shareHealth ? healthTrends(snap.health, isoDay(now)) : [],
      healthInsights,
      vision: profile.consentAi
        ? visionContextFrom(profile.visionStatement, profile.visionStartedOn, snap.visionItems)
        : undefined,
      interests: snap.interests
        .filter((item) => profile.interestIds.includes(item.id))
        .map((item) => item.label),
      pinnedQuote: profile.consentAi
        ? (() => {
            const quote = quoteById(profile.pinnedQuoteId);
            return quote ? { text: quote.text, author: quote.author, source: quote.source, school: quote.school } : null;
          })()
        : null,
      nutritionLines: profile.consentAi ? nutritionLinesFrom(snap, now) : [],
      workoutReflections: shareHealth
        ? workoutReflectionsFromDiary({
            today: isoDay(now),
            feelings: snap.workoutFeelings ?? [],
            planned: snap.plannedSessions,
            sleepSamples: snap.health
              .filter((sample) => sample.kind === 'sleep_hours')
              .map((sample) => ({ day: sample.recordedOn.slice(0, 10), value: sample.value })),
            workoutSamples: snap.health
              .filter((sample) => sample.kind.startsWith('workout_type_'))
              .map((sample) => ({ kind: sample.kind, value: sample.value, recordedOn: sample.recordedOn })),
            logs: snap.foodLogs ?? [],
            hideCalories: snap.nutrition?.hideCalories === true,
          })
        : [],
      mode: requestedMode,
      safety: { selfHarm: false, withdrawal: false, reasons: [] },
    },
  });
}
