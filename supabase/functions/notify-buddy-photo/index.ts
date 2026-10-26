import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.3';
import { buddyPhotoAlert, PHOTO_PUSH_WINDOW_MS, photoPushCoalesced } from '../_shared/buddyPhotoPush.ts';
import { json, preflight } from '../_shared/http.ts';

/**
 * Push after a buddy photo is published.
 * NOT DEPLOYED. Ben applies supabase/migrations/20261026120000_buddy_photo_push.sql,
 * then deploys this function. No database webhook is required. The app calls it.
 *
 * The alert is "New photo on Charioteer". It does not include a name, the photo text,
 * or a preview. Recipients who turned off message notifications are skipped.
 * The sender is never notified. A later photo to the same person inside three minutes
 * is recorded and not sent. The home-screen count is left alone.
 */

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Row = Record<string, unknown>;

Deno.serve(async (req) => {
  const early = preflight(req);
  if (early) return early;
  if (req.method !== 'POST') return json({ ok: false, code: 'method' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authHeader = req.headers.get('Authorization');
  if (!url || !anon || !service || !authHeader) return json({ ok: false, code: 'config' }, 500);

  const payload = await req.json().catch(() => null) as { photoId?: unknown } | null;
  const photoId = typeof payload?.photoId === 'string' ? payload.photoId : '';
  if (!UUID.test(photoId)) return json({ ok: false, code: 'photo' }, 400);

  const bearer = authHeader.replace(/^Bearer\s+/i, '');
  const admin = createClient(url, service, { auth: { persistSession: false } });
  let senderCheck: string | null = null;
  if (bearer !== service) {
    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userData, error } = await userClient.auth.getUser();
    if (error || !userData.user) return json({ ok: false, code: 'unauthorised' }, 401);
    senderCheck = userData.user.id;
  }

  const photo = await admin.from('buddy_photos').select('id, owner_id, published_at').eq('id', photoId).maybeSingle();
  if (photo.error || !photo.data) return json({ ok: false, code: 'photo' }, 404);
  const row = photo.data as Row;
  const ownerId = String(row.owner_id);
  if (!UUID.test(ownerId)) return json({ ok: false, code: 'photo' }, 500);
  if (senderCheck && senderCheck !== ownerId) return json({ ok: false, code: 'unauthorised' }, 403);
  if (row.published_at == null || row.published_at === '') return json({ ok: true, skipped: 'unpublished' });

  const recipients = await admin.from('buddy_photo_recipients').select('buddy_id, hidden_at').eq('photo_id', photoId);
  if (recipients.error) return json({ ok: false, code: 'recipients' }, 500);
  const recipientIds = (recipients.data as Row[] | null ?? [])
    .filter((item) => item.hidden_at == null)
    .map((item) => String(item.buddy_id))
    .filter((id) => UUID.test(id) && id !== ownerId);
  if (!recipientIds.length) return json({ ok: true, skipped: 'recipients', sent: 0, coalesced: 0 });

  const people = await admin
    .from('profiles')
    .select('id, message_notifications, age_confirmed_18')
    .in('id', [ownerId, ...recipientIds]);
  if (people.error || !people.data) return json({ ok: false, code: 'profile' }, 500);
  const profiles = people.data as Row[];
  const owner = profiles.find((person) => String(person.id) === ownerId);
  if (!owner) return json({ ok: false, code: 'profile' }, 404);

  const links = await admin
    .from('connections')
    .select('requester_id, addressee_id, status')
    .eq('status', 'accepted')
    .or(`requester_id.eq.${ownerId},addressee_id.eq.${ownerId}`);
  if (links.error) return json({ ok: false, code: 'connection' }, 500);

  const blocks = await admin.from('blocks').select('blocker_id, blocked_id').or(`blocker_id.eq.${ownerId},blocked_id.eq.${ownerId}`);
  if (blocks.error) return json({ ok: false, code: 'blocks' }, 500);

  let sent = 0;
  let folded = 0;
  let skipped = 0;
  let failed = 0;
  for (const recipientId of recipientIds) {
    const recipient = profiles.find((person) => String(person.id) === recipientId);
    if (!recipient) {
      skipped += 1;
      continue;
    }
    const decision = buddyPhotoAlert({
      ownerId,
      recipientId,
      published: true,
      stillBuddies: acceptedPair((links.data as Row[] | null) ?? [], ownerId, recipientId),
      blocked: pairBlocked((blocks.data as Row[] | null) ?? [], ownerId, recipientId),
      notificationsOn: recipient.message_notifications !== false,
      ownerAdult: Boolean(owner.age_confirmed_18),
      recipientAdult: Boolean(recipient.age_confirmed_18),
      caption: '',
      senderName: '',
    });
    if (!decision.ok) {
      skipped += 1;
      continue;
    }

    const outcome = await deliverPhotoPush(admin, photoId, recipientId, decision);
    if (outcome === 'sent') sent += 1;
    else if (outcome === 'coalesced') folded += 1;
    else if (outcome === 'failed') failed += 1;
    else skipped += 1;
  }

  if (failed > 0) return json({ ok: false, code: 'push', sent, coalesced: folded, skipped }, 502);
  return json({ ok: true, sent, coalesced: folded, skipped });
});

type PushBody = { title: string; body: string; data: { sharedPhotos: true } };

async function deliverPhotoPush(
  admin: ReturnType<typeof createClient>,
  photoId: string,
  recipientId: string,
  decision: PushBody,
): Promise<'sent' | 'coalesced' | 'skipped' | 'failed'> {
  const prior = await admin
    .from('buddy_photo_push_log')
    .select('photo_id')
    .eq('photo_id', photoId)
    .eq('recipient_id', recipientId)
    .maybeSingle();
  if (prior.error) return 'failed';
  if (prior.data) return 'skipped';

  const tokens = await admin.from('device_tokens').select('expo_push_token').eq('user_id', recipientId);
  if (tokens.error) return 'failed';
  const targets = (tokens.data as Row[] | null ?? []).map((token) => String(token.expo_push_token)).filter(Boolean);
  if (!targets.length) return 'skipped';

  const recent = await admin
    .from('buddy_photo_push_log')
    .select('sent_at')
    .eq('recipient_id', recipientId)
    .eq('coalesced', false)
    .gte('sent_at', new Date(Date.now() - PHOTO_PUSH_WINDOW_MS).toISOString())
    .order('sent_at', { ascending: false })
    .limit(1);
  if (recent.error) return 'failed';
  const lastSentAt = recent.data && recent.data[0] ? String((recent.data[0] as Row).sent_at ?? '') : null;
  const fold = photoPushCoalesced(lastSentAt, Date.now());

  const claimed = await admin.from('buddy_photo_push_log').insert({
    photo_id: photoId,
    recipient_id: recipientId,
    coalesced: fold,
  }).select('photo_id');
  if (claimed.error) {
    if (/duplicate|23505/i.test(claimed.error.message)) return 'skipped';
    return 'failed';
  }
  if (fold) return 'coalesced';

  let result: { data?: { status?: string; details?: { error?: string } }[] } | null = null;
  let httpOk = false;
  try {
    const posted = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(targets.map((to) => ({
        to,
        title: decision.title,
        body: decision.body,
        data: decision.data,
        sound: 'default',
      }))),
    });
    httpOk = posted.ok;
    result = await posted.json().catch(() => null) as { data?: { status?: string; details?: { error?: string } }[] } | null;
  } catch {
    httpOk = false;
  }

  if (!httpOk || !result?.data) {
    await admin.from('buddy_photo_push_log').delete().eq('photo_id', photoId).eq('recipient_id', recipientId);
    return 'failed';
  }

  const dropped = targets.filter((_, index) => result?.data?.[index]?.details?.error === 'DeviceNotRegistered');
  if (dropped.length) await admin.from('device_tokens').delete().eq('user_id', recipientId).in('expo_push_token', dropped);
  const delivered = result.data.some((ticket) => ticket.status === 'ok');
  await admin.from('buddy_photo_push_log').update({
    tickets: result.data.map((ticket) => ({
      id: (ticket as { id?: string }).id ?? null,
      status: ticket.status ?? null,
      error: ticket.details?.error ?? null,
    })),
  }).eq('photo_id', photoId).eq('recipient_id', recipientId);
  if (!delivered) {
    await admin.from('buddy_photo_push_log').delete().eq('photo_id', photoId).eq('recipient_id', recipientId);
    return 'failed';
  }
  return 'sent';
}

function acceptedPair(rows: readonly Row[], ownerId: string, recipientId: string): boolean {
  return rows.some((row) => {
    const left = String(row.requester_id);
    const right = String(row.addressee_id);
    return (left === ownerId && right === recipientId) || (left === recipientId && right === ownerId);
  });
}

function pairBlocked(rows: readonly Row[], ownerId: string, recipientId: string): boolean {
  return rows.some((row) => {
    const blockerId = String(row.blocker_id);
    const blockedId = String(row.blocked_id);
    return (blockerId === ownerId && blockedId === recipientId) || (blockerId === recipientId && blockedId === ownerId);
  });
}
