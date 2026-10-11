import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useRepository, useSnapshot } from '@/data';
import type { ProgressPhoto } from '@/data/types';
import { shownError } from '@/domain/errors';
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
  const before = photos[0];
  const now = photos[photos.length - 1];

  async function message() {
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
      setPending(false);
    }
  }

  async function report(photo: ProgressPhoto) {
    setError(null);
    setPending(true);
    try {
      await repo.reportUser({
        reportedUserId: photo.userId,
        reason: 'Shared progress photo',
        details: `Photo ${photo.id}. ${progressPhotoLabel(photo.monthIndex, photo.takenOn)}. ${photo.note}`.slice(0, 2000),
      });
      setReporting(null);
      setSent(photo.id);
    } catch (err) {
      setError(shownError(err, 'Could not send the report.'));
    } finally {
      setPending(false);
    }
  }

  return (
    <View style={{ gap: 10 }}>
      <T variant="label">Shared photos</T>
      <T variant="muted">{name} chose to show these. Private photos stay hidden.</T>
      {error ? <ErrorNote>{error}</ErrorNote> : null}
      {asked ? <T variant="muted">A private request is with them. You can message once you have both agreed.</T> : null}
      {photos.length === 0 ? <T variant="muted">No shared photos.</T> : null}
      {photos.length >= 2 && before && now && before.id !== now.id ? (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1, gap: 6 }}>
            <T variant="label">Before</T>
            <SharedTile photo={before} />
          </View>
          <View style={{ flex: 1, gap: 6 }}>
            <T variant="label">Now</T>
            <SharedTile photo={now} />
          </View>
        </View>
      ) : null}
      {photos.map((photo) => (
        <View key={photo.id} style={{ gap: 6 }}>
          <SharedTile photo={photo} />
          <T variant="label">Shared</T>
          <T>{progressPhotoLabel(photo.monthIndex, photo.takenOn)}</T>
          {photo.note ? <T variant="muted">{photo.note}</T> : null}
          {sent === photo.id ? <T variant="muted">Report sent.</T> : null}
          <Button label="Message privately" tone="quiet" disabled={pending} onPress={() => void message()} />
          {reporting === photo.id ? (
            <View style={{ gap: 8 }}>
              <T>This report goes to the moderation queue, with the photo id.</T>
              <Button label="Send report" pending={pending} onPress={() => void report(photo)} />
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

function SharedTile({ photo }: { photo: ProgressPhoto }) {
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
