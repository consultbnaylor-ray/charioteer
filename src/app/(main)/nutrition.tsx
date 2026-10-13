import { Image } from 'expo-image';
import { useState } from 'react';
import { Platform, Switch, View } from 'react-native';

import { useRepository, useSnapshot } from '@/data';
import { formatUkLong, isoDay } from '@/domain/dates';
import { shownError } from '@/domain/errors';
import { randomId } from '@/domain/id';
import {
  ESTIMATE_HINT,
  ESTIMATE_LABEL,
  FAT_SCIENCE,
  HIDE_CALORIES_LINE,
  MEAL_LABEL,
  MEAL_SLOTS,
  WAGON_SUPPORT,
  alcoholSavedLine,
  dayItems,
  fatBalance,
  nutritionPatternLines,
  processedLine,
  sugarCravingNote,
  sumItems,
  targetLine,
  type FoodItem,
  type MealSlot,
  type MealSource,
} from '@/domain/nutrition';
import { savingsFromTypicalWeek } from '@/domain/savings';
import { soberElapsed } from '@/domain/sober';
import { writeDayToAppleHealth } from '@/health/writeNutrition';
import { NutritionShareSwitch } from '@/ui/NutritionShare';
import { pickMealPhoto } from '@/ui/pickMealPhoto';
import { usePendingPress } from '@/ui/pendingAction';
import { useAppTheme } from '@/ui/theme';
import { Button, Card, Choice, ErrorNote, Field, Screen, T } from '@/ui/ui';

type DraftItem = {
  name: string;
  kcal: string;
  proteinG: string;
  carbsG: string;
  sugarG: string;
  fibreG: string;
  unsaturatedG: string;
  saturatedG: string;
  transG: string;
  sodiumMg: string;
  processed: boolean;
};

type Draft = {
  meal: MealSlot;
  source: MealSource;
  note: string;
  items: DraftItem[];
  estimated: boolean;
  previewUri: string | null;
  photoBase64: string | null;
};

const SAMPLE_JPEG = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAkGBxMTEhUTExMWFhUXGBgYGBgYGBgYGBgYGBgYGBgYGBgYHSggGBolGxUVITEhJSkrLi4uFx8zODMtNygtLisBCgoKDg0OGhAQGy0lHyUtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLf/AABEIAAEAAQMBIgACEQEDEQH/xAAbAAABBQEBAAAAAAAAAAAAAAADAAIEBQYHBf/EABQBAQAAAAAAAAAAAAAAAAAAAAD/xAAVAQEBAAAAAAAAAAAAAAAAAAAAAf/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AJQA/9k=';

function blankItem(): DraftItem {
  return {
    name: '',
    kcal: '',
    proteinG: '',
    carbsG: '',
    sugarG: '',
    fibreG: '',
    unsaturatedG: '',
    saturatedG: '',
    transG: '',
    sodiumMg: '',
    processed: false,
  };
}

function draftFrom(item: FoodItem): DraftItem {
  return {
    name: item.name,
    kcal: String(item.kcal),
    proteinG: String(item.proteinG),
    carbsG: String(item.carbsG),
    sugarG: String(item.sugarG),
    fibreG: String(item.fibreG),
    unsaturatedG: String(item.unsaturatedG),
    saturatedG: String(item.saturatedG),
    transG: String(item.transG),
    sodiumMg: String(item.sodiumMg),
    processed: item.processed,
  };
}

function numberFrom(value: string): number {
  const parsed = Number(value.replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

function itemFromDraft(draft: DraftItem): FoodItem | null {
  const name = draft.name.trim().slice(0, 80);
  if (!name) return null;
  return {
    name,
    kcal: Math.round(numberFrom(draft.kcal)),
    proteinG: numberFrom(draft.proteinG),
    carbsG: numberFrom(draft.carbsG),
    sugarG: numberFrom(draft.sugarG),
    fibreG: numberFrom(draft.fibreG),
    unsaturatedG: numberFrom(draft.unsaturatedG),
    saturatedG: numberFrom(draft.saturatedG),
    transG: numberFrom(draft.transG),
    sodiumMg: Math.round(numberFrom(draft.sodiumMg)),
    processed: draft.processed,
  };
}

export default function Nutrition() {
  const snap = useSnapshot();
  const repo = useRepository();
  const theme = useAppTheme();
  const { run, isPending } = usePendingPress();
  const profile = snap.profile;
  const today = isoDay(new Date());
  const settings = snap.nutrition;
  const hide = settings.hideCalories;
  const items = dayItems(snap.foodLogs, today);
  const totals = sumItems(items);
  const fats = fatBalance(items);
  const started = profile?.stage === 'stopped' && profile.sobrietyStartedAt ? new Date(profile.sobrietyStartedAt) : null;
  const elapsed = started && !Number.isNaN(started.getTime()) ? soberElapsed(started, new Date()) : null;
  const units = elapsed && profile?.weeklyUnits != null
    ? savingsFromTypicalWeek(profile.weeklySpendGbp ?? 0, profile.weeklyUnits, elapsed.totalMs).units
    : 0;
  const sugar = sugarCravingNote(elapsed ? elapsed.days : null);
  const saved = alcoholSavedLine(units, hide);
  const patterns = nutritionPatternLines(snap.foodLogs, snap.checkIns);
  const water = snap.waterDays.find((day) => day.day === today)?.waterMl ?? 0;
  const todayLogs = snap.foodLogs.filter((log) => log.eatenOn === today);
  const goodShare = fats.unsaturated + fats.other <= 0 ? 0 : fats.unsaturated / (fats.unsaturated + fats.other);

  const [meal, setMeal] = useState<MealSlot>('breakfast');
  const [text, setText] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [healthNote, setHealthNote] = useState<string | null>(null);
  const [target, setTarget] = useState(settings.kcalTarget == null ? '' : String(settings.kcalTarget));
  const [waterText, setWaterText] = useState(water ? String(water) : '');
  const [wagonNote, setWagonNote] = useState(settings.wagonNote);

  function openDraft(next: Draft) {
    setDraft({ ...next, meal });
    setError(null);
  }

  function readText() {
    run('estimate', async () => {
      setError(null);
      try {
        const estimate = await repo.estimateMeal({ text });
        if (!estimate.items.length) {
          setError('Add a little more detail, or enter the meal yourself.');
          return;
        }
        openDraft({
          meal,
          source: 'text',
          note: text.trim().slice(0, 500),
          items: estimate.items.map(draftFrom),
          estimated: true,
          previewUri: null,
          photoBase64: null,
        });
      } catch (err) {
        setError(shownError(err, 'Could not read that meal. You can still type it in yourself.'));
      }
    });
  }

  function readPhoto(source: 'camera' | 'library') {
    run('photo', async () => {
      setError(null);
      try {
        const photo = await pickMealPhoto(source);
        if (!photo) return;
        const estimate = await repo.estimateMeal({ imageBase64: photo.base64, text });
        openDraft({
          meal,
          source: 'photo',
          note: text.trim().slice(0, 500),
          items: estimate.items.map(draftFrom),
          estimated: true,
          previewUri: photo.previewUri,
          photoBase64: photo.base64,
        });
      } catch (err) {
        setError(shownError(err, 'Could not read that photo. You can still type the meal in yourself.'));
      }
    });
  }

  function samplePhoto() {
    run('sample', async () => {
      const estimate = await repo.estimateMeal({ imageBase64: SAMPLE_JPEG });
      openDraft({
        meal,
        source: 'photo',
        note: 'Sample plate',
        items: estimate.items.map(draftFrom),
        estimated: true,
        previewUri: `data:image/jpeg;base64,${SAMPLE_JPEG}`,
        photoBase64: SAMPLE_JPEG,
      });
    });
  }

  function saveMeal() {
    if (!draft) return;
    run('save', async () => {
      setError(null);
      setHealthNote(null);
      const foods = draft.items.map(itemFromDraft).filter((item): item is FoodItem => item != null);
      if (!foods.length) {
        setError('Add at least one food.');
        return;
      }
      try {
        await repo.saveFoodLog({
          id: randomId(),
          eatenOn: today,
          meal: draft.meal,
          source: draft.source,
          note: draft.note,
          items: foods,
          estimated: draft.estimated,
          photoBase64: draft.photoBase64,
        });
        setDraft(null);
        setText('');
        if (Platform.OS === 'ios' && profile?.consentHealth) {
          const written = await writeDayToAppleHealth(foods, 0);
          setHealthNote(written.ok ? 'Saved to Apple Health.' : written.message);
        }
      } catch (err) {
        setError(shownError(err, 'Could not save that meal.'));
      }
    });
  }

  function removeLog(id: string) {
    run(`remove:${id}`, async () => {
      setError(null);
      try {
        await repo.deleteFoodLog(id);
      } catch (err) {
        setError(shownError(err, 'Could not remove that meal.'));
      }
    });
  }

  function saveTarget() {
    run('target', async () => {
      setError(null);
      const trimmed = target.trim();
      const kcal = trimmed ? Math.round(Number(trimmed)) : null;
      if (kcal != null && (!Number.isFinite(kcal) || kcal < 800 || kcal > 6000)) {
        setError('A target sits between 800 and 6,000 kcal, or leave it blank.');
        return;
      }
      try {
        await repo.setNutritionSettings({ ...repo.getSnapshot().nutrition, kcalTarget: kcal });
      } catch (err) {
        setError(shownError(err, 'Could not save that target.'));
      }
    });
  }

  function saveWater() {
    run('water', async () => {
      setError(null);
      const ml = Math.round(Number(waterText.trim() || '0'));
      if (!Number.isFinite(ml) || ml < 0 || ml > 8000) {
        setError('Water sits between 0 and 8,000 ml.');
        return;
      }
      const previous = repo.getSnapshot().waterDays.find((day) => day.day === today)?.waterMl ?? 0;
      try {
        await repo.setWater(today, ml);
        const added = ml - previous;
        if (Platform.OS === 'ios' && profile?.consentHealth && added > 0) {
          const written = await writeDayToAppleHealth([], added);
          setHealthNote(written.ok ? 'Saved to Apple Health.' : written.message);
        }
      } catch (err) {
        setError(shownError(err, 'Could not save water.'));
      }
    });
  }

  function setHide(value: boolean) {
    run('hide', async () => {
      setError(null);
      try {
        await repo.setNutritionSettings({ ...repo.getSnapshot().nutrition, hideCalories: value });
      } catch (err) {
        setError(shownError(err, 'Could not update that setting.'));
      }
    });
  }

  function setWagon(value: boolean) {
    run('wagon', async () => {
      setError(null);
      try {
        const current = repo.getSnapshot().nutrition;
        await repo.setNutritionSettings({
          ...current,
          wagonOn: value,
          wagonVisible: value ? current.wagonVisible : false,
          wagonNote: value ? wagonNote.slice(0, 200) : '',
        });
        if (!value) setWagonNote('');
      } catch (err) {
        setError(shownError(err, 'Could not update that flag.'));
      }
    });
  }

  function updateItem(index: number, patch: Partial<DraftItem>) {
    setDraft((current) => {
      if (!current) return current;
      const itemsNext = current.items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item));
      return { ...current, items: itemsNext };
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
    <Screen
      eyebrow="Tools"
      title="Nutrition"
      intro={`${formatUkLong(today)}. Estimates stay labelled, and nothing is saved until you confirm it.`}
    >
      <Card>
        <T variant="label">Today</T>
        {hide ? <T>{HIDE_CALORIES_LINE}</T> : <T>{`${totals.kcal.toLocaleString('en-GB')} kcal`}</T>}
        {!hide && settings.kcalTarget != null ? <T variant="muted">{`Target ${settings.kcalTarget.toLocaleString('en-GB')} kcal`}</T> : null}
        {!hide ? <T>{targetLine(totals.kcal, settings.kcalTarget, false)}</T> : null}
        <T>{`Protein ${totals.proteinG} g · carbohydrate ${totals.carbsG} g · sugar ${totals.sugarG} g`}</T>
        <T>{`Fibre ${totals.fibreG} g · sodium ${totals.sodiumMg.toLocaleString('en-GB')} mg`}</T>
        <T variant="label">Fats</T>
        <View
          accessibilityLabel="Unsaturated fat compared with saturated and trans fat"
          style={{ height: 12, borderRadius: 6, backgroundColor: theme.colors.line, overflow: 'hidden' }}
        >
          <View style={{ width: `${Math.round(goodShare * 100)}%`, height: '100%', backgroundColor: theme.colors.ink }} />
        </View>
        <T variant="muted">{`Unsaturated ${fats.unsaturated} g · saturated and trans ${fats.other} g`}</T>
        <T>{fats.line}</T>
        <T variant="muted">{FAT_SCIENCE}</T>
        {processedLine(items) ? <T>{processedLine(items)}</T> : null}
        {patterns.map((line) => <T key={line}>{line}</T>)}
        {sugar ? <T>{sugar}</T> : null}
        {saved ? <T>{saved}</T> : null}
        <T variant="muted">{`Water ${water.toLocaleString('en-GB')} ml`}</T>
      </Card>

      <Card>
        <T variant="label">Log a meal</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {MEAL_SLOTS.map((slot) => (
            <Choice key={slot} label={MEAL_LABEL[slot]} selected={meal === slot} onPress={() => setMeal(slot)} />
          ))}
        </View>
        <Field label="Describe the meal" value={text} onChangeText={setText} placeholder="2 eggs on toast" />
        <Button label="Estimate from text" pending={isPending('estimate')} pendingLabel="Reading..." onPress={readText} />
        <Button label="Take a photo" tone="quiet" pending={isPending('photo')} pendingLabel="Reading..." onPress={() => readPhoto('camera')} />
        <Button label="Choose a photo" tone="quiet" pending={isPending('photo')} pendingLabel="Reading..." onPress={() => readPhoto('library')} />
        {snap.mode === 'demo' ? (
          <Button label="Use a sample photo" tone="quiet" pending={isPending('sample')} pendingLabel="Reading..." onPress={samplePhoto} />
        ) : null}
        <Button
          label="Enter it myself"
          tone="quiet"
          onPress={() => openDraft({
            meal,
            source: 'manual',
            note: text.trim().slice(0, 500),
            items: [blankItem()],
            estimated: false,
            previewUri: null,
            photoBase64: null,
          })}
        />
      </Card>

      {draft ? (
        <Card>
          <T variant="label">{draft.source === 'photo' ? 'Confirm this photo' : 'Confirm this meal'}</T>
          {draft.estimated ? <T>{ESTIMATE_LABEL}</T> : null}
          <T>{ESTIMATE_HINT}</T>
          {draft.previewUri ? (
            <Image
              source={{ uri: draft.previewUri }}
              style={{ width: '100%', height: 180, borderRadius: 12 }}
              contentFit="cover"
              accessibilityLabel="Meal photo"
            />
          ) : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {MEAL_SLOTS.map((slot) => (
              <Choice key={slot} label={MEAL_LABEL[slot]} selected={draft.meal === slot} onPress={() => setDraft({ ...draft, meal: slot })} />
            ))}
          </View>
          {draft.items.map((item, index) => (
            <View key={index} style={{ gap: 8 }}>
              <Field label="Food" value={item.name} onChangeText={(name) => updateItem(index, { name })} />
              {hide ? null : <Field label="kcal" value={item.kcal} onChangeText={(kcal) => updateItem(index, { kcal })} keyboardType="decimal-pad" />}
              <Field label="Protein (g)" value={item.proteinG} onChangeText={(proteinG) => updateItem(index, { proteinG })} keyboardType="decimal-pad" />
              <Field label="Carbohydrate (g)" value={item.carbsG} onChangeText={(carbsG) => updateItem(index, { carbsG })} keyboardType="decimal-pad" />
              <Field label="Sugar (g)" value={item.sugarG} onChangeText={(sugarG) => updateItem(index, { sugarG })} keyboardType="decimal-pad" />
              <Field label="Fibre (g)" value={item.fibreG} onChangeText={(fibreG) => updateItem(index, { fibreG })} keyboardType="decimal-pad" />
              <Field label="Unsaturated fat (g)" value={item.unsaturatedG} onChangeText={(unsaturatedG) => updateItem(index, { unsaturatedG })} keyboardType="decimal-pad" />
              <Field label="Saturated fat (g)" value={item.saturatedG} onChangeText={(saturatedG) => updateItem(index, { saturatedG })} keyboardType="decimal-pad" />
              <Field label="Trans fat (g)" value={item.transG} onChangeText={(transG) => updateItem(index, { transG })} keyboardType="decimal-pad" />
              <Field label="Sodium (mg)" value={item.sodiumMg} onChangeText={(sodiumMg) => updateItem(index, { sodiumMg })} keyboardType="decimal-pad" />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <T style={{ flex: 1 }}>Highly processed</T>
                <Switch
                  accessibilityLabel={`Highly processed, ${item.name || 'food'}`}
                  value={item.processed}
                  onValueChange={(processed) => updateItem(index, { processed })}
                  trackColor={{ true: theme.colors.ink, false: theme.colors.line }}
                  thumbColor={theme.colors.surface}
                />
              </View>
            </View>
          ))}
          <Button label="Add another food" tone="quiet" onPress={() => setDraft({ ...draft, items: [...draft.items, blankItem()] })} />
          <Button label="Save meal" pending={isPending('save')} pendingLabel="Saving..." onPress={saveMeal} />
          <Button label="Cancel" tone="quiet" disabled={isPending('save')} onPress={() => setDraft(null)} />
        </Card>
      ) : null}

      <Card>
        <T variant="label">Logged today</T>
        {todayLogs.length === 0 ? <T variant="muted">Nothing saved yet.</T> : null}
        {todayLogs.map((log) => {
          const names = log.items.map((item) => item.name).join(', ');
          const kcal = hide ? '' : ` · ${sumItems(log.items).kcal} kcal`;
          const estimate = log.estimated ? ` · ${ESTIMATE_LABEL}` : '';
          return (
            <View key={log.id} style={{ gap: 6 }}>
              {log.previewUrl ? (
                <Image source={{ uri: log.previewUrl }} style={{ width: 96, height: 96, borderRadius: 10 }} contentFit="cover" accessibilityLabel="Saved meal photo" />
              ) : null}
              <T>{`${MEAL_LABEL[log.meal]}: ${names || log.note || 'Meal'}${kcal}${estimate}`}</T>
              <Button label="Remove" tone="quiet" pending={isPending(`remove:${log.id}`)} pendingLabel="Removing..." onPress={() => removeLog(log.id)} />
            </View>
          );
        })}
      </Card>

      <Card>
        <T variant="label">Water</T>
        <Field label="Water today (ml)" value={waterText} onChangeText={setWaterText} keyboardType="number-pad" placeholder="350" />
        <Button label="Save water" pending={isPending('water')} pendingLabel="Saving..." onPress={saveWater} />
      </Card>

      <Card>
        <T variant="label">Calories</T>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <T style={{ flex: 1 }}>Hide calories</T>
          <Switch
            accessibilityLabel="Hide calories"
            value={hide}
            disabled={isPending('hide')}
            onValueChange={setHide}
            trackColor={{ true: theme.colors.ink, false: theme.colors.line }}
            thumbColor={theme.colors.surface}
          />
        </View>
        <T variant="muted">{HIDE_CALORIES_LINE}</T>
        {hide ? null : (
          <>
            <Field label="Optional kcal target" value={target} onChangeText={setTarget} keyboardType="number-pad" placeholder="Leave blank for none" />
            <Button label="Save target" pending={isPending('target')} pendingLabel="Saving..." onPress={saveTarget} />
          </>
        )}
      </Card>

      <Card>
        <T variant="label">Sharing</T>
        <T variant="muted">Off until you switch it on. Other people can message privately or report.</T>
        <NutritionShareSwitch
          label="Food diary visible to community members"
          item="Food diary"
          on={settings.shareFoodDiary}
          apply={(current, selected) => ({ ...current, shareFoodDiary: selected })}
        />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <T style={{ flex: 1 }}>I’ve fallen off the wagon</T>
          <Switch
            accessibilityLabel="I’ve fallen off the wagon"
            value={settings.wagonOn}
            disabled={isPending('wagon')}
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
            <NutritionShareSwitch
              label="Show this on my profile"
              item="A hard moment"
              on={settings.wagonVisible}
              apply={(current, selected) => ({ ...current, wagonVisible: selected })}
            />
            <Button label="Clear this" tone="quiet" pending={isPending('wagon')} pendingLabel="Clearing..." onPress={() => setWagon(false)} />
          </View>
        ) : null}
      </Card>

      {healthNote ? <T variant="muted">{healthNote}</T> : null}
      {error ? <ErrorNote>{error}</ErrorNote> : null}
    </Screen>
  );
}
