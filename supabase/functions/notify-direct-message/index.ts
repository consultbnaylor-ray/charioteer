import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.3';
import { json, preflight } from '../_shared/http.ts';
import { communityOn, iconBadgeCount, messageAlert, pushSenderName } from '../_shared/messagePush.ts';

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

  const payload = await req.json().catch(() => null) as { type?: string; messageId?: unknown; record?: { id?: unknown } } | null;
  if (payload?.type && payload.type !== 'INSERT') return json({ ok: true, skipped: 'type' });
  const messageId = typeof payload?.messageId === 'string'
    ? payload.messageId
    : typeof payload?.record?.id === 'string'
      ? payload.record.id
      : '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(messageId)) {
    return json({ ok: false, code: 'message' }, 400);
  }

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

  const message = await admin.from('direct_messages').select('id, connection_id, sender_id').eq('id', messageId).maybeSingle();
  if (message.error || !message.data) return json({ ok: false, code: 'message' }, 404);
  const row = message.data as Row;
  const senderId = String(row.sender_id);
  const connectionId = String(row.connection_id);
  if (senderCheck && senderCheck !== senderId) return json({ ok: false, code: 'unauthorised' }, 403);

  const connection = await admin.from('connections').select('id, requester_id, addressee_id, status').eq('id', connectionId).maybeSingle();
  if (connection.error || !connection.data) return json({ ok: false, code: 'connection' }, 404);
  const link = connection.data as Row;
  const requesterId = String(link.requester_id);
  const addresseeId = String(link.addressee_id);
  const recipientId = senderId === requesterId ? addresseeId : requesterId;

  const people = await admin.from('profiles').select('id, display_name, community_visible, age_confirmed_18, message_notifications, notify_sender_name').in('id', [senderId, recipientId]);
  if (people.error || !people.data) return json({ ok: false, code: 'profile' }, 500);
  const sender = (people.data as Row[]).find((person) => String(person.id) === senderId);
  const recipient = (people.data as Row[]).find((person) => String(person.id) === recipientId);
  if (!sender || !recipient) return json({ ok: false, code: 'profile' }, 404);

  const blocks = await admin.from('blocks').select('blocker_id, blocked_id').or(`blocker_id.eq.${recipientId},blocked_id.eq.${recipientId}`);
  if (blocks.error) return json({ ok: false, code: 'blocks' }, 500);
  const blocked = (blocks.data as Row[] | null ?? []).some((row) => {
    const blockerId = String(row.blocker_id);
    const blockedId = String(row.blocked_id);
    return (blockerId === senderId && blockedId === recipientId) || (blockerId === recipientId && blockedId === senderId);
  });

  const decision = messageAlert({
    senderId,
    recipientId,
    connectionId,
    connectionAccepted: link.status === 'accepted',
    messageBody: '',
    recipientCommunityOn: communityOn(Boolean(recipient.community_visible), Boolean(recipient.age_confirmed_18)),
    senderCommunityOn: communityOn(Boolean(sender.community_visible), Boolean(sender.age_confirmed_18)),
    blocked,
    notificationsOn: recipient.message_notifications !== false,
    showSenderName: Boolean(recipient.notify_sender_name),
    senderName: pushSenderName(typeof sender.display_name === 'string' ? sender.display_name : ''),
  });
  if (!decision.ok) return json({ ok: true, skipped: decision.reason });

  const tokens = await admin.from('device_tokens').select('expo_push_token').eq('user_id', recipientId);
  if (tokens.error) return json({ ok: false, code: 'tokens' }, 500);
  const targets = (tokens.data as Row[] | null ?? []).map((token) => String(token.expo_push_token)).filter(Boolean);
  if (!targets.length) return json({ ok: true, skipped: 'tokens' });

  const claimed = await admin.from('message_push_log').insert({ message_id: messageId }).select('message_id');
  if (claimed.error) {
    if (/duplicate|23505/i.test(claimed.error.message)) return json({ ok: true, skipped: 'sent' });
    return json({ ok: false, code: 'log' }, 500);
  }

  const badge = await unreadMessageBadge(admin, recipientId);
  const sent = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(targets.map((to) => ({
      to,
      title: decision.title,
      body: decision.body,
      data: decision.data,
      sound: 'default',
      ...(badge == null ? {} : { badge }),
    }))),
  });
  const result = await sent.json().catch(() => null) as { data?: { status?: string; message?: string; details?: { error?: string } }[] } | null;
  if (!sent.ok || !result?.data) {
    await admin.from('message_push_log').delete().eq('message_id', messageId);
    return json({ ok: false, code: 'push' }, 502);
  }

  const dropped = targets.filter((_, index) => result.data?.[index]?.details?.error === 'DeviceNotRegistered');
  if (dropped.length) await admin.from('device_tokens').delete().eq('user_id', recipientId).in('expo_push_token', dropped);
  const delivered = result.data.some((ticket) => ticket.status === 'ok');
  // Ticket ids and codes only, so a push Expo accepted but never delivered can be traced by receipt.
  await admin.from('message_push_log').update({
    tickets: result.data.map((ticket) => ({
      id: (ticket as { id?: string }).id ?? null,
      status: ticket.status ?? null,
      error: ticket.details?.error ?? null,
    })),
  }).eq('message_id', messageId);
  if (!delivered) {
    await admin.from('message_push_log').delete().eq('message_id', messageId);
    return json({ ok: false, code: 'push' }, 502);
  }
  return json({ ok: true });
});

/**
 * Unread direct messages for the home-screen badge.
 * A failed read leaves the badge off the payload so the alert still sends.
 * The count is messages only: requests and other alerts are not included.
 */
async function unreadMessageBadge(
  admin: ReturnType<typeof createClient>,
  recipientId: string,
): Promise<number | null> {
  try {
    const connections = await admin
      .from('connections')
      .select('id')
      .eq('status', 'accepted')
      .or(`requester_id.eq.${recipientId},addressee_id.eq.${recipientId}`);
    if (connections.error || !connections.data) return null;
    const ids = (connections.data as Row[]).map((row) => String(row.id)).filter(Boolean);
    if (!ids.length) return 0;
    const reads = await admin.from('chat_reads').select('connection_id, read_through').eq('user_id', recipientId);
    if (reads.error) return null;
    const readThrough: Record<string, string> = {};
    for (const row of (reads.data as Row[] | null) ?? []) {
      if (typeof row.connection_id === 'string' && typeof row.read_through === 'string') {
        readThrough[row.connection_id] = row.read_through;
      }
    }
    const messages = await admin
      .from('direct_messages')
      .select('connection_id, sender_id, created_at')
      .in('connection_id', ids);
    if (messages.error || !messages.data) return null;
    return iconBadgeCount(
      (messages.data as Row[]).map((row) => ({
        connectionId: String(row.connection_id),
        senderId: String(row.sender_id),
        createdAt: String(row.created_at),
      })),
      recipientId,
      readThrough,
    );
  } catch {
    return null;
  }
}
