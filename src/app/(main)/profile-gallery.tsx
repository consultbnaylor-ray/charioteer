import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { useRepository, useSnapshot } from '@/data';
import { shownError } from '@/domain/errors';
import { communitySharingOn, type PublicProfileView } from '@/domain/profileSharing';
import {
  galleryInChosenOrder,
  LOAD_MORE_PHOTOS,
  PROFILE_GALLERY_PAGE,
  PROFILE_LIBRARY_CLOSED,
  PROFILE_LIBRARY_INTRO,
  PROFILE_LIBRARY_TITLE,
} from '@/domain/profilePhotos';
import { ProfilePhotoEnlarge, ProfilePhotoTiles, type GalleryTile } from '@/ui/ProfileGallery';
import { Button, ErrorNote, Field, Screen, T } from '@/ui/ui';

function one(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === 'string' ? raw : '';
}

/** Every public gallery photo. The profile front shows only the first ones. */
export default function ProfileGalleryScreen() {
  const params = useLocalSearchParams<{ user?: string | string[] }>();
  const otherId = one(params.user);
  const router = useRouter();
  const repo = useRepository();
  const snap = useSnapshot();
  const me = snap.profile?.id ?? '';
  const own = !otherId || otherId === me;
  const [shown, setShown] = useState(PROFILE_GALLERY_PAGE);
  const [view, setView] = useState<PublicProfileView | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [reportError, setReportError] = useState<string | null>(null);
  const [reported, setReported] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (own || !otherId) return;
    let live = true;
    void repo.publicProfile(otherId).then((next) => {
      if (live) setView(next);
    }).catch(() => {
      if (live) setView(null);
    });
    return () => {
      live = false;
    };
  }, [own, otherId, repo]);

  const ownGallery = galleryInChosenOrder(snap.profilePhotos ?? []);
  const otherGallery = galleryInChosenOrder(view?.profilePhotos ?? []);
  const gallery = own ? ownGallery : otherGallery;
  const page = gallery.slice(0, shown);
  const pageKey = page.map((photo) => photo.id).join(',');

  useEffect(() => {
    const ids = pageKey ? pageKey.split(',') : [];
    if (!ids.length) return;
    if (own) {
      void repo.signProfilePhotos(ids);
      return;
    }
    let live = true;
    void repo.profilePhotoUrls(ids).then((rows) => {
      if (!live) return;
      setUrls((current) => {
        const next = { ...current };
        for (const row of rows) next[row.id] = row.url;
        return next;
      });
    }).catch(() => undefined);
    return () => {
      live = false;
    };
  }, [own, pageKey, repo]);

  const tiles: GalleryTile[] = page.map((photo) => {
    const preview = 'previewUrl' in photo && (typeof photo.previewUrl === 'string' || photo.previewUrl === null)
      ? photo.previewUrl
      : null;
    return {
      id: photo.id,
      caption: photo.caption,
      uri: own ? preview : urls[photo.id] ?? null,
    };
  });
  const open = tiles.find((tile) => tile.id === openId) ?? null;
  const title = own ? PROFILE_LIBRARY_TITLE : `${view?.displayName || 'Public'} photos`;

  async function sendReport() {
    if (!otherId || !open) return;
    const written = reason.trim().slice(0, 80);
    if (!written) {
      setReportError('Add a reason.');
      return;
    }
    setPending(true);
    setReportError(null);
    try {
      await repo.reportUser({
        reportedUserId: otherId,
        reason: 'Profile photo',
        details: `Profile photo ${open.id}. ${open.caption}. ${written}`.slice(0, 2000),
      });
      setReported(true);
    } catch (err) {
      setReportError(shownError(err, 'Could not send the report.'));
    } finally {
      setPending(false);
    }
  }

  return (
    <Screen eyebrow="You" title={title} intro={own ? PROFILE_LIBRARY_INTRO : 'Any Charioteer community member can see these photos.'}>
      {own && !communitySharingOn(snap.profile) ? <T variant="muted">{PROFILE_LIBRARY_CLOSED}</T> : null}
      {gallery.length === 0 ? <T variant="muted">No public photos yet.</T> : null}
      <ProfilePhotoTiles tiles={tiles} mode="open" onPress={setOpenId} />
      {shown < gallery.length ? (
        <Button label={LOAD_MORE_PHOTOS} tone="quiet" onPress={() => setShown((count) => count + PROFILE_GALLERY_PAGE)} />
      ) : null}
      {own ? (
        <Button label="Edit profile" tone="quiet" onPress={() => router.push('/public-profile?edit=photos' as never)} />
      ) : null}
      <Button label="Back" tone="quiet" onPress={() => router.back()} />
      <ProfilePhotoEnlarge tile={open} onClose={() => { setOpenId(null); setReported(false); setReason(''); setReportError(null); }}>
        {!own && open ? (
          <View style={{ gap: 8 }}>
            {reported ? <T variant="muted">Report sent.</T> : (
              <>
                <Field label="Reason" value={reason} onChangeText={setReason} maxLength={80} />
                <ErrorNote>{reportError}</ErrorNote>
                <Button label="Report this photo" tone="quiet" pending={pending} onPress={() => void sendReport()} />
              </>
            )}
          </View>
        ) : null}
      </ProfilePhotoEnlarge>
    </Screen>
  );
}
