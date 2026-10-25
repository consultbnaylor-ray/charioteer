import { useEffect, useRef, useState } from 'react';
import { Keyboard, Platform, Pressable, ScrollView, Switch, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useRouter } from 'expo-router';
import { useRepository, useSnapshot } from '@/data';
import { randomId } from '@/domain/id';
import { formatUkDate, isoDay, parseIsoDay } from '@/domain/dates';
import { shownError } from '@/domain/errors';
import { londonDay, mondayOf, shiftDay, weekdayShort } from '@/domain/healthInsights';
import {
  londonWallTime,
  matchedSessionWorkouts,
  nextSessionClock,
  nextWeekday,
  PLANNED_EFFORT_SCORES,
  PLANNED_EFFORT_WORD_LABEL,
  PLANNED_EFFORT_WORDS,
  PLANNED_SESSION_TYPES,
  SESSION_TYPE_LABEL,
  sessionClock,
  sessionDay,
  snapSessionClock,
  type PlannedEffort,
  type PlannedSession,
  type PlannedSessionType,
} from '@/domain/plannedSession';
import { workoutCalendarEventInput } from '@/domain/calendarEvent';
import { sessionEntryWords } from '@/domain/workoutDay';
import { workoutTypeColor } from '@/domain/workoutTypeColor';
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
import { routeSummaryLine, type DeviceWorkout } from '@/domain/workoutRoute';
import { presentSessionEvent } from '@/ui/addToCalendar';
import { DateField } from '@/ui/DateField';
import { PlanTick } from '@/ui/PlanTick';
import { SessionTimeField } from '@/ui/SessionTimeField';
import { statsToneColors } from '@/ui/statsPalette';
import { useAppTheme } from '@/ui/theme';
import { Button, Card, Choice, ErrorNote, Field, T, playSavedHaptic, useScreenScroller } from '@/ui/ui';

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

function weekOf(iso: string): string[] {
  const start = mondayOf(iso);
  return Array.from({ length: 7 }, (_, index) => shiftDay(start, index));
}

/** "22 Oct" from "Thu 22 Oct 2026". */
function stripDate(iso: string): string {
  return formatUkDate(iso).split(' ').slice(1, 3).join(' ');
}

function startsAtFrom(day: Date, time: string): string | null {
  return londonWallTime(isoDay(day), time);
}

export function WorkoutCalendar({
  planDay,
  planNonce = 0,
  planOutdoorNonce = 0,
  workouts = [],
  age = null,
}: {
  planDay?: string | null;
  planNonce?: number;
  /** Opens one outdoor walk or run, 30 minutes, at the next sensible time. */
  planOutdoorNonce?: number;
  workouts?: readonly DeviceWorkout[];
  /** Used for average heart rate as % of max. Missing age does not guess a max. */
  age?: number | null;
}) {
  const snap = useSnapshot();
  const repo = useRepository();
  const router = useRouter();
  const theme = useAppTheme();
  const sessions = snap.plannedSessions ?? [];
  const [setting, setSetting] = useState<WorkoutReminderSetting | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PlannedSession | null>(null);
  const [sessionType, setSessionType] = useState<PlannedSessionType>('boxing');
  const [day, setDay] = useState(() => new Date());
  const [selected, setSelected] = useState(() => londonDay(new Date()));
  const [time, setTime] = useState('18:00');
  const fieldsRef = useRef<View>(null);
  const scroller = useScreenScroller();
  const [durationText, setDurationText] = useState('30');
  const [plannedEffort, setPlannedEffort] = useState<PlannedEffort | null>(null);
  const [note, setNote] = useState('');
  const [draftId, setDraftId] = useState(randomId);
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
    setDraftId(randomId());
    setSessionType('boxing');
    setSelected(planDay);
    setDay(parseIsoDay(planDay));
    setTime(nextSessionClock(new Date(), planDay));
    setDurationText('30');
    setPlannedEffort(null);
    setNote('');
    setOpen(true);
    setError(null);
  }, [planNonce, planDay]);

  useEffect(() => {
    if (!planOutdoorNonce) return;
    setEditing(null);
    setDraftId(randomId());
    setSessionType('outdoor');
    const today = new Date();
    setSelected(londonDay(today));
    setDay(today);
    setTime(nextSessionClock(today));
    setDurationText('30');
    setPlannedEffort(null);
    setNote('');
    setOpen(true);
    setError(null);
    const timer = setTimeout(revealSessionFields, 300);
    return () => clearTimeout(timer);
  }, [planOutdoorNonce]);

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

  function revealSessionFields() {
    const marker = fieldsRef.current;
    if (Platform.OS === 'web') {
      if (typeof document === 'undefined') return;
      const node = document.getElementById('planned-session-fields');
      if (!node) return;
      const parent = webScrollParent(node);
      const frame = () => {
        const rect = node.getBoundingClientRect();
        if (!parent) {
          if (rect.bottom > window.innerHeight - 12) node.scrollIntoView({ block: 'end', behavior: 'smooth' });
          return;
        }
        const parentRect = parent.getBoundingClientRect();
        const overflow = rect.bottom - (parentRect.bottom - 12);
        if (overflow > 0) parent.scrollTop += overflow;
      };
      requestAnimationFrame(frame);
      setTimeout(frame, 250);
      return;
    }
    const inner = scroller?.current.innerRef.current;
    const scroll = scroller?.current.scrollRef.current;
    if (!marker || !inner || !scroll) return;
    const pin = () => {
      marker.measureLayout(
        inner as never,
        (_x, y, _width, height) => {
          const viewHeight = scroller?.current.height ?? 0;
          scroll.scrollTo({ y: Math.max(0, y + height - viewHeight + 16), animated: true });
        },
        () => {},
      );
    };
    requestAnimationFrame(pin);
    setTimeout(pin, 250);
  }

  function begin(session: PlannedSession | null, date = new Date()) {
    setError(null);
    setEditing(session);
    setSessionType(session?.sessionType ?? 'boxing');
    const iso = session ? sessionDay(session) : londonDay(date);
    setSelected(iso);
    setDay(parseIsoDay(iso));
    setTime(session ? snapSessionClock(sessionClock(session)) : nextSessionClock(new Date(), iso));
    setDurationText(String(session?.durationMinutes ?? 30));
    setPlannedEffort(session?.plannedEffort ?? null);
    setNote(session?.note ?? '');
    setDraftId(session?.id ?? randomId());
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
      id: editing?.id ?? draftId,
      sessionType,
      startsAt,
      durationMinutes: Math.round(duration),
      note: note.slice(0, 280),
      plannedEffort,
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

  async function addToCalendar(session: PlannedSession) {
    setError(null);
    const draft = workoutCalendarEventInput(session, setting);
    if (!draft) {
      setError('Add to Calendar needs a start time and a duration.');
      return;
    }
    try {
      const outcome = await presentSessionEvent(draft);
      if (outcome === 'added') playSavedHaptic();
    } catch {
      setError("Add to Calendar isn't available on this phone.");
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
        plannedEffort: session.plannedEffort,
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
  const today = londonDay(now);
  const week = weekOf(selected);
  const rows = sessions.filter((session) => sessionDay(session) === selected);
  const matches = matchedSessionWorkouts(rows, workouts);
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
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous week"
          onPress={() => setSelected((current) => shiftDay(current, -7))}
          style={{ width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
        >
          <T>‹</T>
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          {selected !== today ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Today" onPress={() => setSelected(today)} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 }}>
              <T>Today</T>
            </Pressable>
          ) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next week"
          onPress={() => setSelected((current) => shiftDay(current, 7))}
          style={{ width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
        >
          <T>›</T>
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1, minWidth: '100%' }}>
        <View style={{ flexDirection: 'row', flexGrow: 1, gap: 2 }}>
          {week.map((date) => {
            const count = sessions.filter((session) => sessionDay(session) === date).length;
            const chosen = date === selected;
            const full = formatUkDate(date);
            return (
              <Pressable
                key={date}
                accessibilityRole="button"
                accessibilityLabel={count > 0 ? `${full}, ${count} planned` : `${full}, nothing planned`}
                accessibilityState={{ selected: chosen }}
                onPress={() => setSelected(date)}
                style={{
                  flexGrow: 1,
                  flexShrink: 1,
                  flexBasis: 0,
                  minWidth: 0,
                  minHeight: 64,
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 1,
                  borderWidth: chosen ? 1 : 0,
                  borderColor: theme.colors.ink,
                  backgroundColor: chosen ? theme.colors.emphasisSoft : 'transparent',
                }}
              >
                <T style={{ fontSize: 11, lineHeight: 14, color: theme.colors.muted }}>{weekdayShort(date)}</T>
                <T style={{ fontSize: 12, lineHeight: 16, textAlign: 'center', fontFamily: chosen ? theme.font.bodyStrong : theme.font.body }}>{stripDate(date)}</T>
                {count > 0 ? (
                  <View style={{ alignItems: 'center', gap: 2, minHeight: 14 }}>
                    <View accessibilityElementsHidden style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: theme.colors.ink }} />
                    <T style={{ fontSize: 10, lineHeight: 12, textAlign: 'center' }}>{`${count} planned`}</T>
                  </View>
                ) : (
                  <View style={{ minHeight: 14 }} />
                )}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <T style={{ flex: 1, fontFamily: theme.font.bodyStrong }}>{formatUkDate(selected)}</T>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Plan ${formatUkDate(selected)}`}
          onPress={() => begin(null, parseIsoDay(selected))}
          style={{ minHeight: 44, justifyContent: 'center' }}
        >
          <T>Plan</T>
        </Pressable>
      </View>
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
            onChange={(value) => {
              setDay(value);
              setSelected(isoDay(value));
            }}
            earliestDate={editing && parseIsoDay(sessionDay(editing)).getTime() < Date.now() ? parseIsoDay(sessionDay(editing)) : new Date()}
          />
          <SessionTimeField value={time} onChange={setTime} />
          <View ref={fieldsRef} nativeID="planned-session-fields" collapsable={false} style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {['30', '45', '60'].map((minutes) => (
                <Choice
                  key={minutes}
                  label={`${minutes} min`}
                  selected={durationText === minutes}
                  onPress={() => {
                    Keyboard.dismiss();
                    setDurationText(minutes);
                  }}
                />
              ))}
            </View>
            <Field
              label="Duration in minutes"
              value={durationText}
              onChangeText={(value) => setDurationText(value.replace(/\D/g, '').slice(0, 3))}
              keyboardType="number-pad"
              dismissOnSubmit
              onFocus={revealSessionFields}
            />
            <T variant="label">Planned effort</T>
            <T variant="muted">Optional. Easy, Moderate, Hard, or 1 to 10.</T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {PLANNED_EFFORT_WORDS.map((word) => (
                <Choice
                  key={word}
                  label={PLANNED_EFFORT_WORD_LABEL[word]}
                  selected={plannedEffort === word}
                  onPress={() => setPlannedEffort((current) => (current === word ? null : word))}
                />
              ))}
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {PLANNED_EFFORT_SCORES.map((score) => (
                <Choice
                  key={score}
                  label={String(score)}
                  selected={plannedEffort === score}
                  onPress={() => setPlannedEffort((current) => (current === score ? null : score))}
                />
              ))}
            </View>
            <Field label="Note" value={note} onChangeText={setNote} placeholder="Optional" maxLength={280} onFocus={revealSessionFields} />
            <Button label={editing ? 'Save session' : 'Save session'} pending={pending} onPress={() => { void saveSession(); }} />
          </View>
        </View>
      ) : null}
      {rows.length === 0 ? <T>No sessions on this day.</T> : rows.map((session) => {
        const reminded = setting ? sessionHasReminder(session, setting, now) : false;
        const happened = Boolean(session.doneAt) || Date.parse(session.startsAt) <= now.getTime();
        const matched = happened ? matches.get(session.id) ?? null : null;
        const typeWord = SESSION_TYPE_LABEL[session.sessionType];
        const colorLabel = matched?.label ?? typeWord;
        const entry = sessionEntryWords(session, matched, age, now);
        const line = entry.startsWith(`${typeWord} ·`) ? `${colorLabel}${entry.slice(typeWord.length)}` : entry;
        const routeLine = matched ? routeSummaryLine(matched) : null;
        return (
          <View key={session.id} style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View
                accessibilityElementsHidden
                style={{ width: 10, height: 10, backgroundColor: workoutTypeColor(colorLabel), borderWidth: 1, borderColor: theme.colors.line }}
              />
              <T style={{ flex: 1 }}>{line}</T>
              {reminded ? (
                <View accessibilityRole="image" accessibilityLabel="Reminder set" style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Bell size={14} />
                </View>
              ) : null}
            </View>
            {routeLine ? <T>{routeLine}</T> : null}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {session.doneAt ? null : (
                <Pressable accessibilityRole="button" accessibilityLabel={`Mark ${SESSION_TYPE_LABEL[session.sessionType]} done`} onPress={() => { void markDone(session); }} style={{ minHeight: 44, justifyContent: 'center' }}>
                  <T>Done</T>
                </Pressable>
              )}
              {matched?.routeExpected ? (
                <Pressable accessibilityRole="button" accessibilityLabel={`View route, ${matched.label}`} onPress={() => router.push(`/workout/${encodeURIComponent(matched.id)}` as never)} style={{ minHeight: 44, justifyContent: 'center' }}>
                  <T>View route</T>
                </Pressable>
              ) : null}
              <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${SESSION_TYPE_LABEL[session.sessionType]}`} onPress={() => begin(session)} style={{ minHeight: 44, justifyContent: 'center' }}>
                <T>Edit</T>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={`Add ${SESSION_TYPE_LABEL[session.sessionType]} to Calendar`} onPress={() => { void addToCalendar(session); }} style={{ minHeight: 44, justifyContent: 'center' }}>
                <T>Add to Calendar</T>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${SESSION_TYPE_LABEL[session.sessionType]}`} onPress={() => { void remove(session); }} style={{ minHeight: 44, justifyContent: 'center' }}>
                <T>Delete</T>
              </Pressable>
            </View>
          </View>
        );
      })}
    </Card>
  );
}

function webScrollParent(node: HTMLElement | null): HTMLElement | null {
  let current = node?.parentElement ?? null;
  while (current) {
    const overflow = getComputedStyle(current).overflowY;
    if ((overflow === 'auto' || overflow === 'scroll') && current.scrollHeight > current.clientHeight + 8) return current;
    current = current.parentElement;
  }
  return null;
}

export { planDayFromSessionText } from '@/domain/plannedSession';
