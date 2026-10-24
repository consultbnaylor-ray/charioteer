import { useState } from 'react';
import { Platform, View } from 'react-native';

import { useRepository, useSnapshot } from '@/data';
import { formatUkLong, isoDay, startOfLocalDay } from '@/domain/dates';
import { shownError } from '@/domain/errors';
import { WAIST_ZONE_CAPTION, bodyFatRange, bodyFatZoneCaption, waistRange } from '@/domain/distance';
import {
  BMI_ONLY_NOTE,
  BODY_BUILDS,
  BUILD_WHY,
  BODY_ENTRY_SOURCES,
  BODY_SOURCE_LABEL,
  BUILD_LABEL,
  assessWeight,
  compositionForAssessment,
  compositionTrendLine,
  fatFreeMassKg,
  ffmiPlain,
  ffmiValue,
  parseBodyFatPct,
  parseLeanMassKg,
  waistToHeight,
  weightPointsFrom,
  type BodyBuild,
  type BodyEntrySource,
} from '@/domain/nutrition';
import { readAppleHealthBody } from '@/health/sync';
import { rangedRing } from '@/domain/measureFigures';
import { formatWaistCm } from '@/domain/weightEntry';
import { RangeTrack } from '@/ui/DistanceCharts';
import { MeasureRingView } from '@/ui/MeasuredFigure';
import { DateField } from '@/ui/DateField';
import { usePendingPress } from '@/ui/pendingAction';
import { Button, Card, Choice, Field, QuietNote, T, playSavedHaptic } from '@/ui/ui';

export function BuildChoices() {
  const snap = useSnapshot();
  const repo = useRepository();
  const settings = snap.nutrition;
  const [note, setNote] = useState<string | null>(null);

  function choose(build: BodyBuild) {
    setNote(null);
    const next = settings.build === build ? null : build;
    void repo.setNutritionSettings({ ...repo.getSnapshot().nutrition, build: next }).catch((err: unknown) => {
      setNote(shownError(err, 'Could not save that build.'));
    });
  }

  return (
    <View style={{ gap: 8 }}>
      <T variant="muted">{BUILD_WHY}</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {BODY_BUILDS.map((id) => (
          <Choice key={id} label={BUILD_LABEL[id]} selected={settings.build === id} onPress={() => choose(id)} />
        ))}
      </View>
      <QuietNote>{note}</QuietNote>
    </View>
  );
}

export function BodyCompositionCard() {
  const snap = useSnapshot();
  const repo = useRepository();
  const { run, isPending } = usePendingPress();
  const settings = snap.nutrition;
  const profile = snap.profile;
  const figures = compositionForAssessment(snap.bodyComposition);
  const weights = weightPointsFrom(snap.health);
  const latestWeight = weights.length ? weights[weights.length - 1] : undefined;
  const assessment = assessWeight({
    bodyFatPct: figures.bodyFatPct,
    waistCm: figures.waistCm,
    weightKg: latestWeight?.kg ?? null,
    heightCm: profile?.heightCm ?? null,
    build: settings.build,
    sex: settings.goalSex,
  });
  const lean = fatFreeMassKg({
    weightKg: latestWeight?.kg ?? null,
    bodyFatPct: figures.bodyFatPct,
    leanMassKg: figures.leanMassKg,
  });
  const ffmi = lean != null && profile?.heightCm != null ? ffmiValue(lean, profile.heightCm) : null;
  const ratio = figures.waistCm != null && profile?.heightCm != null ? waistToHeight(figures.waistCm, profile.heightCm) : null;
  const fatRange = figures.bodyFatPct != null ? bodyFatRange(figures.bodyFatPct, settings.goalSex) : null;
  const waistFigure = ratio != null ? waistRange(ratio) : null;
  const [fat, setFat] = useState('');
  const [leanText, setLeanText] = useState('');
  const [source, setSource] = useState<BodyEntrySource>('smart_scale');
  const [day, setDay] = useState(() => startOfLocalDay(new Date()));
  const [note, setNote] = useState<string | null>(null);
  const compositionTrend = compositionTrendLine(snap.bodyComposition, settings.goal);
  const history = [...snap.bodyComposition]
    .sort((left, right) => right.recordedOn.localeCompare(left.recordedOn) || right.createdAt.localeCompare(left.createdAt))
    .slice(0, 5);
  const canReadHealth = Platform.OS === 'ios' && Boolean(profile?.consentHealth);

  function save() {
    run('body', async () => {
      setNote(null);
      const bodyFatPct = fat.trim() ? parseBodyFatPct(Number(fat)) : null;
      if (fat.trim() && bodyFatPct == null) {
        setNote('Body fat sits between 2% and 70%.');
        return;
      }
      const leanMassKg = leanText.trim() ? parseLeanMassKg(Number(leanText)) : null;
      if (leanText.trim() && leanMassKg == null) {
        setNote('Lean body mass sits between 20 and 200 kg.');
        return;
      }
      if (bodyFatPct == null && leanMassKg == null) {
        setNote('Add body fat or lean mass.');
        return;
      }
      try {
        await repo.saveBodyComposition({
          recordedOn: isoDay(day),
          bodyFatPct,
          leanMassKg,
          waistCm: null,
          source,
        });
        setNote('Saved');
        playSavedHaptic();
      } catch (err: unknown) {
        setNote(shownError(err, 'Could not save that reading.'));
      }
    });
  }

  function readHealth() {
    run('body-health', async () => {
      setNote(null);
      const read = await readAppleHealthBody();
      if (!read.ok) {
        setNote(read.message);
        return;
      }
      if (read.body.bodyFatPct == null && read.body.leanMassKg == null) {
        setNote('Apple Health has no body fat or lean body mass to read.');
        return;
      }
      try {
        await repo.saveBodyComposition({
          recordedOn: read.body.compositionDay ?? isoDay(new Date()),
          bodyFatPct: read.body.bodyFatPct,
          leanMassKg: read.body.leanMassKg,
          waistCm: null,
          source: 'healthkit',
        });
        setNote('Saved');
        playSavedHaptic();
      } catch (err: unknown) {
        setNote(shownError(err, 'Could not save that reading.'));
      }
    });
  }

  return (
    <Card>
      <T variant="label">Body</T>
      <T variant="muted">Body fat is used before waist-to-height, and waist-to-height before BMI. This is not a diagnosis, and it is not estimated from a photo.</T>
      <BuildChoices />
      {assessment.plain ? <T>{assessment.plain}</T> : <T variant="muted">{BMI_ONLY_NOTE}</T>}
      {fatRange && figures.bodyFatPct != null ? (
        <>
          <MeasureRingView
            label="Body fat"
            detail={bodyFatZoneCaption(fatRange)}
            ring={rangedRing(
              String(Math.round(figures.bodyFatPct * 10) / 10),
              '%',
              figures.bodyFatPct,
              fatRange.zoneLow,
              fatRange.zoneHigh,
              fatRange.within,
              fatRange.status,
            )}
          />
          <RangeTrack
            value={figures.bodyFatPct}
            zoneLow={fatRange.zoneLow}
            zoneHigh={fatRange.zoneHigh}
            scaleMin={fatRange.scaleMin}
            scaleMax={fatRange.scaleMax}
            status={fatRange.status}
            zoneCaption={bodyFatZoneCaption(fatRange)}
            tone={fatRange.within ? 'good' : 'watch'}
            surface="card"
            showStatus={false}
          />
        </>
      ) : null}
      {waistFigure && ratio != null ? (
        <>
          <MeasureRingView
            label="Waist to height"
            detail={WAIST_ZONE_CAPTION}
            ring={rangedRing(
              ratio.toFixed(2),
              'ratio',
              ratio,
              waistFigure.zoneLow,
              waistFigure.zoneHigh,
              waistFigure.within,
              waistFigure.status,
            )}
          />
          <RangeTrack
            value={ratio}
            zoneLow={waistFigure.zoneLow}
            zoneHigh={waistFigure.zoneHigh}
            scaleMin={waistFigure.scaleMin}
            scaleMax={waistFigure.scaleMax}
            status={waistFigure.status}
            zoneCaption={WAIST_ZONE_CAPTION}
            tone={waistFigure.within ? 'good' : 'watch'}
            surface="card"
            showStatus={false}
          />
        </>
      ) : null}
      {ratio != null && assessment.basis !== 'waist' ? (
        <T>{ratio < 0.5
          ? `Waist-to-height is ${ratio.toFixed(2)}. Under 0.5 is the healthy band: waist is less than half your height.`
          : `Waist-to-height is ${ratio.toFixed(2)}. 0.5 or more sits outside the healthy band on this screen.`}</T>
      ) : null}
      {ffmi != null ? <T>{ffmiPlain({ ffmi, sex: settings.goalSex })}</T> : null}
      {compositionTrend ? <T variant="muted">{compositionTrend}</T> : null}
      <T variant="muted">
        {figures.waistCm != null
          ? `Latest waist ${formatWaistCm(figures.waistCm)}, from a weight reading. Waist-to-height uses that figure.`
          : 'Add a waist with a weight reading. Waist-to-height uses the latest one.'}
      </T>
      <Field label="Body fat (%)" value={fat} onChangeText={setFat} keyboardType="decimal-pad" placeholder="15" />
      <Field label="Lean body mass (kg)" value={leanText} onChangeText={setLeanText} keyboardType="decimal-pad" placeholder="63" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {BODY_ENTRY_SOURCES.map((id) => (
          <Choice key={id} label={BODY_SOURCE_LABEL[id]} selected={source === id} onPress={() => setSource(id)} />
        ))}
      </View>
      <DateField label="Date" value={day} onChange={setDay} />
      <Button label="Save body reading" pending={isPending('body')} pendingLabel="Saving..." onPress={save} />
      {canReadHealth ? (
        <Button label="Read from Apple Health" tone="quiet" pending={isPending('body-health')} pendingLabel="Reading..." onPress={readHealth} />
      ) : null}
      <QuietNote>{note}</QuietNote>
      {history.map((row) => (
        <T key={row.id} variant="muted">
          {`${formatUkLong(row.recordedOn)} · ${BODY_SOURCE_LABEL[row.source]}${row.bodyFatPct != null ? ` · ${row.bodyFatPct}% fat` : ''}${row.leanMassKg != null ? ` · ${row.leanMassKg} kg lean` : ''}${row.waistCm != null ? ` · waist ${row.waistCm} cm` : ''}`}
        </T>
      ))}
    </Card>
  );
}
