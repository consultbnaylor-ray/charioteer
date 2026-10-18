import { useState } from 'react';
import { Linking, Modal, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg from 'react-native-svg';

import { isoDay, startOfLocalDay } from '@/domain/dates';
import { shownError } from '@/domain/errors';
import {
  buildHealthStatBoard,
  detailShowsStatusAgain,
  healthSharingSteps,
  healthTypesForGaps,
  HEALTH_SHEET_ASKED,
  HEALTH_SHEET_WONT_SHOW,
  HEALTH_TURN_ON,
  parseBodyGap,
  type HealthStatBoardInput,
  type HealthStatGap,
  type HealthStatTile,
  type HealthStatVisual,
} from '@/domain/healthStatTiles';
import { BODY_ENTRY_SOURCES, BODY_SOURCE_LABEL, WORKOUT_BUCKETS, WORKOUT_BUCKET_LABEL, type BodyEntrySource, type WorkoutBucket } from '@/domain/nutrition';
import { STATS_SIGNAL } from '@/domain/statsOverview';
import {
  APPLE_HEALTH_CONSENT,
  APPLE_HEALTH_UNAVAILABLE,
  APPLE_HEALTH_WEB,
  type AppleHealthTurnOn,
} from '@/health/connection';
import { CompareBars, ProgressRing, RangeTrack, ToneMark, TrendLine } from '@/ui/DistanceCharts';
import { DateField } from '@/ui/DateField';
import { GoalLine } from '@/ui/GoalLine';
import { statsToneColors } from '@/ui/statsPalette';
import { useAppTheme } from '@/ui/theme';
import { Button, Card, Choice, Field, QuietNote, T, playSavedHaptic } from '@/ui/ui';

export type HealthTurnOnResult = AppleHealthTurnOn | 'consent';

/** Grouped tiles for this person's own readings. Sharing stays on the switches already on this page. */
export function HealthStatBoard(
  input: HealthStatBoardInput & {
    onTurnOn?: (types: readonly string[]) => Promise<HealthTurnOnResult>;
    onSaveBody?: (reading: { recordedOn: string; bodyFatPct: number | null; leanMassKg: number | null; source: BodyEntrySource }) => Promise<void>;
    onSetWorkoutBucket?: (activityType: number, bucket: WorkoutBucket) => Promise<void>;
  },
) {
  const model = buildHealthStatBoard(input);
  const [openId, setOpenId] = useState<string | null>(null);
  const open = model.sections.flatMap((section) => section.tiles).find((tile) => tile.id === openId) ?? null;
  if (model.sections.length === 0 && !model.missingLine) return null;
  return (
    <View style={{ gap: 14 }}>
      {model.sections.map((section) => (
        <StatSection key={section.id} title={section.title} tiles={section.tiles} onOpen={setOpenId} />
      ))}
      {model.missingLine ? (
        <MissingReads line={model.missingLine} gaps={model.gaps} onTurnOn={input.onTurnOn} onSaveBody={input.onSaveBody} />
      ) : null}
      <StatDetail tile={open} caveat={model.caveat} onClose={() => setOpenId(null)} onSetWorkoutBucket={input.onSetWorkoutBucket} />
    </View>
  );
}

function MissingReads({
  line,
  gaps,
  onTurnOn,
  onSaveBody,
}: {
  line: string;
  gaps: HealthStatGap[];
  onTurnOn?: (types: readonly string[]) => Promise<HealthTurnOnResult>;
  onSaveBody?: (reading: { recordedOn: string; bodyFatPct: number | null; leanMassKg: number | null; source: BodyEntrySource }) => Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const [followUp, setFollowUp] = useState<string | null>(null);
  const healthGaps = gaps.filter((gap) => gap.healthType);
  const steps = healthGaps.length ? healthSharingSteps(healthGaps.map((gap) => gap.title)) : null;

  async function turnOn() {
    if (!onTurnOn) return;
    setPending(true);
    setFollowUp(null);
    try {
      const result = await onTurnOn(healthTypesForGaps(gaps));
      if (result === 'web') setFollowUp(APPLE_HEALTH_WEB);
      else if (result === 'unavailable') setFollowUp(APPLE_HEALTH_UNAVAILABLE);
      else if (result === 'consent') setFollowUp(APPLE_HEALTH_CONSENT);
      else if (result === 'opened') setFollowUp(HEALTH_SHEET_WONT_SHOW);
      else if (result === 'prompted') setFollowUp(HEALTH_SHEET_ASKED);
    } catch (err: unknown) {
      setFollowUp(shownError(err, 'Could not open Apple Health.'));
    } finally {
      setPending(false);
    }
  }

  return (
    <View style={{ gap: 8 }}>
      <T variant="muted">{line}</T>
      {healthGaps.length ? (
        <Button label={HEALTH_TURN_ON} pending={pending} pendingLabel="Asking..." onPress={() => void turnOn()} />
      ) : null}
      {steps ? <T>{steps}</T> : null}
      {followUp ? <T>{followUp}</T> : null}
      {gaps.map((gap) => (
        <T key={gap.id}>{gap.source}</T>
      ))}
      <BodyGapEntry gaps={gaps} onSave={onSaveBody} />
    </View>
  );
}

function BodyGapEntry({
  gaps,
  onSave,
}: {
  gaps: HealthStatGap[];
  onSave?: (reading: { recordedOn: string; bodyFatPct: number | null; leanMassKg: number | null; source: BodyEntrySource }) => Promise<void>;
}) {
  const fatMissing = gaps.some((gap) => gap.id === 'body_fat' && gap.manual);
  const leanMissing = gaps.some((gap) => gap.id === 'lean_mass' && gap.manual);
  const [fat, setFat] = useState('');
  const [lean, setLean] = useState('');
  const [source, setSource] = useState<BodyEntrySource>('smart_scale');
  const [day, setDay] = useState(() => startOfLocalDay(new Date()));
  const [note, setNote] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  if ((!fatMissing && !leanMissing) || !onSave) return null;
  const saveBody = onSave;
  const prompt = fatMissing && leanMissing
    ? 'Or enter body fat and lean mass here.'
    : fatMissing
      ? 'Or enter body fat here.'
      : 'Or enter lean mass here.';

  function save() {
    const parsed = parseBodyGap(fatMissing ? fat : '', leanMissing ? lean : '');
    if (!parsed.ok) {
      setNote(parsed.error);
      return;
    }
    if (isoDay(day) > isoDay(new Date())) {
      setNote('Choose today or an earlier day.');
      return;
    }
    setNote(null);
    setPending(true);
    void saveBody({
      recordedOn: isoDay(day),
      bodyFatPct: parsed.bodyFatPct,
      leanMassKg: parsed.leanMassKg,
      source,
    }).then(() => {
      setNote('Saved');
      playSavedHaptic();
    }).catch((err: unknown) => {
      setNote(shownError(err, 'Could not save that reading.'));
    }).finally(() => setPending(false));
  }

  return (
    <View style={{ gap: 8 }}>
      <T>{prompt}</T>
      {fatMissing ? <Field label="Body fat (%)" value={fat} onChangeText={setFat} keyboardType="decimal-pad" placeholder="15" /> : null}
      {leanMissing ? <Field label="Lean body mass (kg)" value={lean} onChangeText={setLean} keyboardType="decimal-pad" placeholder="63" /> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {BODY_ENTRY_SOURCES.map((id) => (
          <Choice key={id} label={BODY_SOURCE_LABEL[id]} selected={source === id} onPress={() => setSource(id)} />
        ))}
      </View>
      <DateField label="Date" value={day} onChange={setDay} maximumDate={new Date()} />
      <Button label="Save body reading" pending={pending} pendingLabel="Saving..." onPress={save} />
      <QuietNote>{note}</QuietNote>
    </View>
  );
}

function StatSection({
  title,
  tiles,
  onOpen,
}: {
  title: string;
  tiles: HealthStatTile[];
  onOpen: (id: string) => void;
}) {
  const theme = useAppTheme();
  const [open, setOpen] = useState(true);
  return (
    <Card>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
      >
        <T style={{ fontFamily: theme.font.bodyStrong, flex: 1 }}>{title}</T>
        <T variant="muted">{open ? 'Hide' : 'Show'}</T>
      </Pressable>
      {open ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {tiles.map((tile) => (
            <StatTile key={tile.id} tile={tile} onOpen={() => onOpen(tile.id)} />
          ))}
        </View>
      ) : null}
    </Card>
  );
}

function StatTile({ tile, onOpen }: { tile: HealthStatTile; onOpen: () => void }) {
  const theme = useAppTheme();
  const spoken = `More info about ${tile.title}. ${valueWithPeriod(tile)}. ${tile.weeklyLine ?? ''} ${tile.mark}. ${tile.status}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={spoken}
      onPress={onOpen}
      style={{
        flexGrow: 1,
        flexBasis: '46%',
        minWidth: 148,
        gap: 6,
        padding: 8,
        borderWidth: 1,
        borderColor: theme.colors.line,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surface,
      }}
    >
      <T variant="label">{tile.title}</T>
      <TileValue tile={tile} />
      {tile.empty ? null : <TileVisual visual={tile.visual} />}
      {tile.empty || tile.visual.kind === 'ring' || tile.visual.kind === 'zone' ? null : (
        <StatusMark tone={tile.tone} status={tile.status} />
      )}
      {!tile.empty && tile.history.length >= 2 && tile.visual.kind !== 'line' ? (
        <TrendLine points={tile.history} color={statsToneColors(theme.scheme)[tile.tone].ink} />
      ) : null}
      {tile.trend ? <T variant="muted">{tile.trend}</T> : null}
      <T variant="muted">More info</T>
    </Pressable>
  );
}

/** The window sits on the number, in the same weight, not as a grey caption under the chart. */
function TileValue({ tile }: { tile: HealthStatTile }) {
  const theme = useAppTheme();
  return (
    <View style={{ gap: 2 }}>
      <T style={{ fontFamily: theme.font.bodyStrong }}>{valueWithPeriod(tile)}</T>
      {tile.weeklyLine ? <T>{tile.weeklyLine}</T> : null}
    </View>
  );
}

function valueWithPeriod(tile: HealthStatTile): string {
  if (!tile.unit) return `${tile.valueText} - ${tile.period}`;
  return `${tile.valueText} ${tile.unit} - ${tile.period}`;
}

function TileVisual({ visual }: { visual: HealthStatVisual }) {
  const theme = useAppTheme();
  if (visual.kind === 'line') return <TrendLine points={visual.points} color={theme.colors.ink} />;
  if (visual.kind === 'ring') {
    return (
      <ProgressRing
        centre={visual.centre}
        unit={visual.unit}
        fill={visual.fill}
        status={visual.status}
        tone={visual.tone}
        surface="card"
        size={84}
        mark
      />
    );
  }
  if (visual.kind === 'zone') {
    return (
      <RangeTrack
        value={visual.value}
        zoneLow={visual.zoneLow}
        zoneHigh={visual.zoneHigh}
        scaleMin={visual.scaleMin}
        scaleMax={visual.scaleMax}
        status={visual.status}
        zoneCaption={visual.zoneCaption}
        goalLow={visual.goalLow}
        goalHigh={visual.goalHigh}
        goalCaption={visual.goalCaption}
        tone={visual.tone}
        surface="card"
        mark
      />
    );
  }
  if (visual.kind === 'bars') {
    return (
      <View style={{ gap: 6, alignSelf: 'stretch' }}>
        <CompareBars layout="row" max={visual.max} bars={visual.bars} />
        {visual.caption ? <T variant="muted">{visual.caption}</T> : null}
      </View>
    );
  }
  return null;
}

function StatusMark({ tone, status }: { tone: HealthStatTile['tone']; status: string }) {
  const theme = useAppTheme();
  const color = statsToneColors(theme.scheme)[tone].ink;
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" accessibilityElementsHidden>
          <ToneMark tone={tone} color={color} />
        </Svg>
        <T style={{ color, fontFamily: theme.font.bodyStrong }}>{STATS_SIGNAL[tone]}</T>
      </View>
      <T>{status}</T>
    </View>
  );
}

function WorkoutTypeChoices({
  tile,
  onSetWorkoutBucket,
}: {
  tile: HealthStatTile;
  onSetWorkoutBucket?: (activityType: number, bucket: WorkoutBucket) => Promise<void>;
}) {
  const rows = tile.breakdown ?? [];
  const [pending, setPending] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);
  if (!rows.length) return null;
  return (
    <View style={{ gap: 12 }}>
      <T variant="label">How this is worked out</T>
      <T variant="label">Each workout type</T>
      {rows.map((row) => (
        <View key={row.activityType} style={{ gap: 6 }}>
          <T>{row.label}, {row.minutes} min. Counted as {WORKOUT_BUCKET_LABEL[row.bucket].toLowerCase()}.</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {WORKOUT_BUCKETS.map((bucket) => (
              <Choice
                key={bucket}
                label={WORKOUT_BUCKET_LABEL[bucket]}
                selected={row.bucket === bucket}
                onPress={() => {
                  if (!onSetWorkoutBucket || row.bucket === bucket || pending != null) return;
                  setPending(row.activityType);
                  setNote(null);
                  void onSetWorkoutBucket(row.activityType, bucket)
                    .then(() => setNote(`${row.label} now counts as ${WORKOUT_BUCKET_LABEL[bucket].toLowerCase()}.`))
                    .catch((err: unknown) => setNote(shownError(err, 'Could not save that choice.')))
                    .finally(() => setPending(null));
                }}
              />
            ))}
          </View>
        </View>
      ))}
      {note ? <T>{note}</T> : null}
    </View>
  );
}

function StatDetail({
  tile,
  caveat,
  onClose,
  onSetWorkoutBucket,
}: {
  tile: HealthStatTile | null;
  caveat: string;
  onClose: () => void;
  onSetWorkoutBucket?: (activityType: number, bucket: WorkoutBucket) => Promise<void>;
}) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const bodyHeight = Math.max(280, Math.round(height * 0.92) - 168 - insets.bottom);
  const ink = tile ? statsToneColors(theme.scheme)[tile.tone].ink : theme.colors.ink;
  return (
    <Modal visible={tile != null} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" style={{ flex: 1 }} onPress={onClose} />
        <View
          style={{
            backgroundColor: theme.colors.bg,
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            paddingHorizontal: 20,
            paddingTop: 16,
            paddingBottom: 16 + insets.bottom,
            gap: 12,
            maxHeight: '92%',
          }}
        >
          <T variant="title">{tile?.title ?? 'More info'}</T>
          <GoalLine note={false} />
          <Button label="Close" tone="quiet" onPress={onClose} />
          {tile ? (
            <ScrollView style={{ flexGrow: 0, height: bodyHeight }}>
              <View style={{ gap: 12, paddingBottom: 8 }}>
                <T variant="label">What this is</T>
                <T>{tile.about}</T>
                <TileValue tile={tile} />
                {tile.empty ? null : <TileVisual visual={tile.visual} />}
                {!tile.empty && detailShowsStatusAgain(tile.visual.kind) ? <StatusMark tone={tile.tone} status={tile.status} /> : null}
                <T variant="label">What your number means</T>
                <T>{tile.meaning}</T>
                {tile.rangeNote && tile.rangeNote !== tile.meaning ? <T>{tile.rangeNote}</T> : null}
                <WorkoutTypeChoices tile={tile} onSetWorkoutBucket={onSetWorkoutBucket} />
                {!tile.empty && tile.history.length >= 2 ? <TrendLine points={tile.history} color={ink} /> : null}
                {tile.trend ? <T variant="muted">{tile.trend}</T> : null}
                {tile.sourceUrl ? (
                  <Pressable
                    accessibilityRole="link"
                    onPress={() => void Linking.openURL(tile.sourceUrl!)}
                    style={{ minHeight: 44, justifyContent: 'center' }}
                  >
                    <T variant="muted">{tile.sourceName}</T>
                  </Pressable>
                ) : tile.sourceName ? <T variant="muted">{tile.sourceName}</T> : null}
                {tile.extraSourceUrl ? (
                  <Pressable
                    accessibilityRole="link"
                    onPress={() => void Linking.openURL(tile.extraSourceUrl!)}
                    style={{ minHeight: 44, justifyContent: 'center' }}
                  >
                    <T variant="muted">{tile.extraSourceName}</T>
                  </Pressable>
                ) : null}
                <T variant="muted">{caveat}</T>
              </View>
            </ScrollView>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}
