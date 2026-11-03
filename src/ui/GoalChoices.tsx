import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import { useRepository, useSnapshot } from '@/data';
import { shownError } from '@/domain/errors';
import {
  GOAL_LOAD_FAILED,
  defaultGoalOptions,
  loadGoalCatalogue,
  resolveGoalOptions,
  type GoalOption,
} from '@/domain/goalOptions';
import { FITNESS_GOAL_LABEL, FITNESS_GOALS, resolvedFitnessGoal, type FitnessGoal } from '@/domain/fitnessGoal';
import { GOAL_PLAIN, boxingChipLabel, isAnyBoxer, type NutritionGoal } from '@/domain/nutrition';
import { settingsForFitnessGoal, settingsForPreset } from '@/domain/targetWeight';
import { PlanTick } from '@/ui/PlanTick';
import { GoalTargetDate, TargetWeightForm } from '@/ui/TargetWeightGoal';
import { statsToneColors } from '@/ui/statsPalette';
import { useAppTheme } from '@/ui/theme';
import { UpdateWeightLink } from '@/ui/UpdateWeightLink';
import { Button, Card, Choice, ErrorNote, QuietNote, T, playSavedHaptic } from '@/ui/ui';

export const GOAL_SAVED_LINE = 'Goal saved';

/** One full-width goal row. The page scrolls. This row does not. */
export function GoalDivision({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        minHeight: 48,
        alignSelf: 'stretch',
        justifyContent: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderWidth: 1,
        borderRadius: 12,
        borderColor: selected ? theme.colors.accent : theme.colors.line,
        backgroundColor: theme.colors.surface,
      }}
    >
      <T style={{ fontFamily: theme.font.bodyStrong }}>{label}</T>
    </Pressable>
  );
}

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

  async function chooseFitness(id: FitnessGoal) {
    if (resolvedFitnessGoal(settings) === id && settings.fitnessGoal === id) return;
    const ticket = ++write.current;
    setNote(null);
    setSaved(false);
    try {
      await repo.setNutritionSettings(settingsForFitnessGoal(repo.getSnapshot().nutrition, id));
      if (ticket !== write.current) return;
      setSaved(true);
      playSavedHaptic();
    } catch (err: unknown) {
      if (ticket !== write.current) return;
      setNote(shownError(err, 'Could not save that goal.'));
    }
  }

  const shown = options.length ? options : defaultGoalOptions();
  const general = shown.filter((option) => !isAnyBoxer(option.id) && option.id !== 'elite_runner' && option.id !== 'body_builder');
  const fitnessNow = resolvedFitnessGoal(settings);
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
      <T variant="label">Or choose a boxing weight class</T>
      <T variant="muted">Boxing weight class (sets your target weight)</T>
      <View accessibilityLabel="Boxing weight classes" style={{ gap: 8, alignSelf: 'stretch' }}>
        {boxing.map((option) => {
          const label = boxingChipLabel(option.id) ?? option.label;
          const selected = settings.goal === option.id && settings.targetWeightKg == null && !draftingTarget;
          return (
            <GoalDivision
              key={option.id}
              label={label}
              selected={selected}
              onPress={() => void choose(option.id)}
            />
          );
        })}
      </View>
      {draftingTarget || settings.targetWeightKg != null ? <TargetWeightForm /> : null}
      {settings.goal && settings.targetWeightKg == null && !draftingTarget ? <GoalTargetDate /> : null}
      <UpdateWeightLink />
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
      <T variant="label">Fitness goal</T>
      <T variant="muted">This sits beside a weight goal. Both can be on.</T>
      <View accessibilityLabel="Fitness goals" style={{ gap: 8, alignSelf: 'stretch' }}>
        {FITNESS_GOALS.map((id) => (
          <GoalDivision
            key={id}
            label={FITNESS_GOAL_LABEL[id]}
            selected={fitnessNow === id}
            onPress={() => void chooseFitness(id)}
          />
        ))}
      </View>
      {settings.goal && settings.goal !== 'elite_runner' && settings.goal !== 'body_builder' ? <T variant="muted">{GOAL_PLAIN[settings.goal]}</T> : null}
      <T variant="muted">{FITNESS_GOAL_LABEL[fitnessNow]}</T>
      <QuietNote>{note}</QuietNote>
    </View>
  );

  return framed ? <Card>{body}</Card> : body;
}
