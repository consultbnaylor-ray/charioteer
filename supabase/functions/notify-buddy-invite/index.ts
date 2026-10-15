import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.3';
import { buddyInviteAlert } from '../_shared/buddyPush.ts';
import { pushSenderName } from '../_shared/messagePush.ts';
import { json, preflight } from '../_shared/http.ts';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

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

  const payload = await req.json().catch(() => null) as { inviteId?: unknown } | null;
  const inviteId = typeof payload?.inviteId === 'string' ? payload.inviteId : '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(inviteId)) {
    return json({ ok: false, code: 'invite' }, 400);
  }

  const bearer = authHeader.replace(/^Bearer\s+/i, '');
  const admin = createClient(url, service, { auth: { persistSession: false } });
  let caller: string | null = null;
  if (bearer !== service) {
    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userData, error } = await userClient.auth.getUser();
    if (error || !userData.user) return json({ ok: false, code: 'unauthorised' }, 401);
    caller = userData.user.id;
  }

  const invite = await admin.from('buddy_invites').select('id, owner_id, buddy_id, status').eq('id', inviteId).maybeSingle();
  if (invite.error || !invite.data) return json({ ok: false, code: 'invite' }, 404);
  const row = invite.data as Row;
  const ownerId = String(row.owner_id);
  const buddyId = String(row.buddy_id);
  if (caller && caller !== ownerId) return json({ ok: false, code: 'unauthorised' }, 403);

  const people = await admin.from('profiles').select('id, display_name, age_confirmed_18, message_notifications, notify_sender_name').in('id', [ownerId, buddyId]);
  if (people.error || !people.data) return json({ ok: false, code: 'profile' }, 500);
  const owner = (people.data as Row[]).find((person) => String(person.id) === ownerId);
  const buddy = (people.data as Row[]).find((person) => String(person.id) === buddyId);
  if (!owner || !buddy) return json({ ok: false, code: 'profile' }, 404);

  const blocks = await admin.from('blocks').select('blocker_id, blocked_id').or(`blocker_id.eq.${buddyId},blocked_id.eq.${buddyId}`);
  if (blocks.error) return json({ ok: false, code: 'blocks' }, 500);
  const blocked = (blocks.data as Row[] | null ?? []).some((item) => {
    const blockerId = String(item.blocker_id);
    const blockedId = String(item.blocked_id);
    return (blockerId === ownerId && blockedId === buddyId) || (blockerId === buddyId && blockedId === ownerId);
  });

  const decision = buddyInviteAlert({
    ownerId,
    buddyId,
    inviteId,
    pending: row.status === 'pending',
    blocked,
    ownerAdult: Boolean(owner.age_confirmed_18),
    buddyAdult: Boolean(buddy.age_confirmed_18),
    notificationsOn: buddy.message_notifications !== false,
    showSenderName: Boolean(buddy.notify_sender_name),
    senderName: pushSenderName(typeof owner.display_name === 'string' ? owner.display_name : ''),
  });
  if (!decision.ok) return json({ ok: true, skipped: decision.reason });

  const tokens = await admin.from('device_tokens').select('expo_push_token').eq('user_id', buddyId);
  if (tokens.error) return json({ ok: false, code: 'tokens' }, 500);
  const targets = (tokens.data as Row[] | null ?? []).map((token) => String(token.expo_push_token)).filter(Boolean);
  if (!targets.length) return json({ ok: true, skipped: 'tokens' });

  const claimed = await admin.from('buddy_invite_push_log').insert({ invite_id: inviteId }).select('invite_id');
  if (claimed.error) {
    if (/duplicate|23505/i.test(claimed.error.message)) return json({ ok: true, skipped: 'sent' });
    return json({ ok: false, code: 'log' }, 500);
  }

  const sent = await fetch(EXPO_PUSH_URL, {
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
  const result = await sent.json().catch(() => null) as { data?: { status?: string; details?: { error?: string } }[] } | null;
  if (!sent.ok || !result?.data) {
    await admin.from('buddy_invite_push_log').delete().eq('invite_id', inviteId);
    return json({ ok: false, code: 'push' }, 502);
  }
  const dropped = targets.filter((_, index) => result.data?.[index]?.details?.error === 'DeviceNotRegistered');
  if (dropped.length) await admin.from('device_tokens').delete().eq('user_id', buddyId).in('expo_push_token', dropped);
  const delivered = result.data.some((ticket) => ticket.status === 'ok');
  if (!delivered) {
    await admin.from('buddy_invite_push_log').delete().eq('invite_id', inviteId);
    return json({ ok: false, code: 'push' }, 502);
  }
  return json({ ok: true });
});
