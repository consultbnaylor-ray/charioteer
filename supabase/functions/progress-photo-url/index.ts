import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.3';
import { json, preflight } from '../_shared/http.ts';

const PHOTO_BUCKET = 'progress-photos';
const SHARED_SECONDS = 60;
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  const early = preflight(req);
  if (early) return early;
  if (req.method !== 'POST') return json({ ok: false, code: 'method' }, 405);
  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authHeader = req.headers.get('Authorization');
  if (!url || !anon || !service || !authHeader) return json({ ok: false, code: 'config' }, 500);

  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData, error } = await userClient.auth.getUser();
  if (error || !userData.user) return json({ ok: false, code: 'unauthorised' }, 401);

  const body = await req.json().catch(() => null) as { ids?: unknown } | null;
  const ids = Array.isArray(body?.ids) ? body.ids.filter((id): id is string => typeof id === 'string' && ID.test(id)).slice(0, 24) : [];
  if (!ids.length) return json({ ok: true, photos: [] });

  // The caller's own row-level security decides which rows exist. A private
  // photo belonging to someone else is not in this result, so it is not signed.
  const { data, error: readError } = await userClient
    .from('progress_photos')
    .select('id, user_id, storage_path, visibility')
    .in('id', ids);
  if (readError) return json({ ok: false, code: 'read' }, 500);

  const admin = createClient(url, service, { auth: { persistSession: false } });
  const photos: { id: string; signed_url: string }[] = [];
  for (const row of data ?? []) {
    const id = String(row.id);
    const ownerId = String(row.user_id);
    const path = String(row.storage_path ?? '');
    const shared = row.visibility === 'community';
    const owns = ownerId === userData.user.id;
    if ((!owns && !shared) || path !== `${ownerId}/${id}.jpg` || path.includes('..')) continue;
    const signed = await admin.storage.from(PHOTO_BUCKET).createSignedUrl(path, SHARED_SECONDS);
    if (signed.data?.signedUrl) photos.push({ id, signed_url: signed.data.signedUrl });
  }
  return json({ ok: true, photos });
});
