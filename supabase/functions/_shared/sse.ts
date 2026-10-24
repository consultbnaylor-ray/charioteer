export type ThumosServerEvent =
  | { type: 'ping' }
  | { type: 'status'; state: 'waiting' | 'retrying' }
  | { type: 'delta'; text: string }
  | { type: 'replace'; reply: string }
  | { type: 'done'; reply: string; role: 'assistant' | 'offline'; ok: boolean }
  | { type: 'error'; message: string };

export function encodeSse(event: ThumosServerEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export function parseSseBuffer(buffer: string, onEvent: (event: ThumosServerEvent) => void): string {
  const parts = buffer.split('\n\n');
  const rest = parts.pop() ?? '';
  for (const part of parts) {
    const line = part
      .split('\n')
      .map((item) => item.trim())
      .find((item) => item.startsWith('data:'));
    if (!line) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]') continue;
    try {
      const parsed = JSON.parse(payload) as ThumosServerEvent;
      if (!parsed || typeof parsed !== 'object' || !('type' in parsed)) continue;
      onEvent(parsed);
    } catch {
      // Ignore a malformed keepalive. The next chunk may complete a real event.
    }
  }
  return rest;
}
