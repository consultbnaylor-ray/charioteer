import { useEffect, useState } from 'react';
import { Pressable, Switch, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useRepository, useSnapshot } from '@/data';
import { formatUkDate, isoDay, parseIsoDay } from '@/domain/dates';
import { shownError } from '@/domain/errors';
import { londonDay, mondayOf, shiftDay } from '@/domain/healthInsights';
import {
  londonWallTime,
  nextWeekday,
  PLANNED_SESSION_TYPES,
  SESSION_TYPE_LABEL,
  sessionClock,
  sessionDay,
  sessionWords,
  type PlannedSession,
  type PlannedSessionType,
} from '@/domain/plannedSession';
import {
  reminderSettingWords,
  sessionHasReminder,
  type ReminderOffset,
  type WorkoutReminderSetting,
} from '@/domain/workoutReminders';
import {
  ensureReminderPermission,
  loadWorkoutReminders,
  rescheduleWorkoutReminders,
  saveWorkoutReminders,
} from '@/notifications/sessionReminder';
import { DateField } from '@/ui/DateField';
import { PlanTick } from '@/ui/PlanTick';
import { statsToneColors } from '@/ui/statsPalette';
import { useAppTheme } from '@/ui/theme';
import { Button, Card, Choice, ErrorNote, Field, T, playSavedHaptic } from '@/ui/ui';

const OFFSETS: { id: ReminderOffset; label: string }[] = [
  { id: '1d', label: '1 day before' },
  { id: '1h', label: '1 hour before' },
  { id: '30m', label: '30 minutes before' },
];

function Bell({ size = 18 }: { size?: number }) {
  const theme = useAppTheme();
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
      <Path
        d="M12 3.5a5.5 5.5 0 0 0-5.5 5.5v2.2c0 .7-.2 1.4-.6 2L4.5 15h15l-1.4-1.8a3.6 3.6 0 0 1-.6-2V9A5.5 5.5 0 0 0 12 3.5Z"
        stroke={theme.colors.ink}
        strokeWidth={1.6}
        fill="none"
      />
      <Path d="M10 17.5a2 2 0 0 0 4 0" stroke={theme.colors.ink} strokeWidth={1.6} fill="none" strokeLinecap="round" />
    </Svg>
  );
}

function SessionMark({ type }: { type: PlannedSessionType }) {
  const theme = useAppTheme();
  const path = type === 'run'
    ? 'M5 16c2-6 4-6 7-6s5 6 7 6'
    : type === 'cardio'
      ? 'M4 14c2-6 4-8 8-8s6 2 8 8'
      : type === 'strength'
        ? 'M4 12h16M7 8v8M17 8v8'
        : type === 'boxing'
          ? 'M8 14c0-4 2-7 4-7s4 3 4 7-2 4-4 4-4-1-4-4Z'
          : 'M12 7v10M7 12h10';
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" accessibilityElementsHidden>
      <Path d={path} stroke={theme.colors.ink} strokeWidth={1.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function calendarDays(now: Date, sessions: readonly PlannedSession[]): string[] {
  const today = londonDay(now);
  const start = mondayOf(today);
  const end = shiftDay(today, 13);
  const days = new Set<string>();
  for (let day = start; day <= end; day = shiftDay(day, 1)) days.add(day);
  for (const session of sessions) days.add(sessionDay(session));
  return [...days].sort();
}

function startsAtFrom(day: Date, time: string): string | null {
  return londonWallTime(isoDay(day), time);
}

export function WorkoutCalendar({ planDay, planNonce = 0 }: { planDay?: string | null; planNonce?: number }) {
  const snap = useSnapshot();
  const repo = useRepository();
  const theme = useAppTheme();
  const sessions = snap.plannedSessions ?? [];
  const [setting, setSetting] = useState<WorkoutReminderSetting | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PlannedSession | null>(null);
  const [sessionType, setSessionType] = useState<PlannedSessionType>('boxing');
  const [day, setDay] = useState(() => new Date());
  const [time, setTime] = useState('18:00');
  const [durationText, setDurationText] = useState('30');
  const [note, setNote] = useState('');
  const [pending, setPending] = useState(false);
  const now = new Date();

  useEffect(() => {
    let live = true;
    void loadWorkoutReminders().then((loaded) => {
      if (live) setSetting(loaded);
    });
    return () => {
      live = false;
    };
  }, []);

  const signature = setting
    ? `${setting.on}|${setting.offsets.join(',')}|${sessions.map((session) => `${session.id}:${session.startsAt}:${session.doneAt ?? ''}`).join(';')}`
    : '';

  useEffect(() => {
    if (!setting) return;
    void rescheduleWorkoutReminders(sessions, setting);
  }, [signature, setting, sessions]);

  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(false), 2500);
    return () => clearTimeout(timer);
  }, [saved]);

  useEffect(() => {
    if (!planNonce || !planDay) return;
    setEditing(null);
    setSessionType('boxing');
    setDay(parseIsoDay(planDay));
    setTime('18:00');
    setDurationText('30');
    setNote('');
    setOpen(true);
    setError(null);
  }, [planNonce, planDay]);

  function noteSaved() {
    setSaved(true);
    playSavedHaptic();
  }

  async function turnOn(value: boolean) {
    if (!setting) return;
    setError(null);
    if (value && !setting.on) {
      const allowed = await ensureReminderPermission();
      if (!allowed) {
        setError('Notifications stay off until this phone allows them.');
        return;
      }
    }
    const next = { ...setting, on: value };
    setSetting(next);
    await saveWorkoutReminders(next);
    noteSaved();
  }

  async function toggleOffset(offset: ReminderOffset) {
    if (!setting) return;
    setError(null);
    const offsets = setting.offsets.includes(offset)
      ? setting.offsets.filter((item) => item !== offset)
      : [...setting.offsets, offset];
    const next = { ...setting, offsets };
    setSetting(next);
    await saveWorkoutReminders(next);
    noteSaved();
  }

  function begin(session: PlannedSession | null, date = new Date()) {
    setError(null);
    setEditing(session);
    setSessionType(session?.sessionType ?? 'boxing');
    setDay(session ? parseIsoDay(sessionDay(session)) : date);
    setTime(session ? sessionClock(session) : '18:00');
    setDurationText(String(session?.durationMinutes ?? 30));
    setNote(session?.note ?? '');
    setOpen(true);
  }

  async function saveSession() {
    const startsAt = startsAtFrom(day, time);
    const duration = Number(durationText);
    if (!startsAt) {
      setError('Enter a time like 18:00.');
      return;
    }
    if (!Number.isFinite(duration) || duration < 10 || duration > 240) {
      setError('Duration needs to be between 10 and 240 minutes.');
      return;
    }
    const draft = {
      sessionType,
      startsAt,
      durationMinutes: Math.round(duration),
      note: note.slice(0, 280),
    };
    setPending(true);
    setError(null);
    try {
      if (editing) await repo.updatePlannedSession(editing.id, { ...draft, doneAt: editing.doneAt });
      else await repo.savePlannedSession(draft);
      setOpen(false);
      setEditing(null);
      noteSaved();
    } catch (err) {
      setError(shownError(err, 'Could not save that session.'));
    } finally {
      setPending(false);
    }
  }

  async function markDone(session: PlannedSession) {
    setPending(true);
    setError(null);
    try {
      await repo.updatePlannedSession(session.id, {
        sessionType: session.sessionType,
        startsAt: session.startsAt,
        durationMinutes: session.durationMinutes,
        note: session.note,
        doneAt: new Date().toISOString(),
      });
      noteSaved();
    } catch (err) {
      setError(shownError(err, 'Could not save that session.'));
    } finally {
      setPending(false);
    }
  }

  async function remove(session: PlannedSession) {
    setPending(true);
    setError(null);
    try {
      await repo.deletePlannedSession(session.id);
      if (editing?.id === session.id) {
        setEditing(null);
        setOpen(false);
      }
      noteSaved();
    } catch (err) {
      setError(shownError(err, 'Could not delete that session.'));
    } finally {
      setPending(false);
    }
  }

  const words = setting ? reminderSettingWords(setting) : null;
  const days = calendarDays(now, sessions);
  const green = statsToneColors(theme.scheme).good.ink;

  return (
    <Card>
      <T variant="label">Workout calendar</T>
      <T variant="label">Workout reminders</T>
      {words ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Bell />
          <T style={{ flex: 1 }}>{words}</T>
          <Switch
            accessibilityLabel="Workout reminders"
            value={setting?.on === true}
            onValueChange={(value) => { void turnOn(value); }}
            trackColor={{ true: theme.colors.ink, false: theme.colors.line }}
            thumbColor={theme.colors.surface}
          />
        </View>
      ) : (
        <T variant="muted">Loading reminders</T>
      )}
      {setting ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {OFFSETS.map((offset) => (
            <Choice
              key={offset.id}
              label={offset.label}
              selected={setting.offsets.includes(offset.id)}
              onPress={() => { void toggleOffset(offset.id); }}
            />
          ))}
        </View>
      ) : null}
      {saved ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <PlanTick done />
          <T style={{ color: green }}>Saved</T>
        </View>
      ) : null}
      <ErrorNote>{error}</ErrorNote>
      <Button label="Plan a session" onPress={() => begin(null, new Date())} />
      {open ? (
        <View style={{ gap: 10 }}>
          <T variant="label">{editing ? 'Edit session' : 'New session'}</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {PLANNED_SESSION_TYPES.map((type) => (
              <Choice key={type} label={SESSION_TYPE_LABEL[type]} selected={sessionType === type} onPress={() => setSessionType(type)} />
            ))}
          </View>
          <DateField
            label="Date"
            value={day}
            onChange={setDay}
            earliestDate={editing && parseIsoDay(sessionDay(editing)).getTime() < Date.now() ? parseIsoDay(sessionDay(editing)) : new Date()}
          />
          <Field label="Time" value={time} onChangeText={setTime} placeholder="18:00" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {['30', '45', '60'].map((minutes) => (
              <Choice key={minutes} label={`${minutes} min`} selected={durationText === minutes} onPress={() => setDurationText(minutes)} />
            ))}
          </View>
          <Field label="Duration in minutes" value={durationText} onChangeText={setDurationText} keyboardType="number-pad" />
          <Field label="Note" value={note} onChangeText={setNote} placeholder="Optional" maxLength={280} />
          <Button label={editing ? 'Save session' : 'Save session'} pending={pending} onPress={() => { void saveSession(); }} />
        </View>
      ) : null}
      {days.map((date) => {
        const rows = sessions.filter((session) => sessionDay(session) === date);
        return (
          <View key={date} style={{ gap: 6, paddingTop: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <T style={{ fontFamily: theme.font.bodyStrong }}>{formatUkDate(date)}</T>
              <Pressable accessibilityRole="button" accessibilityLabel={`Plan ${formatUkDate(date)}`} onPress={() => begin(null, parseIsoDay(date))} style={{ minHeight: 44, justifyContent: 'center' }}>
                <T>Plan</T>
              </Pressable>
            </View>
            {rows.map((session) => {
              const reminded = setting ? sessionHasReminder(session, setting, now) : false;
              return (
                <View key={session.id} style={{ gap: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <SessionMark type={session.sessionType} />
                    <T style={{ flex: 1 }}>{session.doneAt ? `${sessionWords(session)} · Done` : sessionWords(session)}</T>
                    {reminded ? (
                      <View accessibilityRole="image" accessibilityLabel="Reminder set" style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Bell size={14} />
                      </View>
                    ) : null}
                  </View>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {session.doneAt ? null : (
                      <Pressable accessibilityRole="button" accessibilityLabel={`Mark ${SESSION_TYPE_LABEL[session.sessionType]} done`} onPress={() => { void markDone(session); }} style={{ minHeight: 44, justifyContent: 'center' }}>
                        <T>Done</T>
                      </Pressable>
                    )}
                    <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${SESSION_TYPE_LABEL[session.sessionType]}`} onPress={() => begin(session)} style={{ minHeight: 44, justifyContent: 'center' }}>
                      <T>Edit</T>
                    </Pressable>
                    <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${SESSION_TYPE_LABEL[session.sessionType]}`} onPress={() => { void remove(session); }} style={{ minHeight: 44, justifyContent: 'center' }}>
                      <T>Delete</T>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        );
      })}
    </Card>
  );
}

export function planDayFromSessionText(text: string, now = new Date()): string | null {
  const match = /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/.exec(text);
  if (!match?.[1]) return null;
  return nextWeekday(match[1], now);
}
