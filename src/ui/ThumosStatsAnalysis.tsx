import { useState } from 'react';

import { useRepository, useSnapshot } from '@/data';
import { isoDay } from '@/domain/dates';
import { emptyGarminReadings } from '@/domain/garminConnect';
import { METRIC_CAVEAT } from '@/domain/metricRegistry';
import { buildStatsAnalysis, THUMOS_ANALYSE, THUMOS_ANALYSE_CREDIT, THUMOS_ANALYSE_LOCAL } from '@/domain/statsAnalysis';
import { THUMOS_ANALYSE_AGAIN } from '@/domain/thumosReading';
import { OUTSIDE_CRISIS_LINE } from '@/domain/outdoorRoute';
import { VISIBLE_SAFETY_LINE } from '@/domain/visibleSafety';
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
      <T variant="muted">{METRIC_CAVEAT}</T>
      <T variant="muted">{VISIBLE_SAFETY_LINE}</T>
      <T variant="muted">{OUTSIDE_CRISIS_LINE}</T>
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
