import DateTimePicker from '@react-native-community/datetimepicker';
import { createElement, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';

import { snapSessionClock } from '@/domain/plannedSession';
import { radius, stroke, useAppTheme } from '@/ui/theme';
import { Choice, T } from '@/ui/ui';

export const SESSION_TIME_CHIPS = [
  { label: 'Morning 07:00', time: '07:00' },
  { label: 'Lunch 12:30', time: '12:30' },
  { label: 'Evening 18:00', time: '18:00' },
] as const;

/** A clock, not a text box. iOS uses the wheel. The web control is a time picker. */
export function SessionTimeField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const shown = snapSessionClock(value);
  return (
    <View style={{ gap: 8 }}>
      <T variant="label">Time</T>
      {Platform.OS === 'web' ? <WebTime shown={shown} onChange={onChange} /> : <NativeTime shown={shown} onChange={onChange} />}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {SESSION_TIME_CHIPS.map((chip) => (
          <Choice key={chip.time} label={chip.label} selected={shown === chip.time} onPress={() => onChange(chip.time)} />
        ))}
      </View>
    </View>
  );
}

function commitClock(next: Date, onChange: (value: string) => void) {
  const hours = String(next.getHours()).padStart(2, '0');
  const minutes = String(next.getMinutes()).padStart(2, '0');
  onChange(snapSessionClock(`${hours}:${minutes}`));
}

function NativeTime({ shown, onChange }: { shown: string; onChange: (value: string) => void }) {
  const theme = useAppTheme();
  const [open, setOpen] = useState(Platform.OS === 'ios');
  const [hours, minutes] = shown.split(':').map(Number);
  const pickerValue = useMemo(() => {
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    return date;
  }, [hours, minutes]);
  const box = {
    borderWidth: stroke.control,
    borderColor: theme.colors.line,
    backgroundColor: theme.colors.surface,
    borderRadius: radius.md,
    minHeight: 52,
    justifyContent: 'center' as const,
    paddingHorizontal: 16,
  };
  return (
    <View style={{ gap: 6 }}>
      {Platform.OS === 'ios' ? (
        <View accessibilityLabel={`Time, ${shown}`}>
          <T>{shown}</T>
        </View>
      ) : null}
      {Platform.OS === 'android' ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Time, ${shown}`} onPress={() => setOpen(true)} style={box}>
          <T>{shown}</T>
        </Pressable>
      ) : null}
      {Platform.OS === 'ios' ? (
        <DateTimePicker
          value={pickerValue}
          mode="time"
          display="spinner"
          locale="en_GB"
          minuteInterval={5}
          themeVariant={theme.scheme}
          textColor={theme.colors.ink}
          style={{ height: 216, alignSelf: 'stretch' }}
          onChange={(event, next) => {
            if (event.type === 'dismissed' || !next) return;
            commitClock(next, onChange);
          }}
        />
      ) : null}
      {Platform.OS === 'android' && open ? (
        <DateTimePicker
          value={pickerValue}
          mode="time"
          display="spinner"
          is24Hour
          minuteInterval={5}
          onChange={(event, next) => {
            setOpen(false);
            if (event.type === 'dismissed' || !next) return;
            commitClock(next, onChange);
          }}
        />
      ) : null}
    </View>
  );
}

function WebTime({ shown, onChange }: { shown: string; onChange: (value: string) => void }) {
  const theme = useAppTheme();
  const inputRef = useRef<HTMLInputElement | null>(null);
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Time, ${shown}`}
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
        type: 'time',
        step: 300,
        'aria-label': 'Time',
        value: shown,
        tabIndex: -1,
        onChange: (event: { target: { value: string } }) => {
          const next = event.target.value;
          if (/^\d{2}:\d{2}$/.test(next)) onChange(snapSessionClock(next));
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
