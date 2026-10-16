import { useEffect, useState } from 'react';
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
import { Button, Card, Choice, ErrorNote, QuietNote, T } from '@/ui/ui';

/**
 * The same goal chips on Nutrition, Health Plan, and You.
 * They read and write nutrition settings, so a change in one place shows in the others.
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
  const settings = snap.nutrition;
  const [options, setOptions] = useState<GoalOption[]>(() => defaultGoalOptions());
  const [notice, setNotice] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

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

  function choose(id: NutritionGoal) {
    if (settings.goal === id) return;
    setNote(null);
    void repo.setNutritionSettings({ ...repo.getSnapshot().nutrition, goal: id }).catch((err: unknown) => {
      setNote(shownError(err, 'Could not save that goal.'));
    });
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
            onPress={() => choose(option.id)}
          />
        ))}
      </View>
      {settings.goal ? <T variant="muted">{GOAL_PLAIN[settings.goal]}</T> : null}
      <QuietNote>{note}</QuietNote>
    </View>
  );

  return framed ? <Card>{body}</Card> : body;
}
