import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { useRepository, useSnapshot } from '@/data';
import { discoverAction, type DiscoverAction } from '@/domain/connections';
import { shownError } from '@/domain/errors';
import { CommunityProfile } from '@/ui/CommunityProfile';
import { MemberAvatar, useMemberAvatars } from '@/ui/MemberAvatar';
import { DISCOVER_EMPTY, PublicProfileCard } from '@/ui/PublicProfileCard';
import { Button, Card, Choice, ErrorNote, Screen, T } from '@/ui/ui';

export default function People() {
  const snap = useSnapshot();
  const repo = useRepository();
  const router = useRouter();
  const [tab, setTab] = useState<'discover' | 'requests' | 'chats'>('discover');
  const [profileId, setProfileId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const me = snap.profile;
  const avatarOf = useMemberAvatars(snap.directory);

  // New requests and chats arrive from other people, so load them each time People opens.
  useFocusEffect(
    useCallback(() => {
      void repo.reload();
    }, [repo]),
  );
  if (!me) return null;

  const incoming = snap.connections.filter((connection) => connection.status === 'pending' && connection.addresseeId === me.id);
  const sent = snap.connections.filter((connection) => connection.status === 'pending' && connection.requesterId === me.id);
  const chats = snap.connections.filter((connection) => connection.status === 'accepted');
  const nameOf = (id: string) => snap.directory.find((card) => card.id === id)?.displayName ?? 'Member';
  const labelOf = (id: string) => snap.interests.find((interest) => interest.id === id)?.label ?? 'Interest';

  return (
    <Screen eyebrow="People" title="Find your people." intro="Shared interests, a town or area, and a private chat once you both agree. You can block or report at any time.">
      <PublicProfileCard />
      <Button label="What I share" tone="quiet" onPress={() => router.push('/sharing' as never)} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Choice label={`Discover`} selected={tab === 'discover'} onPress={() => setTab('discover')} />
        <Choice label={`Requests (${incoming.length})`} selected={tab === 'requests'} tone={incoming.length > 0 ? 'alert' : 'default'} onPress={() => setTab('requests')} />
        <Choice label={`Chats (${chats.length})`} selected={tab === 'chats'} onPress={() => setTab('chats')} />
      </View>
      <ErrorNote>{error}</ErrorNote>
      {tab === 'discover' ? snap.directory.map((card) => {
        const action = discoverAction(snap.connections, me.id, card.id);
        return (
          <Card key={card.id}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <MemberAvatar name={card.displayName} url={avatarOf(card.id)} />
              <View style={{ flex: 1, gap: 4 }}>
                <T variant="title">{card.displayName}</T>
                <T variant="muted">{card.town || 'Area not shared'}</T>
              </View>
            </View>
            <T>{card.interestIds.map(labelOf).join(' · ')}</T>
            {card.sharedInterestIds.length ? <T variant="muted">In common: {card.sharedInterestIds.map(labelOf).join(', ')}</T> : null}
            <DiscoverActions
              action={action}
              onAsk={() => {
                setError(null);
                void repo.requestConnection(card.id).catch((err: unknown) => setError(shownError(err, 'Could not send that.')));
              }}
              onRespond={(connectionId, accept) => {
                setError(null);
                void repo.respondConnection(connectionId, accept).catch((err: unknown) => setError(shownError(err, 'Could not save that.')));
              }}
              onMessage={(connectionId) => router.push(`/chat/${connectionId}` as never)}
            />
            <Button
              label={profileId === card.id ? 'Hide profile' : 'Profile'}
              tone="quiet"
              onPress={() => setProfileId((current) => (current === card.id ? null : card.id))}
            />
            {profileId === card.id ? <CommunityProfile userId={card.id} name={card.displayName} /> : null}
          </Card>
        );
      }) : null}
      {tab === 'discover' && snap.directory.length === 0 ? <T variant="muted">{DISCOVER_EMPTY}</T> : null}
      {tab === 'requests' ? incoming.map((connection) => (
        <Card key={connection.id}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <MemberAvatar name={nameOf(connection.requesterId)} url={avatarOf(connection.requesterId)} />
            <View style={{ flex: 1 }}><T variant="title">{nameOf(connection.requesterId)} would like to connect</T></View>
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}><Button label="Accept" onPress={() => void repo.respondConnection(connection.id, true).catch((err: unknown) => setError(shownError(err, 'Could not save that.')))} /></View>
            <View style={{ flex: 1 }}><Button label="Decline" tone="quiet" onPress={() => void repo.respondConnection(connection.id, false).catch((err: unknown) => setError(shownError(err, 'Could not save that.')))} /></View>
          </View>
        </Card>
      )) : null}
      {tab === 'requests' && incoming.length === 0 ? <T variant="muted">No open requests.</T> : null}
      {tab === 'requests' && sent.length ? <T variant="label">Sent</T> : null}
      {tab === 'requests' ? sent.map((connection) => (
        <Card key={connection.id}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <MemberAvatar name={nameOf(connection.addresseeId)} url={avatarOf(connection.addresseeId)} />
            <View style={{ flex: 1 }}><T variant="title">Waiting for {nameOf(connection.addresseeId)} to accept</T></View>
          </View>
        </Card>
      )) : null}
      {tab === 'chats' ? chats.map((connection) => {
        const other = connection.requesterId === me.id ? connection.addresseeId : connection.requesterId;
        return (
          <Card key={connection.id}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <MemberAvatar name={nameOf(other)} url={avatarOf(other)} />
              <View style={{ flex: 1 }}><T variant="title">{nameOf(other)}</T></View>
            </View>
            <Button label="Open chat" onPress={() => router.push(`/chat/${connection.id}` as never)} />
          </Card>
        );
      }) : null}
      {tab === 'chats' && chats.length === 0 ? <T variant="muted">No chats yet. Accept a request, or ask someone to connect.</T> : null}
    </Screen>
  );
}

/** The same control stays on the card when Profile is open, so Discover and the profile agree. */
function DiscoverActions({
  action,
  onAsk,
  onRespond,
  onMessage,
}: {
  action: DiscoverAction;
  onAsk: () => void;
  onRespond: (connectionId: string, accept: boolean) => void;
  onMessage: (connectionId: string) => void;
}) {
  if (action.kind === 'incoming') {
    return (
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}><Button label="Accept request" onPress={() => onRespond(action.connectionId, true)} /></View>
        <View style={{ flex: 1 }}><Button label="Decline" tone="quiet" onPress={() => onRespond(action.connectionId, false)} /></View>
      </View>
    );
  }
  if (action.kind === 'sent') return <Button label="Request sent" tone="quiet" disabled onPress={() => undefined} />;
  if (action.kind === 'message') return <Button label="Message" onPress={() => onMessage(action.connectionId)} />;
  return <Button label="Ask to connect" tone="quiet" onPress={onAsk} />;
}
