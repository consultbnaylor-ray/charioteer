import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import { useRepository, useSnapshot } from '@/data';
import { isoDay } from '@/domain/dates';
import { shownError } from '@/domain/errors';
import {
  latestWaistLine,
  latestWaistPoint,
  latestWeightLine,
  latestWeightPoint,
  weightWaistWrite,
  type WeightReadingDraft,
} from '@/domain/weightEntry';
import { WeightFields } from '@/ui/HealthBoard';
import { PlanTick } from '@/ui/PlanTick';
import { statsToneColors } from '@/ui/statsPalette';
import { useAppTheme } from '@/ui/theme';
import { Button, Card, ErrorNote, T, playSavedHaptic } from '@/ui/ui';

export const WEIGHT_WAIST_SAVED = 'Saved';
export const WEIGHT_WAIST_SHEET_HREF = '/health?section=weight';

/**
 * Compact weight and waist entry on You.
 * The fields, validation, and writes are the weight sheet's. Figures stay on this
 * screen unless Share weight and body figures is already on.
 */
export function WeightWaistPanel() {
  const snap = useSnapshot();
  const repo = useRepository();
  const router = useRouter();
  const theme = useAppTheme();
  const consent = Boolean(snap.profile?.consentHealth);
  const [draft, setDraft] = useState<WeightReadingDraft | null>(null);
  const draftRef = useRef<WeightReadingDraft | null>(null);
  const savingRef = useRef(false);
  const [resetToken, setResetToken] = useState(0);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const green = statsToneColors(theme.scheme).good.ink;
  const heightText = snap.profile?.heightCm == null ? '' : String(snap.profile.heightCm);
  const weightLine = latestWeightLine(latestWeightPoint(snap.health));
  const waistLine = latestWaistLine(latestWaistPoint(snap.bodyComposition));

  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(false), 2500);
    return () => clearTimeout(timer);
  }, [saved]);

  const report = useCallback((next: WeightReadingDraft | null) => {
    draftRef.current = next;
    setDraft(next);
    if (next) setSaved(false);
  }, []);

  function save() {
    const current = draftRef.current;
    if (!consent || pending || savingRef.current || !current) return;
    const planned = weightWaistWrite(current, isoDay(new Date()));
    if (!planned.ok) {
      setError(planned.error);
      setSaved(false);
      return;
    }
    if (!planned.sample && !planned.waist) return;
    setError(null);
    setPending(true);
    savingRef.current = true;
    draftRef.current = null;
    void (async () => {
      try {
        if (planned.sample) await repo.saveHealth([planned.sample]);
        if (planned.waist) await repo.saveBodyComposition(planned.waist);
        setResetToken((token) => token + 1);
        setDraft(null);
        setSaved(true);
        playSavedHaptic();
      } catch (err: unknown) {
        draftRef.current = current;
        setDraft(current);
        setSaved(false);
        setError(shownError(err, 'Could not save.'));
      } finally {
        savingRef.current = false;
        setPending(false);
      }
    })();
  }

  return (
    <Card>
      <T variant="label">Weight and waist</T>
      <T>{weightLine}</T>
      <T>{waistLine}</T>
      <WeightFields
        canSave={consent}
        heightText={heightText}
        resetToken={resetToken}
        onDraft={report}
      />
      {consent ? null : (
        <T variant="muted">Health data is off. Turn it on in Privacy & consent to save a weight or a waist.</T>
      )}
      {saved ? (
        <View
          accessibilityRole="text"
          accessibilityLabel={WEIGHT_WAIST_SAVED}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
        >
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <PlanTick done />
          </View>
          <T style={{ color: green }}>{WEIGHT_WAIST_SAVED}</T>
        </View>
      ) : null}
      <ErrorNote>{error}</ErrorNote>
      <Button label="Save" pending={pending} disabled={!consent || pending || draft == null} onPress={save} />
      <Pressable
        accessibilityRole="link"
        accessibilityLabel="Open the weight sheet"
        onPress={() => router.push(WEIGHT_WAIST_SHEET_HREF as never)}
        style={{ minHeight: 44, justifyContent: 'center' }}
      >
        <T>Open the weight sheet</T>
      </Pressable>
    </Card>
  );
}
