import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useRepository, useSnapshot } from '@/data';
import type { ProgressPhoto } from '@/data/types';
import { privateMessageFailure, shownError } from '@/domain/errors';
import type { SharedHealthPlan } from '@/domain/healthPlan';
import { WAGON_PUBLIC_LINE, type SharedNutritionView } from '@/domain/nutrition';
import { SharedNutritionFacts } from '@/ui/NutritionShare';
import { profileStatBoard } from '@/domain/profileStatTiles';
import { PROFILE_LOAD_ERROR, formatSoberShare, sharedReportItems, shownList, type PublicProfileView, type SharedReportItem } from '@/domain/profileSharing';
import { ProfileStatBoard } from '@/ui/ProfileStatTiles';
import { MemberAvatar } from '@/ui/MemberAvatar';
import { PlanTick } from '@/ui/PlanTick';
import { formatGbp } from '@/domain/savings';
import { progressPhotoLabel } from '@/domain/progressPhotos';
import { radius, useAppTheme } from '@/ui/theme';
import { Button, Choice, EditSheet, ErrorNote, Field, T } from '@/ui/ui';

const REPORT_REASONS = {
  photo: { reason: 'Profile photo' },
  progress: { reason: 'Shared progress photo' },
  profile: { reason: 'Shared profile' },
} as const;

type ReportKind = keyof typeof REPORT_REASONS;

type ReportTarget = {
  key: string;
  label: string;
  summary: string;
  kind: ReportKind;
  details: string;
};

type ReportDraft = {
  title: string;
  intro: string;
  targets: ReportTarget[];
  selectedKey: string | null;
};

function kindFor(label: string): ReportKind {
  if (label === 'Profile photo') return 'photo';
  if (label === 'Progress photo') return 'progress';
  return 'profile';
}

function shownSummary(summary: string): string {
  const clean = summary.replace(/\s+/g, ' ').trim();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean)) return '';
  return clean;
}

function choiceLabel(item: ReportTarget): string {
  const summary = shownSummary(item.summary);
  if (!summary || summary === item.label) return item.label;
  const short = summary.length > 64 ? `${summary.slice(0, 61)}…` : summary;
  return `${item.label}: ${short}`;
}

function targetsFrom(items: SharedReportItem[], name: string): ReportTarget[] {
  const rows = items.map((item, index) => ({
    key: `${item.label}:${index}`,
    label: item.label,
    summary: item.summary,
    kind: kindFor(item.label),
    details: `${item.label}: ${item.summary}`,
  }));
  if (rows.length) return rows;
  return [{
    key: 'profile',
    label: 'This profile',
    summary: name,
    kind: 'profile',
    details: `Name: ${name}`,
  }];
}

function profilePhotoTarget(photo: { id: string; caption: string }): ReportTarget {
  return {
    key: photo.id,
    label: 'Profile photo',
    summary: photo.caption || 'Profile photo',
    kind: 'photo',
    details: `Profile photo ${photo.id}. ${photo.caption}`,
  };
}

function progressPhotoTarget(photo: ProgressPhoto): ReportTarget {
  return {
    key: photo.id,
    label: 'Progress photo',
    summary: photo.caption || progressPhotoLabel(photo.monthIndex, photo.takenOn),
    kind: 'progress',
    details: `Photo ${photo.id}. ${progressPhotoLabel(photo.monthIndex, photo.takenOn)}. ${photo.caption}`,
  };
}

function PhotoMenu({ accessibilityLabel, onPress, overlay }: { accessibilityLabel: string; onPress: () => void; overlay?: boolean }) {
  const theme = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      hitSlop={6}
      style={overlay
        ? { position: 'absolute', top: 6, right: 6, zIndex: 1, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }
        : { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
    >
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 16,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: overlay ? 'rgba(17,17,17,0.72)' : theme.colors.sunken,
        }}
      >
        <Text style={{ color: overlay ? '#F3F3EE' : theme.colors.ink, fontSize: 20, lineHeight: 24 }}>⋯</Text>
      </View>
    </Pressable>
  );
}

function MessageFailure({ message, pending, onRetry }: { message: string | null; pending: boolean; onRetry: () => void }) {
  if (!message) return null;
  return (
    <View style={{ gap: 8 }}>
      <ErrorNote>{message}</ErrorNote>
      <Button label="Try again" tone="quiet" pending={pending} pendingLabel="Opening..." onPress={onRetry} />
    </View>
  );
}

function ReportSheet({
  draft,
  reasonText,
  onReason,
  onSelect,
  pending,
  error,
  onClose,
  onSend,
}: {
  draft: ReportDraft;
  reasonText: string;
  onReason: (value: string) => void;
  onSelect: (key: string) => void;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onSend: () => void;
}) {
  const selected = draft.targets.find((item) => item.key === draft.selectedKey);
  return (
    <EditSheet
      visible
      title={draft.title}
      intro={draft.intro}
      saveLabel="Send report"
      pending={pending}
      onClose={onClose}
      onSave={onSend}
    >
      {draft.targets.map((item) => (
        <Choice
          key={item.key}
          label={choiceLabel(item)}
          selected={item.key === draft.selectedKey}
          onPress={() => onSelect(item.key)}
        />
      ))}
      {selected && shownSummary(selected.summary) ? <T variant="muted">{shownSummary(selected.summary)}</T> : null}
      <Field
        label="Reason"
        value={reasonText}
        onChangeText={onReason}
        maxLength={80}
        placeholder="Unwanted contact, a safety concern, or spam"
      />
      {error ? <ErrorNote>{error}</ErrorNote> : null}
    </EditSheet>
  );
}

export function CommunityProfile({ userId, name }: { userId: string; name: string }) {
  const snap = useSnapshot();
  const repo = useRepository();
  const photos = shownList(snap.communityPhotos)
    .filter((photo) => photo?.userId === userId && photo.visibility === 'community')
    .sort((a, b) => a.monthIndex - b.monthIndex || a.takenOn.localeCompare(b.takenOn));
  const router = useRouter();
  const [draft, setDraft] = useState<ReportDraft | null>(null);
  const [reasonText, setReasonText] = useState('');
  const [sent, setSent] = useState<string | null>(null);
  const [asked, setAsked] = useState(false);
  const [pending, setPending] = useState(false);
  const [messageError, setMessageError] = useState<string | null>(null);
  const [messageAt, setMessageAt] = useState<string | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const busy = useRef(false);
  const before = photos[0];
  const now = photos[photos.length - 1];

  async function message(photoId: string) {
    if (busy.current) return;
    busy.current = true;
    setMessageError(null);
    setMessageAt(photoId);
    setPending(true);
    try {
      const opened = await repo.openPrivateChat(userId);
      if (opened.status === 'open') {
        router.push(`/chat/${opened.connectionId}` as never);
        return;
      }
      setAsked(true);
    } catch (err) {
      setMessageAt(photoId);
      setMessageError(privateMessageFailure(err));
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  function openProgressReport(photo: ProgressPhoto) {
    const target = progressPhotoTarget(photo);
    setReasonText('');
    setReportError(null);
    setDraft({
      title: 'Report this photo',
      intro: 'Add a reason. This goes to the moderation queue, with the photo id.',
      targets: [target],
      selectedKey: target.key,
    });
  }

  async function sendReport() {
    const target = draft?.targets.find((item) => item.key === draft.selectedKey);
    if (!draft || !target) {
      setReportError('Pick what to report.');
      return;
    }
    const written = reasonText.trim().slice(0, 80);
    if (!written) {
      setReportError('Add a reason.');
      return;
    }
    if (busy.current) return;
    busy.current = true;
    setReportError(null);
    setPending(true);
    try {
      await repo.reportUser({
        reportedUserId: userId,
        reason: written || REPORT_REASONS[target.kind].reason,
        details: target.details.slice(0, 2000),
      });
      setDraft(null);
      setReasonText('');
      setSent(target.key);
    } catch (err) {
      setReportError(shownError(err, 'Could not send the report.'));
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  return (
    <View style={{ gap: 10 }}>
      <SharedProfileFacts userId={userId} name={name} />
      <T variant="label">Shared photos</T>
      <T variant="muted">{name} chose to show these. Private photos stay hidden.</T>
      {asked ? <T variant="muted">A private request is with them. You can message once you have both agreed.</T> : null}
      {photos.length === 0 ? <T variant="muted">No shared photos.</T> : null}
      {photos.length >= 2 && before && now && before.id !== now.id ? (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1, gap: 6 }}>
            <T variant="label">Before</T>
            <SharedPhotoFrame photo={before} />
          </View>
          <View style={{ flex: 1, gap: 6 }}>
            <T variant="label">Now</T>
            <SharedPhotoFrame photo={now} />
          </View>
        </View>
      ) : null}
      {photos.map((photo) => (
        <View key={photo.id} style={{ gap: 6 }}>
          <View>
            <SharedPhotoFrame photo={photo} />
            <PhotoMenu overlay accessibilityLabel="Report photo" onPress={() => openProgressReport(photo)} />
          </View>
          <T variant="label">Shared</T>
          <T>{progressPhotoLabel(photo.monthIndex, photo.takenOn)}</T>
          {photo.caption ? <T variant="muted">{photo.caption}</T> : null}
          {sent === photo.id ? <T variant="muted">Report sent.</T> : null}
          <Button label="Message privately" tone="quiet" disabled={pending} onPress={() => void message(photo.id)} />
          {messageAt === photo.id ? <MessageFailure message={messageError} pending={pending} onRetry={() => void message(photo.id)} /> : null}
        </View>
      ))}
      {draft ? (
        <ReportSheet
          draft={draft}
          reasonText={reasonText}
          onReason={(value) => {
            setReasonText(value);
            setReportError(null);
          }}
          onSelect={(key) => setDraft((current) => (current ? { ...current, selectedKey: key } : current))}
          pending={pending}
          error={reportError}
          onClose={() => {
            if (pending) return;
            setDraft(null);
            setReportError(null);
          }}
          onSend={() => void sendReport()}
        />
      ) : null}
    </View>
  );
}

/** Headline, focus lines, and tick count. The rest of the plan is not here. */
export function SharedHealthPlanFacts({ plan }: { plan: SharedHealthPlan | null }) {
  if (!plan) return null;
  return (
    <View style={{ gap: 4 }}>
      <T variant="label">Health plan</T>
      <T>{plan.headline}</T>
      {plan.focus.map((action, index) => (
        <View key={`${index}:${action.text}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <PlanTick done={action.done} />
          <T style={{ flex: 1 }}>{action.text}</T>
        </View>
      ))}
      <T variant="muted">{`${plan.ticked} of ${plan.total} ticked`}</T>
    </View>
  );
}

function SharedProfileFacts({ userId, name }: { userId: string; name: string }) {
  const repo = useRepository();
  const router = useRouter();
  const [view, setView] = useState<PublicProfileView | null>(null);
  const [load, setLoad] = useState<'loading' | 'hidden' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [nutrition, setNutrition] = useState<SharedNutritionView | null>(null);
  const [planShare, setPlanShare] = useState<SharedHealthPlan | null>(null);
  const [asked, setAsked] = useState(false);
  const [draft, setDraft] = useState<ReportDraft | null>(null);
  const [reasonText, setReasonText] = useState('');
  const [sent, setSent] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [messageError, setMessageError] = useState<string | null>(null);
  const [messageAt, setMessageAt] = useState<'diary' | 'wagon' | 'plan' | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const busy = useRef(false);

  useEffect(() => {
    let live = true;
    setLoad('loading');
    void repo.publicProfile(userId).then((next) => {
      if (!live) return;
      setView(next);
      setLoad(next ? 'ready' : 'hidden');
    }).catch((err: unknown) => {
      console.error(err);
      if (!live) return;
      setView(null);
      setLoad('error');
    });
    void repo.sharedNutrition(userId).then((next) => {
      if (live) setNutrition(next);
    });
    void repo.sharedHealthPlan(userId).then((next) => {
      if (live) setPlanShare(next);
    });
    return () => {
      live = false;
    };
  }, [repo, userId, attempt]);

  useEffect(() => {
    const ids = shownList(view?.profilePhotos).map((photo) => photo.id);
    if (!ids.length) return;
    let live = true;
    void repo.profilePhotoUrls(ids).then((rows) => {
      if (!live) return;
      const next: Record<string, string> = {};
      for (const row of rows) next[row.id] = row.url;
      setPhotoUrls(next);
    }).catch(() => {
      if (live) setPhotoUrls({});
    });
    return () => {
      live = false;
    };
  }, [repo, view]);

  if (load === 'loading') return null;
  if (load === 'error') {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={PROFILE_LOAD_ERROR} onPress={() => setAttempt((current) => current + 1)} style={{ minHeight: 44, justifyContent: 'center' }}>
        <T>{PROFILE_LOAD_ERROR}</T>
      </Pressable>
    );
  }
  if (load === 'hidden' || !view) return <T variant="muted">This profile is hidden.</T>;
  const shown: PublicProfileView = {
    ...view,
    ...(nutrition
      ? {
        foodDiary: nutrition.meals,
        calories: nutrition.calories,
        quality: nutrition.quality,
        progress: nutrition.progress,
        wagon: nutrition.wagon,
        goal: nutrition.goal,
      }
      : {}),
    healthPlan: planShare,
  };
  const items = sharedReportItems(shown);
  const profilePhotos = shownList(view.profilePhotos);
  const avatar = profilePhotos.find((photo) => photo.role === 'avatar');
  const gallery = profilePhotos.filter((photo) => photo.role === 'gallery');

  async function reach(from: 'diary' | 'wagon' | 'plan') {
    if (busy.current) return;
    busy.current = true;
    setMessageError(null);
    setMessageAt(from);
    setPending(true);
    try {
      const opened = await repo.openPrivateChat(userId);
      if (opened.status === 'open') {
        router.push(`/chat/${opened.connectionId}` as never);
        return;
      }
      setAsked(true);
    } catch (err) {
      setMessageAt(from);
      setMessageError(privateMessageFailure(err));
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  function openProfileReport() {
    setReasonText('');
    setReportError(null);
    setDraft({
      title: 'Report this profile',
      intro: 'Pick what to report, and add a reason. This goes to the moderation queue.',
      targets: targetsFrom(items, view?.displayName || name),
      selectedKey: null,
    });
  }

  function openPhotoReport(photo: { id: string; caption: string }) {
    const target = profilePhotoTarget(photo);
    setReasonText('');
    setReportError(null);
    setDraft({
      title: 'Report this photo',
      intro: 'Add a reason. This goes to the moderation queue, with the photo id.',
      targets: [target],
      selectedKey: target.key,
    });
  }

  async function sendReport() {
    const target = draft?.targets.find((item) => item.key === draft.selectedKey);
    if (!draft || !target) {
      setReportError('Pick what to report.');
      return;
    }
    const written = reasonText.trim().slice(0, 80);
    if (!written) {
      setReportError('Add a reason.');
      return;
    }
    if (busy.current) return;
    busy.current = true;
    setReportError(null);
    setPending(true);
    try {
      await repo.reportUser({
        reportedUserId: userId,
        reason: written || REPORT_REASONS[target.kind].reason,
        details: target.details.slice(0, 2000),
      });
      setDraft(null);
      setReasonText('');
      setSent(target.key);
    } catch (err) {
      setReportError(shownError(err, 'Could not send the report.'));
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <MemberAvatar name={view.displayName || name} url={avatar ? photoUrls[avatar.id] : null} size={64} />
        <T variant="title" style={{ flex: 1 }}>{view.displayName || name}</T>
        {avatar ? <PhotoMenu accessibilityLabel="Report profile photo" onPress={() => openPhotoReport(avatar)} /> : null}
      </View>
      {avatar?.caption ? <T variant="muted">{avatar.caption}</T> : null}
      {sent === avatar?.id ? <T variant="muted">Report sent.</T> : null}
      {gallery.map((photo) => (
        <View key={photo.id} style={{ gap: 6 }}>
          <View>
            <SharedPhotoFrame photo={{ id: photo.id, userId, takenOn: '', monthIndex: 0, note: '', caption: photo.caption, storagePath: '', createdAt: '', visibility: 'community', previewUrl: photoUrls[photo.id] ?? null }} />
            <PhotoMenu overlay accessibilityLabel="Report profile photo" onPress={() => openPhotoReport(photo)} />
          </View>
          {photo.caption ? <T variant="muted">{photo.caption}</T> : null}
          {sent === photo.id ? <T variant="muted">Report sent.</T> : null}
        </View>
      ))}
      {view.bio ? <T>{view.bio}</T> : null}
      {view.pinnedQuote ? (
        <View style={{ gap: 4 }}>
          <T variant="title">{view.pinnedQuote.text}</T>
          <T variant="muted">{view.pinnedQuote.author} · {view.pinnedQuote.school} · {view.pinnedQuote.source}</T>
        </View>
      ) : null}
      {shownList(view.interests).length ? <T>{shownList(view.interests).join(' · ')}</T> : null}
      <T variant="muted">{view.town || 'Area not shared'}</T>
      <ProfileStatBoard {...profileStatBoard(shown, { audience: 'member' })} />
      {view.stage ? <T>Stage: {view.stage}</T> : null}
      {view.sober && typeof view.sober.days === 'number' ? <T>{formatSoberShare({ days: view.sober.days, since: typeof view.sober.since === 'string' ? view.sober.since : '' })}</T> : null}
      {shownList(view.milestones).length ? <T>{shownList(view.milestones).join(', ')}</T> : null}
      {shownList(view.reasons).map((reason) => <T key={reason}>{reason}</T>)}
      {view.moneySaved != null ? <T>{formatGbp(view.moneySaved)} saved</T> : null}
      {view.unitsAvoided != null ? <T>{view.unitsAvoided} units avoided</T> : null}
      {view.moodStreak != null ? <T>Mood streak {view.moodStreak}</T> : null}
      {shownList(shown.health).map((line) => <T key={line}>{line}</T>)}
      <SharedNutritionFacts meals={shown.foodDiary} calories={shown.calories} quality={shown.quality} progress={shown.progress} goal={shown.goal} />
      {shown.foodDiary ? (
        <View style={{ gap: 4 }}>
          <T variant="muted">Only a private message or a report.</T>
          <Button label="Message privately" tone="quiet" pending={pending && messageAt === 'diary'} pendingLabel="Opening..." onPress={() => void reach('diary')} />
          {messageAt === 'diary' ? <MessageFailure message={messageError} pending={pending} onRetry={() => void reach('diary')} /> : null}
        </View>
      ) : null}
      {shown.healthPlan ? (
        <View style={{ gap: 4 }}>
          <SharedHealthPlanFacts plan={shown.healthPlan} />
          <T variant="muted">Only a private message or a report.</T>
          <Button label="Message privately" tone="quiet" pending={pending && messageAt === 'plan'} pendingLabel="Opening..." onPress={() => void reach('plan')} />
          {messageAt === 'plan' ? <MessageFailure message={messageError} pending={pending} onRetry={() => void reach('plan')} /> : null}
        </View>
      ) : null}
      {shown.wagon ? (
        <View style={{ gap: 6 }}>
          <T>{WAGON_PUBLIC_LINE}</T>
          {shown.wagon.note ? <T variant="muted">{shown.wagon.note}</T> : null}
          {asked ? <T variant="muted">A private request is with them. You can message once you have both agreed.</T> : null}
          <Button label="Reach out" pending={pending && messageAt === 'wagon'} pendingLabel="Opening..." onPress={() => void reach('wagon')} />
          {messageAt === 'wagon' ? <MessageFailure message={messageError} pending={pending} onRetry={() => void reach('wagon')} /> : null}
        </View>
      ) : null}
      {shownList(shown.gratitude).map((entry) => <T key={entry.id}>{entry.body ?? ''}</T>)}
      {shownList(view.vision).map((item) => <T key={item.id}>{[item.caption, item.area].filter(Boolean).join(' · ')}</T>)}
      {shownList(view.gratitudePhotos).map((photo) => photo.caption ? <T key={photo.id}>{photo.caption}</T> : null)}
      {sent && sent !== avatar?.id && !gallery.some((photo) => photo.id === sent) ? <T variant="muted">Report sent.</T> : null}
      <Button label="Invite as buddy" tone="quiet" disabled={pending} onPress={() => router.push(`/buddies?invite=${userId}` as never)} />
      <Button label="Report this profile" tone="quiet" disabled={pending} onPress={openProfileReport} />
      {draft ? (
        <ReportSheet
          draft={draft}
          reasonText={reasonText}
          onReason={(value) => {
            setReasonText(value);
            setReportError(null);
          }}
          onSelect={(key) => {
            setDraft((current) => (current ? { ...current, selectedKey: key } : current));
            setReportError(null);
          }}
          pending={pending}
          error={reportError}
          onClose={() => {
            if (pending) return;
            setDraft(null);
            setReportError(null);
          }}
          onSend={() => void sendReport()}
        />
      ) : null}
    </View>
  );
}

export function SharedPhotoFrame({ photo }: { photo: ProgressPhoto }) {
  const theme = useAppTheme();
  const label = progressPhotoLabel(photo.monthIndex, photo.takenOn);
  return (
    <View style={{ width: '100%', aspectRatio: 1, borderRadius: radius.md, overflow: 'hidden', backgroundColor: theme.colors.sunken }}>
      {photo.previewUrl ? (
        <Image source={{ uri: photo.previewUrl }} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityLabel={label} />
      ) : (
        <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', padding: 8 }]}>
          <T variant="muted">Photo unavailable</T>
        </View>
      )}
    </View>
  );
}
