import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.3';

import { json, preflight } from '../_shared/http.ts';
import {
  buildDirectionsBody,
  cleanPlaceQuery,
  directionsUrl,
  geocodeUrl,
  parseDirections,
  parseGeocode,
  readMode,
  readPlace,
  readShape,
  routeLengthM,
  withinRouteLimit,
} from '../_shared/orsRoute.ts';

const UNAVAILABLE = 'The route service is not available right now. Nothing was saved.';
const TOO_MANY = 'Too many routes just now. Wait a few minutes and try again.';

const recent = new Map<string, number[]>();

function memoryAllows(userId: string): boolean {
  const decision = withinRouteLimit(recent.get(userId) ?? [], Date.now());
  if (!decision.ok) return false;
  recent.set(userId, decision.next);
  return true;
}

Deno.serve(async (req) => {
  const early = preflight(req);
  if (early) return early;
  if (req.method !== 'POST') return json({ ok: false, code: 'method' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  const authHeader = req.headers.get('Authorization');
  if (!url || !anon || !authHeader) return json({ ok: false, code: 'unavailable', message: UNAVAILABLE }, 503);

  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json({ ok: false, code: 'unauthorised' }, 401);
  const userId = userData.user.id;

  const body = (await req.json().catch(() => null)) as {
    action?: unknown;
    mode?: unknown;
    shape?: unknown;
    start?: unknown;
    end?: unknown;
    distanceM?: unknown;
    minutes?: unknown;
    query?: unknown;
  } | null;
  if (!body || (body.action !== 'route' && body.action !== 'search')) {
    return json({ ok: false, code: 'input', message: 'Choose a route or a place.' }, 400);
  }

  const key = Deno.env.get('ORS_API_KEY');
  if (!key) return json({ ok: false, code: 'unavailable', message: UNAVAILABLE }, 503);

  const allowed = await requestAllowed(url, userId);
  if (!allowed) return json({ ok: false, code: 'rate', message: TOO_MANY }, 429);

  try {
    if (body.action === 'search') {
      const query = cleanPlaceQuery(body.query);
      if (!query) return json({ ok: false, code: 'input', message: 'Type at least two letters.' }, 400);
      const response = await fetch(geocodeUrl(query), {
        headers: { Authorization: key, Accept: 'application/json' },
        signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) return json({ ok: false, code: 'unavailable', message: UNAVAILABLE }, 503);
      const payload = await response.json().catch(() => null);
      return json({ ok: true, places: parseGeocode(payload) });
    }

    const mode = readMode(body.mode);
    const shape = readShape(body.shape);
    const start = readPlace(body.start);
    const end = readPlace(body.end);
    if (!mode || !shape || !start) return json({ ok: false, code: 'input', message: 'Choose a start point.' }, 400);
    if (shape === 'a_to_b' && !end) return json({ ok: false, code: 'input', message: 'Choose a destination.' }, 400);
    const lengthM = routeLengthM({ mode, distanceM: body.distanceM, minutes: body.minutes });
    if (!lengthM) return json({ ok: false, code: 'input', message: 'Choose a distance or a time.' }, 400);
    const directions = buildDirectionsBody({ mode, shape, start, end, lengthM });
    if (!directions) return json({ ok: false, code: 'input', message: 'Choose a destination.' }, 400);
    const response = await fetch(directionsUrl(mode), {
      method: 'POST',
      headers: {
        Authorization: key,
        Accept: 'application/geo+json, application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(directions),
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) return json({ ok: false, code: 'unavailable', message: UNAVAILABLE }, 503);
    const payload = await response.json().catch(() => null);
    const plan = parseDirections(payload, mode, shape);
    if (!plan) return json({ ok: false, code: 'unavailable', message: UNAVAILABLE }, 503);
    return json({ ok: true, mocked: false, mode, shape, ...plan });
  } catch {
    console.error('outdoor-route request failed');
    return json({ ok: false, code: 'unavailable', message: UNAVAILABLE }, 503);
  }
});

async function requestAllowed(url: string, userId: string): Promise<boolean> {
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (serviceKey) {
    const table = await tableAllows(url, serviceKey, userId);
    if (table === false) return false;
    if (table === true) {
      memoryAllows(userId);
      return true;
    }
  }
  return memoryAllows(userId);
}

/** True when the count table accepted the request. False when the person is over the limit. Null when the table is not there yet. */
async function tableAllows(url: string, serviceKey: string, userId: string): Promise<boolean | null> {
  try {
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const tenAgo = new Date(Date.now() - 600_000).toISOString();
    const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
    const ten = await admin.from('outdoor_route_requests').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', tenAgo);
    if (ten.error) return null;
    if ((ten.count ?? 0) >= 12) return false;
    const day = await admin.from('outdoor_route_requests').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', dayAgo);
    if (day.error) return null;
    if ((day.count ?? 0) >= 40) return false;
    const inserted = await admin.from('outdoor_route_requests').insert({ user_id: userId });
    if (inserted.error) return null;
    return true;
  } catch {
    return null;
  }
}
