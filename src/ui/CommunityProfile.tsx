import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useRepository, useSnapshot } from '@/data';
import type { ProgressPhoto } from '@/data/types';
import { shownError } from '@/domain/errors';
import { WAGON_PUBLIC_LINE, type SharedNutritionView } from '@/domain/nutrition';
import { SharedNutritionFacts } from '@/ui/NutritionShare';
import { formatSoberShare, sharedReportItems, type PublicProfileView } from '@/domain/profileSharing';
import { MemberAvatar } from '@/ui/MemberAvatar';
import { formatGbp } from '@/domain/savings';
import { progressPhotoLabel } from '@/domain/progressPhotos';
import { radius, useAppTheme } from '@/ui/theme';
import { Button, ErrorNote, T } from '@/ui/ui';

export function CommunityProfile({ userId, name }: { userId: string; name: string }) {
  const snap = useSnapshot();
  const repo = useRepository();
  const photos = snap.communityPhotos
    .filter((photo) => photo.userId === userId && photo.visibility === 'community')
    .sort((a, b) => a.monthIndex - b.monthIndex || a.takenOn.localeCompare(b.takenOn));
  const router = useRouter();
  const [reporting, setReporting] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [asked, setAsked] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const before = photos[0];
  const now = photos[photos.length - 1];

  async function message() {
    if (busy.current) return;
    busy.current = true;
    setError(null);
    setPending(true);
    try {
      const opened = await repo.openPrivateChat(userId);
      if (opened.status === 'open') {
        router.push(`/chat/${opened.connectionId}` as never);
        return;
      }
      setAsked(true);
    } catch (err) {
      setError(shownError(err, 'Could not open a private message.'));
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  async function report(photo: ProgressPhoto) {
    if (busy.current) return;
    busy.current = true;
    setError(null);
    setPending(true);
    try {
      await repo.reportUser({
        reportedUserId: photo.userId,
        reason: 'Shared progress photo',
        details: `Photo ${photo.id}. ${progressPhotoLabel(photo.monthIndex, photo.takenOn)}. ${photo.caption}`.slice(0, 2000),
      });
      setReporting(null);
      setSent(photo.id);
    } catch (err) {
      setError(shownError(err, 'Could not send the report.'));
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
      {error ? <ErrorNote>{error}</ErrorNote> : null}
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
          <SharedPhotoFrame photo={photo} />
          <T variant="label">Shared</T>
          <T>{progressPhotoLabel(photo.monthIndex, photo.takenOn)}</T>
          {photo.caption ? <T variant="muted">{photo.caption}</T> : null}
          {sent === photo.id ? <T variant="muted">Report sent.</T> : null}
          <Button label="Message privately" tone="quiet" disabled={pending} onPress={() => void message()} />
          {reporting === photo.id ? (
            <View style={{ gap: 8 }}>
              <T>This report goes to the moderation queue, with the photo id.</T>
              <Button label="Send report" pending={pending} pendingLabel="Sending..." onPress={() => void report(photo)} />
              <Button label="Cancel" tone="quiet" disabled={pending} onPress={() => setReporting(null)} />
            </View>
          ) : (
            <Button label="Report photo" tone="quiet" disabled={pending} onPress={() => setReporting(photo.id)} />
          )}
        </View>
      ))}
    </View>
  );
}

function SharedProfileFacts({ userId, name }: { userId: string; name: string }) {
  const repo = useRepository();
  const router = useRouter();
  const [view, setView] = useState<PublicProfileView | null | undefined>(undefined);
  const [nutrition, setNutrition] = useState<SharedNutritionView | null>(null);
  const [asked, setAsked] = useState(false);
  const [reporting, setReporting] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const busy = useRef(false);

  useEffect(() => {
    let live = true;
    setView(undefined);
    void repo.publicProfile(userId).then((next) => {
      if (live) setView(next);
    });
    void repo.sharedNutrition(userId).then((next) => {
      if (live) setNutrition(next);
    });
    return () => {
      live = false;
    };
  }, [repo, userId]);

  useEffect(() => {
    const ids = view?.profilePhotos.map((photo) => photo.id) ?? [];
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

  if (view === undefined) return null;
  if (!view) return <T variant="muted">This profile is hidden.</T>;
  const shown: PublicProfileView = nutrition
    ? {
      ...view,
      foodDiary: nutrition.meals,
      calories: nutrition.calories,
      quality: nutrition.quality,
      progress: nutrition.progress,
      wagon: nutrition.wagon,
    }
    : view;
  const items = sharedReportItems(shown).filter((item) => item.label !== 'Progress photo' && item.label !== 'Profile photo');

  async function reach() {
    if (busy.current) return;
    busy.current = true;
    setError(null);
    setPending(true);
    try {
      const opened = await repo.openPrivateChat(userId);
      if (opened.status === 'open') {
        router.push(`/chat/${opened.connectionId}` as never);
        return;
      }
      setAsked(true);
    } catch (err) {
      setError(shownError(err, 'Could not open a private message.'));
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  const avatar = view.profilePhotos.find((photo) => photo.role === 'avatar');
  const gallery = view.profilePhotos.filter((photo) => photo.role === 'gallery');

  async function report(key: string, summary: string) {
    if (busy.current) return;
    busy.current = true;
    setError(null);
    setPending(true);
    try {
      await repo.reportUser({
        reportedUserId: userId,
        reason: 'Shared profile',
        details: summary.slice(0, 2000),
      });
      setReporting(null);
      setSent(key);
    } catch (err) {
      setError(shownError(err, 'Could not send the report.'));
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  async function reportPhoto(photo: { id: string; caption: string }) {
    if (busy.current) return;
    busy.current = true;
    setError(null);
    setPending(true);
    try {
      await repo.reportUser({
        reportedUserId: userId,
        reason: 'Profile photo',
        details: `Profile photo ${photo.id}. ${photo.caption}`.slice(0, 2000),
      });
      setReporting(null);
      setSent(photo.id);
    } catch (err) {
      setError(shownError(err, 'Could not send the report.'));
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <MemberAvatar name={view.displayName || name} url={avatar ? photoUrls[avatar.id] : null} size={64} />
        <T variant="title">{view.displayName || name}</T>
      </View>
      {avatar?.caption ? <T variant="muted">{avatar.caption}</T> : null}
      {avatar ? (
        <View style={{ gap: 6 }}>
          {sent === avatar.id ? <T variant="muted">Report sent.</T> : null}
          {reporting === avatar.id ? (
            <View style={{ gap: 8 }}>
              <T>This report goes to the moderation queue, with the photo id.</T>
              <Button label="Send report" pending={pending} pendingLabel="Sending..." onPress={() => void reportPhoto(avatar)} />
              <Button label="Cancel" tone="quiet" disabled={pending} onPress={() => setReporting(null)} />
            </View>
          ) : (
            <Button label="Report profile photo" tone="quiet" disabled={pending} onPress={() => setReporting(avatar.id)} />
          )}
        </View>
      ) : null}
      {gallery.map((photo) => (
        <View key={photo.id} style={{ gap: 6 }}>
          <SharedPhotoFrame photo={{ id: photo.id, userId, takenOn: '', monthIndex: 0, note: '', caption: photo.caption, storagePath: '', createdAt: '', visibility: 'community', previewUrl: photoUrls[photo.id] ?? null }} />
          {photo.caption ? <T variant="muted">{photo.caption}</T> : null}
          {sent === photo.id ? <T variant="muted">Report sent.</T> : null}
          {reporting === photo.id ? (
            <View style={{ gap: 8 }}>
              <T>This report goes to the moderation queue, with the photo id.</T>
              <Button label="Send report" pending={pending} pendingLabel="Sending..." onPress={() => void reportPhoto(photo)} />
              <Button label="Cancel" tone="quiet" disabled={pending} onPress={() => setReporting(null)} />
            </View>
          ) : (
            <Button label="Report profile photo" tone="quiet" disabled={pending} onPress={() => setReporting(photo.id)} />
          )}
        </View>
      ))}
      {view.bio ? <T>{view.bio}</T> : null}
      {view.pinnedQuote ? (
        <View style={{ gap: 4 }}>
          <T variant="title">{view.pinnedQuote.text}</T>
          <T variant="muted">{view.pinnedQuote.author} · {view.pinnedQuote.school} · {view.pinnedQuote.source}</T>
        </View>
      ) : null}
      {view.interests.length ? <T>{view.interests.join(' · ')}</T> : null}
      <T variant="muted">{view.town || 'Area not shared'}</T>
      {view.stage ? <T>Stage: {view.stage}</T> : null}
      {view.sober ? <T>{formatSoberShare(view.sober)}</T> : null}
      {view.milestones.length ? <T>{view.milestones.join(', ')}</T> : null}
      {view.reasons.map((reason) => <T key={reason}>{reason}</T>)}
      {view.moneySaved != null ? <T>{formatGbp(view.moneySaved)} saved</T> : null}
      {view.unitsAvoided != null ? <T>{view.unitsAvoided} units avoided</T> : null}
      {view.moodStreak != null ? <T>Mood streak {view.moodStreak}</T> : null}
      {shown.health.map((line) => <T key={line}>{line}</T>)}
      <SharedNutritionFacts meals={shown.foodDiary} calories={shown.calories} quality={shown.quality} progress={shown.progress} />
      {shown.foodDiary ? (
        <View style={{ gap: 4 }}>
          <T variant="muted">Only a private message or a report.</T>
          <Button label="Message privately" tone="quiet" pending={pending} pendingLabel="Opening..." onPress={() => void reach()} />
        </View>
      ) : null}
      {shown.wagon ? (
        <View style={{ gap: 6 }}>
          <T>{WAGON_PUBLIC_LINE}</T>
          {shown.wagon.note ? <T variant="muted">{shown.wagon.note}</T> : null}
          {asked ? <T variant="muted">A private request is with them. You can message once you have both agreed.</T> : null}
          <Button label="Reach out" pending={pending} pendingLabel="Opening..." onPress={() => void reach()} />
        </View>
      ) : null}
      {shown.gratitude.map((entry) => <T key={entry.id}>{entry.body}</T>)}
      {view.vision.map((item) => <T key={item.id}>{[item.caption, item.area].filter(Boolean).join(' · ')}</T>)}
      {view.gratitudePhotos.map((photo) => photo.caption ? <T key={photo.id}>{photo.caption}</T> : null)}
      {error ? <ErrorNote>{error}</ErrorNote> : null}
      {sent === 'profile' ? <T variant="muted">Report sent.</T> : null}
      {reporting === 'profile' ? (
        <View style={{ gap: 8 }}>
          <T>This report goes to the moderation queue.</T>
          <Button label="Send report" pending={pending} pendingLabel="Sending..." onPress={() => void report('profile', `Name: ${view.displayName || name}`)} />
          <Button label="Cancel" tone="quiet" disabled={pending} onPress={() => setReporting(null)} />
        </View>
      ) : (
        <Button label="Report profile" tone="quiet" disabled={pending} onPress={() => setReporting('profile')} />
      )}
      {items.map((item) => {
        const key = `${item.label}:${item.summary}`;
        return (
          <View key={key} style={{ gap: 6 }}>
            {sent === key ? <T variant="muted">Report sent.</T> : null}
            {reporting === key ? (
              <View style={{ gap: 8 }}>
                <T>This report goes to the moderation queue.</T>
                <Button label="Send report" pending={pending} pendingLabel="Sending..." onPress={() => void report(key, `${item.label}: ${item.summary}`)} />
                <Button label="Cancel" tone="quiet" disabled={pending} onPress={() => setReporting(null)} />
              </View>
            ) : (
              <Button label={`Report ${item.label}`} tone="quiet" disabled={pending} onPress={() => setReporting(key)} />
            )}
          </View>
        );
      })}
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
