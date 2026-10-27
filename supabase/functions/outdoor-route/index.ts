import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.3';

import { json, preflight } from '../_shared/http.ts';
import {
  GLOBAL_ROUTE_DAILY_CAP,
  LOOP_ATTEMPT_CAP,
  NO_PATH_MESSAGE,
  ORS_DIRECTIONS_DAILY_BUDGET,
  RATE_LIMITED_MESSAGE,
  SNAP_RADIUS_M,
  UNAVAILABLE_MESSAGE,
  buildDirectionsBody,
  buildSnapBody,
  chooseLoopCandidate,
  classifyOrsFailure,
  cleanPlaceQuery,
  directionsUrl,
  geocodeUrl,
  haversineM,
  loopCandidateReady,
  nextLoopRequest,
  orsRequestHeaders,
  parseDirections,
  parseGeocode,
  parseSnap,
  readMode,
  readPlace,
  readShape,
  readViaPoints,
  routeLengthM,
  snapUrl,
  withinGlobalRouteLimit,
  withinRouteLimit,
} from '../_shared/orsRoute.ts';

const recent = new Map<string, number[]>();
let globalRecent: number[] = [];
let directionStamps: number[] = [];

function takeDirectionsBudget(now = Date.now()): boolean {
  const gate = withinGlobalRouteLimit(directionStamps, now, ORS_DIRECTIONS_DAILY_BUDGET);
  if (!gate.ok) return false;
  directionStamps = gate.next;
  return true;
}

function memoryAllows(userId: string, now = Date.now()): boolean {
  const across = withinGlobalRouteLimit(globalRecent, now);
  if (!across.ok) return false;
  const person = withinRouteLimit(recent.get(userId) ?? [], now);
  if (!person.ok) return false;
  globalRecent = across.next;
  recent.set(userId, person.next);
  return true;
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
  } | null;
  if (!body || (body.action !== 'route' && body.action !== 'search')) {
    return json({ ok: false, code: 'bad_request', message: 'Choose a route or a place.' }, 400);
  }

  const key = Deno.env.get('ORS_API_KEY');
  if (!key) return json({ ok: false, code: 'unavailable', message: UNAVAILABLE_MESSAGE }, 503);

  const allowed = await requestAllowed(url, userId);
  if (!allowed) return json({ ok: false, code: 'rate_limited', message: RATE_LIMITED_MESSAGE }, 429);

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
      return json({ ok: true, places: parseGeocode(payload) });
    }

    const mode = readMode(body.mode);
    const shape = readShape(body.shape);
    const start = readPlace(body.start);
    const end = readPlace(body.end);
    if (!mode || !shape || !start) return json({ ok: false, code: 'bad_request', message: 'Choose a start point.' }, 400);
    if (shape === 'a_to_b' && !end) return json({ ok: false, code: 'bad_request', message: 'Choose a destination.' }, 400);
    const vias = readViaPoints(body.via);
    if (!vias) return json({ ok: false, code: 'bad_request', message: 'Choose up to five points on the route.' }, 400);
    const lengthM = routeLengthM({ mode, distanceM: body.distanceM, minutes: body.minutes });
    if (!lengthM && vias.length === 0) return json({ ok: false, code: 'bad_request', message: 'Choose a distance or a time.' }, 400);
    if (shape === 'loop' && vias.length === 0 && lengthM) {
      const loop = await searchLoop(key, mode, start, lengthM);
      if (loop.kind === 'failure') return json(loop.failure.body, loop.failure.status);
      const moved = loop.hit.snapDistanceM != null && loop.hit.snapDistanceM >= 1;
      return json({
        ok: true,
        mocked: false,
        mode,
        shape,
        ...loop.hit.plan,
        snappedStart: moved ? loop.hit.snappedStart : null,
        snapDistanceM: moved ? loop.hit.snapDistanceM : null,
        loopNote: loop.note,
      });
    }
    const directions = buildDirectionsBody({ mode, shape, start, end, lengthM: lengthM ?? 0, via: vias });
    if (!directions) return json({ ok: false, code: 'bad_request', message: 'Choose a destination.' }, 400);
    const first = await postDirections(key, mode, shape, directions);
    if (first.kind === 'plan') return json({ ok: true, mocked: false, mode, shape, ...first.plan });
    if (first.failure.body.code !== 'no_path') return json(first.failure.body, first.failure.status);
    const snapped = await snapStart(key, mode, start);
    if (snapped.kind === 'failure') return json(snapped.failure.body, snapped.failure.status);
    if (snapped.kind === 'none') return json({ ok: false, code: 'no_path', message: NO_PATH_MESSAGE }, 422);
    const retry = buildDirectionsBody({ mode, shape, start: snapped.point, end, lengthM: lengthM ?? 0, via: vias });
    if (!retry) return json({ ok: false, code: 'no_path', message: NO_PATH_MESSAGE }, 422);
    const second = await postDirections(key, mode, shape, retry);
    if (second.kind === 'failure') {
      if (second.failure.body.code === 'no_path') return json({ ok: false, code: 'no_path', message: NO_PATH_MESSAGE }, 422);
      return json(second.failure.body, second.failure.status);
    }
    const moved = snapped.distanceM >= 1;
    return json({
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

type LoopHit = {
  plan: DirectionPlan;
  snappedStart: { latitude: number; longitude: number } | null;
  snapDistanceM: number | null;
};

/** Several round trips, then the closest clean line. Stops at the attempt cap and the daily budget. */
async function searchLoop(
  key: string,
  mode: NonNullable<ReturnType<typeof readMode>>,
  start: { latitude: number; longitude: number },
  targetM: number,
): Promise<
  | { kind: 'plan'; hit: LoopHit; note: 'distance' | 'retrace' | null }
  | { kind: 'failure'; failure: ReturnType<typeof classifyOrsFailure> }
> {
  let length = targetM;
  let seed = 1;
  let origin = start;
  let carried: { point: { latitude: number; longitude: number }; distanceM: number } | null = null;
  const hits: LoopHit[] = [];
  let failure: ReturnType<typeof classifyOrsFailure> | null = null;
  let calls = 0;
  while (calls < LOOP_ATTEMPT_CAP) {
    const body = buildDirectionsBody({ mode, shape: 'loop', start: origin, lengthM: length, seed });
    if (!body) break;
    calls += 1;
    const result = await postDirections(key, mode, 'loop', body);
    if (result.kind === 'failure') {
      failure = result.failure;
      if (result.failure.body.code === 'no_path' && carried == null && calls < LOOP_ATTEMPT_CAP) {
        const snapped = await snapStart(key, mode, start);
        if (snapped.kind === 'failure') return { kind: 'failure', failure: snapped.failure };
        if (snapped.kind === 'none') {
          return { kind: 'failure', failure: { status: 422, body: { ok: false, code: 'no_path', message: NO_PATH_MESSAGE } } };
        }
        origin = snapped.point;
        carried = snapped;
        continue;
      }
      if (hits.length === 0) return { kind: 'failure', failure: result.failure };
      break;
    }
    hits.push({
      plan: result.plan,
      snappedStart: carried?.point ?? null,
      snapDistanceM: carried?.distanceM ?? null,
    });
    if (loopCandidateReady(targetM, result.plan)) break;
    const next = nextLoopRequest(targetM, result.plan.distanceM, length, seed);
    if (!next) break;
    length = next.lengthM;
    seed = next.seed;
  }
  const chosen = chooseLoopCandidate(targetM, hits.map((hit) => ({
    hit,
    distanceM: hit.plan.distanceM,
    points: hit.plan.points,
  })));
  if (!chosen) {
    return {
      kind: 'failure',
      failure: failure ?? { status: 503, body: { ok: false, code: 'unavailable', message: UNAVAILABLE_MESSAGE } },
    };
  }
  return { kind: 'plan', hit: chosen.choice.hit, note: chosen.note };
}

async function postDirections(
  key: string,
  mode: NonNullable<ReturnType<typeof readMode>>,
  shape: NonNullable<ReturnType<typeof readShape>>,
  body: Record<string, unknown>,
): Promise<{ kind: 'plan'; plan: DirectionPlan } | { kind: 'failure'; failure: ReturnType<typeof classifyOrsFailure> }> {
  if (!takeDirectionsBudget()) {
    return { kind: 'failure', failure: { status: 429, body: { ok: false, code: 'rate_limited', message: RATE_LIMITED_MESSAGE } } };
  }
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

async function requestAllowed(url: string, userId: string): Promise<boolean> {
  const now = Date.now();
  const across = withinGlobalRouteLimit(globalRecent, now);
  const person = withinRouteLimit(recent.get(userId) ?? [], now);
  if (!across.ok || !person.ok) return false;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (serviceKey) {
    const table = await tableAllows(url, serviceKey, userId);
    if (table === false) return false;
  }
  return memoryAllows(userId, now);
}

/** True when the count table accepted the request. False when the person is over the limit. Null when the table is not there yet. */
async function tableAllows(url: string, serviceKey: string, userId: string): Promise<boolean | null> {
  try {
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const tenAgo = new Date(Date.now() - 600_000).toISOString();
    const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
    const across = await admin.from('outdoor_route_requests').select('id', { count: 'exact', head: true }).gte('created_at', dayAgo);
    if (across.error) return null;
    if ((across.count ?? 0) >= GLOBAL_ROUTE_DAILY_CAP) return false;
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
