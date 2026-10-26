import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useState } from 'react';
import { Linking, View, useWindowDimensions } from 'react-native';

import { useRepository } from '@/data';
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
  LAST_ROUTE_FIGURES,
  REDRAWING_THE_ROUTE,
  RELEASE_TO_REDRAW,
  REMOVE_POINT,
  RESET_ADJUST,
  ROUTE_REQUEST_LIMIT_LINE,
  ROUTE_UNCHANGED,
  UNDO_ADJUST,
  VIA_POINT_CAP,
  beginDrag,
  createRedrawScheduler,
  finishDrag,
  lineMidpoint,
  movedFarEnough,
  nearestVia,
  noteRouteRequest,
  readRouteRequests,
  routeRequestsTodayLine,
  viaCountLine,
  withVia,
  withoutVia,
  type DragGesture,
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
  const [guide, setGuide] = useState<OutdoorPoint[]>([]);
  const [original, setOriginal] = useState<RoutePlan | null>(null);
  const [history, setHistory] = useState<{ plan: RoutePlan; vias: OutdoorPoint[] }[]>([]);
  const [requestsToday, setRequestsToday] = useState(0);
  const [redrawing, setRedrawing] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const { width } = useWindowDimensions();
  const narrow = width < 360;
  const [you, setYou] = useState<OutdoorPoint | null>(null);
  const [focus, setFocus] = useState(0);
  const [rough, setRough] = useState(false);
  const hereSelected = startName === 'Where I am' && start != null;
  const nearLine = plan ? nearestPathLine(plan.snapDistanceM) : null;
  const dragRef = useRef<DragGesture | null>(null);
  const acceptedRef = useRef(acceptedVias);
  const shownRef = useRef(shownVias);
  const planRef = useRef(plan);
  acceptedRef.current = acceptedVias;
  shownRef.current = shownVias;
  planRef.current = plan;
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

  function forgetAdjust() {
    setAdjusting(false);
    setAcceptedVias([]);
    setShownVias([]);
    setGuide([]);
    setOriginal(null);
    setHistory([]);
    setSelected(null);
    dragRef.current = null;
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
      setRequestsToday(await noteRouteRequest(phoneRequests));
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
      setError(null);
    } catch (err) {
      setPlan(current.plan);
      setAcceptedVias(current.vias);
      setShownVias(current.vias);
      const message = err instanceof UserFacingError ? err.message : shownError(err, ROUTE_UNAVAILABLE);
      setError(`${message} ${ROUTE_UNCHANGED}`);
    } finally {
      setRedrawing(false);
      setGuide([]);
    }
  };

  function onMapDown(point: OutdoorPoint) {
    dragRef.current = beginDrag(shownRef.current, planRef.current?.points ?? [], point);
    queueRef.current.down();
  }

  function onMapMove(point: OutdoorPoint) {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = { ...drag, current: point };
    setGuide([drag.origin, point]);
  }

  function onMapUp(point: OutdoorPoint) {
    const drag = dragRef.current;
    dragRef.current = null;
    setGuide([]);
    const result = finishDrag(acceptedRef.current, drag ? { ...drag, current: point } : null);
    if (result.send) {
      setSelected(null);
      setShownVias(result.vias);
      setRedrawing(true);
      queueRef.current.lift(result.vias);
      return;
    }
    const parkedIndex = shownRef.current.length > acceptedRef.current.length ? shownRef.current.length - 1 : null;
    const parked = parkedIndex == null ? null : shownRef.current[parkedIndex];
    if (parked && movedFarEnough(parked, point)) {
      const placed = withVia(acceptedRef.current, point, null);
      if (placed) {
        setSelected(null);
        setShownVias(placed);
        setRedrawing(true);
        queueRef.current.lift(placed);
        return;
      }
    }
    setSelected(nearestVia(shownRef.current, point));
  }

  function addPoint() {
    if (shownRef.current.length > acceptedRef.current.length) return;
    if (acceptedRef.current.length >= VIA_POINT_CAP) return;
    const points = planRef.current?.points ?? [];
    const mid = lineMidpoint(points);
    if (!mid) return;
    const next = withVia(acceptedRef.current, mid, null);
    if (!next) return;
    setShownVias(next);
    setSelected(next.length - 1);
    setAdjusting(true);
  }

  function removePoint() {
    if (shownRef.current.length > acceptedRef.current.length) {
      setShownVias(acceptedRef.current);
      setSelected(null);
      return;
    }
    if (selected == null || selected >= acceptedRef.current.length) return;
    const next = withoutVia(acceptedRef.current, selected);
    setSelected(null);
    setShownVias(next);
    setRedrawing(true);
    queueRef.current.lift(next);
  }

  function undoAdjust() {
    setSelected(null);
    if (shownRef.current.length !== acceptedRef.current.length) {
      setShownVias(acceptedRef.current);
      setGuide([]);
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
    setGuide([]);
    setSelected(null);
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
      setRequestsToday(await noteRouteRequest(phoneRequests));
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
      setGuide([]);
      setHistory([]);
      setSelected(null);
      setAdjusting(false);
      setFocus(0);
      if (!craving) {
        const label = next.mode === 'run' ? 'Run' : next.mode === 'cycle' ? 'Cycle' : 'Walk';
        setTitle(next.shape === 'a_to_b' ? `${label} to a place` : `${label} loop`);
      }
    } catch (err) {
      setPlan(null);
      forgetAdjust();
      setError(err instanceof UserFacingError ? err.message : shownError(err, ROUTE_UNAVAILABLE));
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

  const mapsUrl = plan ? appleMapsUrl(plan.points, plan.mode) : null;
  const mapHeight = Math.max(180, narrow ? 220 : 360);
  const canRemove = selected != null || shownVias.length > acceptedVias.length;
  const adjustActions = !craving && adjusting && plan ? (
    <View style={{ gap: 8 }}>
      {guide.length > 0 ? <T>{RELEASE_TO_REDRAW}</T> : null}
      {redrawing ? <T>{REDRAWING_THE_ROUTE}</T> : null}
      {guide.length > 0 || redrawing ? <T>{LAST_ROUTE_FIGURES}</T> : null}
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
          {!craving ? (
            <Button
              label={ADJUST_THE_ROUTE}
              tone={adjusting ? 'primary' : 'quiet'}
              disabled={redrawing}
              onPress={() => setAdjusting((on) => !on)}
            />
          ) : null}
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
              adjust={!craving && adjusting ? {
                enabled: true,
                vias: shownVias,
                guide,
                onDown: onMapDown,
                onMove: onMapMove,
                onUp: onMapUp,
              } : null}
              onShowMyLocation={() => { void showMyLocation(); }}
            />
          </View>
          {!craving && !adjusting ? <T>{routeRequestsTodayLine(requestsToday)}</T> : null}
          {adjustActions}
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
