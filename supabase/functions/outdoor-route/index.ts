import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.3';

import { json, preflight } from '../_shared/http.ts';
import {
  GLOBAL_ROUTE_DAILY_CAP,
  GLOBAL_SEARCH_DAILY_CAP,
  NO_PATH_MESSAGE,
  RATE_LIMITED_MESSAGE,
  ROUTE_DAILY_CAP,
  ROUTE_TEN_MINUTE_CAP,
  SEARCH_DAILY_CAP,
  SEARCH_TEN_MINUTE_CAP,
  ORS_MAX_SKETCH_BYTES,
  ORS_WAYPOINT_LIMIT,
  ROUTE_LIMIT_MESSAGE,
  SNAP_RADIUS_M,
  UNAVAILABLE_MESSAGE,
  buildDirectionsBody,
  buildSnapBody,
  classifyOrsFailure,
  cleanPlaceQuery,
  directionsUrl,
  geocodeUrl,
  haversineM,
  orsRequestHeaders,
  parseDirections,
  parseGeocode,
  parseSnap,
  readMode,
  readPlace,
  readShape,
  readSketchPoints,
  readViaPoints,
  sketchLimitMessage,
  routeLengthM,
  routingMode,
  snapUrl,
  listedUser,
  withinGlobalRouteLimit,
  withinRouteLimit,
  withinSearchLimit,
} from '../_shared/orsRoute.ts';

type RequestKind = 'route' | 'search';

const recent = new Map<string, number[]>();
const searchRecent = new Map<string, number[]>();
const recordedIds = new Map<string, number>();
let globalRecent: number[] = [];
let globalSearchRecent: number[] = [];

function routeLimitExempt(userId: string): boolean {
  return listedUser(Deno.env.get('ROUTE_LIMIT_EXEMPT_USERS'), userId);
}

function readRequestId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const id = value.trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id) ? id : null;
}

function seenRequest(userId: string, requestId: string | null, now: number): boolean {
  if (!requestId) return false;
  const until = recordedIds.get(`${userId}:${requestId}`);
  if (!until) return false;
  if (until <= now) {
    recordedIds.delete(`${userId}:${requestId}`);
    return false;
  }
  return true;
}

function rememberRequest(userId: string, requestId: string | null, now: number): void {
  if (!requestId) return;
  recordedIds.set(`${userId}:${requestId}`, now + 120_000);
}

function forgetRequest(userId: string, requestId: string | null): void {
  if (!requestId) return;
  recordedIds.delete(`${userId}:${requestId}`);
}

function memoryPeek(userId: string, kind: RequestKind, exempt: boolean, now: number): boolean {
  const globalStamps = kind === 'search' ? globalSearchRecent : globalRecent;
  const globalCap = kind === 'search' ? GLOBAL_SEARCH_DAILY_CAP : GLOBAL_ROUTE_DAILY_CAP;
  if (!withinGlobalRouteLimit(globalStamps, now, globalCap).ok) return false;
  if (exempt) return true;
  const stamps = kind === 'search' ? searchRecent.get(userId) ?? [] : recent.get(userId) ?? [];
  const person = kind === 'search' ? withinSearchLimit(stamps, now) : withinRouteLimit(stamps, now);
  return person.ok;
}

function memoryCommit(userId: string, kind: RequestKind, exempt: boolean, now: number): void {
  if (kind === 'search') {
    const across = withinGlobalRouteLimit(globalSearchRecent, now, GLOBAL_SEARCH_DAILY_CAP);
    if (across.ok) globalSearchRecent = across.next;
    if (exempt) return;
    const person = withinSearchLimit(searchRecent.get(userId) ?? [], now);
    if (person.ok) searchRecent.set(userId, person.next);
    return;
  }
  const across = withinGlobalRouteLimit(globalRecent, now);
  if (across.ok) globalRecent = across.next;
  if (exempt) return;
  const person = withinRouteLimit(recent.get(userId) ?? [], now);
  if (person.ok) recent.set(userId, person.next);
}

Deno.serve(async (req) => {
  const early = preflight(req);
  if (early) return early;
  if (req.method !== 'POST') return json({ ok: false, code: 'method' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  const authHeader = req.headers.get('Authorization');
  if (!url || !anon || !authHeader) return json({ ok: false, code: 'unavailable', message: UNAVAILABLE_MESSAGE }, 503);

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
    via?: unknown;
    preferPaths?: unknown;
    sketch?: unknown;
    requestId?: unknown;
  } | null;
  if (!body || (body.action !== 'route' && body.action !== 'search')) {
    return json({ ok: false, code: 'bad_request', message: 'Choose a route or a place.' }, 400);
  }

  const key = Deno.env.get('ORS_API_KEY');
  if (!key) return json({ ok: false, code: 'unavailable', message: UNAVAILABLE_MESSAGE }, 503);

  const requestId = readRequestId(body.requestId);
  const exempt = routeLimitExempt(userId);
  const kind: RequestKind = body.action === 'search' ? 'search' : 'route';
  const allowed = await requestAllowed(url, userId, kind, exempt, requestId);
  if (!allowed) return json({ ok: false, code: 'rate_limited', message: RATE_LIMITED_MESSAGE }, 429);

  async function finish(payload: { ok: true } & Record<string, unknown>): Promise<Response> {
    if (payload.ok === true) await recordRequest(url, userId, kind, requestId, exempt);
    return json(payload);
  }

  try {
    if (body.action === 'search') {
      const query = cleanPlaceQuery(body.query);
      if (!query) return json({ ok: false, code: 'bad_request', message: 'Type at least two letters.' }, 400);
      const response = await fetch(geocodeUrl(query), {
        headers: orsRequestHeaders(key, 'application/json'),
        signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) return json({ ok: false, code: 'unavailable', message: UNAVAILABLE_MESSAGE }, 503);
      const payload = await response.json().catch(() => null);
      return finish({ ok: true, places: parseGeocode(payload) });
    }

    const mode = readMode(body.mode);
    const shape = readShape(body.shape);
    const start = readPlace(body.start);
    const end = readPlace(body.end);
    if (!mode || !shape || !start) return json({ ok: false, code: 'bad_request', message: 'Choose a start point.' }, 400);
    if (shape === 'a_to_b' && !end) return json({ ok: false, code: 'bad_request', message: 'Choose a destination.' }, 400);
    const vias = readViaPoints(body.via);
    if (!vias) return json({ ok: false, code: 'bad_request', message: 'Choose up to five points on the route.' }, 400);
    const preferPaths = body.preferPaths === true;
    const sketchBytes = JSON.stringify(body.sketch ?? '').length;
    if (sketchBytes > ORS_MAX_SKETCH_BYTES || (Array.isArray(body.sketch) && body.sketch.length > ORS_WAYPOINT_LIMIT)) {
      return json({ ok: false, code: 'limit', message: ROUTE_LIMIT_MESSAGE }, 400);
    }
    const sketch = readSketchPoints(body.sketch);
    if (!sketch) return json({ ok: false, code: 'bad_request', message: 'Choose fewer points on the sketch.' }, 400);
    const limited = sketchLimitMessage(sketch);
    if (limited) return json({ ok: false, code: 'limit', message: limited }, 400);
    const lengthM = routeLengthM({ mode, distanceM: body.distanceM, minutes: body.minutes });
    if (!lengthM && vias.length === 0 && sketch.length < 2) return json({ ok: false, code: 'bad_request', message: 'Choose a distance or a time.' }, 400);
    const routed = routingMode(mode, preferPaths);
    const directions = buildDirectionsBody({ mode, shape, start, end, lengthM: lengthM ?? 0, via: vias, preferPaths, sketch });
    if (!directions) return json({ ok: false, code: 'bad_request', message: 'Choose a destination.' }, 400);
    const first = await postDirections(key, routed, shape, directions);
    if (first.kind === 'plan') return finish({ ok: true, mocked: false, mode, shape, ...first.plan });
    if (first.failure.body.code !== 'no_path') return json(first.failure.body, first.failure.status);
    const snapped = await snapStart(key, routed, sketch[0] ?? start);
    if (snapped.kind === 'failure') return json(snapped.failure.body, snapped.failure.status);
    if (snapped.kind === 'none') return json({ ok: false, code: 'no_path', message: NO_PATH_MESSAGE }, 422);
    const retrySketch = sketch.length >= 2 ? [snapped.point, ...sketch.slice(1)] : sketch;
    const retry = buildDirectionsBody({ mode, shape, start: snapped.point, end, lengthM: lengthM ?? 0, via: vias, preferPaths, sketch: retrySketch });
    if (!retry) return json({ ok: false, code: 'no_path', message: NO_PATH_MESSAGE }, 422);
    const second = await postDirections(key, routed, shape, retry);
    if (second.kind === 'failure') {
      if (second.failure.body.code === 'no_path') return json({ ok: false, code: 'no_path', message: NO_PATH_MESSAGE }, 422);
      return json(second.failure.body, second.failure.status);
    }
    const moved = snapped.distanceM >= 1;
    return finish({
      ok: true,
      mocked: false,
      mode,
      shape,
      ...second.plan,
      snappedStart: moved ? snapped.point : null,
      snapDistanceM: moved ? snapped.distanceM : null,
    });
  } catch {
    console.error('outdoor-route request failed');
    return json({ ok: false, code: 'unavailable', message: UNAVAILABLE_MESSAGE }, 503);
  }
});

type DirectionPlan = NonNullable<ReturnType<typeof parseDirections>>;

async function postDirections(
  key: string,
  mode: NonNullable<ReturnType<typeof readMode>>,
  shape: NonNullable<ReturnType<typeof readShape>>,
  body: Record<string, unknown>,
): Promise<{ kind: 'plan'; plan: DirectionPlan } | { kind: 'failure'; failure: ReturnType<typeof classifyOrsFailure> }> {
  const response = await fetch(directionsUrl(mode), {
    method: 'POST',
    headers: {
      ...orsRequestHeaders(key, 'application/geo+json, application/json'),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    return { kind: 'failure', failure: classifyOrsFailure(response.status, payload) };
  }
  const payload = await response.json().catch(() => null);
  const plan = parseDirections(payload, mode, shape);
  if (!plan) {
    return {
      kind: 'failure',
      failure: { status: 503, body: { ok: false, code: 'unavailable', message: UNAVAILABLE_MESSAGE } },
    };
  }
  return { kind: 'plan', plan };
}

/** One snap, then the route uses that point. This does not count as another request. */
async function snapStart(
  key: string,
  mode: NonNullable<ReturnType<typeof readMode>>,
  start: { latitude: number; longitude: number },
): Promise<
  | { kind: 'point'; point: { latitude: number; longitude: number }; distanceM: number }
  | { kind: 'none' }
  | { kind: 'failure'; failure: ReturnType<typeof classifyOrsFailure> }
> {
  const response = await fetch(snapUrl(mode), {
    method: 'POST',
    headers: {
      ...orsRequestHeaders(key, 'application/geo+json, application/json'),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(buildSnapBody(start)),
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const failure = classifyOrsFailure(response.status, payload);
    if (failure.body.code === 'no_path' || failure.body.code === 'bad_request') return { kind: 'none' };
    return { kind: 'failure', failure };
  }
  const payload = await response.json().catch(() => null);
  const snapped = parseSnap(payload);
  if (!snapped) return { kind: 'none' };
  const distanceM = snapped.distanceM ?? Math.round(haversineM(start, snapped));
  if (distanceM > SNAP_RADIUS_M) return { kind: 'none' };
  return { kind: 'point', point: { latitude: snapped.latitude, longitude: snapped.longitude }, distanceM };
}

/** Writes one row after a successful plan or place list. A refusal, a bad request, or a failed lookup writes nothing. */
async function recordRequest(url: string, userId: string, kind: RequestKind, requestId: string | null, exempt: boolean): Promise<void> {
  const now = Date.now();
  if (seenRequest(userId, requestId, now)) return;
  rememberRequest(userId, requestId, now);
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (serviceKey) {
    try {
      const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
      const inserted = await admin.from('outdoor_route_requests').insert({ user_id: userId, kind });
      if (inserted.error) {
        forgetRequest(userId, requestId);
        return;
      }
    } catch {
      forgetRequest(userId, requestId);
      return;
    }
  }
  memoryCommit(userId, kind, exempt, now);
}

async function requestAllowed(url: string, userId: string, kind: RequestKind, exempt: boolean, requestId: string | null): Promise<boolean> {
  const now = Date.now();
  if (seenRequest(userId, requestId, now)) return true;
  if (!memoryPeek(userId, kind, exempt, now)) return false;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (serviceKey) {
    const table = await tableAllows(url, serviceKey, userId, kind, exempt);
    if (table === false) return false;
  }
  return true;
}

/**
 * True when this kind is still under its cap. False when it is over.
 * Null when the table cannot be read. An exempt account still counts toward the global cap.
 */
async function tableAllows(url: string, serviceKey: string, userId: string, kind: RequestKind, exempt: boolean): Promise<boolean | null> {
  const burst = kind === 'search' ? SEARCH_TEN_MINUTE_CAP : ROUTE_TEN_MINUTE_CAP;
  const daily = kind === 'search' ? SEARCH_DAILY_CAP : ROUTE_DAILY_CAP;
  const globalCap = kind === 'search' ? GLOBAL_SEARCH_DAILY_CAP : GLOBAL_ROUTE_DAILY_CAP;
  try {
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const tenAgo = new Date(Date.now() - 600_000).toISOString();
    const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
    const across = await admin.from('outdoor_route_requests').select('id', { count: 'exact', head: true }).eq('kind', kind).gte('created_at', dayAgo);
    if (across.error) return null;
    if ((across.count ?? 0) >= globalCap) return false;
    if (exempt) return true;
    const ten = await admin.from('outdoor_route_requests').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('kind', kind).gte('created_at', tenAgo);
    if (ten.error) return null;
    if ((ten.count ?? 0) >= burst) return false;
    const day = await admin.from('outdoor_route_requests').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('kind', kind).gte('created_at', dayAgo);
    if (day.error) return null;
    if ((day.count ?? 0) >= daily) return false;
    return true;
  } catch {
    return null;
  }
}
