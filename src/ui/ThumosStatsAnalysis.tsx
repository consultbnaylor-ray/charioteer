import { useState } from 'react';

import { useRepository, useSnapshot } from '@/data';
import { isoDay } from '@/domain/dates';
import { emptyGarminReadings } from '@/domain/garminConnect';
import { buildStatsAnalysis, THUMOS_ANALYSE, THUMOS_ANALYSE_CREDIT, THUMOS_ANALYSE_LOCAL, THUMOS_ANALYSIS_CAVEAT } from '@/domain/statsAnalysis';
import { THUMOS_ANALYSE_AGAIN } from '@/domain/thumosReading';
import { useHealthSources } from '@/health/useHealthSources';
import { Button, Card, T } from '@/ui/ui';

/**
 * Starts as one button. The coach is called only from the press, and that call is metered.
 */
export function ThumosStatsAnalysis() {
  const repo = useRepository();
  const snap = useSnapshot();
  const { samples, readings } = useHealthSources();
  const [pending, setPending] = useState(false);
  const [text, setText] = useState<string | null>(null);
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
        samples,
        readings: readings ?? emptyGarminReadings(),
      });
      const result = await repo.analyseStats(summary);
      setText(result.text);
      setLocal(result.source === 'local');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis did not answer.');
    } finally {
      setPending(false);
    }
  }

  if (!text) {
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
      <T>{text}</T>
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
