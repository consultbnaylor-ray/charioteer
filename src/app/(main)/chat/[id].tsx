import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useRepository, useSnapshot } from '@/data';
import { Button, Card, Choice, ErrorNote, Field, Screen, T } from '@/ui/ui';
import { useAppTheme } from '@/ui/theme';

const REASONS = ['Unwanted contact', 'Safety concern', 'Spam', 'Something else'];

export default function Chat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const snap = useSnapshot();
  const repo = useRepository();
  const theme = useAppTheme();
  const [draft, setDraft] = useState('');
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState(REASONS[0]);
  const [details, setDetails] = useState('');
  const [error, setError] = useState<string | null>(null);
  const me = snap.profile;
  const connection = snap.connections.find((item) => item.id === id);
  if (!me || !connection) {
    return <Screen title="Chat"><T>This chat is not available.</T></Screen>;
  }
  const otherId = connection.requesterId === me.id ? connection.addresseeId : connection.requesterId;
  const other = snap.directory.find((card) => card.id === otherId)?.displayName ?? 'Member';
  const messages = snap.messages.filter((message) => message.connectionId === connection.id);

  return (
    <Screen eyebrow="Private chat" title={other} intro="Only the two of you can read this. Blocking hides them from you.">
      {messages.map((message) => (
        <Card key={message.id} style={{ backgroundColor: message.senderId === me.id ? theme.colors.copperSoft : theme.colors.surface }}>
          <T variant="label">{message.senderId === me.id ? 'You' : other}</T>
          <T>{message.body}</T>
        </Card>
      ))}
      {messages.length === 0 ? <T variant="muted">No messages yet. Say hello when you are ready.</T> : null}
      <Field label="Message" value={draft} onChangeText={setDraft} placeholder="Write a message" />
      <ErrorNote>{error}</ErrorNote>
      <Button label="Send" onPress={() => {
        setError(null);
        void repo.sendDirectMessage(connection.id, draft).then(() => setDraft('')).catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not send.'));
      }} />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}><Button label="Block" tone="quiet" onPress={() => void repo.blockUser(otherId)} /></View>
        <View style={{ flex: 1 }}><Button label="Report" tone="quiet" onPress={() => setReporting((value) => !value)} /></View>
      </View>
      {reporting ? (
        <Card>
          <T variant="label">Report {other}</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {REASONS.map((item) => <Choice key={item} label={item} selected={reason === item} onPress={() => setReason(item)} />)}
          </View>
          <Field label="Details" value={details} onChangeText={setDetails} multiline />
          <Button label="Send report" onPress={() => {
            void repo.reportUser({ reportedUserId: otherId, reason, details }).then(() => {
              setReporting(false);
              setDetails('');
            }).catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not send the report.'));
          }} />
          <T variant="muted">Reports go to a moderation queue. In this version that queue is the reports table, visible to moderators.</T>
        </Card>
      ) : null}
    </Screen>
  );
}
