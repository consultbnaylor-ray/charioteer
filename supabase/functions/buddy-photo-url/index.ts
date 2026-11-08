import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.3';
import { json, preflight } from '../_shared/http.ts';

const PHOTO_BUCKET = 'buddy-photos';
// Long enough to open the card and tap Save to Photos. The link is minted
// only after buddy_photo_feed says this person may see that photo.
const SHARED_SECONDS = 60 * 60;
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type FeedRow = {
  id?: unknown;
  ownerId?: unknown;
  storagePath?: unknown;
  published?: unknown;
};

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
  const wanted = new Set(
    Array.isArray(body?.ids) ? body.ids.filter((id): id is string => typeof id === 'string' && ID.test(id)).slice(0, 40) : [],
  );
  if (!wanted.size) return json({ ok: true, photos: [] });

  // The feed is the allow-list: the owner, or a recipient of that share.
  // It does not include a hidden photo or a photo for someone who is not a buddy.
  const feed = await userClient.rpc('buddy_photo_feed');
  if (feed.error) return json({ ok: false, code: 'read' }, 500);
  const rows = Array.isArray(feed.data) ? feed.data as FeedRow[] : [];

  const admin = createClient(url, service, { auth: { persistSession: false } });
  const photos: { id: string; signed_url: string }[] = [];
  for (const row of rows) {
    const id = typeof row.id === 'string' ? row.id : '';
    const ownerId = typeof row.ownerId === 'string' ? row.ownerId : '';
    const path = typeof row.storagePath === 'string' ? row.storagePath : '';
    if (!wanted.has(id) || row.published === false) continue;
    if (!ID.test(ownerId) || path !== `${ownerId}/${id}.jpg` || path.includes('..')) continue;
    const signed = await admin.storage.from(PHOTO_BUCKET).createSignedUrl(path, SHARED_SECONDS);
    if (signed.data?.signedUrl) photos.push({ id, signed_url: signed.data.signedUrl });
  }
  return json({ ok: true, photos });
});
