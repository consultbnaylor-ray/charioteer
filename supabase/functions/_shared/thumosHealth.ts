import { THUMOS_CHAT } from './thumos.ts';

/** How often an outside check should call the health function. */
export const THUMOS_HEALTH_CADENCE = {
  fiveMinutes: '*/5 * * * *',
  hourly: '0 * * * *',
} as const;

/** A one-token ping. Reasoning is off so the check itself stays short. */
export function thumosHealthBody(): {
  model: string;
  reasoning_effort: 'none';
  max_tokens: 1;
  stream: false;
  messages: { role: 'user'; content: string }[];
} {
  return {
    model: THUMOS_CHAT.model,
    reasoning_effort: 'none',
    max_tokens: 1,
    stream: false,
    messages: [{ role: 'user', content: 'ping' }],
  };
}

export function thumosHealthVerdict(status: number | 'timeout' | 'missing_key'): { ok: boolean; code: string } {
  if (status === 'missing_key') return { ok: false, code: 'missing_key' };
  if (status === 'timeout') return { ok: false, code: 'timeout' };
  if (status >= 200 && status < 300) return { ok: true, code: 'ok' };
  return { ok: false, code: `http_${status}` };
}
