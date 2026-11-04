import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ActivityIndicator, Modal, Pressable, View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';

import { useRepository, useSnapshot } from '@/data';
import { buildDailyTargets, DAILY_TARGETS_CAVEAT } from '@/domain/dailyTargets';
import { formatUkCompactWhen, isoDay } from '@/domain/dates';
import { formatAxisNumber, placeAxisLabels, progressDateTicks, yAxisTicks } from '@/domain/readingChart';
import { shownError } from '@/domain/errors';
import { resolvedFitnessGoal } from '@/domain/fitnessGoal';
import { competitionCutActive } from '@/domain/targetWeight';
import { chartVo2Readings, goalProgressSeries, goalProgressSignStub, orderReadings, progressLinePath, type DatedValue, type GoalProgressPhoto } from '@/domain/goalProgress';
import { PHOTO_RETRY, PHOTO_UNAVAILABLE } from '@/domain/ownerPhotos';
import { saveJpegToLibrary } from '@/ui/saveSharedPhoto';
import { londonDay } from '@/domain/healthInsights';
import { weightPointsFrom } from '@/domain/nutrition';
import { weightReadingKg, weightWaistWrite, type WeightUnitMode } from '@/domain/weightEntry';
import { useHealthSources } from '@/health/useHealthSources';
import { pickProgressPhoto } from '@/ui/prepareProgressPhoto';
import { statsToneColors } from '@/ui/statsPalette';
import { useAppTheme } from '@/ui/theme';
import { Button, Card, Choice, Field, T, playSavedHaptic } from '@/ui/ui';

const PROGRESS_PHOTO_AUTOSAVE = 'progress-photo-auto-save';

function shiftDay(day: string, delta: number): string {
  const [year, month, date] = day.split('-').map(Number);
  const next = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, date ?? 1));
  next.setUTCDate(next.getUTCDate() + delta);
  return next.toISOString().slice(0, 10);
}

function averageRecentEnergy(samples: readonly { kind: string; value: number; recordedOn: string }[], today: string): number | null {
  const start = shiftDay(today, -6);
  const rows = samples.filter((sample) => sample.kind === 'active_energy' && sample.value > 0 && sample.recordedOn.slice(0, 10) >= start && sample.recordedOn.slice(0, 10) <= today);
  if (!rows.length) return null;
  return rows.reduce((sum, sample) => sum + sample.value, 0) / rows.length;
}

export function DailyTargets() {
  const snap = useSnapshot();
  const repo = useRepository();
  const theme = useAppTheme();
  const { samples, readings: watch } = useHealthSources();
  const settings = snap.nutrition;
  const targetKg = settings?.targetWeightKg ?? null;
  const targetOn = settings?.targetOn ?? null;
  const today = londonDay(new Date());
  const readings = weightPointsFrom(samples.length ? samples : snap.health ?? []);
  const current = readings.length ? readings[readings.length - 1] : undefined;
  const fitnessGoal = settings ? resolvedFitnessGoal(settings) : 'normal';
  const hasFitness = settings?.fitnessGoal != null || settings?.goal === 'elite_runner' || settings?.goal === 'body_builder';
  const hasAim = settings?.goal != null || targetKg != null || hasFitness;
  const plan = targetKg != null && targetOn && current
    ? buildDailyTargets({
      currentKg: current.kg,
      targetKg,
      targetOn,
      today,
      heightCm: snap.profile?.heightCm ?? null,
      age: settings?.goalAge ?? null,
      sex: settings?.goalSex ?? null,
      activeEnergyKcal: settings?.activityEnergyKcal ?? averageRecentEnergy(samples, today),
      startKg: settings?.targetStartKg ?? readings[0]?.kg ?? null,
      startDay: readings[0]?.day ?? null,
      fitnessGoal,
      competitionCut: competitionCutActive({
        competitionCut: settings?.competitionCut,
        competitionCutAt: settings?.competitionCutAt,
        targetOn,
        age: settings?.goalAge ?? null,
        today,
      }),
    })
    : null;
  if (!hasAim) return null;
  const vo2Chart = chartVo2Readings({
    apple: samples.filter((sample) => sample.kind === 'vo2_max').map((sample) => ({
      recordedOn: sample.recordedOn,
      value: sample.value,
      id: sample.id,
    })),
    garmin: (watch.userMetrics ?? []).map((row) => ({ day: row.calendarDate, value: row.vo2Max })),
  });
  const vo2 = vo2Chart.points;
  const series = goalProgressSeries({
    today,
    targetOn,
    goal: settings?.goal === 'elite_runner' || settings?.goal === 'body_builder' ? null : settings?.goal ?? null,
    sex: settings?.goalSex ?? null,
    age: settings?.goalAge ?? null,
    fitnessGoal: hasFitness || settings?.goal != null ? fitnessGoal : null,
    weight: readings.map((row) => ({ day: row.day, kg: row.kg })),
    vo2,
    weightTargetKg: targetKg,
    weightStartKg: settings?.targetStartKg ?? readings[0]?.kg ?? null,
  });
  const photos = snap.goalProgressPhotos ?? [];
  const green = statsToneColors(theme.scheme).good.ink;
  return (
    <Card>
      <T variant="label">Daily Targets</T>
      {plan ? (
        <>
          <T>{plan.headline}</T>
          <T>{plan.intake}</T>
          <T>{plan.activity}</T>
          <T>{plan.weigh}</T>
          {plan.pace ? <T>{plan.pace}</T> : null}
          {plan.fuelNote ? <T>{plan.fuelNote}</T> : null}
        </>
      ) : (
        <T variant="muted">{targetOn ? `Target date ${targetOn}` : 'Set an optional target date on the goal if you want a path on the graph.'}</T>
      )}
      <GoalProgressGraph
        series={series}
        photos={photos}
        today={today}
        ink={theme.colors.ink}
        muted={theme.colors.muted}
        line={theme.colors.line}
        accent={green}
        surface={theme.colors.surface}
      />
      <ProgressPhotoButton today={today} />
      {targetKg != null ? <WeightInline /> : null}
      <T variant="muted">{plan?.caveat ?? DAILY_TARGETS_CAVEAT}</T>
      {vo2Chart.sourceLabel ? <T variant="muted">{vo2Chart.sourceLabel}</T> : null}
      {series.vo2Note ? <T variant="muted">{series.vo2Note}</T> : null}
    </Card>
  );
}

const PLOT_H = 156;
const GUTTER = 56;

function ukDayMonth(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1));
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(date);
}

function readingCallout(value: number, unit: string, day: string, today: string): string {
  const amount = `${formatAxisNumber(value)} ${unit}`;
  return day === today ? `${amount} today` : `${amount} on ${ukDayMonth(day)}`;
}

function targetCallout(value: number, unit: string, day: string): string {
  return `Target ${formatAxisNumber(value)} ${unit} by ${ukDayMonth(day)}`;
}

function xAt(day: string, start: string, end: string, plotW: number): number {
  const span = Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`);
  if (!(span > 0)) return GUTTER + plotW / 2;
  const offset = Date.parse(`${day}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`);
  return GUTTER + Math.min(1, Math.max(0, offset / span)) * plotW;
}

function GoalProgressGraph({
  series,
  photos,
  today,
  ink,
  muted,
  line,
  accent,
  surface,
}: {
  series: ReturnType<typeof goalProgressSeries>;
  photos: readonly GoalProgressPhoto[];
  today: string;
  ink: string;
  muted: string;
  line: string;
  accent: string;
  surface: string;
}) {
  const [open, setOpen] = useState<GoalProgressPhoto | null>(null);
  const [width, setWidth] = useState(0);
  const repo = useRepository();
  const weight = orderReadings(series.weightActual);
  const vo2 = orderReadings(series.vo2Actual);
  const latestWeight = weight[weight.length - 1];
  const latestVo2 = vo2[vo2.length - 1];
  const weightTarget = series.weightPath?.[series.weightPath.length - 1];
  const vo2Target = series.vo2Path?.[series.vo2Path.length - 1];
  const nearest = (day: string, rows: DatedValue[]) => rows.find((row) => row.day === day)?.value ?? null;
  const shown = open ? (photos.find((photo) => photo.id === open.id) ?? open) : null;
  const stamp = shown ? formatUkCompactWhen(shown.createdAt || `${shown.recordedOn}T12:00:00.000Z`) : '';
  const weightHere = shown ? nearest(shown.recordedOn, series.weightActual) : null;
  const vo2Here = shown ? nearest(shown.recordedOn, series.vo2Actual) : null;
  return (
    <View style={{ gap: 14, alignSelf: 'stretch' }} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      <MiniSeries
        title="Weight"
        unit="kg"
        color={ink}
        label={muted}
        grid={line}
        surface={surface}
        actual={weight}
        path={series.weightPath}
        start={series.start}
        end={series.end}
        width={width}
        empty="No weigh-ins yet"
        latest={latestWeight ? readingCallout(latestWeight.value, 'kg', latestWeight.day, today) : null}
        target={weightTarget ? targetCallout(weightTarget.value, 'kg', weightTarget.day) : null}
      />
      <MiniSeries
        title="VO2 max"
        unit="ml/kg/min"
        color={accent}
        label={muted}
        grid={line}
        surface={surface}
        actual={vo2}
        path={series.vo2Path}
        straight
        start={series.start}
        end={series.end}
        width={width}
        empty="No VO2 max readings yet"
        latest={latestVo2 ? readingCallout(latestVo2.value, 'ml/kg/min', latestVo2.day, today) : null}
        target={vo2Target ? targetCallout(vo2Target.value, 'ml/kg/min', vo2Target.day) : null}
      />
      <DateAxis start={series.start} end={series.end} photos={photos} width={width} accent={accent} surface={surface} muted={muted} onOpen={setOpen} />
      <Modal visible={shown != null} transparent animationType="fade" onRequestClose={() => setOpen(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'center', padding: 16 }}>
          {shown ? (
            <View style={{ gap: 8, alignSelf: 'stretch', backgroundColor: surface, padding: 12, borderRadius: 8 }}>
              <T>{weightHere == null ? 'Weight: not logged' : `Weight ${formatAxisNumber(weightHere)} kg`}</T>
              <T>{vo2Here == null ? 'VO2 max: not logged' : `VO2 max ${formatAxisNumber(vo2Here)} ml/kg/min`}</T>
              <ProgressPhotoFrame photo={shown} stamp={stamp} />
              <Button label="Delete photo" tone="quiet" onPress={() => { void repo.deleteGoalProgressPhoto(shown.id).then(() => setOpen(null)); }} />
              <Button label="Close" tone="quiet" onPress={() => setOpen(null)} />
            </View>
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

function MiniSeries({
  title,
  unit,
  color,
  label,
  grid,
  surface,
  actual,
  path,
  straight = false,
  start,
  end,
  width,
  empty,
  latest,
  target,
}: {
  title: string;
  unit: string;
  color: string;
  label: string;
  grid: string;
  surface: string;
  actual: readonly DatedValue[];
  path: readonly DatedValue[] | null;
  straight?: boolean;
  start: string;
  end: string;
  width: number;
  empty: string;
  latest: string | null;
  target: string | null;
}) {
  if (actual.length === 0) {
    return (
      <View style={{ gap: 4, alignSelf: 'stretch' }}>
        <T>{title}</T>
        <T variant="muted">{empty}</T>
      </View>
    );
  }
  const ordered = orderReadings(actual);
  const route = orderReadings(path ?? []);
  const ticks = axisTicks(yAxisTicks([...ordered, ...route].map((point) => point.value)));
  const low = ticks[0] ?? 0;
  const high = ticks[ticks.length - 1] ?? 1;
  const plotW = Math.max(1, width - GUTTER - 8);
  const xFor = (day: string) => xAt(day, start, end, plotW);
  function yFor(value: number): number {
    const span = high - low || 1;
    return 22 + (1 - (value - low) / span) * (PLOT_H - 36);
  }
  const actualPath = ordered.length > 1 ? progressLinePath(ordered, xFor, yFor, straight) : '';
  const targetPath = route.length > 1 ? progressLinePath(route, xFor, yFor) : '';
  const targetEnd = route[route.length - 1];
  const shortUnit = unit.length <= 4;
  return (
    <View accessibilityLabel={`${title}. ${latest ?? empty}. ${target ?? ''}`} style={{ gap: 4, alignSelf: 'stretch' }}>
      <T>{title}</T>
      {latest ? <T>{latest}</T> : null}
      {target ? <T variant="muted">{target}</T> : null}
      {width > 0 ? (
        <Svg width={width} height={PLOT_H}>
          {ticks.map((tick) => (
            <Line key={tick} x1={GUTTER} x2={width - 8} y1={yFor(tick)} y2={yFor(tick)} stroke={grid} strokeWidth={1} />
          ))}
          {ticks.map((tick) => (
            <SvgText key={`label-${tick}`} x={GUTTER - 8} y={yFor(tick) + 4} fill={label} fontSize={11} textAnchor="end">
              {shortUnit ? `${formatAxisNumber(tick)} ${unit}` : formatAxisNumber(tick)}
            </SvgText>
          ))}
          {targetPath ? (
            <Path d={targetPath} stroke={color} strokeWidth={1.75} strokeDasharray="7 5" fill="none" strokeOpacity={0.45} />
          ) : null}
          {actualPath ? <Path d={actualPath} stroke={color} strokeWidth={2.5} fill="none" /> : null}
          {ordered.map((point) => (
            <Circle key={`${point.day}-${point.value}`} cx={xFor(point.day)} cy={yFor(point.value)} r={3.5} fill={color} />
          ))}
          {targetEnd ? (
            <Circle cx={xFor(targetEnd.day)} cy={yFor(targetEnd.value)} r={5} fill={surface} stroke={color} strokeWidth={1.75} strokeOpacity={0.7} />
          ) : null}
        </Svg>
      ) : <View style={{ height: PLOT_H }} />}
      {shortUnit ? null : <T variant="muted">{unit}</T>}
    </View>
  );
}

function ProgressPhotoFrame({ photo, stamp }: { photo: GoalProgressPhoto; stamp: string }) {
  const repo = useRepository();
  const [box, setBox] = useState(0);
  const [uri, setUri] = useState<string | null>(photo.previewUrl);
  const [ratio, setRatio] = useState<number | null>(null);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const [autoSave, setAutoSave] = useState(false);
  const resigned = useRef(false);
  const savedToLibrary = useRef(false);

  useEffect(() => {
    if (!autoSave || phase !== 'ready' || !uri || savedToLibrary.current) return;
    savedToLibrary.current = true;
    void saveJpegToLibrary(uri).then((result) => {
      if (result === 'saved') setSaveNote('Saved to your photo library');
    }).catch(() => undefined);
  }, [autoSave, phase, uri]);

  useEffect(() => {
    void AsyncStorage.getItem(PROGRESS_PHOTO_AUTOSAVE).then((value) => setAutoSave(value === '1')).catch(() => undefined);
  }, []);

  useEffect(() => {
    let live = true;
    resigned.current = false;
    setPhase('loading');
    setRatio(null);
    if (photo.previewUrl) setUri(photo.previewUrl);
    const seed = photo.previewUrl && (photo.previewUrl.startsWith('http') || photo.previewUrl.startsWith('data:'))
      ? photo.previewUrl
      : goalProgressSignStub(photo.storagePath);
    if (!seed) {
      setPhase('failed');
      return undefined;
    }
    void repo.refreshSignedPhoto(seed).then((next) => {
      if (!live) return;
      if (next) setUri(next);
      else if (!photo.previewUrl) setPhase('failed');
    });
    return () => {
      live = false;
    };
  }, [attempt, photo.id, photo.previewUrl, photo.storagePath, repo]);

  const height = box > 0 ? Math.max(160, Math.round(box / (ratio ?? 0.75))) : 240;

  return (
    <View style={{ alignSelf: 'stretch', gap: 8 }} onLayout={(event) => setBox(event.nativeEvent.layout.width)}>
      <View style={{ width: '100%', height, borderRadius: 8, overflow: 'hidden', backgroundColor: '#111111' }}>
        {uri && box > 0 ? (
          <Image
            key={`${photo.id}:${attempt}:${uri}`}
            source={{ uri }}
            style={{ width: box, height }}
            contentFit="contain"
            accessibilityLabel={`Progress photo, ${stamp}`}
            onLoad={(event) => {
              const sourceWidth = event.source?.width ?? 0;
              const sourceHeight = event.source?.height ?? 0;
              if (sourceWidth > 0 && sourceHeight > 0) setRatio(sourceWidth / sourceHeight);
              setPhase('ready');
            }}
            onError={() => {
              if (resigned.current) {
                setPhase('failed');
                return;
              }
              resigned.current = true;
              const stub = goalProgressSignStub(photo.storagePath);
              if (!stub) {
                setPhase('failed');
                return;
              }
              void repo.refreshSignedPhoto(stub).then((next) => {
                if (next && next !== uri) {
                  setUri(next);
                  setPhase('loading');
                  return;
                }
                setPhase('failed');
              });
            }}
          />
        ) : null}
        {phase === 'ready' ? null : (
          <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', padding: 12, gap: 8 }}>
            {phase === 'failed' ? (
              <Pressable accessibilityRole="button" accessibilityLabel={`${PHOTO_UNAVAILABLE}. ${PHOTO_RETRY}`} onPress={() => setAttempt((value) => value + 1)}>
                <T style={{ color: '#F3F3EE', textAlign: 'center' }}>{PHOTO_UNAVAILABLE}</T>
                <T style={{ color: '#F3F3EE', textAlign: 'center' }}>{PHOTO_RETRY}</T>
              </Pressable>
            ) : (
              <ActivityIndicator accessibilityLabel="Loading photo" color="#F3F3EE" />
            )}
          </View>
        )}
      </View>
      <T>{stamp}</T>
      <Button label="Save to Photos" tone="quiet" onPress={() => { void saveToPhotos(); }} />
      <Choice
        label="Also save new photos to your library"
        selected={autoSave}
        onPress={() => {
          const next = !autoSave;
          setAutoSave(next);
          void AsyncStorage.setItem(PROGRESS_PHOTO_AUTOSAVE, next ? '1' : '0').catch(() => undefined);
        }}
      />
      {saveNote ? <T variant="muted">{saveNote}</T> : null}
    </View>
  );

  async function saveToPhotos() {
    if (!uri) {
      setSaveNote('The photo is not ready to save yet.');
      return;
    }
    const result = await saveJpegToLibrary(uri);
    setSaveNote(result === 'saved' ? 'Saved to your photo library' : result === 'denied' ? 'Photo library permission is off.' : 'Saving photos is not available on this phone.');
  }
}

function axisTicks(ticks: readonly number[]): number[] {
  if (ticks.length <= 4) return [...ticks];
  const last = ticks.length - 1;
  const picked = [ticks[0], ticks[Math.round(last / 3)], ticks[Math.round((2 * last) / 3)], ticks[last]];
  return [...new Set(picked.filter((tick): tick is number => tick != null))];
}

function DateAxis({
  start,
  end,
  photos,
  width,
  accent,
  surface,
  muted,
  onOpen,
}: {
  start: string;
  end: string;
  photos: readonly GoalProgressPhoto[];
  width: number;
  accent: string;
  surface: string;
  muted: string;
  onOpen: (photo: GoalProgressPhoto) => void;
}) {
  const ticks = progressDateTicks(start, end);
  const plotW = Math.max(1, width - GUTTER - 8);
  const xFor = (day: string) => xAt(day, start, end, plotW);
  const labels = width > 0
    ? placeAxisLabels({ ticks, xs: ticks.map((tick) => xFor(tick.day)), rowWidth: width, scale: 0.8 })
    : [];
  return (
    <View style={{ alignSelf: 'stretch', gap: 4 }}>
      {photos.length > 0 ? (
        <View style={{ height: 24 }}>
          {photos.map((photo, index) => {
            const stacked = photos.slice(0, index).filter((other) => other.recordedOn === photo.recordedOn).length;
            const left = Math.min(Math.max(0, xFor(photo.recordedOn) - 11 + stacked * 24), Math.max(0, width - 22));
            return (
            <Pressable
              key={photo.id}
              accessibilityRole="button"
              accessibilityLabel={`Progress photo ${formatUkCompactWhen(photo.createdAt || `${photo.recordedOn}T12:00:00.000Z`)}`}
              onPress={() => onOpen(photo)}
              style={{ position: 'absolute', left, top: 0, width: 22, height: 22, borderRadius: 11, borderWidth: 1, borderColor: accent, backgroundColor: surface, alignItems: 'center', justifyContent: 'center' }}
            >
              <Svg width={14} height={14} viewBox="0 0 24 24">
                <Path d="M8 7h2l1-2h2l1 2h2a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z" stroke={accent} strokeWidth={1.6} fill="none" />
                <Circle cx={12} cy={13} r={2.4} stroke={accent} strokeWidth={1.6} fill="none" />
            </Svg>
            </Pressable>
            );
          })}
        </View>
      ) : null}
      <View style={{ height: 22 }}>
        {labels.map((tick) => (
          <T key={`${tick.day}-${tick.label}`} variant="muted" numberOfLines={1} style={{ position: 'absolute', left: tick.left, width: tick.textWidth, textAlign: 'center', color: muted, fontSize: 12, lineHeight: 16 }}>{tick.label}</T>
        ))}
      </View>
    </View>
  );
}

function ProgressPhotoButton({ today }: { today: string }) {
  const repo = useRepository();
  const [pending, setPending] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  async function take() {
    setPending(true);
    setNote(null);
    try {
      const picked = await pickProgressPhoto('camera');
      if (!picked) return;
      await repo.addGoalProgressPhoto(picked.bytes, picked.takenOn || today);
      setNote('Photo saved on that day. It is private and is not sent to Thumos.');
    } catch (err) {
      setNote(shownError(err, 'Could not save that photo.'));
    } finally {
      setPending(false);
    }
  }
  return (
    <View style={{ gap: 8 }}>
      <Button label="Take a Time Stamped Photo to track Progress Visually" pending={pending} pendingLabel="Saving..." onPress={() => void take()} />
      {note ? <T variant="muted">{note}</T> : null}
    </View>
  );
}

function WeightInline() {
  const repo = useRepository();
  const [unit, setUnit] = useState<WeightUnitMode>('kg');
  const [kgText, setKgText] = useState('');
  const [stonesText, setStonesText] = useState('');
  const [poundsText, setPoundsText] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function save() {
    const parsed = weightReadingKg({ unit, kilograms: kgText, stones: stonesText, pounds: poundsText });
    if (!parsed.ok || parsed.kg == null) {
      setNote(parsed.ok ? 'Enter a weight.' : parsed.error);
      return;
    }
    const today = isoDay(new Date());
    const written = weightWaistWrite({ kg: parsed.kg, recordedOn: today, waistCm: null }, today);
    if (!written.ok || !written.sample) {
      setNote(written.ok ? 'Enter a weight.' : written.error);
      return;
    }
    setPending(true);
    setNote(null);
    try {
      await repo.saveHealth([written.sample]);
      setKgText('');
      setStonesText('');
      setPoundsText('');
      setNote('Weight saved');
      playSavedHaptic();
    } catch (err) {
      setNote(shownError(err, 'Could not save that weight.'));
    } finally {
      setPending(false);
    }
  }

  return (
    <View style={{ gap: 8 }}>
      <T variant="label">Update weight</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Choice label="kg" selected={unit === 'kg'} onPress={() => setUnit('kg')} />
        <Choice label="st-lb" selected={unit === 'stlb'} onPress={() => setUnit('stlb')} />
      </View>
      {unit === 'kg' ? (
        <Field label="Weight (kg)" value={kgText} onChangeText={setKgText} keyboardType="decimal-pad" />
      ) : (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Field label="Stones" value={stonesText} onChangeText={setStonesText} keyboardType="number-pad" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Pounds" value={poundsText} onChangeText={setPoundsText} keyboardType="decimal-pad" />
          </View>
        </View>
      )}
      <Button label="Save weight" pending={pending} pendingLabel="Saving..." onPress={() => void save()} />
      {note ? <T>{note}</T> : null}
    </View>
  );
}
