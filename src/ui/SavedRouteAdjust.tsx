import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';

import { useRepository } from '@/data';
import { shownError } from '@/domain/errors';
import { formatClimb, type RouteMode, type RoutePlan } from '@/domain/findRoute';
import { routeSummary, type OutdoorPoint, type OutdoorRoute } from '@/domain/outdoorRoute';
import {
  ADD_A_POINT,
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
  armPlacement,
  createRedrawScheduler,
  noteRouteRequest,
  readRouteRequests,
  routeRequestsTodayLine,
  tapPoint,
  viaCountLine,
  withoutVia,
  type PointEdit,
} from '@/domain/routeAdjust';
import {
  ADJUST_SENDS,
  CANCEL,
  SAVED_ROUTE_MAP_LABEL,
  adjustPlanInput,
  kindAfterAdjust,
} from '@/domain/savedRoute';
import { LOCATION_FIX_MESSAGE, LOCATION_FIX_PENDING, readWhileUsingFix } from '@/location/whileUsing';
import { FootpathMap } from '@/ui/FootpathMap';
import { RouteConsentCard } from '@/ui/RouteConsentCard';
import { narrowScreen } from '@/ui/SavedRouteCard';
import { useRouteConsent } from '@/ui/useRouteConsent';
import { Button, Card, Choice, ErrorNote, T } from '@/ui/ui';

const phoneRequests = {
  getItem: (key: string) => AsyncStorage.getItem(key),
  setItem: (key: string, value: string) => AsyncStorage.setItem(key, value),
};

/** The saved line, redrawn through points the person adds. Save replaces the same row. */
export function SavedRouteAdjust({ route, onClose }: { route: OutdoorRoute; onClose: () => void }) {
  const repo = useRepository();
  const consent = useRouteConsent();
  const { width } = useWindowDimensions();
  const narrow = narrowScreen(width);
  const mapHeight = narrow ? 180 : 260;
  const [mode, setMode] = useState<RouteMode>('walk');
  const [plan, setPlan] = useState<RoutePlan | null>(null);
  const [acceptedVias, setAcceptedVias] = useState<OutdoorPoint[]>([]);
  const [shownVias, setShownVias] = useState<OutdoorPoint[]>([]);
  const [history, setHistory] = useState<{ plan: RoutePlan | null; vias: OutdoorPoint[] }[]>([]);
  const [requestsToday, setRequestsToday] = useState(0);
  const [redrawing, setRedrawing] = useState(false);
  const [edit, setEdit] = useState<PointEdit>({ kind: 'idle' });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [here, setHere] = useState<OutdoorPoint | null>(null);
  const [focus, setFocus] = useState(0);
  const [locating, setLocating] = useState(false);
  const acceptedRef = useRef(acceptedVias);
  const shownRef = useRef(shownVias);
  const planRef = useRef(plan);
  const modeRef = useRef(mode);
  const routeRef = useRef(route);
  const editRef = useRef(edit);
  acceptedRef.current = acceptedVias;
  shownRef.current = shownVias;
  planRef.current = plan;
  modeRef.current = mode;
  routeRef.current = route;
  editRef.current = edit;
  const sendRef = useRef<(vias: readonly OutdoorPoint[]) => Promise<void>>(async () => undefined);
  const queueRef = useRef(createRedrawScheduler((vias) => sendRef.current(vias)));

  useEffect(() => {
    const queue = queueRef.current;
    void readRouteRequests(phoneRequests).then(setRequestsToday).catch(() => undefined);
    return () => queue.dispose();
  }, []);

  useEffect(() => {
    sendRef.current = async (vias) => {
      if (!consent.allowed || vias.length === 0) {
        setRedrawing(false);
        return;
      }
      const currentRoute = routeRef.current;
      const input = adjustPlanInput(currentRoute, modeRef.current, vias);
      if (!input) {
        setRedrawing(false);
        setError(ROUTE_UNCHANGED);
        return;
      }
      const previous = { plan: planRef.current, vias: acceptedRef.current.map((point) => ({ ...point })) };
      try {
        const count = await noteRouteRequest(phoneRequests);
        setRequestsToday(count);
        const next = await repo.planOutdoorRoute(input);
        setHistory((stack) => [...stack, previous]);
        setPlan(next);
        setAcceptedVias(vias.map((point) => ({ ...point })));
        setShownVias(vias.map((point) => ({ ...point })));
        setError(null);
      } catch {
        setPlan(previous.plan);
        setAcceptedVias(previous.vias);
        setShownVias(previous.vias);
        setError(ROUTE_UNCHANGED);
      } finally {
        setRedrawing(false);
      }
    };
  }, [consent.allowed, repo]);

  function clearEdit() {
    const idle: PointEdit = { kind: 'idle' };
    editRef.current = idle;
    setEdit(idle);
  }

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
    if (!consent.allowed) return;
    if (acceptedRef.current.length >= VIA_POINT_CAP) return;
    const armed = armPlacement(acceptedRef.current.length);
    editRef.current = armed;
    setEdit(armed);
  }

  function removePoint() {
    if (editRef.current.kind !== 'move') return;
    const next = withoutVia(shownRef.current, editRef.current.index);
    clearEdit();
    if (next.length === 0) {
      setPlan(null);
      setAcceptedVias([]);
      setShownVias([]);
      return;
    }
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
    setPlan(null);
    setAcceptedVias([]);
    setShownVias([]);
    setHistory([]);
    clearEdit();
    setError(null);
  }

  function chooseMode(next: RouteMode) {
    setMode(next);
    modeRef.current = next;
    if (acceptedRef.current.length === 0) return;
    setRedrawing(true);
    queueRef.current.lift(acceptedRef.current);
  }

  async function whereIAm() {
    setLocating(true);
    try {
      const fix = await readWhileUsingFix();
      if (!fix.ok) {
        setError(LOCATION_FIX_MESSAGE);
        return;
      }
      setHere(fix.point);
      setFocus((value) => value + 1);
    } finally {
      setLocating(false);
    }
  }

  async function save() {
    if (!plan) return;
    setPending(true);
    setError(null);
    try {
      await repo.replaceOutdoorRoute(route.id, {
        id: route.id,
        title: route.title,
        kind: kindAfterAdjust(plan.points),
        points: plan.points,
        durationMinutes: plan.durationMinutes,
        distanceM: plan.distanceM,
        ascentM: plan.ascentM,
      });
      onClose();
    } catch (err) {
      setError(shownError(err, 'Could not save that route.'));
    } finally {
      setPending(false);
    }
  }

  const shown: OutdoorRoute = plan
    ? {
      ...route,
      kind: kindAfterAdjust(plan.points),
      points: plan.points,
      distanceM: plan.distanceM,
      durationMinutes: plan.durationMinutes,
      ascentM: plan.ascentM,
    }
    : route;
  const canRemove = edit.kind === 'move';

  if (consent.ready && !consent.allowed) {
    return <RouteConsentCard onNotNow={onClose} />;
  }

  return (
    <View style={{ gap: 12 }}>
      <Card>
        <FootpathMap
          routes={[shown]}
          sketch={[]}
          here={here}
          locationFocus={focus}
          locating={locating}
          height={mapHeight}
          mapLabel={SAVED_ROUTE_MAP_LABEL}
          onShowMyLocation={() => { void whereIAm(); }}
          adjust={consent.allowed ? {
            enabled: true,
            vias: shownVias,
            selectedIndex: edit.kind === 'move' ? edit.index : null,
            onTap: onMapTap,
          } : null}
        />
        {locating ? (
          <Button label="Where I am" tone="quiet" pending pendingLabel={LOCATION_FIX_PENDING} onPress={() => {}} />
        ) : (
          <Choice label="Where I am" selected={here != null} onPress={() => { void whereIAm(); }} />
        )}
        <T>{routeSummary(shown)}</T>
        <T>{formatClimb(shown.ascentM ?? null)}</T>
      </Card>
      <Card>
        <T variant="label">How</T>
        <Choice label="Walk" selected={mode === 'walk'} onPress={() => chooseMode('walk')} />
        <Choice label="Run" selected={mode === 'run'} onPress={() => chooseMode('run')} />
        <Choice label="Cycle" selected={mode === 'cycle'} onPress={() => chooseMode('cycle')} />
        <T>{ADJUST_SENDS}</T>
        {redrawing ? <T>{REDRAWING_THE_ROUTE}</T> : null}
        {redrawing ? <T>{LAST_ROUTE_FIGURES}</T> : null}
        <T>{viaCountLine(shownVias.length)}</T>
        <T>{routeRequestsTodayLine(requestsToday)}</T>
        <T variant="muted">{ROUTE_REQUEST_LIMIT_LINE}</T>
        <Button
          label={ADD_A_POINT}
          tone="quiet"
          disabled={shownVias.length >= VIA_POINT_CAP || redrawing || !consent.allowed}
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
        <Button label="Save this route" tone="quiet" disabled={!plan || pending} pending={pending} onPress={() => { void save(); }} />
        <Button label={CANCEL} onPress={onClose} />
      </Card>
      <ErrorNote>{error}</ErrorNote>
    </View>
  );
}
