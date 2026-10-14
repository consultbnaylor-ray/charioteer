import { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, View } from 'react-native';

import type { HealthSample } from '@/data/types';
import { isoDay, startOfLocalDay } from '@/domain/dates';
import { buildMetricGuidance, parseHeightCm } from '@/domain/guidance';
import { compositionForAssessment } from '@/domain/nutrition';
import {
  buildHealthInsights,
  dailyValues,
  formatHealthValue,
  formatReadingLine,
  formatUkCompactDay,
  groupedReadings,
  HEALTH_METRICS,
  latestReading,
  seriesForWindow,
  type HealthInsightKind,
} from '@/domain/healthInsights';
import { healthShareLabel, toggleHealthKind } from '@/domain/profileSharing';
import { useSnapshot } from '@/data';
import { weightReadingKg, type WeightReadingDraft, type WeightUnitMode } from '@/domain/weightEntry';
import { DateField } from '@/ui/DateField';
import { GuidanceRange } from '@/ui/GuidanceRange';
import { HrvExplainer } from '@/ui/HrvExplainer';
import { ShareOnProfile } from '@/ui/ShareOnProfile';
import { HealthChart } from '@/ui/HealthChart';
import { useAppTheme } from '@/ui/theme';
import { Card, Choice, Field, playSavedHaptic, T } from '@/ui/ui';

const RANGES = [7, 30, 90] as const;

export function HealthBoard({
  samples,
  today,
  soberOn,
  stage,
  heightCm = null,
  adult = true,
  canSaveHeight = false,
  onSaveHeight,
  onWeightDraftChange,
  weightReset = 0,
}: {
  samples: HealthSample[];
  today: string;
  soberOn: string | null;
  stage: string | null;
  heightCm?: number | null;
  adult?: boolean;
  canSaveHeight?: boolean;
  onSaveHeight?: (heightCm: number | null) => Promise<void>;
  onWeightDraftChange?: (draft: WeightReadingDraft | null) => void;
  weightReset?: number;
}) {
  const report = buildHealthInsights({ today, samples, soberOn, stage });
  return (
    <View style={{ gap: 14 }}>
      <Card>
        <T variant="title">Your health this week</T>
        {report.headlines.length === 0 ? (
          <T variant="muted">Not enough readings yet to compare this week with the one before.</T>
        ) : (
          report.headlines.map((line) => <T key={line}>{line}</T>)
        )}
        <T variant="muted">These notes are not medical advice.</T>
      </Card>
      {HEALTH_METRICS.map((metric) => {
        const kindReport = report.kinds.find((item) => item.kind === metric.kind);
        return (
          <MetricCard
            key={metric.kind}
            kind={metric.kind}
            label={metric.label}
            chart={metric.chart}
            samples={samples}
            today={today}
            lines={kindReport?.lines ?? []}
            flags={kindReport?.flags ?? []}
            heightCm={heightCm}
            adult={adult}
            canSaveHeight={canSaveHeight}
            onSaveHeight={onSaveHeight}
            onWeightDraftChange={onWeightDraftChange}
            weightReset={weightReset}
          />
        );
      })}
    </View>
  );
}

export function HealthReadings({ samples }: { samples: HealthSample[] }) {
  return <Readings groups={groupedReadings(samples)} />;
}

function MetricCard({
  kind,
  label,
  chart,
  samples,
  today,
  lines,
  flags,
  heightCm,
  adult,
  canSaveHeight,
  onSaveHeight,
  onWeightDraftChange,
  weightReset,
}: {
  kind: HealthInsightKind;
  label: string;
  chart: 'bar' | 'line';
  samples: HealthSample[];
  today: string;
  lines: string[];
  flags: {
    id: string;
    detail: string;
    step: string;
    sourceName: string;
    sourceUrl: string;
  }[];
  heightCm: number | null;
  adult: boolean;
  canSaveHeight: boolean;
  onSaveHeight?: (heightCm: number | null) => Promise<void>;
  onWeightDraftChange?: (draft: WeightReadingDraft | null) => void;
  weightReset: number;
}) {
  const [range, setRange] = useState<(typeof RANGES)[number]>(7);
  const [heightText, setHeightText] = useState(heightCm == null ? '' : String(heightCm));
  const [heightError, setHeightError] = useState<string | null>(null);
  const [heightSaved, setHeightSaved] = useState<string | null>(null);
  const latest = latestReading(samples, kind, today);
  const points = seriesForWindow(samples, kind, today, range);
  const history = dailyValues(samples, kind).filter((point) => point.day <= today);
  const typedHeight = parseHeightCm(heightText);
  const liveHeight = typedHeight.ok ? typedHeight.value : heightCm;
  const snap = useSnapshot();
  const figures = compositionForAssessment(snap.bodyComposition);
  const guidance = buildMetricGuidance({
    kind,
    today,
    points: history,
    heightCm: liveHeight,
    adult,
    bodyFatPct: kind === 'weight_kg' ? figures.bodyFatPct : null,
    waistCm: kind === 'weight_kg' ? figures.waistCm : null,
    build: kind === 'weight_kg' ? snap.nutrition.build : null,
    sex: kind === 'weight_kg' ? snap.nutrition.goalSex : null,
  });
  const shownFlags = flags.filter((flag) => flag.id !== 'resting_high' && flag.id !== 'short_sleep');
  const sharing = snap.sharing;

  useEffect(() => {
    setHeightText(heightCm == null ? '' : String(heightCm));
  }, [heightCm]);

  useEffect(() => {
    if (!heightSaved) return;
    const timer = setTimeout(() => setHeightSaved(null), 2500);
    return () => clearTimeout(timer);
  }, [heightSaved]);

  function commitHeight() {
    if (!onSaveHeight || !canSaveHeight) return;
    const parsed = parseHeightCm(heightText);
    if (!parsed.ok) {
      setHeightError(parsed.error);
      setHeightSaved(null);
      return;
    }
    if (parsed.value === heightCm) {
      setHeightError(null);
      return;
    }
    setHeightError(null);
    void onSaveHeight(parsed.value).then(() => {
      setHeightSaved('Saved ✓');
      playSavedHaptic();
    }).catch(() => {
      setHeightError('Could not save your height.');
    });
  }

  return (
    <Card>
      <T variant="label">{label}</T>
      {latest ? (
        <T variant="title">
          {formatHealthValue(kind, latest.value)}
          {latest.day === today ? '' : ` · ${formatUkCompactDay(latest.day)}`}
        </T>
      ) : (
        <T variant="muted">No readings yet</T>
      )}
      {latest?.day === today ? <T variant="muted">Today</T> : null}
      {kind === 'weight_kg' ? (
        <View style={{ gap: 6 }}>
          <WeightFields
            canSave={canSaveHeight}
            heightText={heightText}
            resetToken={weightReset}
            onDraft={onWeightDraftChange}
          />
          <Field
            label="Height (cm)"
            value={heightText}
            onChangeText={setHeightText}
            onBlur={commitHeight}
            keyboardType="decimal-pad"
            editable={canSaveHeight}
            hint="Used for BMI and waist-to-height. It is not shown on your public profile."
          />
          {canSaveHeight ? null : <T variant="muted">Health data is off. Turn it on in Privacy & consent to save a weight or a height.</T>}
          {heightError ? <T>{heightError}</T> : null}
          {heightSaved ? <T>{heightSaved}</T> : null}
        </View>
      ) : null}
      <GuidanceRange guidance={guidance} />
      {kind === 'hrv_sdnn' ? <HrvExplainer /> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {RANGES.map((days) => (
          <Choice key={days} label={`${days}d`} selected={range === days} onPress={() => setRange(days)} />
        ))}
      </View>
      <HealthChart kind={kind} shape={chart} today={today} windowDays={range} points={points} />
      {lines.map((line) => (
        <T key={line}>{line}</T>
      ))}
      {shownFlags.map((flag) => (
        <View key={flag.id} style={{ gap: 4 }}>
          <T>{flag.detail}</T>
          <T>{flag.step}</T>
          {flag.sourceUrl ? (
            <Pressable
              accessibilityRole="link"
              onPress={() => void Linking.openURL(flag.sourceUrl)}
              style={{ minHeight: 44, justifyContent: 'center' }}
            >
              <T variant="muted">{flag.sourceName}</T>
            </Pressable>
          ) : (
            <T variant="muted">{flag.sourceName}</T>
          )}
        </View>
      ))}
      <ShareOnProfile
        label={healthShareLabel(label)}
        item={`${label} average`}
        on={sharing.healthKinds.includes(kind)}
        sensitive
        apply={(current, selected) => toggleHealthKind(current, kind, selected)}
      />
    </Card>
  );
}

function WeightFields({
  canSave,
  heightText,
  resetToken,
  onDraft,
}: {
  canSave: boolean;
  heightText: string;
  resetToken: number;
  onDraft?: (draft: WeightReadingDraft | null) => void;
}) {
  const [unit, setUnit] = useState<WeightUnitMode>('kg');
  const [kgText, setKgText] = useState('');
  const [stonesText, setStonesText] = useState('');
  const [poundsText, setPoundsText] = useState('');
  const [day, setDay] = useState(() => startOfLocalDay(new Date()));
  const parsed = weightReadingKg({ unit, kilograms: kgText, stones: stonesText, pounds: poundsText });
  const seenReset = useRef(resetToken);

  useEffect(() => {
    if (seenReset.current === resetToken) return;
    seenReset.current = resetToken;
    setUnit('kg');
    setKgText('');
    setStonesText('');
    setPoundsText('');
    setDay(startOfLocalDay(new Date()));
  }, [resetToken]);

  useEffect(() => {
    if (!onDraft) return;
    const reading = weightReadingKg({ unit, kilograms: kgText, stones: stonesText, pounds: poundsText });
    const recordedOn = isoDay(day);
    if (!canSave || !reading.ok || reading.kg == null || recordedOn > isoDay(new Date())) {
      onDraft(null);
      return;
    }
    onDraft({ kg: reading.kg, recordedOn, heightText });
  }, [onDraft, canSave, unit, kgText, stonesText, poundsText, day, heightText]);

  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Choice label="kg" selected={unit === 'kg'} onPress={() => setUnit('kg')} />
        <Choice label="st-lb" selected={unit === 'stlb'} onPress={() => setUnit('stlb')} />
      </View>
      {unit === 'kg' ? (
        <Field
          label="Weight (kg)"
          value={kgText}
          onChangeText={setKgText}
          keyboardType="decimal-pad"
          editable={canSave}
        />
      ) : (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Field label="Stones" value={stonesText} onChangeText={setStonesText} keyboardType="number-pad" editable={canSave} />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Pounds" value={poundsText} onChangeText={setPoundsText} keyboardType="decimal-pad" editable={canSave} />
          </View>
        </View>
      )}
      {!parsed.ok ? <T>{parsed.error}</T> : null}
      <DateField label="Date" value={day} onChange={setDay} maximumDate={new Date()} />
    </View>
  );
}

function Readings({ groups }: { groups: ReturnType<typeof groupedReadings> }) {
  const theme = useAppTheme();
  const [open, setOpen] = useState(false);
  const count = groups.reduce((sum, group) => sum + group.rows.length, 0);
  return (
    <View style={{ gap: 10 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
      >
        <T style={{ fontFamily: theme.font.bodyStrong }}>All readings</T>
        <T variant="muted">{open ? 'Hide' : `Show ${count}`}</T>
      </Pressable>
      {open
        ? groups.map((group) => {
            const label = HEALTH_METRICS.find((metric) => metric.kind === group.kind)?.label ?? group.kind;
            return (
              <View key={group.kind} style={{ gap: 6 }}>
                <T variant="label">{label}</T>
                {group.rows.map((row, index) => (
                  <T key={`${row.recordedOn}-${row.source ?? 'reading'}-${index}`} variant="muted">
                    {formatReadingLine(row.kind, row.value, row.recordedOn, row.source)}
                  </T>
                ))}
              </View>
            );
          })
        : null}
      {open && groups.length === 0 ? <T variant="muted">Nothing logged yet.</T> : null}
    </View>
  );
}
