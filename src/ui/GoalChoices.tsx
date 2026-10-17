import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { useRepository, useSnapshot } from '@/data';
import { shownError } from '@/domain/errors';
import {
  GOAL_LOAD_FAILED,
  defaultGoalOptions,
  loadGoalCatalogue,
  resolveGoalOptions,
  type GoalOption,
} from '@/domain/goalOptions';
import { GOAL_PLAIN, type NutritionGoal } from '@/domain/nutrition';
import { PlanTick } from '@/ui/PlanTick';
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
    if (settings.goal === id) return;
    const ticket = ++write.current;
    setNote(null);
    setSaved(false);
    try {
      await repo.setNutritionSettings({ ...repo.getSnapshot().nutrition, goal: id });
      if (ticket !== write.current) return;
      setSaved(true);
      playSavedHaptic();
    } catch (err: unknown) {
      if (ticket !== write.current) return;
      setNote(shownError(err, 'Could not save that goal.'));
    }
  }

  const shown = options.length ? options : defaultGoalOptions();
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
        {shown.map((option) => (
          <Choice
            key={option.id}
            label={option.label}
            selected={settings.goal === option.id}
            onPress={() => void choose(option.id)}
          />
        ))}
      </View>
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
