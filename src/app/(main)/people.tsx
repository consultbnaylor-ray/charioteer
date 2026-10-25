import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { View } from 'react-native';

import { useRepository, useSnapshot } from '@/data';
import {
  BUDDIES_EMPTY,
  BUDDIES_HINT,
  COMMUNITY_HINT,
  REQUESTS_HEADING,
  SENT_HEADING,
  buddyCount,
  connectionOtherId,
  discoverAction,
  foldedRows,
  memberAvatarSources,
  memberDisplayName,
  peopleLists,
  type DiscoverAction,
} from '@/domain/connections';
import { shownError } from '@/domain/errors';
import { randomId } from '@/domain/id';
import { chatPreview, latestChatMessage, messageUnreadTotal, viewerChatUnread } from '@/domain/liveChat';
import { BuddyShareButton } from '@/ui/BuddySharePanel';
import { BuddyProfileButton } from '@/ui/CommunityProfile';
import { CommunityPrompt } from '@/ui/CommunityPrompt';
import { useChatRead } from '@/ui/chatRead';
import { MemberAvatar, useMemberAvatars } from '@/ui/MemberAvatar';
import { usePendingPress } from '@/ui/pendingAction';
import { PlanTick } from '@/ui/PlanTick';
import { DISCOVER_EMPTY } from '@/ui/PublicProfileCard';
import { useAppTheme } from '@/ui/theme';
import { Button, Card, Choice, CountBadge, ErrorNote, Screen, T } from '@/ui/ui';

export default function People() {
  const snap = useSnapshot();
  const repo = useRepository();
  const router = useRouter();
  const [tab, setTab] = useState<'buddies' | 'community'>('buddies');
  const [openLists, setOpenLists] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const { run, isPending } = usePendingPress();
  const clientIds = useRef(new Map<string, string>());
  const me = snap.profile;
  const messages = snap.messages ?? [];
  const lists = me ? peopleLists(snap.directory, snap.connections ?? [], me.id) : null;
  const incoming = lists?.incoming ?? [];
  const accepted = lists?.accepted ?? [];
  const { marks: readMarks, ready: readsReady } = useChatRead(me?.id);
  const avatarOf = useMemberAvatars(memberAvatarSources(snap.directory, snap.connectionCards));

  useFocusEffect(
    useCallback(() => {
      void repo.reload();
    }, [repo]),
  );
  if (!me || !lists) return null;

  const unreadTotal = readsReady
    ? messageUnreadTotal(messages, accepted.map((connection) => connection.id), me.id, readMarks)
    : 0;
  const nameOf = (id: string) => memberDisplayName(id, snap.directory, snap.connectionCards);
  const labelOf = (id: string) => snap.interests.find((interest) => interest.id === id)?.label ?? 'Interest';
  const clientIdFor = (key: string) => {
    const existing = clientIds.current.get(key);
    if (existing) return existing;
    const id = randomId();
    clientIds.current.set(key, id);
    return id;
  };
  const ask = (cardId: string) => {
    setError(null);
    const key = `ask:${cardId}`;
    run(key, () => repo.requestConnection(cardId, clientIdFor(key)).then(() => {
      clientIds.current.delete(key);
    }).catch((err: unknown) => setError(shownError(err, 'Could not send that.'))));
  };
  const respond = (connectionId: string, accept: boolean) => {
    setError(null);
    run(`respond:${connectionId}`, () => repo.respondConnection(connectionId, accept).catch((err: unknown) => setError(shownError(err, 'Could not save that.'))));
  };
  const show = (key: string, count: number) => {
    const fold = foldedRows(Array.from({ length: count }), Boolean(openLists[key]));
    return { shown: fold.shown.length, hidden: fold.hidden, open: () => setOpenLists((current) => ({ ...current, [key]: true })) };
  };

  return (
    <Screen eyebrow="People" title="Find your people." intro="A private chat once you both agree.">
      <CommunityPrompt userId={me.id} visible={!me.communityVisible && me.ageConfirmed18} />
      <YourProfileRow name={me.displayName} photoUrl={(snap.profilePhotos ?? []).find((photo) => photo.role === 'avatar')?.previewUrl} />
      <Card>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Choice
              label={`Buddies (${buddyCount(lists)})`}
              selected={tab === 'buddies'}
              tone={incoming.length > 0 ? 'alert' : 'default'}
              badge={unreadTotal}
              onPress={() => setTab('buddies')}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Choice
              label={`Community (${lists.community.length})`}
              selected={tab === 'community'}
              tone={unreadTotal > 0 ? 'alert' : 'default'}
              onPress={() => setTab('community')}
            />
          </View>
        </View>
      </Card>
      <T variant="muted">{tab === 'buddies' ? BUDDIES_HINT : COMMUNITY_HINT}</T>
      <ErrorNote>{error}</ErrorNote>
      {tab === 'buddies' ? (
        <>
          {incoming.length ? <T variant="label">{REQUESTS_HEADING}</T> : null}
          {incoming.slice(0, show('incoming', incoming.length).shown).map((connection) => (
            <Card key={connection.id}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <MemberAvatar name={nameOf(connection.requesterId)} url={avatarOf(connection.requesterId)} />
                <View style={{ flex: 1 }}><T variant="title">{nameOf(connection.requesterId)} would like to connect</T></View>
              </View>
              <DiscoverActions
                action={{ kind: 'incoming', connectionId: connection.id }}
                askPending={false}
                respondPending={isPending(`respond:${connection.id}`)}
                onAsk={() => undefined}
                onRespond={respond}
                onMessage={(connectionId) => router.navigate(`/chat/${connectionId}` as never)}
              />
            </Card>
          ))}
          {show('incoming', incoming.length).hidden ? (
            <Button label="Show all" tone="quiet" onPress={show('incoming', incoming.length).open} />
          ) : null}
          {accepted.slice(0, show('accepted', accepted.length).shown).map((connection) => {
            const other = connectionOtherId(connection, me.id);
            const latest = latestChatMessage(messages, connection.id);
            const unread = viewerChatUnread(messages, connection.id, me.id, readMarks[connection.id]);
            return (
              <Card key={connection.id}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <MemberAvatar name={nameOf(other)} url={avatarOf(other)} />
                  <View style={{ flex: 1, gap: 4 }}>
                    <T variant="title">{nameOf(other)}</T>
                    {latest?.body ? <T variant="muted">{chatPreview(latest.body)}</T> : null}
                  </View>
                  <PlanTick done />
                  <CountBadge count={unread} />
                </View>
                <Button label="Message" onPress={() => router.navigate(`/chat/${connection.id}` as never)} />
                <BuddyShareButton userId={other} name={nameOf(other)} />
              </Card>
            );
          })}
          {show('accepted', accepted.length).hidden ? (
            <Button label="Show all" tone="quiet" onPress={show('accepted', accepted.length).open} />
          ) : null}
          {lists.outgoing.length ? <T variant="label">{SENT_HEADING}</T> : null}
          {lists.outgoing.slice(0, show('outgoing', lists.outgoing.length).shown).map((connection) => (
            <Card key={connection.id}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <MemberAvatar name={nameOf(connection.addresseeId)} url={avatarOf(connection.addresseeId)} />
                <View style={{ flex: 1 }}><T variant="title">{nameOf(connection.addresseeId)}</T></View>
              </View>
              <DiscoverActions
                action={{ kind: 'sent' }}
                askPending={false}
                respondPending={false}
                onAsk={() => undefined}
                onRespond={respond}
                onMessage={(connectionId) => router.navigate(`/chat/${connectionId}` as never)}
              />
            </Card>
          ))}
          {accepted.length === 0 && incoming.length === 0 && lists.outgoing.length === 0 ? (
            <T variant="muted">{BUDDIES_EMPTY}</T>
          ) : null}
        </>
      ) : null}
      {tab === 'community' ? lists.community.slice(0, show('community', lists.community.length).shown).map((card) => {
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
            <T>{(card.interestIds ?? []).map(labelOf).join(' · ')}</T>
            {(card.sharedInterestIds ?? []).length ? <T variant="muted">In common: {(card.sharedInterestIds ?? []).map(labelOf).join(', ')}</T> : null}
            <DiscoverActions
              action={action}
              askPending={isPending(`ask:${card.id}`)}
              respondPending={action.kind === 'incoming' && isPending(`respond:${action.connectionId}`)}
              onAsk={() => ask(card.id)}
              onRespond={respond}
              onMessage={(connectionId) => router.navigate(`/chat/${connectionId}` as never)}
            />
            <BuddyProfileButton userId={card.id} name={card.displayName} />
          </Card>
        );
      }) : null}
      {tab === 'community' && show('community', lists.community.length).hidden ? (
        <Button label="Show all" tone="quiet" onPress={show('community', lists.community.length).open} />
      ) : null}
      {tab === 'community' && lists.community.length === 0 ? <T variant="muted">{DISCOVER_EMPTY}</T> : null}
      <Button label="What I share" tone="quiet" onPress={() => router.push('/sharing' as never)} />
      <Button label="Share with a buddy" onPress={() => router.push('/buddies' as never)} />
    </Screen>
  );
}

function YourProfileRow({ name, photoUrl }: { name: string; photoUrl?: string | null }) {
  const theme = useAppTheme();
  const router = useRouter();
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <MemberAvatar name={name} url={photoUrl} size={36} />
        <T numberOfLines={1} style={{ flex: 1, minWidth: 0, fontFamily: theme.font.bodyStrong }}>{name}</T>
        <Button label="View public profile" tone="quiet" onPress={() => router.push('/public-profile' as never)} />
      </View>
    </Card>
  );
}

function DiscoverActions({
  action,
  askPending,
  respondPending,
  onAsk,
  onRespond,
  onMessage,
}: {
  action: DiscoverAction;
  askPending: boolean;
  respondPending: boolean;
  onAsk: () => void;
  onRespond: (connectionId: string, accept: boolean) => void;
  onMessage: (connectionId: string) => void;
}) {
  if (action.kind === 'incoming') {
    return (
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}><Button label="Accept request" pending={respondPending} pendingLabel="Sending..." onPress={() => onRespond(action.connectionId, true)} /></View>
        <View style={{ flex: 1 }}><Button label="Decline" tone="quiet" pending={respondPending} pendingLabel="Sending..." onPress={() => onRespond(action.connectionId, false)} /></View>
      </View>
    );
  }
  if (action.kind === 'sent') return <Button label="Request sent" tone="quiet" disabled onPress={() => undefined} />;
  if (action.kind === 'message') return <Button label="Message" onPress={() => onMessage(action.connectionId)} />;
  return <Button label="Ask to connect" tone="quiet" pending={askPending} pendingLabel="Sending..." onPress={onAsk} />;
}
