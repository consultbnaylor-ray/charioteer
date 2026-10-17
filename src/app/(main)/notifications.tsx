import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Switch, View } from 'react-native';

import { useRepository, useSnapshot } from '@/data';
import { shownError } from '@/domain/errors';
import { formatReminderClock, parseReminderClock } from '@/domain/thumos';
import { offerMessageNotifications, syncMovementReminder } from '@/notifications/register';
import { IosNotificationOffRow } from '@/ui/IosNotificationOffRow';
import { useAppTheme } from '@/ui/theme';
import { Card, Choice, ErrorNote, Field, Screen, T } from '@/ui/ui';
import { GENERIC_MESSAGE_ALERT } from '../../../supabase/functions/_shared/messagePush';
import { MOVEMENT_REMINDER_BODY } from '../../../supabase/functions/_shared/motivation';

const REMINDER_CHOICES = [7 * 60, 12 * 60 + 30, 18 * 60, 21 * 60];

export default function NotificationsScreen() {
  const snap = useSnapshot();
  const repo = useRepository();
  const theme = useAppTheme();
  const profile = snap.profile;
  const [error, setError] = useState<string | null>(null);
  const [timeDraft, setTimeDraft] = useState('');

  useFocusEffect(
    useCallback(() => {
      if (profile?.movementReminder) {
        void syncMovementReminder(true, profile.movementReminderMinute);
      }
      setTimeDraft(profile?.movementReminderMinute == null ? '' : formatReminderClock(profile.movementReminderMinute));
    }, [profile?.movementReminder, profile?.movementReminderMinute]),
  );

  if (!profile) return null;

  return (
    <Screen
      eyebrow="Account"
      title="Notifications"
      intro="A private message can alert this phone. The alert does not include what they wrote. A movement nudge is separate, and it stays off until you turn it on."
    >
      <ErrorNote>{error}</ErrorNote>
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
          <T style={{ flex: 1 }}>Message notifications</T>
          <Switch
            accessibilityLabel="Message notifications"
            value={profile.messageNotifications}
            onValueChange={(value) => {
              setError(null);
              void repo.updateProfile({ messageNotifications: value }).then(() => {
                if (value) void offerMessageNotifications(repo).catch((error: unknown) => console.error('message notifications', error));
              }).catch((err: unknown) => setError(shownError(err, 'Could not save.')));
            }}
            trackColor={{ true: theme.colors.ink, false: theme.colors.line }}
            thumbColor={theme.colors.surface}
          />
        </View>
        <T variant="muted">The same choice as Turn off Message Notifications in Edit profile.</T>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
          <T style={{ flex: 1 }}>Show sender's name</T>
          <Switch
            accessibilityLabel="Show sender's name"
            value={profile.notifySenderName}
            onValueChange={(value) => {
              setError(null);
              void repo.updateProfile({ notifySenderName: value }).catch((err: unknown) => setError(shownError(err, 'Could not save.')));
            }}
            trackColor={{ true: theme.colors.ink, false: theme.colors.line }}
            thumbColor={theme.colors.surface}
          />
        </View>
        <T variant="muted">Off, the alert says {GENERIC_MESSAGE_ALERT}.</T>
        <IosNotificationOffRow />
      </Card>
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
          <T style={{ flex: 1 }}>Movement reminder</T>
          <Switch
            accessibilityLabel="Movement reminder"
            value={profile.movementReminder}
            onValueChange={(value) => {
              setError(null);
              const minute = profile.movementReminderMinute ?? 18 * 60;
              void repo.updateProfile({
                movementReminder: value,
                movementReminderMinute: minute,
              }).then(() => syncMovementReminder(value, minute)).catch((err: unknown) => setError(shownError(err, 'Could not save.')));
            }}
            trackColor={{ true: theme.colors.ink, false: theme.colors.line }}
            thumbColor={theme.colors.surface}
          />
        </View>
        <T variant="muted">Off unless you choose it. The alert says: {MOVEMENT_REMINDER_BODY} It does not name your mood, streak, food, or body. Skip it if you are injured or unwell.</T>
        {profile.movementReminder ? (
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {REMINDER_CHOICES.map((minute) => (
                <Choice
                  key={minute}
                  label={formatReminderClock(minute)}
                  selected={profile.movementReminderMinute === minute}
                  onPress={() => {
                    setError(null);
                    setTimeDraft(formatReminderClock(minute));
                    void repo.updateProfile({ movementReminderMinute: minute }).then(() => syncMovementReminder(true, minute)).catch((err: unknown) => setError(shownError(err, 'Could not save.')));
                  }}
                />
              ))}
            </View>
            <Field
              label="Or type a time"
              value={timeDraft}
              onChangeText={setTimeDraft}
              placeholder="18:00"
              onBlur={() => {
                const minute = parseReminderClock(timeDraft);
                if (minute == null) {
                  setError('Use a time like 18:00.');
                  setTimeDraft(profile.movementReminderMinute == null ? '' : formatReminderClock(profile.movementReminderMinute));
                  return;
                }
                if (minute === profile.movementReminderMinute) return;
                setError(null);
                setTimeDraft(formatReminderClock(minute));
                void repo.updateProfile({ movementReminderMinute: minute }).then(() => syncMovementReminder(true, minute)).catch((err: unknown) => setError(shownError(err, 'Could not save.')));
              }}
            />
          </View>
        ) : null}
      </Card>
    </Screen>
  );
}
