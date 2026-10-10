import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useRepository, useSnapshot } from '@/data';
import { Button, Card, Choice, ErrorNote, Screen, T } from '@/ui/ui';

export default function People() {
  const snap = useSnapshot();
  const repo = useRepository();
  const router = useRouter();
  const [tab, setTab] = useState<'discover' | 'requests' | 'chats'>('discover');
  const [error, setError] = useState<string | null>(null);
  const me = snap.profile;
  if (!me) return null;

  if (!me.ageConfirmed18 || !me.communityVisible) {
    return (
      <Screen eyebrow="People" title="Community is off." intro="It is for adults, and only if you choose to be visible. Your private details stay private either way.">
        <Button label="Turn community on" onPress={() => void repo.updateProfile({ communityVisible: true, })} />
      </Screen>
    );
  }

  const incoming = snap.connections.filter((connection) => connection.status === 'pending' && connection.addresseeId === me.id);
  const chats = snap.connections.filter((connection) => connection.status === 'accepted');
  const nameOf = (id: string) => snap.directory.find((card) => card.id === id)?.displayName ?? 'Member';
  const labelOf = (id: string) => snap.interests.find((interest) => interest.id === id)?.label ?? 'Interest';

  return (
    <Screen eyebrow="People" title="Find your people." intro="Shared interests, a town or area, and a private chat once you both agree. You can block or report at any time.">
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Choice label={`Discover`} selected={tab === 'discover'} onPress={() => setTab('discover')} />
        <Choice label={`Requests (${incoming.length})`} selected={tab === 'requests'} onPress={() => setTab('requests')} />
        <Choice label={`Chats (${chats.length})`} selected={tab === 'chats'} onPress={() => setTab('chats')} />
      </View>
      <ErrorNote>{error}</ErrorNote>
      {tab === 'discover' ? snap.directory.map((card) => {
        const linked = snap.connections.some((connection) =>
          connection.status !== 'declined' &&
          ((connection.requesterId === me.id && connection.addresseeId === card.id) ||
            (connection.requesterId === card.id && connection.addresseeId === me.id)));
        return (
          <Card key={card.id}>
            <T variant="title">{card.displayName}</T>
            <T variant="muted">{card.town || 'Area not shared'}</T>
            <T>{card.interestIds.map(labelOf).join(' · ')}</T>
            {card.sharedInterestIds.length ? <T variant="muted">In common: {card.sharedInterestIds.map(labelOf).join(', ')}</T> : null}
            <Button
              label={linked ? 'Already in touch' : 'Ask to connect'}
              tone="quiet"
              disabled={linked}
              onPress={() => {
                setError(null);
                void repo.requestConnection(card.id).catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not send that.'));
              }}
            />
          </Card>
        );
      }) : null}
      {tab === 'discover' && snap.directory.length === 0 ? <T variant="muted">No one to show. People you have blocked stay hidden.</T> : null}
      {tab === 'requests' ? incoming.map((connection) => (
        <Card key={connection.id}>
          <T variant="title">{nameOf(connection.requesterId)} would like to connect</T>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}><Button label="Accept" tone="sage" onPress={() => void repo.respondConnection(connection.id, true)} /></View>
            <View style={{ flex: 1 }}><Button label="Decline" tone="quiet" onPress={() => void repo.respondConnection(connection.id, false)} /></View>
          </View>
        </Card>
      )) : null}
      {tab === 'requests' && incoming.length === 0 ? <T variant="muted">No open requests.</T> : null}
      {tab === 'chats' ? chats.map((connection) => {
        const other = connection.requesterId === me.id ? connection.addresseeId : connection.requesterId;
        return (
          <Card key={connection.id}>
            <T variant="title">{nameOf(other)}</T>
            <Button label="Open chat" onPress={() => router.push(`/chat/${connection.id}` as never)} />
          </Card>
        );
      }) : null}
      {tab === 'chats' && chats.length === 0 ? <T variant="muted">No chats yet. Accept a request, or ask someone to connect.</T> : null}
    </Screen>
  );
}
