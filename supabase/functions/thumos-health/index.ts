import { corsHeaders, json, preflight } from '../_shared/http.ts';
import { THUMOS_CHAT } from '../_shared/thumos.ts';
import { THUMOS_HEALTH_CADENCE, thumosHealthBody, thumosHealthVerdict } from '../_shared/thumosHealth.ts';

/**
 * One-token check that xAI answers. Call every five minutes (*/5 * * * *)
 * and hourly (0 * * * *), with header x-thumos-health set to THUMOS_HEALTH_SECRET.
 */
Deno.serve(async (req) => {
  const early = preflight(req);
  if (early) return early;
  if (req.method !== 'POST' && req.method !== 'GET') return json({ ok: false, code: 'method' }, 405);

  const secret = Deno.env.get('THUMOS_HEALTH_SECRET');
  if (!secret || req.headers.get('x-thumos-health') !== secret) {
    console.error('thumos health: refused, secret missing or wrong');
    return json({ ok: false, code: 'unauthorised' }, 401);
  }

  const apiKey = Deno.env.get('XAI_API_KEY');
  if (!apiKey) {
    console.error('thumos health: XAI_API_KEY is not set');
    const verdict = thumosHealthVerdict('missing_key');
    return json({ ...verdict, cadence: THUMOS_HEALTH_CADENCE }, 503);
  }

  const started = Date.now();
  try {
    const response = await fetch(THUMOS_CHAT.completionsUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Connection: 'close',
      },
      body: JSON.stringify({ ...thumosHealthBody(), max_tokens: 1 }),
      signal: AbortSignal.timeout(THUMOS_CHAT.firstTimeoutMs),
    });
    const verdict = thumosHealthVerdict(response.status);
    if (!verdict.ok) console.error('thumos health: xAI HTTP status', response.status);
    return json({ ...verdict, latencyMs: Date.now() - started, cadence: THUMOS_HEALTH_CADENCE }, verdict.ok ? 200 : 503);
  } catch (error) {
    const name = error instanceof Error ? error.name : 'Error';
    console.error('thumos health: xAI HTTP status', name);
    const verdict = thumosHealthVerdict(name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 500);
    return json({ ...verdict, latencyMs: Date.now() - started, cadence: THUMOS_HEALTH_CADENCE }, 503);
  }
});
