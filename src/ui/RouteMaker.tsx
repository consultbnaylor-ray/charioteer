import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Linking, View, useWindowDimensions } from 'react-native';

import { holdMadeRoute } from '@/activity/madeRouteGuide';
import { currentLive } from '@/activity/oneSession';
import { useRepository } from '@/data';
import { OTHER_SESSION_LINE, startLabel, type ActivityKind } from '@/domain/activitySession';
import { UserFacingError, shownError } from '@/domain/errors';
import {
  APPLE_MAPS_NOTE,
  HIKE_PROFILE_NOTE,
  ROUTE_MOCK_LINE,
  ROUTE_UNAVAILABLE,
  STARTER_NOTE,
  STARTER_PLACES,
  appleMapsUrl,
  formatClimb,
  nearestPathLine,
  routeKind,
  type RouteMode,
  type RoutePlace,
  type RoutePlan,
  type RouteShape,
} from '@/domain/findRoute';
import {
  routeSummary,
  type OutdoorPoint,
} from '@/domain/outdoorRoute';
import {
  ADD_A_POINT,
  ADJUST_THE_ROUTE,
  adjustControlsOn,
  armPlacement,
  countsPhoneRouteRequest,
  LAST_ROUTE_FIGURES,
  REDRAWING_THE_ROUTE,
  REMOVE_POINT,
  RESET_ADJUST,
  ROUTE_REQUEST_LIMIT_LINE,
  ROUTE_UNCHANGED,
  TAP_TO_MOVE,
  TAP_TO_PLACE,
  UNDO_ADJUST,
  VIA_POINT_CAP,
  createRedrawScheduler,
  noteRouteRequest,
  readRouteRequests,
  routeRequestsTodayLine,
  tapPoint,
  viaCountLine,
  withoutVia,
  type PointEdit,
} from '@/domain/routeAdjust';
import { LOCATION_FIX_MESSAGE, LOCATION_FIX_PENDING, ROUGH_FIX_LINE, readWhileUsingFix } from '@/location/whileUsing';
import { FootpathMap } from '@/ui/FootpathMap';
import { Button, Card, Choice, ErrorNote, Field, T } from '@/ui/ui';

const DISTANCES = [
  { id: '3', label: '3 km', metres: 3000 },
  { id: '5', label: '5 km', metres: 5000 },
  { id: '8', label: '8 km', metres: 8000 },
  { id: 'time', label: 'Use time', metres: null },
] as const;

const TIMES = [
  { id: 'none', label: 'No set time', minutes: null },
  { id: '30', label: '30 min', minutes: 30 },
  { id: '45', label: '45 min', minutes: 45 },
  { id: '60', label: '60 min', minutes: 60 },
] as const;

const CRAVING_MINUTES = [10, 15, 20] as const;

const phoneRequests = {
  getItem: (key: string) => AsyncStorage.getItem(key),
  setItem: (key: string, value: string) => AsyncStorage.setItem(key, value),
};

export function RouteMaker({ purpose }: { purpose: 'find' | 'craving' }) {
  const repo = useRepository();
  const router = useRouter();
  const craving = purpose === 'craving';
  const [mode, setMode] = useState<RouteMode>('walk');
  const [shape, setShape] = useState<RouteShape>('loop');
  const [distanceId, setDistanceId] = useState<(typeof DISTANCES)[number]['id']>('5');
  const [timeId, setTimeId] = useState<(typeof TIMES)[number]['id']>('none');
  const [minutes, setMinutes] = useState<(typeof CRAVING_MINUTES)[number]>(15);
  const [start, setStart] = useState<OutdoorPoint | null>(null);
  const [startName, setStartName] = useState('');
  const [end, setEnd] = useState<OutdoorPoint | null>(null);
  const [endName, setEndName] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<RoutePlace[]>([]);
  const [picking, setPicking] = useState<'start' | 'end'>('start');
  const [plan, setPlan] = useState<RoutePlan | null>(null);
  const [title, setTitle] = useState(craving ? 'Craving walk' : 'My route');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [locating, setLocating] = useState(false);
  const [saved, setSaved] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [acceptedVias, setAcceptedVias] = useState<OutdoorPoint[]>([]);
  const [shownVias, setShownVias] = useState<OutdoorPoint[]>([]);
  const [original, setOriginal] = useState<RoutePlan | null>(null);
  const [history, setHistory] = useState<{ plan: RoutePlan; vias: OutdoorPoint[] }[]>([]);
  const [requestsToday, setRequestsToday] = useState(0);
  const [redrawing, setRedrawing] = useState(false);
  const [edit, setEdit] = useState<PointEdit>({ kind: 'idle' });
  const { width } = useWindowDimensions();
  const narrow = width < 360;
  const [you, setYou] = useState<OutdoorPoint | null>(null);
  const [focus, setFocus] = useState(0);
  const [rough, setRough] = useState(false);
  const hereSelected = startName === 'Where I am' && start != null;
  const nearLine = plan ? nearestPathLine(plan.snapDistanceM) : null;
  const acceptedRef = useRef(acceptedVias);
  const shownRef = useRef(shownVias);
  const planRef = useRef(plan);
  const editRef = useRef(edit);
  acceptedRef.current = acceptedVias;
  shownRef.current = shownVias;
  planRef.current = plan;
  editRef.current = edit;
  const sendRef = useRef<(vias: readonly OutdoorPoint[]) => Promise<void>>(async () => undefined);
  const queueRef = useRef(createRedrawScheduler((vias) => sendRef.current(vias)));

  useEffect(() => {
    const queue = queueRef.current;
    void readRouteRequests(phoneRequests).then(setRequestsToday).catch(() => undefined);
    return () => queue.dispose();
  }, []);

  function askedRoute(): { distanceM: number | null; minutes: number | null } {
    const distance = DISTANCES.find((item) => item.id === distanceId)?.metres ?? null;
    const timed = TIMES.find((item) => item.id === timeId)?.minutes ?? null;
    return {
      distanceM: craving ? null : distance,
      minutes: craving ? minutes : timed,
    };
  }

  function clearEdit() {
    const idle: PointEdit = { kind: 'idle' };
    editRef.current = idle;
    setEdit(idle);
  }

  function forgetAdjust() {
    setAdjusting(false);
    setAcceptedVias([]);
    setShownVias([]);
    setOriginal(null);
    setHistory([]);
    clearEdit();
  }

  sendRef.current = async (vias) => {
    const currentPlan = planRef.current;
    const here = start;
    if (!currentPlan || !here) {
      setRedrawing(false);
      return;
    }
    const current = { plan: currentPlan, vias: acceptedRef.current };
    const asked = askedRoute();
    const through = vias.length > 0;
    setRedrawing(true);
    try {
      const next = await repo.planOutdoorRoute({
        mode: craving ? 'walk' : mode,
        shape: craving ? 'loop' : shape,
        start: here,
        end: !craving && shape === 'a_to_b' ? end : null,
        distanceM: through ? null : asked.distanceM,
        minutes: through ? null : asked.minutes,
        via: [...vias],
      });
      setHistory((stack) => [...stack, current].slice(-8));
      setPlan(next);
      setAcceptedVias([...vias]);
      setShownVias([...vias]);
      setRequestsToday(await noteRouteRequest(phoneRequests));
      setError(null);
    } catch (err) {
      setPlan(current.plan);
      setAcceptedVias(current.vias);
      setShownVias(current.vias);
      const message = err instanceof UserFacingError ? err.message : shownError(err, ROUTE_UNAVAILABLE);
      if (countsPhoneRouteRequest(message)) setRequestsToday(await noteRouteRequest(phoneRequests));
      setError(`${message} ${ROUTE_UNCHANGED}`);
    } finally {
      setRedrawing(false);
    }
  };

  function onMapTap(point: OutdoorPoint) {
    const result = tapPoint({ edit: editRef.current, vias: shownRef.current, point });
    editRef.current = result.edit;
    setEdit(result.edit);
    if (!result.send) return;
    setShownVias(result.vias);
    setRedrawing(true);
    queueRef.current.lift(result.vias);
  }

  function addPoint() {
    if (acceptedRef.current.length >= VIA_POINT_CAP) return;
    const armed = armPlacement(acceptedRef.current.length);
    editRef.current = armed;
    setEdit(armed);
    setAdjusting(true);
  }

  function removePoint() {
    if (editRef.current.kind !== 'move') return;
    const index = editRef.current.index;
    if (index >= acceptedRef.current.length) return;
    const next = withoutVia(acceptedRef.current, index);
    clearEdit();
    setShownVias(next);
    setRedrawing(true);
    queueRef.current.lift(next);
  }

  function undoAdjust() {
    clearEdit();
    if (shownRef.current.length !== acceptedRef.current.length) {
      setShownVias(acceptedRef.current);
      return;
    }
    setHistory((stack) => {
      const previous = stack[stack.length - 1];
      if (!previous) return stack;
      setPlan(previous.plan);
      setAcceptedVias(previous.vias);
      setShownVias(previous.vias);
      return stack.slice(0, -1);
    });
  }

  function resetAdjust() {
    if (!original) return;
    setPlan(original);
    setAcceptedVias([]);
    setShownVias([]);
    setHistory([]);
    clearEdit();
  }

  function pickStart(place: RoutePlace) {
    setStart(place);
    setStartName(place.name);
    setRough(false);
    setPlan(null);
    forgetAdjust();
  }

  function pickEnd(place: RoutePlace) {
    setEnd(place);
    setEndName(place.name);
    setPlan(null);
    forgetAdjust();
  }

  function pickResult(place: RoutePlace) {
    if (picking === 'end') pickEnd(place);
    else pickStart(place);
  }

  async function whereIAm() {
    setError(null);
    setLocating(true);
    try {
      const fix = await readWhileUsingFix();
      if (!fix.ok) {
        setError(LOCATION_FIX_MESSAGE);
        return;
      }
      setStart(fix.point);
      setStartName('Where I am');
      setYou(fix.point);
      setRough(fix.approximate);
      setPlan(null);
      forgetAdjust();
      setFocus(0);
      setError(null);
    } finally {
      setLocating(false);
    }
  }

  async function showMyLocation() {
    setError(null);
    setLocating(true);
    try {
      const fix = await readWhileUsingFix();
      if (!fix.ok) {
        setError(LOCATION_FIX_MESSAGE);
        return;
      }
      setYou(fix.point);
      setFocus((value) => value + 1);
    } finally {
      setLocating(false);
    }
  }

  async function search() {
    setError(null);
    setPending(true);
    try {
      setResults(await repo.searchRoutePlaces(query));
    } catch (err) {
      setError(shownError(err, 'The place search did not answer.'));
    } finally {
      setPending(false);
    }
  }

  async function make() {
    setError(null);
    setSaved(false);
    if (!start) {
      setError('Choose a start point.');
      return;
    }
    const distance = DISTANCES.find((item) => item.id === distanceId)?.metres ?? null;
    const timed = TIMES.find((item) => item.id === timeId)?.minutes ?? null;
    const askedMinutes = craving ? minutes : distance == null ? timed : timed;
    const askedDistance = craving ? null : distance;
    if (!craving && askedDistance == null && askedMinutes == null) {
      setError('Choose a distance or a time.');
      return;
    }
    if (shape === 'a_to_b' && !end) {
      setError('Choose a destination.');
      return;
    }
    setPending(true);
    try {
      const next = await repo.planOutdoorRoute({
        mode: craving ? 'walk' : mode,
        shape: craving ? 'loop' : shape,
        start,
        end: !craving && shape === 'a_to_b' ? end : null,
        distanceM: askedDistance,
        minutes: askedMinutes,
      });
      setPlan(next);
      setOriginal(next);
      setAcceptedVias([]);
      setShownVias([]);
      setHistory([]);
      clearEdit();
      setAdjusting(false);
      setFocus(0);
      if (!craving) {
        const label = next.mode === 'run' ? 'Run' : next.mode === 'cycle' ? 'Cycle' : 'Walk';
        setTitle(next.shape === 'a_to_b' ? `${label} to a place` : `${label} loop`);
      }
      setRequestsToday(await noteRouteRequest(phoneRequests));
    } catch (err) {
      setPlan(null);
      forgetAdjust();
      const message = err instanceof UserFacingError ? err.message : shownError(err, ROUTE_UNAVAILABLE);
      if (countsPhoneRouteRequest(message)) setRequestsToday(await noteRouteRequest(phoneRequests));
      setError(message);
    } finally {
      setPending(false);
    }
  }

  async function save() {
    if (!plan) return;
    setError(null);
    setPending(true);
    try {
      await repo.saveOutdoorRoute({
        title,
        kind: routeKind(plan.shape, craving),
        points: plan.points,
        durationMinutes: plan.durationMinutes,
        distanceM: plan.distanceM,
        ascentM: plan.ascentM,
      });
      setSaved(true);
    } catch (err) {
      setError(shownError(err, 'Could not save that route.'));
    } finally {
      setPending(false);
    }
  }

  function beginOuting(kind: ActivityKind) {
    const line = planRef.current;
    if (!line || line.points.length < 2) return;
    if (currentLive()) {
      setError(OTHER_SESSION_LINE);
      return;
    }
    holdMadeRoute({ title: title.trim() || 'My route', kind, points: line.points });
    router.push(`/activity?kind=${kind}&made=${Date.now()}` as never);
  }

  const mapsUrl = plan ? appleMapsUrl(plan.points, plan.mode) : null;
  const mapHeight = Math.max(180, narrow ? 220 : 360);
  const canRemove = edit.kind === 'move';
  const showAdjust = adjustControlsOn({ craving, adjusting, hasPlan: plan != null });
  const adjustActions = showAdjust ? (
    <View style={{ gap: 8 }}>
      {redrawing ? <T>{REDRAWING_THE_ROUTE}</T> : null}
      {redrawing ? <T>{LAST_ROUTE_FIGURES}</T> : null}
      <T>{viaCountLine(shownVias.length)}</T>
      {shownVias.map((_, index) => (
        <T key={`point-${index}`} accessibilityLabel={`Via point ${index + 1} of ${VIA_POINT_CAP}`}>{`Point ${index + 1}`}</T>
      ))}
      <T>{routeRequestsTodayLine(requestsToday)}</T>
      <T variant="muted">{ROUTE_REQUEST_LIMIT_LINE}</T>
      <Button
        label={ADD_A_POINT}
        tone="quiet"
        disabled={shownVias.length >= VIA_POINT_CAP || redrawing}
        onPress={addPoint}
      />
      {edit.kind === 'place' ? <T>{TAP_TO_PLACE}</T> : null}
      {edit.kind === 'move' ? <T>{TAP_TO_MOVE}</T> : null}
      <View style={narrow ? { gap: 8 } : { flexDirection: 'row', gap: 8 }}>
        <View style={narrow ? undefined : { flex: 1 }}>
          <Button label={UNDO_ADJUST} tone="quiet" disabled={history.length === 0 && shownVias.length === acceptedVias.length} onPress={undoAdjust} />
        </View>
        <View style={narrow ? undefined : { flex: 1 }}>
          <Button label={RESET_ADJUST} tone="quiet" disabled={history.length === 0 && acceptedVias.length === 0 && shownVias.length === 0} onPress={resetAdjust} />
        </View>
      </View>
      <Button label={REMOVE_POINT} tone="quiet" disabled={!canRemove || redrawing} onPress={removePoint} />
    </View>
  ) : null;
  const fullScreenBar = adjustActions && plan ? (
    <View style={{ gap: 8 }}>
      <T>{routeSummary({ distanceM: plan.distanceM, durationMinutes: plan.durationMinutes })}</T>
      <T>{formatClimb(plan.ascentM)}</T>
      {adjustActions}
    </View>
  ) : null;

  return (
    <>
      <Card>
        {craving ? (
          <>
            <T variant="label">How long</T>
            {CRAVING_MINUTES.map((value) => (
              <Choice key={value} label={`${value} minutes`} selected={minutes === value} onPress={() => setMinutes(value)} />
            ))}
          </>
        ) : (
          <>
            <T variant="label">How</T>
            <Choice label="Walk" selected={mode === 'walk'} onPress={() => setMode('walk')} />
            <Choice label="Run" selected={mode === 'run'} onPress={() => setMode('run')} />
            <Choice label="Cycle" selected={mode === 'cycle'} onPress={() => setMode('cycle')} />
            {mode === 'run' ? <T variant="muted">{HIKE_PROFILE_NOTE}</T> : null}
            <T variant="label">Shape</T>
            <Choice label="Loop" selected={shape === 'loop'} onPress={() => setShape('loop')} />
            <Choice label="A to B" selected={shape === 'a_to_b'} onPress={() => setShape('a_to_b')} />
            <T variant="label">Distance</T>
            {DISTANCES.map((item) => (
              <Choice key={item.id} label={item.label} selected={distanceId === item.id} onPress={() => setDistanceId(item.id)} />
            ))}
            <T variant="muted">When both are set, the distance is used.</T>
            <T variant="label">Time</T>
            {TIMES.map((item) => (
              <Choice key={item.id} label={item.label} selected={timeId === item.id} onPress={() => setTimeId(item.id)} />
            ))}
          </>
        )}
        <T variant="label">Start</T>
        <T variant="muted">{STARTER_NOTE}</T>
        <T>{startName ? `Start: ${startName}` : 'No start yet.'}</T>
        {STARTER_PLACES.map((place) => (
          <Choice key={place.id} label={place.name} selected={startName === place.name} onPress={() => pickStart(place)} />
        ))}
        {locating ? (
          <Button label="Where I am" tone="quiet" pending pendingLabel={LOCATION_FIX_PENDING} onPress={() => {}} />
        ) : (
          <Choice label="Where I am" selected={hereSelected} onPress={() => { void whereIAm(); }} />
        )}
        {rough && hereSelected ? <T>{ROUGH_FIX_LINE}</T> : null}
        {!craving && shape === 'a_to_b' ? (
          <>
            <T variant="label">Destination</T>
            <T>{endName ? `Destination: ${endName}` : 'No destination yet.'}</T>
            {STARTER_PLACES.map((place) => (
              <Choice key={`end-${place.id}`} label={place.name} selected={endName === place.name} onPress={() => pickEnd(place)} />
            ))}
          </>
        ) : null}
        <Field label="Search for a place" value={query} onChangeText={setQuery} maxLength={80} />
        {!craving && shape === 'a_to_b' ? (
          <>
            <Choice label="Search sets the start" selected={picking === 'start'} onPress={() => setPicking('start')} />
            <Choice label="Search sets the destination" selected={picking === 'end'} onPress={() => setPicking('end')} />
          </>
        ) : null}
        <Button label="Search" tone="quiet" disabled={query.trim().length < 2 || pending || locating} pending={pending} onPress={() => { void search(); }} />
        {results.map((place) => (
          <Choice key={`found-${place.id}`} label={place.name} selected={false} onPress={() => pickResult(place)} />
        ))}
        <Button
          label={craving ? 'Make this walk' : 'Make the route'}
          disabled={pending || locating}
          pending={pending}
          onPress={() => { void make(); }}
        />
      </Card>
      {plan ? (
        <Card>
          <T variant="title">{craving ? 'Craving walk' : title}</T>
          <T>{routeSummary({ distanceM: plan.distanceM, durationMinutes: plan.durationMinutes })}</T>
          <T>{formatClimb(plan.ascentM)}</T>
          {nearLine ? <T>{nearLine}</T> : null}
          {rough && hereSelected ? <T>{ROUGH_FIX_LINE}</T> : null}
          {plan.mocked ? <T>{ROUTE_MOCK_LINE}</T> : null}
          {plan.mode === 'run' ? <T variant="muted">{HIKE_PROFILE_NOTE}</T> : null}
          {!craving && plan.points.length >= 2 ? (
            <>
              <Button label={startLabel('walk')} tone="quiet" onPress={() => beginOuting('walk')} />
              <Button label={startLabel('run')} tone="quiet" onPress={() => beginOuting('run')} />
              <Button label={startLabel('cycle')} tone="quiet" onPress={() => beginOuting('cycle')} />
            </>
          ) : null}
          {!craving ? (
            <Button
              label={ADJUST_THE_ROUTE}
              tone={adjusting ? 'primary' : 'quiet'}
              disabled={redrawing}
              onPress={() => {
                if (adjusting) clearEdit();
                setAdjusting((on) => !on);
              }}
            />
          ) : null}
          {adjustActions}
          <View accessibilityLabel="Route line">
            <FootpathMap
              routes={[]}
              sketch={plan.points}
              here={you}
              startPoint={plan.snappedStart ?? plan.points[0] ?? null}
              locationFocus={focus}
              locating={locating}
              height={mapHeight}
              bar={fullScreenBar}
              adjust={showAdjust ? {
                enabled: true,
                vias: shownVias,
                selectedIndex: edit.kind === 'move' ? edit.index : null,
                onTap: onMapTap,
              } : null}
              onShowMyLocation={() => { void showMyLocation(); }}
            />
          </View>
          {!craving && !adjusting ? <T>{routeRequestsTodayLine(requestsToday)}</T> : null}
          <Field label="Route name" value={title} onChangeText={setTitle} maxLength={80} />
          <Button label="Save this route" tone="quiet" disabled={pending || title.trim().length === 0} pending={pending} onPress={() => { void save(); }} />
          {saved ? <T>Saved on your account. You can delete it from Outside is Good.</T> : null}
          {mapsUrl ? (
            <Button label="Open in Apple Maps" tone="quiet" onPress={() => { void Linking.openURL(mapsUrl); }} />
          ) : null}
          <T variant="muted">{APPLE_MAPS_NOTE}</T>
        </Card>
      ) : null}
      <ErrorNote>{error}</ErrorNote>
    </>
  );
}
