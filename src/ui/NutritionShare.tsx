import { useState } from 'react';
import { Switch, View } from 'react-native';

import { useRepository, useSnapshot } from '@/data';
import { shownError } from '@/domain/errors';
import { WAGON_SUPPORT, type NutritionSettings, type SharedGoal, type SharedQuality } from '@/domain/nutrition';
import { sensitiveShareConfirm } from '@/domain/profileSharing';
import { usePendingPress } from '@/ui/pendingAction';
import { useAppTheme } from '@/ui/theme';
import { Button, Card, Field, QuietNote, T } from '@/ui/ui';

/**
 * One labelled switch for a nutrition share. The first health or sobriety
 * item still uses the existing confirmation. Later items remember that consent.
 */
export function NutritionShareSwitch({
  label,
  item,
  on,
  apply,
}: {
  label: string;
  item: string;
  on: boolean;
  apply: (settings: NutritionSettings, selected: boolean) => NutritionSettings;
}) {
  const snap = useSnapshot();
  const repo = useRepository();
  const theme = useAppTheme();
  const [ask, setAsk] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(selected: boolean, consent: boolean) {
    setError(null);
    setAsk(false);
    try {
      await repo.setNutritionSettings(apply(repo.getSnapshot().nutrition, selected));
      if (consent) {
        await repo.setProfileSharing({ ...repo.getSnapshot().sharing, sensitiveConsentAt: new Date().toISOString() });
      }
    } catch (err) {
      setError(shownError(err, 'Could not update sharing.'));
    }
  }

  function change(value: boolean) {
    if (!value) {
      setAsk(false);
      if (on) void save(false, false);
      return;
    }
    if (!snap.sharing.sensitiveConsentAt && !ask) {
      setAsk(true);
      return;
    }
    void save(true, !snap.sharing.sensitiveConsentAt);
  }

  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
        <T style={{ flex: 1 }}>{label}</T>
        <Switch
          accessibilityLabel={label}
          value={on}
          onValueChange={change}
          trackColor={{ true: theme.colors.ink, false: theme.colors.line }}
          thumbColor={theme.colors.surface}
        />
      </View>
      {ask ? (
        <View style={{ gap: 8 }}>
          <T>{sensitiveShareConfirm(item)}</T>
          <Button label="Share" onPress={() => void save(true, true)} />
          <Button label="Not now" tone="quiet" onPress={() => setAsk(false)} />
        </View>
      ) : null}
      <QuietNote>{error}</QuietNote>
    </View>
  );
}

/**
 * The personal wagon flag. You and Nutrition both render this, so they read
 * and write the same note, flag, and share switch.
 */
export function WagonFlag() {
  const snap = useSnapshot();
  const repo = useRepository();
  const theme = useAppTheme();
  const { run, isPending } = usePendingPress();
  const settings = snap.nutrition;
  const [wagonNote, setWagonNote] = useState(settings.wagonNote);
  const [error, setError] = useState<string | null>(null);

  function setWagon(value: boolean) {
    setError(null);
    const current = repo.getSnapshot().nutrition;
    void repo.setNutritionSettings({
      ...current,
      wagonOn: value,
      wagonNote: value ? wagonNote.slice(0, 200) : '',
    }).then(() => {
      if (!repo.getSnapshot().nutrition.wagonOn) setWagonNote('');
    }).catch((err: unknown) => {
      setError(shownError(err, 'Could not update that flag.'));
    });
  }

  function saveWagonNote() {
    run('wagon-note', async () => {
      setError(null);
      try {
        await repo.setNutritionSettings({ ...repo.getSnapshot().nutrition, wagonNote: wagonNote.slice(0, 200) });
      } catch (err) {
        setError(shownError(err, 'Could not save that note.'));
      }
    });
  }

  return (
    <Card>
      <T variant="label">A hard moment</T>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <T style={{ flex: 1 }}>I’ve fallen off the wagon</T>
        <Switch
          accessibilityLabel="I’ve fallen off the wagon"
          value={settings.wagonOn}
          onValueChange={setWagon}
          trackColor={{ true: theme.colors.ink, false: theme.colors.line }}
          thumbColor={theme.colors.surface}
        />
      </View>
      {settings.wagonOn ? (
        <View style={{ gap: 8 }}>
          <T>You can clear this whenever you want. While it is on, Thumos treats it gently and will not shame you.</T>
          {WAGON_SUPPORT.map((line) => <T key={line}>{line}</T>)}
          <Field label="Optional note" value={wagonNote} onChangeText={setWagonNote} placeholder="A few words, if you want" maxLength={200} />
          <Button label="Save note" pending={isPending('wagon-note')} pendingLabel="Saving..." onPress={saveWagonNote} />
          <Button label="Clear this" tone="quiet" onPress={() => setWagon(false)} />
        </View>
      ) : (
        <T variant="muted">This stays on your own screen until you share the flag.</T>
      )}
      <NutritionShareSwitch
        label="Share the wagon flag"
        item="The wagon flag"
        on={settings.wagonVisible}
        apply={(current, selected) => ({ ...current, wagonVisible: selected })}
      />
      <QuietNote>{error}</QuietNote>
    </Card>
  );
}

/** Unsaturated fat against saturated and trans fat. The ink is the unsaturated share. */
export function FatShareBar({ unsaturated, other }: { unsaturated: number; other: number }) {
  const theme = useAppTheme();
  const total = unsaturated + other;
  const share = total > 0 ? unsaturated / total : 0;
  return (
    <View
      accessibilityLabel="Unsaturated fat compared with saturated and trans fat"
      style={{ height: 12, borderRadius: 6, backgroundColor: theme.colors.line, overflow: 'hidden' }}
    >
      <View style={{ width: `${Math.round(share * 100)}%`, height: '100%', backgroundColor: theme.colors.ink }} />
    </View>
  );
}

/** The pieces another member can see. Buttons stay with the profile that offers them. */
export function SharedNutritionFacts({
  meals,
  calories,
  quality,
  progress,
  goal = null,
}: {
  meals: { meal: string; detail: string }[] | null;
  calories: string | null;
  quality: SharedQuality | null;
  progress: string | null;
  goal?: SharedGoal | null;
}) {
  return (
    <>
      {meals ? (
        <View style={{ gap: 4 }}>
          <T variant="label">Today’s meals</T>
          {meals.length === 0 ? <T variant="muted">Nothing logged today.</T> : meals.map((meal) => (
            <T key={`${meal.meal}:${meal.detail}`}>{meal.meal}: {meal.detail}</T>
          ))}
        </View>
      ) : null}
      {calories ? (
        <View style={{ gap: 4 }}>
          <T variant="label">Calories and macros</T>
          <T>{calories}</T>
        </View>
      ) : null}
      {quality ? (
        <View style={{ gap: 4 }}>
          <T variant="label">Food quality</T>
          <FatShareBar unsaturated={quality.unsaturated} other={quality.other} />
          <T variant="muted">{`Unsaturated ${quality.unsaturated} g · saturated and trans ${quality.other} g`}</T>
          <T>{quality.line}</T>
        </View>
      ) : null}
      {progress ? (
        <View style={{ gap: 4 }}>
          <T variant="label">Progress</T>
          <T>{progress}</T>
        </View>
      ) : null}
      {goal ? (
        <View style={{ gap: 4 }}>
          <T variant="label">Nutrition goal</T>
          <T>{goal.line}</T>
        </View>
      ) : null}
    </>
  );
}
