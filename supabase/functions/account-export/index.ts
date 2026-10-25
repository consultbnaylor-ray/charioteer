import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.3';
import { json, preflight } from '../_shared/http.ts';

const PHOTO_BUCKET = 'progress-photos';
const GRATITUDE_BUCKET = 'gratitude-photos';
const VISION_BUCKET = 'vision-board';
const PROFILE_BUCKET = 'profile-photos';
const BUDDY_BUCKET = 'buddy-photos';
const SIGNED_SECONDS = 3600;

type Signer = {
  storage: {
    from(bucket: string): {
      createSignedUrl(path: string, expiresIn: number): Promise<{ data: { signedUrl?: string } | null }>;
    };
  };
};

/** Owner prefix only. The link is signed. The bytes stay in the private bucket. */
async function withSignedUrls(
  client: Signer,
  userId: string,
  bucket: string,
  photos: Record<string, unknown>[],
  ownerPrefix = true,
): Promise<Record<string, unknown>[]> {
  const signedPhotos = [];
  for (const photo of photos) {
    const path = typeof photo.storage_path === 'string' ? photo.storage_path : '';
    let signedUrl: string | null = null;
    const ownFile = ownerPrefix ? path.startsWith(`${userId}/`) : path.endsWith('.jpg');
    if (ownFile && !path.includes('..')) {
      const signed = await client.storage.from(bucket).createSignedUrl(path, SIGNED_SECONDS);
      signedUrl = signed.data?.signedUrl ?? null;
    }
    signedPhotos.push({ ...photo, signed_url: signedUrl });
  }
  return signedPhotos;
}

Deno.serve(async (req) => {
  const early = preflight(req);
  if (early) return early;
  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  const authHeader = req.headers.get('Authorization');
  if (!url || !anon || !authHeader) return json({ ok: false, code: 'config' }, 500);
  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData, error } = await userClient.auth.getUser();
  if (error || !userData.user) return json({ ok: false, code: 'unauthorised' }, 401);
  const { data, error: rpcError } = await userClient.rpc('export_my_data');
  if (rpcError) return json({ ok: false, code: 'export', message: rpcError.message }, 500);

  const record = (data ?? {}) as Record<string, unknown>;
  const userId = userData.user.id;
  const photos = Array.isArray(record.progress_photos) ? record.progress_photos as Record<string, unknown>[] : [];
  record.progress_photos = await withSignedUrls(userClient, userId, PHOTO_BUCKET, photos);
  if (Array.isArray(record.gratitude_photos)) {
    record.gratitude_photos = await withSignedUrls(
      userClient,
      userId,
      GRATITUDE_BUCKET,
      record.gratitude_photos as Record<string, unknown>[],
    );
  }
  if (Array.isArray(record.vision_board_items)) {
    record.vision_board_items = await withSignedUrls(
      userClient,
      userId,
      VISION_BUCKET,
      record.vision_board_items as Record<string, unknown>[],
    );
  }
  if (Array.isArray(record.profile_photos)) {
    record.profile_photos = await withSignedUrls(
      userClient,
      userId,
      PROFILE_BUCKET,
      record.profile_photos as Record<string, unknown>[],
    );
  }
  if (Array.isArray(record.buddy_photos)) {
    record.buddy_photos = await withSignedUrls(
      userClient,
      userId,
      BUDDY_BUCKET,
      record.buddy_photos as Record<string, unknown>[],
    );
  }
  if (Array.isArray(record.buddy_photos_shared_with_me)) {
    record.buddy_photos_shared_with_me = await withSignedUrls(
      userClient,
      userId,
      BUDDY_BUCKET,
      record.buddy_photos_shared_with_me as Record<string, unknown>[],
      false,
    );
  }
  return json({ ok: true, data: record });
});
