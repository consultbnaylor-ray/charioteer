import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Share, View } from 'react-native';

import { useRepository, useSnapshot } from '@/data';
import {
  BUDDY_CHOOSE,
  buddyShareMessage,
  consumeBuddySecret,
  emptyBuddyScope,
  scopeHasShare,
  scopeSummary,
  type BuddyInvite,
  type BuddyLinkPass,
  type BuddyList,
  type BuddyScope,
  type BuddyShareView,
} from '@/domain/buddies';
import { memberDisplayName } from '@/domain/connections';
import { shownError } from '@/domain/errors';
import { formatUkDate } from '@/domain/dates';
import { BuddyScopeEditor } from '@/ui/BuddyScope';
import { usePendingPress } from '@/ui/pendingAction';
import { Button, Card, Choice, EditSheet, ErrorNote, Field, Screen, T } from '@/ui/ui';

const EMPTY: BuddyList = { sharing: [], watching: [], links: [] };

type Compose =
  | { kind: 'person'; buddyId: string; name: string; scope: BuddyScope }
  | { kind: 'link'; scope: BuddyScope }
  | { kind: 'edit'; invite: BuddyInvite; scope: BuddyScope };

export default function BuddiesScreen() {
  const repo = useRepository();
  const snap = useSnapshot();
  const router = useRouter();
  const params = useLocalSearchParams<{ invite?: string; code?: string; token?: string }>();
  const { run, isPending } = usePendingPress();
  const [list, setList] = useState<BuddyList>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [compose, setCompose] = useState<Compose | null>(null);
  const [pass, setPass] = useState<BuddyLinkPass | null>(null);
  const [review, setReview] = useState<BuddyInvite | null>(null);
  const [linkPreview, setLinkPreview] = useState<{ secret: string; name: string; scope: BuddyScope } | null>(null);
  const [typed, setTyped] = useState('');
  const [view, setView] = useState<BuddyShareView | null>(null);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState('');
  const [reportKey, setReportKey] = useState<string | null>(null);
  const openedInvite = useRef<string | null>(null);
  const openedSecret = useRef<string | null>(null);

  const load = useCallback(() => {
    void repo.listBuddies().then(setList).catch((err: unknown) => setError(shownError(err, 'Could not load buddies.')));
  }, [repo]);

  useFocusEffect(useCallback(() => {
    load();
  }, [load]));

  const inviteId = typeof params.invite === 'string' ? params.invite : '';
  const routeSecret = (typeof params.code === 'string' && params.code) || (typeof params.token === 'string' && params.token) || '';

  useEffect(() => {
    if (!inviteId || openedInvite.current === inviteId) return;
    openedInvite.current = inviteId;
    const name = memberDisplayName(inviteId, snap.directory, snap.connectionCards);
    setCompose({ kind: 'person', buddyId: inviteId, name, scope: emptyBuddyScope() });
  }, [inviteId, snap.connectionCards, snap.directory]);

  const openLink = (value: string) => {
    setError(null);
    run('preview', () => repo.previewBuddyLink(value).then((preview) => {
      setLinkPreview({ secret: value, ...preview });
      setCompose(null);
      setView(null);
    }).catch((err: unknown) => setError(shownError(err, 'That invite is not available.'))));
  };

  useEffect(() => {
    const value = routeSecret || consumeBuddySecret() || '';
    if (!value || openedSecret.current === value) return;
    openedSecret.current = value;
    openLink(value);
  }, [routeSecret]);

  const sendPerson = () => {
    if (!compose || compose.kind !== 'person') return;
    if (!scopeHasShare(compose.scope)) {
      setError(BUDDY_CHOOSE);
      return;
    }
    setError(null);
    run('send', () => repo.createBuddyInvite(compose.buddyId, compose.scope).then(() => {
      setCompose(null);
      load();
    }).catch((err: unknown) => setError(shownError(err, 'Could not send that.'))));
  };

  const sendLink = () => {
    if (!compose || compose.kind !== 'link') return;
    if (!scopeHasShare(compose.scope)) {
      setError(BUDDY_CHOOSE);
      return;
    }
    setError(null);
    run('link', () => repo.createBuddyLink(compose.scope).then((created) => {
      setPass(created);
      setCompose(null);
      load();
    }).catch((err: unknown) => setError(shownError(err, 'Could not create that link.'))));
  };

  const saveScope = () => {
    if (!compose || compose.kind !== 'edit') return;
    if (!scopeHasShare(compose.scope)) {
      setError(BUDDY_CHOOSE);
      return;
    }
    setError(null);
    run('scope', () => repo.updateBuddyScope(compose.invite.id, compose.scope).then(() => {
      setCompose(null);
      load();
    }).catch((err: unknown) => setError(shownError(err, 'Could not save that.'))));
  };

  const openShare = (ownerId: string) => {
    setError(null);
    setView(null);
    run(`view:${ownerId}`, () => repo.sharedBuddyData(ownerId).then((next) => {
      setView(next);
      if (!next) setError('This share is not available.');
    }).catch((err: unknown) => setError(shownError(err, 'Could not open that.'))));
  };

  const message = (userId: string) => {
    setError(null);
    run('message', () => repo.openPrivateChat(userId).then((opened) => {
      if (opened.status === 'open') router.push(`/chat/${opened.connectionId}` as never);
      else setError('A private request is with them. You can message once you have both agreed.');
    }).catch((err: unknown) => setError(shownError(err, 'Could not open a private message.'))));
  };

  return (
    <Screen
      eyebrow="People"
      title="Buddies"
      intro="A buddy sees only what you choose for them. It is view-only, and it does not depend on Community."
    >
      <ErrorNote>{error}</ErrorNote>
      {pass ? (
        <Card>
          <T variant="label">Invite link</T>
          <T>Code {pass.code}</T>
          <T variant="muted">Works once. Expires {formatUkDate(pass.expiresAt)}.</T>
          <T>{pass.url}</T>
          <Button label="Share link" onPress={() => {
            const messageText = buddyShareMessage(pass);
            void Share.share({ message: messageText }).catch(() => setError('Could not open the share sheet.'));
          }} />
          <Button label="Done" tone="quiet" onPress={() => setPass(null)} />
        </Card>
      ) : null}
      {compose ? (
        <View style={{ gap: 12 }}>
          <T variant="title">
            {compose.kind === 'person' ? `Invite ${compose.name}` : compose.kind === 'link' ? 'Invite by link' : `What ${compose.invite.name} can see`}
          </T>
          <BuddyScopeEditor
            scope={compose.scope}
            heading="They will see"
            onChange={(scope) => setCompose({ ...compose, scope })}
          />
          {compose.kind === 'person' ? <Button label="Send invite" pending={isPending('send')} pendingLabel="Sending..." onPress={sendPerson} /> : null}
          {compose.kind === 'link' ? <Button label="Create link" pending={isPending('link')} pendingLabel="Sending..." onPress={sendLink} /> : null}
          {compose.kind === 'edit' ? <Button label="Save" pending={isPending('scope')} pendingLabel="Sending..." onPress={saveScope} /> : null}
          <Button label="Back" tone="quiet" onPress={() => setCompose(null)} />
        </View>
      ) : null}
      {review ? (
        <Card>
          <T variant="title">{review.name} wants you as a buddy</T>
          <T variant="label">You will see</T>
          {scopeSummary(review.scope).map((line) => <T key={line}>{line}</T>)}
          <T variant="muted">View only. You can reply by private message, and either of you can remove this later.</T>
          <Button label="Accept" pending={isPending(`accept:${review.id}`)} pendingLabel="Sending..." onPress={() => {
            setError(null);
            run(`accept:${review.id}`, () => repo.acceptBuddyInvite(review.id).then(() => {
              setReview(null);
              load();
            }).catch((err: unknown) => setError(shownError(err, 'Could not accept that.'))));
          }} />
          <Button label="Back" tone="quiet" onPress={() => setReview(null)} />
          <Button label="Decline" tone="quiet" pending={isPending(`decline:${review.id}`)} pendingLabel="Sending..." onPress={() => {
            setError(null);
            run(`decline:${review.id}`, () => repo.declineBuddyInvite(review.id).then(() => {
              setReview(null);
              load();
            }).catch((err: unknown) => setError(shownError(err, 'Could not decline that.'))));
          }} />
        </Card>
      ) : null}
      {linkPreview ? (
        <Card>
          <T variant="title">{linkPreview.name} invited you</T>
          <T variant="label">You will see</T>
          {scopeSummary(linkPreview.scope).map((line) => <T key={line}>{line}</T>)}
          <Button label="Accept" pending={isPending('accept-link')} pendingLabel="Sending..." onPress={() => {
            setError(null);
            run('accept-link', () => repo.acceptBuddyLink(linkPreview.secret).then(() => {
              setLinkPreview(null);
              load();
            }).catch((err: unknown) => setError(shownError(err, 'Could not accept that.'))));
          }} />
          <Button label="Not now" tone="quiet" onPress={() => setLinkPreview(null)} />
        </Card>
      ) : null}
      {view ? (
        <Card>
          <T variant="title">{view.displayName}</T>
          <T variant="muted">View only. A private message is the only reply.</T>
          {view.summary.map((line) => <T key={line}>{line}</T>)}
          {view.meals?.map((meal) => <T key={`${meal.meal}-${meal.detail}`}>{meal.meal}: {meal.detail}</T>)}
          {view.calories ? <T>{view.calories}</T> : null}
          {view.quality ? <T>{view.quality}</T> : null}
          {view.goal ? <T>{view.goal}</T> : null}
          {view.progress ? <T>{view.progress}</T> : null}
          {view.checkIns ? <T>{view.checkIns}</T> : null}
          {view.gratitude?.map((line) => <T key={line}>{line}</T>)}
          {view.vision?.map((line) => <T key={line}>{line}</T>)}
          {view.healthPlan ? (
            <View style={{ gap: 4 }}>
              <T>{view.healthPlan.headline}</T>
              {view.healthPlan.focus.map((item) => <T key={item.text}>{item.done ? 'Done' : 'Still to do'} · {item.text}</T>)}
              <T variant="muted">{view.healthPlan.ticked} of {view.healthPlan.total} ticked</T>
            </View>
          ) : null}
          {view.healthData?.map((line) => <T key={line}>{line}</T>)}
          <Button label="Message privately" pending={isPending('message')} pendingLabel="Opening..." onPress={() => message(view.ownerId)} />
          <Button label="Report" tone="quiet" onPress={() => {
            setReportKey(view.summary[0] ?? 'share');
            setReason('');
            setReporting(true);
          }} />
        </Card>
      ) : null}
      {!compose ? (
        <View style={{ gap: 12 }}>
          <Button label="Invite by link" onPress={() => {
            setPass(null);
            setCompose({ kind: 'link', scope: emptyBuddyScope() });
          }} />
          <Card>
            <T variant="label">Type a code</T>
            <Field label="Code" value={typed} onChangeText={setTyped} placeholder="8 characters" />
            <Button label="Look up code" pending={isPending('preview')} pendingLabel="Sending..." onPress={() => {
              const value = typed.trim();
              if (!value) return;
              openLink(value);
            }} />
            {routeSecret && !linkPreview ? <Button label="Open invite from the link" tone="quiet" onPress={() => openLink(routeSecret)} /> : null}
          </Card>
          <T variant="label">Waiting for you</T>
          {list.watching.filter((invite) => invite.status === 'pending').map((invite) => (
            <Card key={invite.id}>
              <T variant="title">{invite.name} invited you</T>
              <Button label="Review" onPress={() => setReview(invite)} />
            </Card>
          ))}
          {list.watching.every((invite) => invite.status !== 'pending') ? <T variant="muted">No requests waiting.</T> : null}
          <T variant="label">Sharing with you</T>
          {list.watching.filter((invite) => invite.status === 'accepted').map((invite) => (
            <Card key={invite.id}>
              <T variant="title">{invite.name}</T>
              {scopeSummary(invite.scope).map((line) => <T key={line}>{line}</T>)}
              <Button label="View" pending={isPending(`view:${invite.ownerId}`)} pendingLabel="Opening..." onPress={() => openShare(invite.ownerId)} />
              <Button label="Message privately" tone="quiet" onPress={() => message(invite.ownerId)} />
              <Button label="Remove buddy" tone="quiet" pending={isPending(`revoke:${invite.id}`)} pendingLabel="Sending..." onPress={() => {
                setError(null);
                run(`revoke:${invite.id}`, () => repo.revokeBuddy(invite.id).then(() => {
                  if (view?.ownerId === invite.ownerId) setView(null);
                  load();
                }).catch((err: unknown) => setError(shownError(err, 'Could not remove that.'))));
              }} />
            </Card>
          ))}
          {list.watching.every((invite) => invite.status !== 'accepted') ? <T variant="muted">No one is sharing with you yet.</T> : null}
          <T variant="label">Who can see your day</T>
          {list.sharing.map((invite) => (
            <Card key={invite.id}>
              <T variant="title">{invite.name}</T>
              <T variant="muted">{invite.status === 'pending' ? 'Waiting for them to accept' : 'Accepted'}</T>
              {scopeSummary(invite.scope).map((line) => <T key={line}>{line}</T>)}
              <Button label="Edit what they see" tone="quiet" onPress={() => setCompose({ kind: 'edit', invite, scope: invite.scope })} />
              <Button label="Stop sharing" tone="quiet" pending={isPending(`revoke:${invite.id}`)} pendingLabel="Sending..." onPress={() => {
                setError(null);
                run(`revoke:${invite.id}`, () => repo.revokeBuddy(invite.id).then(load).catch((err: unknown) => setError(shownError(err, 'Could not stop that.'))));
              }} />
            </Card>
          ))}
          {list.sharing.length === 0 ? <T variant="muted">You are not sharing with a buddy yet.</T> : null}
          {list.links.length ? <T variant="label">Links still open</T> : null}
          {list.links.map((link) => (
            <Card key={link.id}>
              <T>Expires {formatUkDate(link.expiresAt)}</T>
              {scopeSummary(link.scope).map((line) => <T key={line}>{line}</T>)}
              <Button label="Cancel link" tone="quiet" pending={isPending(`link:${link.id}`)} pendingLabel="Sending..." onPress={() => {
                setError(null);
                run(`link:${link.id}`, () => repo.revokeBuddyLink(link.id).then(load).catch((err: unknown) => setError(shownError(err, 'Could not cancel that.'))));
              }} />
            </Card>
          ))}
        </View>
      ) : null}
      <EditSheet
        visible={reporting && Boolean(view)}
        title="Report this share"
        intro="Pick what to report, and add a reason. This goes to the moderation queue."
        saveLabel="Send report"
        pending={isPending('report')}
        onClose={() => {
          if (isPending('report')) return;
          setReporting(false);
        }}
        onSave={() => {
          if (!view) return;
          const written = reason.trim().slice(0, 80);
          if (!written || !reportKey) {
            setError('Add a reason.');
            return;
          }
          setError(null);
          run('report', () => repo.reportUser({
            reportedUserId: view.ownerId,
            reason: written,
            details: `Buddy share: ${reportKey}`.slice(0, 2000),
          }).then(() => {
            setReporting(false);
            setReason('');
          }).catch((err: unknown) => setError(shownError(err, 'Could not send the report.'))));
        }}
      >
        {(view?.summary ?? []).map((line) => (
          <Choice key={line} label={line} selected={reportKey === line} onPress={() => setReportKey(line)} />
        ))}
        <Field label="Reason" value={reason} onChangeText={setReason} maxLength={80} placeholder="Unwanted contact, a safety concern, or spam" />
      </EditSheet>
    </Screen>
  );
}
