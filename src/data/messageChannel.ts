/**
 * One insert stream for every chat this account can read.
 * Realtime applies the select policy. A second call does not add callbacks
 * after subscribe, which is what `chat:<id>` did when two screens shared a name.
 */
const subscribed = new WeakSet<object>();

type ChannelLike = {
  on: (
    event: 'postgres_changes',
    filter: { event: string; schema: string; table: string },
    callback: (payload: { new: unknown }) => void,
  ) => ChannelLike;
  subscribe: (callback?: (status: string) => void) => ChannelLike;
};

export type MessageRealtime = {
  channel: (name: string) => ChannelLike;
  removeChannel: (channel: ChannelLike) => unknown;
};

export const DIRECT_MESSAGES_CHANNEL = 'direct-messages';

export function subscribeAccountMessages(
  client: MessageRealtime,
  onInsert: (row: unknown) => void,
  onSubscribed?: () => void,
): () => void {
  if (subscribed.has(client)) return () => undefined;
  const channel = client.channel(DIRECT_MESSAGES_CHANNEL);
  try {
    channel
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages' }, (payload) => {
        onInsert(payload.new);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') onSubscribed?.();
      });
    subscribed.add(client);
  } catch (error) {
    console.error('direct messages', error);
  }
  return () => {
    subscribed.delete(client);
    void client.removeChannel(channel);
  };
}
