import { useState } from 'react';
import { Linking, Modal, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg from 'react-native-svg';

import { isoDay, startOfLocalDay } from '@/domain/dates';
import { BAND_CAVEAT, type BandLink } from '@/domain/healthBands';
import { latestVo2Reading, type Vo2Source } from '@/domain/vo2Estimate';
import { chartBucketForPeriod } from '@/domain/readingChart';
import { parseStatPeriod, rollingWindow, type StatPeriod } from '@/domain/statWindow';
import { shownError } from '@/domain/errors';
import {
  buildHealthStatBoard,
  narrowHealthStatBoard,
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
import {
  APPLE_HEALTH_CONSENT,
  APPLE_HEALTH_UNAVAILABLE,
  APPLE_HEALTH_WEB,
  type AppleHealthTurnOn,
} from '@/health/connection';
import { CompareBars, ProgressRing, RangeTrack, ToneMark, TrendLine } from '@/ui/DistanceCharts';
import { ReadingChart } from '@/ui/ReadingChart';
import { DateField } from '@/ui/DateField';
import { GoalLine } from '@/ui/GoalLine';
import { statsToneColors } from '@/ui/statsPalette';
import { useAppTheme } from '@/ui/theme';
import { MoreInfoButton } from '@/ui/MoreInfo';
import { Vo2EstimateNote } from '@/ui/Vo2EstimateNote';
import { healthTileIcon } from '@/domain/statIcons';
import { IconLabel } from '@/ui/statIcons';
import { textMentionsWeight, UpdateWeightLink } from '@/ui/UpdateWeightLink';
import { Button, Card, Choice, Field, QuietNote, T, playSavedHaptic } from '@/ui/ui';

export type HealthTurnOnResult = AppleHealthTurnOn | 'consent';

/** Grouped tiles for this person's own readings. Sharing stays on the switches already on this page. */
export function HealthStatBoard(
  input: HealthStatBoardInput & {
    onTurnOn?: (types: readonly string[]) => Promise<HealthTurnOnResult>;
    onSaveBody?: (reading: { recordedOn: string; bodyFatPct: number | null; leanMassKg: number | null; source: BodyEntrySource }) => Promise<void>;
    onSetWorkoutBucket?: (activityType: number, bucket: WorkoutBucket) => Promise<void>;
    onPlanOutdoor?: () => void;
    /** When set, only these tile ids stay. */
    onlyTiles?: readonly string[];
    /** Tile ids left on another screen. */
    omitTiles?: readonly string[];
  },
) {
  const model = narrowHealthStatBoard(buildHealthStatBoard(input), { only: input.onlyTiles, omit: input.omitTiles });
  const period = parseStatPeriod(input.period);
  const vo2 = latestVo2Reading(input.samples);
  const measuredOn = vo2?.day ?? null;
  const vo2Source = vo2?.source ?? null;
  const [openId, setOpenId] = useState<string | null>(null);
  const open = model.sections.flatMap((section) => section.tiles).find((tile) => tile.id === openId) ?? null;
  if (model.sections.length === 0 && !model.missingLine) return null;
  return (
    <View style={{ gap: 14 }}>
      {model.sections.map((section) => (
        <StatSection
          key={section.id}
          title={section.title}
          tiles={section.tiles}
          today={input.today}
          period={period}
          measuredOn={measuredOn}
          vo2Source={vo2Source}
          onPlanOutdoor={input.onPlanOutdoor}
          onOpen={setOpenId}
        />
      ))}
      {model.missingLine ? (
        <MissingReads line={model.missingLine} gaps={model.gaps} onTurnOn={input.onTurnOn} onSaveBody={input.onSaveBody} />
      ) : null}
      <StatDetail
        tile={open}
        today={input.today}
        period={period}
        measuredOn={measuredOn}
        vo2Source={vo2Source}
        onPlanOutdoor={input.onPlanOutdoor}
        caveat={model.caveat}
        onClose={() => setOpenId(null)}
        onSetWorkoutBucket={input.onSetWorkoutBucket}
      />
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
  today,
  period,
  measuredOn,
  vo2Source,
  onPlanOutdoor,
  onOpen,
}: {
  title: string;
  tiles: HealthStatTile[];
  today: string;
  period: StatPeriod;
  measuredOn: string | null;
  vo2Source: Vo2Source | null;
  onPlanOutdoor?: () => void;
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
            <StatTile key={tile.id} tile={tile} today={today} period={period} measuredOn={measuredOn} vo2Source={vo2Source} onPlanOutdoor={onPlanOutdoor} onOpen={() => onOpen(tile.id)} />
          ))}
        </View>
      ) : null}
    </Card>
  );
}

function StatTile({
  tile,
  today,
  period,
  measuredOn,
  vo2Source,
  onPlanOutdoor,
  onOpen,
}: {
  tile: HealthStatTile;
  today: string;
  period: StatPeriod;
  measuredOn: string | null;
  vo2Source: Vo2Source | null;
  onPlanOutdoor?: () => void;
  onOpen: () => void;
}) {
  const theme = useAppTheme();
  const icon = healthTileIcon(tile.id);
  const charted = tile.readings.length > 0;
  const spoken = `More info about ${tile.title}. ${valueWithPeriod(tile)}. ${tile.weeklyLine ?? ''} ${tile.mark}. ${tile.status}`;
  return (
    <View
      style={{
        flexGrow: 1,
        flexBasis: charted ? '100%' : '46%',
        minWidth: 148,
        gap: 6,
        padding: 8,
        borderWidth: 1,
        borderColor: theme.colors.line,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surface,
      }}
    >
      <Pressable accessibilityRole="button" accessibilityLabel={spoken} onPress={onOpen} style={{ gap: 6 }}>
        {icon ? <IconLabel name={icon}>{tile.title}</IconLabel> : <T style={{ fontFamily: theme.font.bodyStrong, fontSize: 16, lineHeight: 22 }}>{tile.title}</T>}
        {tile.warning ? (
          <View accessibilityRole="alert" style={{ backgroundColor: '#FFE14A', borderWidth: 2, borderColor: '#1A1400', padding: 8 }}>
            <T style={{ color: '#1A1400', fontFamily: theme.font.bodyStrong }}>⚠ Contact your GP or NHS 111.</T>
          </View>
        ) : null}
        <TileValue tile={tile} />
        {tile.empty ? null : <TileVisual visual={tile.visual} charted={charted} showCaptions={tile.visual.kind !== 'zone'} />}
        {!tile.empty && tile.hasGuideline ? (
          <T variant="muted">{tile.id === 'weekly_active_minutes' ? 'Not medical advice. Not a diagnosis.' : 'Not medical advice.'}</T>
        ) : null}
        {tile.empty || tile.visual.kind === 'ring' || tile.visual.kind === 'zone' ? null : (
          <StatusMark tone={tile.tone} status={tile.status} word={tile.mark} />
        )}
        {!charted && !tile.empty && tile.history.length >= 2 && tile.visual.kind !== 'line' ? (
          <TrendLine points={tile.history} color={statsToneColors(theme.scheme)[tile.tone].ink} />
        ) : null}
        {tile.trend ? <T variant="muted">{tile.trend}</T> : null}
      </Pressable>
      <MoreInfoButton
        label="More info"
        accessibilityLabel={`More info about ${tile.title}`}
        onPress={onOpen}
      />
      {tileFaceMentionsWeight(tile) ? <UpdateWeightLink /> : null}
      {charted ? <TileChart tile={tile} today={today} period={period} /> : null}
      {tile.id === 'vo2_max' && onPlanOutdoor ? <Vo2EstimateNote measuredOn={measuredOn} source={vo2Source} today={today} onPlan={onPlanOutdoor} /> : null}
    </View>
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

const SUM_CHARTS = new Set(['steps', 'workouts', 'weekly_active_minutes']);

function TileChart({ tile, today, period }: { tile: HealthStatTile; today: string; period: StatPeriod }) {
  const window = rollingWindow(today, period);
  const unit = tile.unit === 'h' ? 'hours' : tile.unit;
  return (
    <ReadingChart
      points={tile.readings}
      start={window.start}
      end={window.end}
      unit={unit}
      aggregate={SUM_CHARTS.has(tile.id) ? 'sum' : 'mean'}
      bucket={chartBucketForPeriod(period)}
      accessibilityLabel={`${tile.title} chart`}
    />
  );
}

function tileFaceMentionsWeight(tile: HealthStatTile): boolean {
  if (tile.id === 'weight_kg') return false;
  const visual = tile.visual.kind === 'zone'
    ? `${tile.visual.status} ${tile.visual.zoneCaption} ${tile.visual.goalCaption ?? ''}`
    : tile.visual.kind === 'bars'
      ? tile.visual.caption ?? ''
      : '';
  return textMentionsWeight([tile.title, tile.status, tile.trend ?? '', tile.unit, tile.weeklyLine ?? '', visual].join(' '));
}

function tileMentionsWeight(tile: HealthStatTile): boolean {
  if (tile.id === 'weight_kg') return false;
  const sheet = tile.sheet
    ? `${tile.sheet.measures} ${tile.sheet.elite} ${tile.sheet.compare} ${tile.sheet.next} ${tile.workedOut ?? ''}`
    : '';
  return textMentionsWeight([tile.about, tile.meaning, tile.rangeNote ?? '', sheet].join(' ')) || tileFaceMentionsWeight(tile);
}

function valueWithPeriod(tile: HealthStatTile): string {
  if (!tile.unit) return `${tile.valueText} - ${tile.period}`;
  return `${tile.valueText} ${tile.unit} - ${tile.period}`;
}

function TileVisual({ visual, charted = false, showCaptions = true }: { visual: HealthStatVisual; charted?: boolean; showCaptions?: boolean }) {
  const theme = useAppTheme();
  if (visual.kind === 'line') {
    if (charted) return null;
    return <TrendLine points={visual.points} color={theme.colors.ink} />;
  }
  if (visual.kind === 'ring') {
    return (
      <ProgressRing
        centre={visual.centre}
        unit={visual.unit}
        fill={visual.fill}
        status={visual.status}
        tone={visual.tone}
        signal={visual.signal}
        monochrome={visual.neutral}
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
        signal={visual.signal}
        monochrome={visual.neutral}
        surface="card"
        mark
        showCaptions={showCaptions}
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

function StatusMark({ tone, status, word }: { tone: HealthStatTile['tone']; status: string; word: string }) {
  const theme = useAppTheme();
  const neutral = word === 'Early days' || word === 'On pace';
  const iconTone = word === 'On pace' ? 'good' : word === 'Early days' ? 'info' : tone;
  const color = neutral ? theme.colors.ink : statsToneColors(theme.scheme)[tone].ink;
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" accessibilityElementsHidden>
          <ToneMark tone={iconTone} color={color} />
        </Svg>
        <T style={{ color, fontFamily: theme.font.bodyStrong }}>{word}</T>
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

function sourceLabel(source: BandLink): string {
  if (source.year == null) return `${source.name}. No year is printed on that page.`;
  if (source.name.includes(String(source.year))) return source.name;
  return `${source.name}, ${source.year}`;
}

function StatDetail({
  tile,
  today,
  period,
  measuredOn,
  vo2Source,
  onPlanOutdoor,
  caveat,
  onClose,
  onSetWorkoutBucket,
}: {
  tile: HealthStatTile | null;
  today: string;
  period: StatPeriod;
  measuredOn: string | null;
  vo2Source: Vo2Source | null;
  onPlanOutdoor?: () => void;
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
                {tileMentionsWeight(tile) ? <UpdateWeightLink /> : null}
                <TileValue tile={tile} />
                {tile.empty ? null : <TileVisual visual={tile.visual} charted={tile.readings.length > 0} />}
                {tile.readings.length > 0 ? <TileChart tile={tile} today={today} period={period} /> : null}
                {tile.id === 'vo2_max' && onPlanOutdoor ? <Vo2EstimateNote measuredOn={measuredOn} source={vo2Source} today={today} onPlan={() => { onClose(); onPlanOutdoor(); }} /> : null}
                {!tile.empty && detailShowsStatusAgain(tile.visual.kind) ? <StatusMark tone={tile.tone} status={tile.status} word={tile.mark} /> : null}
                <T style={{ fontFamily: theme.font.bodyStrong, fontSize: 16, lineHeight: 22 }}>What your number means</T>
                <ReadingSections tile={tile} />
                {tile.rangeNote && !tile.meaning.includes(tile.rangeNote) ? <T>{tile.rangeNote}</T> : null}
                <WorkoutTypeChoices tile={tile} onSetWorkoutBucket={onSetWorkoutBucket} />
                {!tile.empty && tile.readings.length === 0 && tile.history.length >= 2 ? <TrendLine points={tile.history} color={ink} /> : null}
                {tile.trend ? <T variant="muted">{tile.trend}</T> : null}
                {tile.sources && tile.sources.length > 0 ? tile.sources.map((source) => (
                  <Pressable
                    key={source.url}
                    accessibilityRole="link"
                    accessibilityLabel={sourceLabel(source)}
                    onPress={() => void Linking.openURL(source.url)}
                    style={{ minHeight: 44, justifyContent: 'center' }}
                  >
                    <T variant="muted">{sourceLabel(source)}</T>
                  </Pressable>
                )) : tile.sourceUrl ? (
                  <Pressable
                    accessibilityRole="link"
                    onPress={() => void Linking.openURL(tile.sourceUrl!)}
                    style={{ minHeight: 44, justifyContent: 'center' }}
                  >
                    <T variant="muted">{tile.sourceName}</T>
                  </Pressable>
                ) : tile.sourceName ? <T variant="muted">{tile.sourceName}</T> : null}
                {tile.sources && tile.sources.length > 0 && tile.sourceName && !tile.sources.some((source) => source.name === tile.sourceName) ? (
                  <T variant="muted">{tile.sourceName}</T>
                ) : null}
                {tile.hasGuideline && !tile.meaning.includes(BAND_CAVEAT) ? <T variant="muted">{BAND_CAVEAT}</T> : null}
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

function ReadingSections({ tile }: { tile: HealthStatTile }) {
  const theme = useAppTheme();
  const [open, setOpen] = useState(false);
  if (!tile.sheet) return <T>{tile.meaning}</T>;
  const rows = [
    ['What it measures', tile.sheet.measures],
    ['An elite athlete', tile.sheet.elite],
    ['How you compare', tile.sheet.compare],
    ['What to do', tile.sheet.next],
  ] as const;
  return (
    <View style={{ gap: 12 }}>
      {rows.map(([title, body]) => (
        <View key={title} style={{ gap: 4 }}>
          <T style={{ fontFamily: theme.font.bodyStrong, fontSize: 16, lineHeight: 22 }}>{title}</T>
          <T>{body}</T>
        </View>
      ))}
      {tile.workedOut ? (
        <View style={{ gap: 8 }}>
          <Button
            label={open ? 'Hide how we worked this out' : 'How we worked this out'}
            tone="quiet"
            onPress={() => setOpen((value) => !value)}
          />
          {open ? <T>{tile.workedOut}</T> : null}
        </View>
      ) : null}
    </View>
  );
}
