import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { useRepository, useSnapshot } from '@/data';
import { markChatRead } from '@/data/chatRead';
import { shownError } from '@/domain/errors';
import { randomId } from '@/domain/id';
import { CHAT_POLL_MS, latestChatMessage } from '@/domain/liveChat';
import { offerMessageNotifications } from '@/notifications/register';
import { MemberAvatar, useMemberAvatars } from '@/ui/MemberAvatar';
import { usePendingPress } from '@/ui/pendingAction';
import { Button, Card, Choice, ErrorNote, Field, Screen, T } from '@/ui/ui';
import { useAppTheme } from '@/ui/theme';

const REASONS = ['Unwanted contact', 'Safety concern', 'Spam', 'Something else'];

export default function Chat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const snap = useSnapshot();
  const repo = useRepository();
  const theme = useAppTheme();
  const avatarOf = useMemberAvatars(snap.directory);
  const [draft, setDraft] = useState('');
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState(REASONS[0]);
  const [details, setDetails] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { run, isPending } = usePendingPress();
  const clientIds = useRef(new Map<string, string>());
  const me = snap.profile;
  const connection = snap.connections.find((item) => item.id === id);
  const connectionId = connection?.id;

  useEffect(() => {
    if (!connection) return;
    void offerMessageNotifications(repo);
  }, [repo, connection]);

  useEffect(() => {
    if (!connectionId) return;
    const stop = repo.watchChat(connectionId);
    const timer = setInterval(() => {
      void repo.reloadMessages();
    }, CHAT_POLL_MS);
    return () => {
      stop();
      clearInterval(timer);
    };
  }, [repo, connectionId]);

  useEffect(() => {
    if (!me || !connectionId) return;
    const latest = latestChatMessage(snap.messages, connectionId);
    if (!latest) return;
    void markChatRead(me.id, connectionId, latest.createdAt);
  }, [me, connectionId, snap.messages]);

  if (!me || !connection) {
    return <Screen title="Chat"><T>This chat is not available.</T></Screen>;
  }
  const otherId = connection.requesterId === me.id ? connection.addresseeId : connection.requesterId;
  const otherCard = snap.directory.find((card) => card.id === otherId);
  const other = otherCard?.displayName ?? 'Member';
  const messages = snap.messages.filter((message) => message.connectionId === connection.id);
  const clientIdFor = (key: string) => {
    const existing = clientIds.current.get(key);
    if (existing) return existing;
    const id = randomId();
    clientIds.current.set(key, id);
    return id;
  };
  const send = (text: string, id: string, key: string) => {
    setError(null);
    run(key, () => repo.sendDirectMessage(connection.id, text, id).catch((err: unknown) => setError(shownError(err, 'Could not send.'))));
  };

  return (
    <Screen eyebrow="Private chat" title={other} intro="Only the two of you can read this. Blocking hides them from you.">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <MemberAvatar name={other} url={avatarOf(otherId)} />
        <T variant="title">{other}</T>
      </View>
      {messages.map((message) => (
        <Card key={message.id} style={{ backgroundColor: message.senderId === me.id ? theme.colors.emphasisSoft : theme.colors.surface }}>
          <T variant="label">{message.senderId === me.id ? 'You' : other}</T>
          <T>{message.body}</T>
          {message.delivery === 'sending' ? <T variant="muted">Sending…</T> : null}
          {message.delivery === 'failed' ? (
            <View style={{ gap: 8 }}>
              <T variant="muted">That message was not sent.</T>
              <Button label="Try again" tone="quiet" pending={isPending(`send:${message.id}`)} pendingLabel="Sending..." onPress={() => send(message.body, message.id, `send:${message.id}`)} />
            </View>
          ) : null}
        </Card>
      ))}
      {messages.length === 0 ? <T variant="muted">No messages yet. Say hello when you are ready.</T> : null}
      <Field label="Message" value={draft} onChangeText={setDraft} placeholder="Write a message" multiline minLines={4} maxLines={6} />
      <ErrorNote>{error}</ErrorNote>
      <Button label="Send" pending={isPending('compose')} pendingLabel="Sending..." onPress={() => {
        const text = draft.trim();
        if (!text) return;
        const id = clientIdFor('compose');
        setDraft('');
        setError(null);
        run('compose', () => repo.sendDirectMessage(connection.id, text, id).then(() => {
          clientIds.current.delete('compose');
        }).catch((err: unknown) => {
          setError(shownError(err, 'Could not send.'));
          const kept = repo.getSnapshot().messages.some((message) => message.id === id);
          if (!kept) setDraft(text);
          else clientIds.current.delete('compose');
        }));
      }} />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}><Button label="Block" tone="quiet" pending={isPending(`block:${otherId}`)} pendingLabel="Sending..." onPress={() => {
          setError(null);
          const key = `block:${otherId}`;
          run(key, () => repo.blockUser(otherId, clientIdFor(key)).then(() => {
            clientIds.current.delete(key);
          }).catch((err: unknown) => setError(shownError(err, 'Could not block that person.'))));
        }} /></View>
        <View style={{ flex: 1 }}><Button label="Report" tone="quiet" onPress={() => setReporting((value) => !value)} /></View>
      </View>
      {reporting ? (
        <Card>
          <T variant="label">Report {other}</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {REASONS.map((item) => <Choice key={item} label={item} selected={reason === item} onPress={() => setReason(item)} />)}
          </View>
          <Field label="Details" value={details} onChangeText={setDetails} multiline />
          <Button label="Send report" pending={isPending(`report:${otherId}`)} pendingLabel="Sending..." onPress={() => {
            setError(null);
            const key = `report:${otherId}`;
            run(key, () => repo.reportUser({ reportedUserId: otherId, reason, details, clientId: clientIdFor(key) }).then(() => {
              clientIds.current.delete(key);
              setReporting(false);
              setDetails('');
            }).catch((err: unknown) => setError(shownError(err, 'Could not send the report.'))));
          }} />
          <T variant="muted">Reports go to a moderation queue. In this version that queue is the reports table, visible to moderators.</T>
        </Card>
      ) : null}
    </Screen>
  );
}
