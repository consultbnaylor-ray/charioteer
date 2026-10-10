import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.3';
import { json, preflight } from '../_shared/http.ts';

const PHOTO_BUCKET = 'progress-photos';
const LEFT_IN_PLACE = 'Could not remove the private photos, so the account was left in place.';

Deno.serve(async (req) => {
  const early = preflight(req);
  if (early) return early;
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

  const admin = createClient(url, service, { auth: { persistSession: false } });
  const storageError = await removeProgressPhotos(admin, userData.user.id);
  if (storageError) return json({ ok: false, code: 'storage', message: storageError }, 500);

  const { error: deleteError } = await admin.auth.admin.deleteUser(userData.user.id);
  if (deleteError) return json({ ok: false, code: 'delete', message: deleteError.message }, 500);
  return json({ ok: true });
});

type StorageAdmin = {
  storage: {
    from(bucket: string): {
      list(path: string, options: { limit: number; offset: number }): Promise<{
        data: { name?: string }[] | null;
        error: { message: string } | null;
      }>;
      remove(paths: string[]): Promise<{ error: { message: string } | null }>;
    };
  };
};

/** Service role, before the auth user goes. A missing bucket is fine; any other storage error keeps the account. */
async function removeProgressPhotos(admin: StorageAdmin, userId: string): Promise<string | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) return LEFT_IN_PLACE;
  const paths: string[] = [];
  for (let offset = 0; offset < 10000; offset += 100) {
    const listed = await admin.storage.from(PHOTO_BUCKET).list(userId, { limit: 100, offset });
    if (listed.error) {
      if (/bucket not found/i.test(listed.error.message)) return null;
      return LEFT_IN_PLACE;
    }
    const page = listed.data ?? [];
    for (const item of page) {
      const name = item.name ?? '';
      if (!name || name.includes('/') || name.includes('..') || !name.toLowerCase().endsWith('.jpg')) continue;
      paths.push(`${userId}/${name}`);
    }
    if (page.length < 100) break;
  }
  for (let index = 0; index < paths.length; index += 100) {
    const removed = await admin.storage.from(PHOTO_BUCKET).remove(paths.slice(index, index + 100));
    if (removed.error) {
      if (/bucket not found/i.test(removed.error.message)) return null;
      return LEFT_IN_PLACE;
    }
  }
  return null;
}
