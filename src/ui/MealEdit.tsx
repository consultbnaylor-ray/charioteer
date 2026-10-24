import DateTimePicker from '@react-native-community/datetimepicker';
import { createElement, useRef, useState } from 'react';
import { Platform, Pressable, Switch, View } from 'react-native';

import type { FoodLogUpdate } from '@/data/types';
import { isoDay, parseIsoDay } from '@/domain/dates';
import { londonDay } from '@/domain/healthInsights';
import { shownError } from '@/domain/errors';
import {
  APPLE_HEALTH_MEAL_NOTE,
  ESTIMATE_HINT,
  ESTIMATE_LABEL,
  MEAL_LABEL,
  MEAL_SLOTS,
  londonClock,
  londonWallInstant,
  mealDayChangeAllowed,
  mealLogWindow,
  mealSlotClock,
  parsePortion,
  scaleFoodItems,
  type FoodItem,
  type FoodLog,
  type MealSlot,
} from '@/domain/nutrition';
import { DateField } from '@/ui/DateField';
import { dismissKeyboard } from '@/ui/keyboard';
import { radius, useAppTheme } from '@/ui/theme';
import { Button, Choice, Field, T } from '@/ui/ui';

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

export function MealEdit({
  log,
  hideCalories,
  saved,
  saving,
  estimating,
  showHealthNote,
  onSave,
  onEstimate,
  onCancel,
  onError,
}: {
  log: FoodLog;
  hideCalories: boolean;
  saved: boolean;
  saving: boolean;
  estimating: boolean;
  showHealthNote: boolean;
  onSave: (patch: FoodLogUpdate) => void;
  onEstimate: (text: string) => Promise<FoodItem[]>;
  onCancel: () => void;
  onError: (message: string | null) => void;
}) {
  const theme = useAppTheme();
  const openedNote = log.note;
  const openedPortion = log.portion || 1;
  const [note, setNote] = useState(log.note);
  const [portion, setPortion] = useState(String(openedPortion));
  const [appliedPortion, setAppliedPortion] = useState(openedPortion);
  const [meal, setMeal] = useState<MealSlot>(log.meal);
  const [day, setDay] = useState(() => parseIsoDay(log.eatenOn));
  const [time, setTime] = useState(() => (log.eatenAt ? londonClock(log.eatenAt) : mealSlotClock(log.meal)));
  const [items, setItems] = useState<DraftItem[]>(() => log.items.map(draftFrom));
  const [fatText, setFatText] = useState(() => log.items.map((item) => String(fatGrams(draftFrom(item)))));
  const [estimated, setEstimated] = useState(log.estimated);
  const appliedRef = useRef(openedPortion);
  const draftRef = useRef(items);

  const typedPortion = parsePortion(portion);
  const portionChanged = (typedPortion ?? appliedPortion) !== openedPortion;
  const descriptionChanged = note.trim() !== openedNote.trim();

  function replaceItems(next: DraftItem[]) {
    draftRef.current = next;
    setItems(next);
    setFatText(next.map((item) => String(fatGrams(item))));
  }

  function updateItem(index: number, patch: Partial<DraftItem>) {
    setItems((current) => {
      const next = current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item));
      draftRef.current = next;
      setFatText(next.map((item) => String(fatGrams(item))));
      return next;
    });
  }

  function applyPortion(value: string) {
    setPortion(value);
    const next = parsePortion(value);
    if (next == null || next === appliedRef.current) return;
    const scaled = scaleDraft(draftRef.current, next / appliedRef.current);
    appliedRef.current = next;
    setAppliedPortion(next);
    replaceItems(scaled);
  }

  function commitPortion(drafts: DraftItem[]): { items: DraftItem[]; portion: number } | null {
    const next = parsePortion(portion);
    if (next == null) {
      onError('Portion sits between 0.25 and 12.');
      return null;
    }
    if (next === appliedRef.current) return { items: drafts, portion: next };
    const scaled = scaleDraft(drafts, next / appliedRef.current);
    appliedRef.current = next;
    setAppliedPortion(next);
    replaceItems(scaled);
    return { items: scaled, portion: next };
  }

  function applyFat(index: number) {
    const typed = Number(String(fatText[index] ?? '').replace(',', '.'));
    if (!Number.isFinite(typed) || typed < 0) return;
    setItems((current) => current.map((item, itemIndex) => (itemIndex === index ? withFatTotal(item, typed) : item)));
  }

  function save() {
    dismissKeyboard();
    const withFats = items.map((item, index) => {
      const typed = Number(String(fatText[index] ?? '').replace(',', '.'));
      if (!Number.isFinite(typed) || typed < 0) return item;
      if (Math.abs(typed - fatGrams(item)) < 0.05) return item;
      return withFatTotal(item, typed);
    });
    const scaled = commitPortion(withFats);
    if (!scaled) return;
    const foods = scaled.items.map(itemFromDraft).filter((item): item is FoodItem => item != null);
    if (!foods.length) {
      onError('Add at least one food.');
      return;
    }
    const clock = parseClock(time);
    if (!clock) {
      onError('Use a time such as 08:30.');
      return;
    }
    const picked = isoDay(day);
    if (!mealDayChangeAllowed(picked, log.eatenOn, new Date())) {
      onError('Choose today or a day in the last 30 days.');
      return;
    }
    const eatenAt = londonWallInstant(picked, clock.hours, clock.minutes);
    if (londonDay(eatenAt) !== picked) {
      onError('That day could not be saved.');
      return;
    }
    onError(null);
    onSave({
      eatenOn: picked,
      eatenAt,
      meal,
      note: note.trim().slice(0, 500),
      items: foods,
      estimated,
      portion: scaled.portion,
    });
  }

  function reestimate() {
    const description = note.trim();
    if (description.length < 2) {
      onError('Add a description before asking for a new estimate.');
      return;
    }
    const factor = typedPortion ?? appliedPortion;
    void onEstimate(description).then((foods) => {
      if (!foods.length) {
        onError('Could not read that meal. You can still type the figures in.');
        return;
      }
      const scaled = factor === 1 ? foods : scaleFoodItems(foods, factor);
      replaceItems(scaled.map(draftFrom));
      if (typedPortion != null) {
        appliedRef.current = typedPortion;
        setAppliedPortion(typedPortion);
      }
      setEstimated(true);
      onError(null);
    }).catch((err: unknown) => {
      onError(shownError(err, 'Could not read that meal. You can still type the figures in.'));
    });
  }

  return (
    <View style={{ gap: 8 }}>
      <Field label="Description" value={note} onChangeText={setNote} placeholder="Porridge and a banana" maxLength={500} />
      <Field
        label="Portion"
        value={portion}
        onChangeText={applyPortion}
        keyboardType="decimal-pad"
        hint="1 is the logged amount. 2 doubles every figure."
      />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {MEAL_SLOTS.map((slot) => (
          <Choice key={slot} label={MEAL_LABEL[slot]} selected={meal === slot} onPress={() => { setMeal(slot); setTime(mealSlotClock(slot)); }} />
        ))}
      </View>
      <DateField
        label="Date"
        value={day}
        onChange={setDay}
        maximumDate={parseIsoDay(mealLogWindow(new Date()).today)}
        earliestDate={parseIsoDay(mealLogWindow(new Date()).earliest)}
      />
      <TimeField label="Time" value={time} onChange={setTime} />
      {estimated ? <T>{ESTIMATE_LABEL}</T> : null}
      {items.map((item, index) => (
        <View key={`${log.id}-${index}`} style={{ gap: 8 }}>
          <Field label="Food" value={item.name} onChangeText={(name) => updateItem(index, { name })} />
          {hideCalories ? null : (
            <Field label="kcal" value={item.kcal} onChangeText={(kcal) => updateItem(index, { kcal })} keyboardType="decimal-pad" />
          )}
          <Field label="Protein (g)" value={item.proteinG} onChangeText={(proteinG) => updateItem(index, { proteinG })} keyboardType="decimal-pad" />
          <Field label="Carbohydrate (g)" value={item.carbsG} onChangeText={(carbsG) => updateItem(index, { carbsG })} keyboardType="decimal-pad" />
          <Field label="Sugar (g)" value={item.sugarG} onChangeText={(sugarG) => updateItem(index, { sugarG })} keyboardType="decimal-pad" />
          <Field label="Fibre (g)" value={item.fibreG} onChangeText={(fibreG) => updateItem(index, { fibreG })} keyboardType="decimal-pad" />
          <Field
            label="Fat (g)"
            value={fatText[index] ?? ''}
            onChangeText={(value) => setFatText((current) => current.map((entry, entryIndex) => (entryIndex === index ? value : entry)))}
            onBlur={() => applyFat(index)}
            keyboardType="decimal-pad"
          />
          <T variant="label">Fat quality</T>
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
      {descriptionChanged || portionChanged ? (
        <View style={{ gap: 8 }}>
          <T variant="muted">{ESTIMATE_HINT}</T>
          <Button
            label="Re-estimate with AI"
            tone="quiet"
            pending={estimating}
            pendingLabel="Reading..."
            onPress={reestimate}
          />
        </View>
      ) : null}
      {showHealthNote ? <T variant="muted">{APPLE_HEALTH_MEAL_NOTE}</T> : null}
      <Button
        label={saved && !saving ? 'Saved ✓' : 'Save meal'}
        pending={saving}
        pendingLabel="Saving..."
        onPress={save}
      />
      <Button label="Cancel" tone="quiet" disabled={saving} onPress={onCancel} />
    </View>
  );
}

function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const theme = useAppTheme();
  const [open, setOpen] = useState(Platform.OS === 'ios');
  const shown = parseClock(value) ? value : '12:00';
  if (Platform.OS === 'web') {
    return (
      <View style={{ gap: 6 }}>
        <T variant="label">{label}</T>
        <WebTimeInput label={label} value={shown} onChange={onChange} />
      </View>
    );
  }
  const clock = parseClock(shown) ?? { hours: 12, minutes: 0 };
  const pickerValue = new Date();
  pickerValue.setHours(clock.hours, clock.minutes, 0, 0);
  return (
    <View style={{ gap: 6 }}>
      <T variant="label">{label}</T>
      {Platform.OS === 'android' ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label}, ${shown}`}
          onPress={() => setOpen(true)}
          style={{
            borderWidth: 1,
            borderColor: theme.colors.line,
            backgroundColor: theme.colors.surface,
            borderRadius: radius.md,
            minHeight: 52,
            justifyContent: 'center',
            paddingHorizontal: 14,
          }}
        >
          <T>{shown}</T>
        </Pressable>
      ) : (
        <View accessibilityLabel={`${label}, ${shown}`}>
          <T>{shown}</T>
        </View>
      )}
      {open ? (
        <DateTimePicker
          value={pickerValue}
          mode="time"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          themeVariant={theme.scheme}
          accentColor={theme.colors.ink}
          onChange={(event, next) => {
            if (Platform.OS === 'android') setOpen(false);
            if (event.type === 'dismissed' || !next) return;
            onChange(`${String(next.getHours()).padStart(2, '0')}:${String(next.getMinutes()).padStart(2, '0')}`);
          }}
        />
      ) : null}
    </View>
  );
}

function WebTimeInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const theme = useAppTheme();
  const inputRef = useRef<HTMLInputElement | null>(null);
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${value}`}
        onPress={() => {
          const node = inputRef.current;
          if (node && typeof node.showPicker === 'function') node.showPicker();
          else node?.focus();
        }}
        style={{
          borderWidth: 1,
          borderColor: theme.colors.line,
          backgroundColor: theme.colors.surface,
          borderRadius: radius.md,
          minHeight: 52,
          justifyContent: 'center',
          paddingHorizontal: 14,
        }}
      >
        <T>{value}</T>
      </Pressable>
      {createElement('input', {
        ref: inputRef,
        type: 'time',
        'aria-label': label,
        value,
        tabIndex: -1,
        onChange: (event: { target: { value: string } }) => {
          if (parseClock(event.target.value)) onChange(event.target.value);
        },
        style: {
          position: 'absolute',
          opacity: 0,
          width: 1,
          height: 1,
          pointerEvents: 'none',
        },
      })}
    </View>
  );
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

function round1(value: number): number {
  return Math.round(value * 10) / 10;
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

function scaleDraft(items: DraftItem[], factor: number): DraftItem[] {
  return items.map((item) => {
    const food = itemFromDraft({ ...item, name: item.name.trim() || 'Food' });
    if (!food) return item;
    const [scaled] = scaleFoodItems([food], factor);
    if (!scaled) return item;
    return { ...draftFrom(scaled), name: item.name };
  });
}

function fatGrams(item: DraftItem): number {
  return round1(numberFrom(item.unsaturatedG) + numberFrom(item.saturatedG) + numberFrom(item.transG));
}

function withFatTotal(item: DraftItem, total: number): DraftItem {
  const current = fatGrams(item);
  const next = round1(Math.max(0, total));
  if (current <= 0) return { ...item, unsaturatedG: String(next), saturatedG: '0', transG: '0' };
  const factor = next / current;
  return {
    ...item,
    unsaturatedG: String(round1(numberFrom(item.unsaturatedG) * factor)),
    saturatedG: String(round1(numberFrom(item.saturatedG) * factor)),
    transG: String(round1(numberFrom(item.transG) * factor)),
  };
}

function parseClock(value: string): { hours: number; minutes: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return { hours, minutes };
}
