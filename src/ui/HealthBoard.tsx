import { useEffect, useState } from 'react';
import { Linking, Pressable, View } from 'react-native';

import type { HealthSample } from '@/data/types';
import { buildMetricGuidance, parseHeightCm } from '@/domain/guidance';
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
import { GuidanceRange } from '@/ui/GuidanceRange';
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
}: {
  samples: HealthSample[];
  today: string;
  soberOn: string | null;
  stage: string | null;
  heightCm?: number | null;
  adult?: boolean;
  canSaveHeight?: boolean;
  onSaveHeight?: (heightCm: number | null) => Promise<void>;
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
  const guidance = buildMetricGuidance({
    kind,
    today,
    points: history,
    heightCm: liveHeight,
    adult,
  });
  const shownFlags = flags.filter((flag) => flag.id !== 'resting_high' && flag.id !== 'short_sleep');
  const sharing = useSnapshot().sharing;

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
          <Field
            label="Height (cm)"
            value={heightText}
            onChangeText={setHeightText}
            onBlur={commitHeight}
            keyboardType="decimal-pad"
            editable={canSaveHeight}
            hint="Used only for BMI. It is not shown on your public profile."
          />
          {canSaveHeight ? null : <T variant="muted">Health data is off. Turn it on in Privacy & consent to save a height.</T>}
          {heightError ? <T>{heightError}</T> : null}
          {heightSaved ? <T>{heightSaved}</T> : null}
        </View>
      ) : null}
      <GuidanceRange guidance={guidance} />
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
