import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.3';
import { json, preflight } from '../_shared/http.ts';

const PHOTO_BUCKET = 'profile-photos';
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

  // Own rows come from row-level security. Another person's row comes from
  // shared_profile_photos, which requires community consent, age 18, and no
  // block in either direction. There is no storage select for that folder.
  const { data, error: readError } = await userClient
    .from('profile_photos')
    .select('id, user_id, storage_path')
    .in('id', ids);
  if (readError) return json({ ok: false, code: 'read' }, 500);

  const shared = await userClient.rpc('shared_profile_photos', { photo_ids: ids });
  const rows = new Map<string, { id: string; user_id: string; storage_path: string }>();
  for (const row of data ?? []) {
    rows.set(String(row.id), {
      id: String(row.id),
      user_id: String(row.user_id ?? ''),
      storage_path: String(row.storage_path ?? ''),
    });
  }
  if (!shared.error && Array.isArray(shared.data)) {
    for (const row of shared.data) {
      if (!row || typeof row !== 'object' || !('id' in row)) continue;
      const record = row as { id?: unknown; user_id?: unknown; storage_path?: unknown };
      if (typeof record.id !== 'string' || rows.has(record.id)) continue;
      rows.set(record.id, {
        id: record.id,
        user_id: String(record.user_id ?? ''),
        storage_path: String(record.storage_path ?? ''),
      });
    }
  }

  const admin = createClient(url, service, { auth: { persistSession: false } });
  const photos: { id: string; signed_url: string }[] = [];
  for (const row of rows.values()) {
    const id = row.id;
    const ownerId = row.user_id;
    const path = row.storage_path;
    if (path !== `${ownerId}/${id}.jpg` || path.includes('..')) continue;
    const signed = await admin.storage.from(PHOTO_BUCKET).createSignedUrl(path, SHARED_SECONDS);
    if (signed.data?.signedUrl) photos.push({ id, signed_url: signed.data.signedUrl });
  }
  return json({ ok: true, photos });
});
