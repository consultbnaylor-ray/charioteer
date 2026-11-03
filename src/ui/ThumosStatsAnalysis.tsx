import { useState } from 'react';
import { View } from 'react-native';

import { useRepository, useSnapshot } from '@/data';
import { isoDay } from '@/domain/dates';
import { emptyGarminReadings } from '@/domain/garminConnect';
import { resolvedFitnessGoal } from '@/domain/fitnessGoal';
import { competitionCutActive } from '@/domain/targetWeight';
import { londonDay } from '@/domain/healthInsights';
import { analysisSectionsFromText, buildStatsAnalysis, THUMOS_ANALYSE, THUMOS_ANALYSE_CREDIT, THUMOS_ANALYSE_LOCAL, THUMOS_ANALYSIS_CAVEAT, withNutritionReview, type AnalysisSection } from '@/domain/statsAnalysis';
import { THUMOS_ANALYSE_AGAIN } from '@/domain/thumosReading';
import { useHealthSources } from '@/health/useHealthSources';
import { useAppTheme } from '@/ui/theme';
import { Button, Card, T } from '@/ui/ui';

/**
 * Starts as one button. The coach is called only from the press, and that call is metered.
 */
export function ThumosStatsAnalysis() {
  const theme = useAppTheme();
  const repo = useRepository();
  const snap = useSnapshot();
  const { samples, readings } = useHealthSources();
  const [pending, setPending] = useState(false);
  const [sections, setSections] = useState<AnalysisSection[]>([]);
  const [local, setLocal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const profile = snap.profile;
  if (!profile) return null;

  async function run() {
    setPending(true);
    setError(null);
    try {
      const summary = buildStatsAnalysis({
        today: isoDay(new Date()),
        age: snap.nutrition?.goalAge ?? null,
        sex: snap.nutrition?.goalSex ?? null,
        goal: snap.nutrition?.goal ?? null,
        heightCm: profile?.heightCm ?? null,
        targetWeightKg: snap.nutrition?.targetWeightKg ?? null,
        targetOn: snap.nutrition?.targetOn ?? null,
        activeEnergyKcal: snap.nutrition?.activityEnergyKcal ?? null,
        kcalTarget: snap.nutrition?.kcalTarget ?? null,
        proteinTarget: snap.nutrition?.proteinTarget ?? null,
        build: snap.nutrition?.build ?? null,
        phase: snap.nutrition?.goalPhase ?? null,
        fitnessGoal: snap.nutrition ? resolvedFitnessGoal(snap.nutrition) : null,
        competitionCut: snap.nutrition ? competitionCutActive({
          competitionCut: snap.nutrition.competitionCut,
          competitionCutAt: snap.nutrition.competitionCutAt,
          targetOn: snap.nutrition.targetOn,
          age: snap.nutrition.goalAge,
          today: londonDay(new Date()),
        }) : false,
        hideCalories: snap.nutrition?.hideCalories === true,
        logs: (snap.foodLogs ?? []).map((log) => ({
          eatenOn: log.eatenOn,
          meal: log.meal,
          note: log.note,
          estimated: log.estimated || log.source === 'photo' || log.source === 'text',
          portion: log.portion,
          items: log.items.map((item) => ({ name: item.name, kcal: item.kcal, proteinG: item.proteinG })),
        })),
        samples,
        readings: readings ?? emptyGarminReadings(),
      });
      const result = await repo.analyseStats(summary);
      const shown = result.sections.length ? result.sections : analysisSectionsFromText(result.text);
      setSections(withNutritionReview(shown, summary.nutrition, {
        fitnessGoal: summary.fitnessGoal,
        vo2Goal: summary.vo2Goal,
        fuelNote: summary.fuelNote,
      }));
      setLocal(result.source === 'local');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis did not answer.');
    } finally {
      setPending(false);
    }
  }

  if (!sections.length) {
    return (
      <Card>
        <Button
          label={THUMOS_ANALYSE}
          pending={pending}
          pendingLabel="Analysing..."
          onPress={() => void run()}
        />
        <T variant="muted">{THUMOS_ANALYSE_CREDIT}</T>
        {error ? <T>{error}</T> : null}
      </Card>
    );
  }

  return (
    <Card>
      <T variant="label">Thumos</T>
      {sections.map((section, index) => (
        <View key={`${section.title}-${index}`} style={{ gap: 2 }}>
          <T variant="label" style={{ textTransform: 'none', letterSpacing: 0, color: theme.colors.ink, fontSize: 15 }}>{section.title}</T>
          {section.body.split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter(Boolean).map((paragraph, paragraphIndex) => (
            <T key={`${section.title}-${paragraphIndex}`}>{paragraph}</T>
          ))}
        </View>
      ))}
      {local ? <T variant="muted">{THUMOS_ANALYSE_LOCAL}</T> : null}
      <T variant="muted">{THUMOS_ANALYSIS_CAVEAT}</T>
      <Button
        label={THUMOS_ANALYSE_AGAIN}
        pending={pending}
        pendingLabel="Analysing..."
        onPress={() => void run()}
      />
      <T variant="muted">{THUMOS_ANALYSE_CREDIT}</T>
      {error ? <T>{error}</T> : null}
    </Card>
  );
}
