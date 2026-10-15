import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Switch, View } from 'react-native';

import { useRepository, useSnapshot } from '@/data';
import { shownError } from '@/domain/errors';
import { WAGON_SUPPORT, type NutritionSettings, type SharedGoal, type SharedQuality } from '@/domain/nutrition';
import { communitySharingOn, sensitiveShareConfirm } from '@/domain/profileSharing';
import { usePendingPress } from '@/ui/pendingAction';
import { useAppTheme } from '@/ui/theme';
import { Button, Card, Field, QuietNote, T } from '@/ui/ui';

export const NUTRITION_SHARE_LOCKED = 'These stay off until Community is on.';

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
  const communityOn = communitySharingOn(snap.profile);
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
    if (!communityOn) return;
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
          disabled={!communityOn}
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

/** All six nutrition shares, always listed. Community off disables them; it does not hide them. */
export function NutritionShareSummary() {
  const snap = useSnapshot();
  const router = useRouter();
  const settings = snap.nutrition;
  const communityOn = communitySharingOn(snap.profile);
  return (
    <Card>
      <T variant="label">What I share from Nutrition</T>
      {communityOn ? (
        <T variant="muted">Each switch shares only that item. They stay off until you switch them on.</T>
      ) : (
        <>
          <T variant="muted">{NUTRITION_SHARE_LOCKED}</T>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Turn on Community"
            onPress={() => router.push('/privacy' as never)}
            style={{ minHeight: 44, justifyContent: 'center' }}
          >
            <T>Turn on Community</T>
          </Pressable>
        </>
      )}
      <NutritionShareSwitch
        label="Share today's meals"
        item="Today's meals"
        on={settings.shareFoodDiary}
        apply={(current, selected) => ({ ...current, shareFoodDiary: selected })}
      />
      <NutritionShareSwitch
        label="Share daily calories and macros"
        item="Daily calories and macros"
        on={settings.shareCalories}
        apply={(current, selected) => ({ ...current, shareCalories: selected })}
      />
      <NutritionShareSwitch
        label="Share food quality"
        item="Food quality"
        on={settings.shareQuality}
        apply={(current, selected) => ({ ...current, shareQuality: selected })}
      />
      <NutritionShareSwitch
        label="Share progress and streaks"
        item="Progress and streaks"
        on={settings.shareProgress}
        apply={(current, selected) => ({ ...current, shareProgress: selected })}
      />
      <NutritionShareSwitch
        label="Share the wagon flag"
        item="The wagon flag"
        on={settings.wagonVisible}
        apply={(current, selected) => ({ ...current, wagonVisible: selected })}
      />
      <NutritionShareSwitch
        label="Share the goal and progress"
        item="The goal and progress"
        on={settings.shareGoal}
        apply={(current, selected) => ({ ...current, shareGoal: selected })}
      />
    </Card>
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
  const rows = Array.isArray(meals) ? meals : null;
  const unsaturated = quality && typeof quality.unsaturated === 'number' && Number.isFinite(quality.unsaturated) ? quality.unsaturated : 0;
  const other = quality && typeof quality.other === 'number' && Number.isFinite(quality.other) ? quality.other : 0;
  const qualityLine = quality && typeof quality.line === 'string' ? quality.line : '';
  const goalLine = goal && typeof goal.line === 'string' ? goal.line : '';
  return (
    <>
      {rows ? (
        <View style={{ gap: 4 }}>
          <T variant="label">Today’s meals</T>
          {rows.length === 0 ? <T variant="muted">Nothing logged today.</T> : rows.map((meal) => (
            <T key={`${meal?.meal ?? ''}:${meal?.detail ?? ''}`}>{meal?.meal ?? ''}: {meal?.detail ?? ''}</T>
          ))}
        </View>
      ) : null}
      {typeof calories === 'string' && calories ? (
        <View style={{ gap: 4 }}>
          <T variant="label">Calories and macros</T>
          <T>{calories}</T>
        </View>
      ) : null}
      {quality ? (
        <View style={{ gap: 4 }}>
          <T variant="label">Food quality</T>
          <FatShareBar unsaturated={unsaturated} other={other} />
          <T variant="muted">{`Unsaturated ${unsaturated} g · saturated and trans ${other} g`}</T>
          {qualityLine ? <T>{qualityLine}</T> : null}
        </View>
      ) : null}
      {typeof progress === 'string' && progress ? (
        <View style={{ gap: 4 }}>
          <T variant="label">Progress</T>
          <T>{progress}</T>
        </View>
      ) : null}
      {goal && goalLine ? (
        <View style={{ gap: 4 }}>
          <T variant="label">Nutrition goal</T>
          <T>{goalLine}</T>
        </View>
      ) : null}
    </>
  );
}
