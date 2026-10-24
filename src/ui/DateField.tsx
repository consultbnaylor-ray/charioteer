import DateTimePicker from '@react-native-community/datetimepicker';
import { createElement, useRef, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';

import { clampToPast, formatUkLong, isoDay, parseIsoDay, startOfLocalDay } from '@/domain/dates';
import { radius, stroke, useAppTheme } from '@/ui/theme';
import { T } from '@/ui/ui';

export function DateField({
  label,
  value,
  onChange,
  hint,
  maximumDate,
  earliestDate,
}: {
  label: string;
  value: Date;
  onChange: (value: Date) => void;
  hint?: string;
  maximumDate?: Date;
  /** When set, the day cannot be earlier than this. Future days stay available. */
  earliestDate?: Date;
}) {
  const theme = useAppTheme();
  const [open, setOpen] = useState(Platform.OS === 'ios');
  const latest = maximumDate ? endOfLocalDay(maximumDate) : earliestDate ? null : endOfLocalDay(new Date());
  const earliest = earliestDate ? startOfLocalDay(earliestDate) : null;
  const shown = formatUkLong(value);

  function commit(next: Date) {
    let day = startOfLocalDay(next);
    if (latest && day.getTime() > startOfLocalDay(latest).getTime()) day = startOfLocalDay(latest);
    if (earliest && day.getTime() < earliest.getTime()) day = earliest;
    if (!earliest && latest) day = clampToPast(day, latest);
    onChange(day);
  }

  return (
    <View style={{ gap: 6 }}>
      <T variant="label">{label}</T>
      {Platform.OS === 'web' ? (
        <WebDateInput label={label} value={value} shown={shown} maximumDate={latest} earliestDate={earliest} onCommit={commit} />
      ) : (
        <>
          {Platform.OS === 'android' ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${label}, ${shown}`}
              onPress={() => setOpen(true)}
              style={{
                borderWidth: stroke.control,
                borderColor: theme.colors.line,
                backgroundColor: theme.colors.surface,
                borderRadius: radius.md,
                minHeight: 52,
                justifyContent: 'center',
                paddingHorizontal: 16,
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
              value={value}
              mode="date"
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              maximumDate={latest ?? undefined}
              minimumDate={earliest ?? undefined}
              themeVariant={theme.scheme}
              accentColor={theme.colors.ink}
              onChange={(event, next) => {
                if (Platform.OS === 'android') setOpen(false);
                if (event.type === 'dismissed' || !next) return;
                commit(next);
              }}
            />
          ) : null}
        </>
      )}
      {hint ? <T variant="muted">{hint}</T> : null}
    </View>
  );
}

function endOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function WebDateInput({
  label,
  value,
  shown,
  maximumDate,
  earliestDate,
  onCommit,
}: {
  label: string;
  value: Date;
  shown: string;
  maximumDate: Date | null;
  earliestDate: Date | null;
  onCommit: (value: Date) => void;
}) {
  const theme = useAppTheme();
  const inputRef = useRef<HTMLInputElement | null>(null);
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${shown}`}
        onPress={() => {
          const node = inputRef.current;
          if (node && typeof node.showPicker === 'function') node.showPicker();
          else node?.focus();
        }}
        style={{
          borderWidth: stroke.control,
          borderColor: theme.colors.line,
          backgroundColor: theme.colors.surface,
          borderRadius: radius.md,
          minHeight: 52,
          justifyContent: 'center',
          paddingHorizontal: 16,
        }}
      >
        <T>{shown}</T>
      </Pressable>
      {createElement('input', {
        ref: inputRef,
        type: 'date',
        'aria-label': label,
        value: isoDay(value),
        max: maximumDate ? isoDay(maximumDate) : undefined,
        min: earliestDate ? isoDay(earliestDate) : undefined,
        tabIndex: -1,
        onChange: (event: { target: { value: string } }) => {
          const next = event.target.value;
          if (!/^\d{4}-\d{2}-\d{2}$/.test(next)) return;
          onCommit(parseIsoDay(next));
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
