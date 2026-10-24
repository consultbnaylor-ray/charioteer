import { json, preflight } from '../_shared/http.ts';

/**
 * Buddy invites no longer send a push. The only remote alert is a direct message
 * from notify-direct-message. An older client that still calls this gets a quiet skip.
 * Do not post to Expo from here.
 */
Deno.serve(async (req) => {
  const early = preflight(req);
  if (early) return early;
  if (req.method !== 'POST') return json({ ok: false, code: 'method' }, 405);
  return json({ ok: true, skipped: 'messages-only' });
});
