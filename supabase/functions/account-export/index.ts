import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.3';
import { json, preflight } from '../_shared/http.ts';

const PHOTO_BUCKET = 'progress-photos';
const SIGNED_SECONDS = 3600;

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
  const photos = Array.isArray(record.progress_photos) ? record.progress_photos as Record<string, unknown>[] : [];
  const signedPhotos = [];
  for (const photo of photos) {
    const path = typeof photo.storage_path === 'string' ? photo.storage_path : '';
    let signedUrl: string | null = null;
    if (path.startsWith(`${userData.user.id}/`) && !path.includes('..')) {
      const signed = await userClient.storage.from(PHOTO_BUCKET).createSignedUrl(path, SIGNED_SECONDS);
      signedUrl = signed.data?.signedUrl ?? null;
    }
    signedPhotos.push({ ...photo, signed_url: signedUrl });
  }
  record.progress_photos = signedPhotos;
  return json({ ok: true, data: record });
});
