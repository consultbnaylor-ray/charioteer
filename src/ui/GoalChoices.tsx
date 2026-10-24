import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { useRepository, useSnapshot } from '@/data';
import { shownError } from '@/domain/errors';
import {
  GOAL_LOAD_FAILED,
  defaultGoalOptions,
  loadGoalCatalogue,
  resolveGoalOptions,
  type GoalOption,
} from '@/domain/goalOptions';
import { GOAL_PLAIN, boxingChipLabel, isAnyBoxer, type NutritionGoal } from '@/domain/nutrition';
import { settingsForPreset } from '@/domain/targetWeight';
import { PlanTick } from '@/ui/PlanTick';
import { TargetWeightForm } from '@/ui/TargetWeightGoal';
import { statsToneColors } from '@/ui/statsPalette';
import { useAppTheme } from '@/ui/theme';
import { Button, Card, Choice, ErrorNote, QuietNote, T, playSavedHaptic } from '@/ui/ui';

export const GOAL_SAVED_LINE = 'Goal saved';

/**
 * The same goal chips on Nutrition, Health Plan, and You.
 * A tap writes nutrition settings immediately, so the row stays in step on every
 * screen. Save your details stays for name, stage, and the other profile fields.
 */
export function GoalChoices({
  framed = true,
  detail = 'Pick one.',
}: {
  framed?: boolean;
  detail?: string;
}) {
  const snap = useSnapshot();
  const repo = useRepository();
  const theme = useAppTheme();
  const settings = snap.nutrition;
  const [options, setOptions] = useState<GoalOption[]>(() => defaultGoalOptions());
  const [notice, setNotice] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [boxingOpen, setBoxingOpen] = useState(() => isAnyBoxer(settings.goal));
  const [draftingTarget, setDraftingTarget] = useState(false);
  const write = useRef(0);
  const green = statsToneColors(theme.scheme).good.ink;

  useEffect(() => {
    let cancelled = false;
    void loadGoalCatalogue()
      .then((rows) => {
        if (cancelled) return;
        const resolved = resolveGoalOptions({ ok: true, options: rows });
        setOptions(resolved.options.length ? resolved.options : defaultGoalOptions());
        setNotice(resolved.failed ? GOAL_LOAD_FAILED : null);
      })
      .catch(() => {
        if (cancelled) return;
        const resolved = resolveGoalOptions({ ok: false });
        setOptions(resolved.options.length ? resolved.options : defaultGoalOptions());
        setNotice(GOAL_LOAD_FAILED);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const currentBoxing = isAnyBoxer(settings.goal) ? settings.goal : null;
  useEffect(() => {
    if (currentBoxing) setBoxingOpen(true);
  }, [currentBoxing]);

  async function choose(id: NutritionGoal) {
    if (settings.goal === id && settings.targetWeightKg == null && !draftingTarget) return;
    const ticket = ++write.current;
    setNote(null);
    setSaved(false);
    try {
      setDraftingTarget(false);
      await repo.setNutritionSettings(settingsForPreset(repo.getSnapshot().nutrition, id));
      if (ticket !== write.current) return;
      setSaved(true);
      playSavedHaptic();
    } catch (err: unknown) {
      if (ticket !== write.current) return;
      setNote(shownError(err, 'Could not save that goal.'));
    }
  }

  const shown = options.length ? options : defaultGoalOptions();
  const general = shown.filter((option) => !isAnyBoxer(option.id));
  const boxing = shown.filter((option) => isAnyBoxer(option.id));
  const body = (
    <View style={{ gap: 8 }}>
      <T variant="label">Goal</T>
      <T variant="muted">{detail}</T>
      {notice ? (
        <View style={{ gap: 8 }}>
          <ErrorNote>{notice}</ErrorNote>
          <Button label="Try again" onPress={() => setAttempt((value) => value + 1)} />
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {general.map((option) => (
          <Choice
            key={option.id}
            label={option.label}
            selected={settings.goal === option.id && settings.targetWeightKg == null && !draftingTarget}
            onPress={() => void choose(option.id)}
          />
        ))}
        <Choice
          label="Target weight"
          selected={settings.targetWeightKg != null || draftingTarget}
          onPress={() => setDraftingTarget(true)}
        />
      </View>
      {draftingTarget || settings.targetWeightKg != null ? <TargetWeightForm /> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Boxing weight classes"
        accessibilityState={{ expanded: boxingOpen }}
        onPress={() => setBoxingOpen((value) => !value)}
        style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
      >
        <T style={{ fontFamily: theme.font.bodyStrong, flex: 1 }}>Boxing weight classes</T>
        <T variant="muted">{boxingOpen ? 'Hide' : 'Show'}</T>
      </Pressable>
      {!boxingOpen && currentBoxing ? (
        <Choice
          label={boxingChipLabel(currentBoxing) ?? 'Boxing'}
          selected={settings.targetWeightKg == null && !draftingTarget}
          onPress={() => setBoxingOpen(true)}
        />
      ) : null}
      {boxingOpen ? (
        <ScrollView style={{ maxHeight: 280 }} nestedScrollEnabled>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {boxing.map((option) => (
              <Choice
                key={option.id}
                label={boxingChipLabel(option.id) ?? option.label}
                selected={settings.goal === option.id && settings.targetWeightKg == null && !draftingTarget}
                onPress={() => void choose(option.id)}
              />
            ))}
          </View>
        </ScrollView>
      ) : null}
      {saved ? (
        <View
          accessibilityRole="text"
          accessibilityLabel={GOAL_SAVED_LINE}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
        >
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <PlanTick done />
          </View>
          <T style={{ color: green }}>{GOAL_SAVED_LINE}</T>
        </View>
      ) : null}
      {settings.goal ? <T variant="muted">{GOAL_PLAIN[settings.goal]}</T> : null}
      <QuietNote>{note}</QuietNote>
    </View>
  );

  return framed ? <Card>{body}</Card> : body;
}
