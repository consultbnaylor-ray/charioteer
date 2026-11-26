import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, Switch, View, useWindowDimensions } from 'react-native';

import { holdMadeRoute } from '@/activity/madeRouteGuide';
import { currentLive } from '@/activity/oneSession';
import { useRepository } from '@/data';
import { OTHER_SESSION_LINE, startLabel, type ActivityKind } from '@/domain/activitySession';
import { SHOW_IN_APP_OUTING } from '@/domain/outsideSection';
import { randomId } from '@/domain/id';
import { UserFacingError, shownError } from '@/domain/errors';
import {
  APPLE_MAPS_NOTE,
  DISTANCE_WINS_NOTE,
  HIKE_PROFILE_NOTE,
  DRAW_TOO_SHORT,
  ROUTE_DISTANCE_CHOICES,
  ROUTE_MOCK_LINE,
  ROUTE_TIME_CHOICES,
  ROUTE_UNAVAILABLE,
  BOTH_HERE_HINT,
  SEARCH_EMPTY,
  placeSearchEmptyShown,
  appleMapsUrl,
  nearestPathLine,
  routeAskFromChoices,
  routeDistanceFieldHint,
  routeKind,
  routeMinutesFieldHint,
  type RouteDistanceChoice,
  type RouteDistanceUnit,
  type RouteMode,
  type RoutePlace,
  type RoutePlan,
  type RouteShape,
  type RouteTimeChoice,
} from '@/domain/findRoute';
import {
  buildDrawSnapRequests,
  clearDrawStrokes,
  combineDrawStrokes,
  commitDrawStroke,
  drawGapLines,
  drawReadyToSnap,
  rawStrokeLines,
  snappedDrawLine,
  undoDrawStroke,
} from '@/domain/drawStroke';
import { intentRoundNote, snapDrawnIntent } from '@/domain/drawIntent';
import {
  pathMetres,
  sketchDistanceLabel,
  sketchIsClosed,
  type OutdoorPoint,
} from '@/domain/outdoorRoute';
import {
  ADD_A_POINT,
  ADJUST_THE_ROUTE,
  DRAW_NO_PATH,
  DRAW_PEN_HINT,
  DRAW_SNAP_FAILED,
  DRAW_SNAP_STRAYED,
  DRAW_SNAP_LIMIT,
  DRAW_SNAP_TRY_AGAIN,
  DRAW_SNAPPED,
  logDrawSnapFailure,
  PLACE_SEARCH_MIN_CHARS,
  PREFER_PATHS_LABEL,
  PREFER_PATHS_NOTE,
  adjustControlsOn,
  armPlacement,
  countsPhoneRouteRequest,
  createPlaceSearch,
  snapLimitMessage,
  createRedrawScheduler,
  placeQueryKey,
  placeSearchOnce,
  LAST_ROUTE_FIGURES,
  noteRouteRequest,
  readRouteRequests,
  REDRAWING_THE_ROUTE,
  REMOVE_POINT,
  RESET_ADJUST,
  ROUTE_REQUEST_LIMIT_LINE,
  ROUTE_UNCHANGED,
  routeRequestsTodayLine,
  takeChosenPlace,
  TAP_TO_MOVE,
  TAP_TO_PLACE,
  UNDO_ADJUST,
  VIA_POINT_CAP,
  tapPoint,
  viaCountLine,
  withoutVia,
  type PointEdit,
} from '@/domain/routeAdjust';
import {
  PLANNER_DISTANCE,
  PLANNER_MODE,
  PLANNER_SHAPE,
  PLANNER_TIME,
  PLANNER_TITLE,
  RESET_MAP,
  plannerNeedsReset,
} from '@/domain/routeReset';
import { loadDistanceUnit } from '@/health/distanceUnit';
import { LOCATION_FIX_MESSAGE, LOCATION_FIX_PENDING, ROUGH_FIX_LINE, readWhileUsingFix } from '@/location/whileUsing';
import { FootpathMap } from '@/ui/FootpathMap';
import { RouteSnapSummary } from '@/ui/RouteSnapSummary';
import { dismissKeyboard } from '@/ui/keyboard';
import { usePreferPaths } from '@/ui/preferPaths';
import { RouteChoiceGroup } from '@/ui/RouteChoiceGroup';
import { statsToneColors } from '@/ui/statsPalette';
import { useAppTheme } from '@/ui/theme';
import { Button, Card, Choice, ErrorNote, Field, T } from '@/ui/ui';

const CRAVING_MINUTES = [10, 15, 20] as const;

/** The typed custom distance and time stay for this visit, including after leaving the screen. */
const customSession = { distance: '', minutes: '' };

const phoneRequests = {
  getItem: (key: string) => AsyncStorage.getItem(key),
  setItem: (key: string, value: string) => AsyncStorage.setItem(key, value),
};

export function RouteMaker({ purpose }: { purpose: 'find' | 'craving' }) {
  const repo = useRepository();
  const router = useRouter();
  const drawFlag = useLocalSearchParams<{ draw?: string | string[] }>().draw;
  const openDraw = (Array.isArray(drawFlag) ? drawFlag[0] : drawFlag) === '1';
  const craving = purpose === 'craving';
  const theme = useAppTheme();
  const [preferPaths, setPreferPaths] = usePreferPaths();
  const [mode, setMode] = useState<RouteMode>('walk');
  const [modeTouched, setModeTouched] = useState(false);
  const [shape, setShape] = useState<RouteShape>('loop');
  const [shapeTouched, setShapeTouched] = useState(false);
  const [distanceId, setDistanceId] = useState<RouteDistanceChoice>('5');
  const [timeId, setTimeId] = useState<RouteTimeChoice>('none');
  const [customDistance, setCustomDistance] = useState(customSession.distance);
  const [customMinutes, setCustomMinutes] = useState(customSession.minutes);
  const [unit, setUnit] = useState<RouteDistanceUnit>('km');
  const [minutes, setMinutes] = useState<(typeof CRAVING_MINUTES)[number]>(15);
  const [start, setStart] = useState<OutdoorPoint | null>(null);
  const [startName, setStartName] = useState('');
  const [end, setEnd] = useState<OutdoorPoint | null>(null);
  const [endName, setEndName] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<RoutePlace[]>([]);
  const [pin, setPin] = useState<RoutePlace | null>(null);
  const [pathsNote, setPathsNote] = useState(false);
  const [drawNote, setDrawNote] = useState<string | null>(null);
  const [snapMiss, setSnapMiss] = useState<string | null>(null);
  const [plan, setPlan] = useState<RoutePlan | null>(null);
  const [title, setTitle] = useState(craving ? 'Craving walk' : 'My route');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [locatingRole, setLocatingRole] = useState<null | 'start' | 'end' | 'map'>(null);
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
  const [drawing, setDrawing] = useState(false);
  const [pencil, setPencil] = useState<OutdoorPoint[]>([]);
  const [strokes, setStrokes] = useState<OutdoorPoint[][]>([]);
  const [snappedCount, setSnappedCount] = useState(0);
  const [drawStack, setDrawStack] = useState<{ plan: RoutePlan | null; snappedCount: number; keptStrokes: number }[]>([]);
  const [fromDraw, setFromDraw] = useState(false);
  const [lookAt, setLookAt] = useState<OutdoorPoint | null>(null);
  const [lookFocus, setLookFocus] = useState(0);
  const [homeTick, setHomeTick] = useState(0);
  const [optionsKey, setOptionsKey] = useState(0);
  const [searched, setSearched] = useState(false);
  const [startPick, setStartPick] = useState<RoutePlace | null>(null);
  const [endQuery, setEndQuery] = useState('');
  const [endResults, setEndResults] = useState<RoutePlace[]>([]);
  const [endSearched, setEndSearched] = useState(false);
  const [endPick, setEndPick] = useState<RoutePlace | null>(null);
  const locating = locatingRole != null;
  const hereSelected = startName === 'Where I am' && start != null;
  const endHereSelected = endName === 'Where I am' && end != null;
  const nearLine = plan ? nearestPathLine(plan.snapDistanceM) : null;
  const acceptedRef = useRef(acceptedVias);
  const shownRef = useRef(shownVias);
  const planRef = useRef(plan);
  const editRef = useRef(edit);
  acceptedRef.current = acceptedVias;
  shownRef.current = shownVias;
  planRef.current = plan;
  editRef.current = edit;
  const strokesRef = useRef(strokes);
  const pencilRef = useRef(pencil);
  const snappedCountRef = useRef(snappedCount);
  const drawGen = useRef(0);
  const epoch = useRef(0);
  strokesRef.current = strokes;
  pencilRef.current = pencil;
  snappedCountRef.current = snappedCount;
  const sendRef = useRef<(vias: readonly OutdoorPoint[]) => Promise<void>>(async () => undefined);
  const routeFlight = useRef(false);
  const queueRef = useRef(createRedrawScheduler((vias) => sendRef.current(vias)));
  const queryRef = useRef(query);
  const searchRef = useRef<() => void>(() => undefined);
  const placeSearchRef = useRef(createPlaceSearch(() => searchRef.current()));
  const endQueryRef = useRef(endQuery);
  const endSearchRef = useRef<() => void>(() => undefined);
  const endPlaceSearchRef = useRef(createPlaceSearch(() => endSearchRef.current()));
  const preferRef = useRef(preferPaths);
  queryRef.current = query;
  endQueryRef.current = endQuery;
  preferRef.current = preferPaths;

  useEffect(() => {
    const queue = queueRef.current;
    const places = placeSearchRef.current;
    const endPlaces = endPlaceSearchRef.current;
    void readRouteRequests(phoneRequests).then(setRequestsToday).catch(() => undefined);
    void loadDistanceUnit().then(setUnit).catch(() => undefined);
    const chosen = takeChosenPlace();
    if (chosen?.role === 'end') {
      setEnd(chosen.place);
      setEndName(chosen.place.name);
      setEndPick(chosen.place);
      setShape('a_to_b');
      setShapeTouched(true);
      setPin(chosen.place);
      setLookAt(chosen.place);
      setLookFocus(1);
    } else if (chosen) {
      setStart(chosen.place);
      setStartName(chosen.place.name);
      setStartPick(chosen.place);
      setPin(chosen.place);
      setLookAt(chosen.place);
      setLookFocus(1);
    }
    if (!craving && openDraw) setDrawing(true);
    return () => {
      queue.dispose();
      places.dispose();
      endPlaces.dispose();
    };
  }, []);

  function askedRoute(): { ok: true; distanceM: number | null; minutes: number | null } | { ok: false; message: string } {
    if (craving) return { ok: true, distanceM: null, minutes };
    return routeAskFromChoices({
      mode,
      distanceChoice: distanceId,
      timeChoice: timeId,
      customDistance,
      customMinutes,
      unit,
    });
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
    const generation = epoch.current;
    const currentPlan = planRef.current;
    const here = start;
    if (routeFlight.current || !currentPlan || !here) {
      setRedrawing(false);
      return;
    }
    const current = { plan: currentPlan, vias: acceptedRef.current };
    const asked = askedRoute();
    if (!asked.ok) {
      setRedrawing(false);
      setError(asked.message);
      return;
    }
    routeFlight.current = true;
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
        preferPaths: preferRef.current,
      });
      if (epoch.current !== generation) return;
      setHistory((stack) => [...stack, current].slice(-8));
      setPlan(next);
      setAcceptedVias([...vias]);
      setShownVias([...vias]);
      setRequestsToday(await noteRouteRequest(phoneRequests));
      setError(null);
    } catch (err) {
      if (epoch.current !== generation) return;
      setPlan(current.plan);
      setAcceptedVias(current.vias);
      setShownVias(current.vias);
      const message = err instanceof UserFacingError ? err.message : shownError(err, ROUTE_UNAVAILABLE);
      if (countsPhoneRouteRequest(message)) setRequestsToday(await noteRouteRequest(phoneRequests));
      setError(`${message} ${ROUTE_UNCHANGED}`);
    } finally {
      if (epoch.current === generation) {
        routeFlight.current = false;
        setRedrawing(false);
      }
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

  function choosePlace(place: RoutePlace) {
    setStart(place);
    setStartName(place.name);
    setStartPick(place);
    setRough(false);
    setPin(place);
    setLookAt(place);
    setLookFocus((value) => value + 1);
    setResults([]);
    setSearched(false);
    setQuery(place.name);
    queryRef.current = place.name;
    setPlan(null);
    forgetAdjust();
    dismissKeyboard();
  }

  function onSearchText(value: string) {
    setQuery(value);
    queryRef.current = value;
    if (value.trim().length < PLACE_SEARCH_MIN_CHARS) {
      setResults([]);
      setSearched(false);
    }
    placeSearchRef.current.type(value);
  }

  function chooseEndPlace(place: RoutePlace) {
    setEnd(place);
    setEndName(place.name);
    setEndPick(place);
    setPin(place);
    setLookAt(place);
    setLookFocus((value) => value + 1);
    setEndResults([]);
    setEndSearched(false);
    setEndQuery(place.name);
    endQueryRef.current = place.name;
    setPlan(null);
    forgetAdjust();
    dismissKeyboard();
  }

  function onEndSearchText(value: string) {
    setEndQuery(value);
    endQueryRef.current = value;
    if (value.trim().length < PLACE_SEARCH_MIN_CHARS) {
      setEndResults([]);
      setEndSearched(false);
    }
    endPlaceSearchRef.current.type(value);
  }

  async function whereIAm(role: 'start' | 'end') {
    const generation = epoch.current;
    setError(null);
    setLocatingRole(role);
    try {
      const fix = await readWhileUsingFix();
      if (epoch.current !== generation) return;
      if (!fix.ok) {
        setError(LOCATION_FIX_MESSAGE);
        return;
      }
      if (role === 'end') {
        setEnd(fix.point);
        setEndName('Where I am');
        setEndPick(null);
        setEndQuery('');
        endQueryRef.current = '';
        setEndResults([]);
        setEndSearched(false);
      } else {
        setStart(fix.point);
        setStartName('Where I am');
        setStartPick(null);
        setQuery('');
        queryRef.current = '';
        setResults([]);
        setSearched(false);
      }
      setYou(fix.point);
      setRough(fix.approximate);
      setPlan(null);
      forgetAdjust();
      setFocus(0);
      setError(null);
    } finally {
      if (epoch.current === generation) setLocatingRole(null);
    }
  }

  async function showMyLocation() {
    setError(null);
    setLocatingRole('map');
    try {
      const fix = await readWhileUsingFix();
      if (!fix.ok) {
        setError(LOCATION_FIX_MESSAGE);
        return;
      }
      setYou(fix.point);
      setFocus((value) => value + 1);
    } finally {
      setLocatingRole(null);
    }
  }

  async function search(role: 'start' | 'end' = 'start') {
    const current = role === 'end' ? endQueryRef : queryRef;
    const query = current.current.trim();
    if (query.length < PLACE_SEARCH_MIN_CHARS) {
      if (role === 'end') {
        setEndResults([]);
        setEndSearched(false);
      } else {
        setResults([]);
        setSearched(false);
      }
      return;
    }
    setError(null);
    try {
      const found = await placeSearchOnce(query, () => repo.searchRoutePlaces(query));
      if (placeQueryKey(current.current) !== placeQueryKey(query)) return;
      if (role === 'end') {
        setEndResults(found);
        setEndSearched(true);
      } else {
        setResults(found);
        setSearched(true);
      }
    } catch (err) {
      if (role === 'end') endPlaceSearchRef.current.missed();
      else placeSearchRef.current.missed();
      if (role === 'end') setEndSearched(false);
      else setSearched(false);
      setError(shownError(err, 'The place search did not answer.'));
    }
  }
  searchRef.current = () => { void search('start'); };
  endSearchRef.current = () => { void search('end'); };

  async function make() {
    if (routeFlight.current) return;
    setError(null);
    setSaved(false);
    if (!start) {
      setError('Choose a start point.');
      return;
    }
    const asked = askedRoute();
    if (!asked.ok) {
      setError(asked.message);
      return;
    }
    if (shape === 'a_to_b' && !end) {
      setError('Choose a destination.');
      return;
    }
    const generation = epoch.current;
    routeFlight.current = true;
    drawGen.current += 1;
    setPending(true);
    try {
      const next = await repo.planOutdoorRoute({
        mode: craving ? 'walk' : mode,
        shape: craving ? 'loop' : shape,
        start,
        end: !craving && shape === 'a_to_b' ? end : null,
        distanceM: asked.distanceM,
        minutes: asked.minutes,
        preferPaths,
      });
      if (epoch.current !== generation) return;
      const empty = clearDrawStrokes();
      strokesRef.current = empty;
      setStrokes(empty);
      snappedCountRef.current = 0;
      setSnappedCount(0);
      setDrawStack([]);
      setPencil([]);
      setDrawing(false);
      setPlan(next);
      setFromDraw(false);
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
      if (epoch.current !== generation) return;
      setPlan(null);
      forgetAdjust();
      const message = err instanceof UserFacingError ? err.message : shownError(err, ROUTE_UNAVAILABLE);
      if (countsPhoneRouteRequest(message)) setRequestsToday(await noteRouteRequest(phoneRequests));
      setError(message);
    } finally {
      if (epoch.current === generation) {
        routeFlight.current = false;
        setPending(false);
      }
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

  function holdStroke(points: OutdoorPoint[]) {
    if (points.length === 0) {
      setPencil([]);
      return;
    }
    const nextStrokes = commitDrawStroke(strokesRef.current, points);
    if (nextStrokes.length === strokesRef.current.length) {
      setDrawNote(DRAW_TOO_SHORT);
      setError(DRAW_TOO_SHORT);
      setPencil([]);
      return;
    }
    strokesRef.current = nextStrokes;
    setStrokes(nextStrokes);
    setPencil([]);
    setDrawNote(null);
    setSnapMiss(null);
    setError(null);
  }

  async function snapDrawn(): Promise<boolean> {
    if (routeFlight.current) return false;
    const nextStrokes = strokesRef.current;
    const previous = planRef.current;
    const previousCount = snappedCountRef.current;
    const generation = drawGen.current + 1;
    drawGen.current = generation;
    setFromDraw(true);
    const anchor = startName === 'Where I am' ? start : null;
    const combined = combineDrawStrokes(nextStrokes);
    const drawnShape = sketchIsClosed(combined) ? 'loop' : 'a_to_b';
    const preview = buildDrawSnapRequests(nextStrokes, anchor, drawnShape === 'loop');
    if (preview.limit) {
      const line = previous ? `${DRAW_SNAP_LIMIT} ${ROUTE_UNCHANGED}` : DRAW_SNAP_LIMIT;
      setSnapMiss(line);
      setDrawNote(DRAW_SNAP_FAILED);
      setError(line);
      return false;
    }
    if (preview.requests.length === 0) {
      setDrawNote(DRAW_TOO_SHORT);
      setError(DRAW_TOO_SHORT);
      setSnapMiss(null);
      return false;
    }
    const origin = anchor ?? combined[0];
    const finish = combined[combined.length - 1];
    if (!origin || !finish) {
      setDrawNote(DRAW_TOO_SHORT);
      setError(DRAW_TOO_SHORT);
      setSnapMiss(null);
      return false;
    }
    const drawMode = craving ? 'walk' : mode;
    routeFlight.current = true;
    setPending(true);
    setError(null);
    const requestId = randomId();
    try {
      // The drawing becomes a few intent points, and the route service finds the real way
      // between them in one call (two when the first strays far). A river or a field in the
      // drawing is routed round, over the nearest bridge or path, not refused.
      const result = await snapDrawnIntent({
        strokes: nextStrokes,
        anchor,
        closeLoop: drawnShape === 'loop',
        send: (waypoints) => repo.planOutdoorRoute({
          mode: drawMode,
          shape: craving ? 'loop' : drawnShape,
          start: waypoints[0] ?? origin,
          end: waypoints[waypoints.length - 1] ?? finish,
          distanceM: null,
          minutes: null,
          via: [],
          sketch: [...waypoints],
          preferPaths: preferRef.current,
          requestId,
          intent: true,
        }),
      });
      if (drawGen.current !== generation) return false;
      if (!result.ok) {
        if (result.limit) {
          const line = previous ? `${DRAW_SNAP_LIMIT} ${ROUTE_UNCHANGED}` : DRAW_SNAP_LIMIT;
          setSnapMiss(line);
          setDrawNote(DRAW_SNAP_FAILED);
          setError(line);
          return false;
        }
        throw result.error instanceof Error ? result.error : new Error(DRAW_NO_PATH);
      }
      const next = result.plan;
      if (next.points.length < 2) {
        setDrawNote(DRAW_NO_PATH);
        setError(DRAW_NO_PATH);
        setSnapMiss(null);
        return false;
      }
      setSnapMiss(null);
      setPlan(next);
      planRef.current = next;
      setDrawStack((stack) => [...stack, { plan: previous, snappedCount: previousCount, keptStrokes: previousCount }].slice(-8));
      setSnappedCount(nextStrokes.length);
      snappedCountRef.current = nextStrokes.length;
      setOriginal(next);
      const snapNote = result.fit === 'close'
        ? DRAW_SNAPPED
        : result.fit === 'near'
          ? DRAW_SNAP_STRAYED
          : intentRoundNote(result.drawnM, result.routeM);
      setDrawNote(snapNote);
      setError(null);
      setAcceptedVias([]);
      setShownVias([]);
      setHistory([]);
      clearEdit();
      setAdjusting(false);
      setStart(origin);
      setStartName('Sketched line');
      setStartPick(null);
      setQuery('');
      queryRef.current = '';
      setResults([]);
      if (!craving && drawnShape === 'a_to_b') {
        setShape('a_to_b');
        setShapeTouched(true);
        setEnd(finish);
        setEndName('Sketched end');
        setEndPick(null);
      }
      setRequestsToday(await noteRouteRequest(phoneRequests));
      return true;
    } catch (err) {
      if (drawGen.current !== generation) return false;
      logDrawSnapFailure(err);
      const message = err instanceof UserFacingError ? err.message : shownError(err, ROUTE_UNAVAILABLE);
      const shown = snapLimitMessage(message) ?? message;
      const line = previous ? `${shown} ${ROUTE_UNCHANGED}` : shown;
      setSnapMiss(line);
      setDrawNote(DRAW_SNAP_FAILED);
      setError(line);
      return false;
    } finally {
      if (drawGen.current === generation) {
        routeFlight.current = false;
        setPending(false);
      }
    }
  }

  function undoDraw() {
    if (pencilRef.current.length > 0) {
      setPencil([]);
      setDrawNote(null);
      setSnapMiss(null);
      setError(null);
      return;
    }
    if (strokesRef.current.length > snappedCountRef.current) {
      const next = undoDrawStroke(strokesRef.current);
      strokesRef.current = next;
      setStrokes(next);
      setDrawNote(null);
      setSnapMiss(null);
      setError(null);
      return;
    }
    drawGen.current += 1;
    setPending(false);
    setDrawStack((stack) => {
      const previous = stack[stack.length - 1];
      if (!previous) {
        const next = undoDrawStroke(strokesRef.current);
        strokesRef.current = next;
        setStrokes(next);
        return stack;
      }
      const next = strokesRef.current.slice(0, previous.keptStrokes);
      strokesRef.current = next;
      setStrokes(next);
      setPlan(previous.plan);
      planRef.current = previous.plan;
      setFromDraw(previous.plan != null);
      setSnappedCount(previous.snappedCount);
      snappedCountRef.current = previous.snappedCount;
      setPencil([]);
      setDrawNote(null);
      setSnapMiss(null);
      setError(null);
      return stack.slice(0, -1);
    });
  }

  function clearDraw() {
    drawGen.current += 1;
    setPending(false);
    setPencil([]);
    const empty = clearDrawStrokes();
    strokesRef.current = empty;
    setStrokes(empty);
    snappedCountRef.current = 0;
    setSnappedCount(0);
    setDrawStack([]);
    setDrawNote(null);
    setSnapMiss(null);
    if (fromDraw) {
      setPlan(null);
      planRef.current = null;
      setFromDraw(false);
      forgetAdjust();
    }
  }

  function toggleDraw() {
    setDrawing((on) => {
      if (!on) setAdjusting(false);
      return !on;
    });
  }

  async function confirmDraw() {
    if (pencilRef.current.length > 0) holdStroke(pencilRef.current);
    if (!drawReadyToSnap(strokesRef.current, [])) {
      setDrawNote(DRAW_TOO_SHORT);
      setError(DRAW_TOO_SHORT);
      setSnapMiss(null);
      return;
    }
    const snapped = await snapDrawn();
    if (snapped) setDrawing(false);
  }

  const mapHeight = Math.max(180, narrow ? 220 : 360);
  const snappedLine = snappedDrawLine(plan?.points ?? null, strokes, snappedCount);
  const strokeLines = rawStrokeLines(strokes, snappedCount, pencil);
  const gaps = drawGapLines(strokes, plan?.points ?? null, snappedCount, pencil);
  const drawnMetres = strokeLines.reduce((sum, line) => sum + pathMetres(line), 0);
  const sketchLabel = sketchDistanceLabel(drawnMetres);
  function snapFigures() {
    if (snapMiss) {
      return (
        <View accessibilityLabel={`${DRAW_SNAP_FAILED}. ${snapMiss}`} style={{ gap: 8, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.danger }}>
          <T style={{ color: theme.colors.danger, fontFamily: theme.font.bodyStrong }}>{snapMiss}</T>
          <Button label={DRAW_SNAP_TRY_AGAIN} disabled={pending} pending={pending} onPress={() => { void confirmDraw(); }} />
        </View>
      );
    }
    if (fromDraw && plan) return <RouteSnapSummary plan={plan} />;
    return null;
  }
  const snapPanel = snapFigures();
  const drawBar = sketchLabel || snapPanel ? (
    <View style={{ gap: 8 }}>
      {sketchLabel ? <T>{sketchLabel}</T> : null}
      {snapFigures()}
    </View>
  ) : null;
  const howChoice = mode === 'run' ? 'Run' : mode === 'cycle' ? 'Cycle' : 'Walk';
  const shapeChoice = shape === 'a_to_b' ? 'A to B' : 'Loop';

  function chooseMode(next: RouteMode) {
    setMode(next);
    setModeTouched(true);
  }

  function chooseShape(next: RouteShape) {
    setShape(next);
    setShapeTouched(true);
  }
  const distanceChoice = ROUTE_DISTANCE_CHOICES.find((item) => item.id === distanceId)?.label ?? '5 km';
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
      <RouteSnapSummary plan={plan} />
      {adjustActions}
    </View>
  ) : null;
  const needsReset = plannerNeedsReset({
    modeTouched,
    shapeTouched,
    distanceId,
    timeId,
    customDistance,
    customMinutes,
    start,
    startName,
    end,
    endName,
    query,
    endQuery,
    searchOpen: searched || endSearched || results.length > 0 || endResults.length > 0,
    drawing,
    pencil: pencil.length,
    strokes: strokes.length,
    snapped: snappedCount,
    fromDraw,
    plan: plan != null,
    adjusting,
    vias: shownVias.length + acceptedVias.length,
    history: history.length,
    drawNote: drawNote != null,
    snapMiss: snapMiss != null,
    saved,
    title,
    error: error != null,
    editing: edit.kind !== 'idle',
    pin: pin != null || lookAt != null,
    rough,
  });

  function resetMap() {
    if (!needsReset) return;
    epoch.current += 1;
    drawGen.current += 1;
    routeFlight.current = false;
    planRef.current = null;
    const empty = clearDrawStrokes();
    strokesRef.current = empty;
    pencilRef.current = [];
    snappedCountRef.current = 0;
    queryRef.current = '';
    endQueryRef.current = '';
    placeSearchRef.current.type('');
    endPlaceSearchRef.current.type('');
    customSession.distance = '';
    customSession.minutes = '';
    setMode(PLANNER_MODE);
    setModeTouched(false);
    setShape(PLANNER_SHAPE);
    setShapeTouched(false);
    setDistanceId(PLANNER_DISTANCE);
    setTimeId(PLANNER_TIME);
    setCustomDistance('');
    setCustomMinutes('');
    setStart(null);
    setStartName('');
    setEnd(null);
    setEndName('');
    setQuery('');
    setResults([]);
    setPin(null);
    setDrawNote(null);
    setSnapMiss(null);
    setPlan(null);
    setTitle(craving ? 'Craving walk' : PLANNER_TITLE);
    setError(null);
    setPending(false);
    setLocatingRole(null);
    setSaved(false);
    forgetAdjust();
    setRedrawing(false);
    setPencil([]);
    setStrokes(empty);
    setSnappedCount(0);
    setDrawStack([]);
    setFromDraw(false);
    setDrawing(false);
    setLookAt(null);
    setSearched(false);
    setStartPick(null);
    setEndQuery('');
    setEndResults([]);
    setEndSearched(false);
    setEndPick(null);
    setRough(false);
    setFocus(0);
    setHomeTick((value) => value + 1);
    setOptionsKey((value) => value + 1);
  }

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
            <RouteChoiceGroup
              key={optionsKey}
              title={modeTouched ? 'How' : 'How (optional)'}
              choice={modeTouched ? howChoice : 'Walk / Run / Cycle'}
            >
              <Choice label="Walk" selected={modeTouched && mode === 'walk'} onPress={() => chooseMode('walk')} />
              <Choice label="Run" selected={modeTouched && mode === 'run'} onPress={() => chooseMode('run')} />
              <Choice label="Cycle" selected={modeTouched && mode === 'cycle'} onPress={() => chooseMode('cycle')} />
              {modeTouched && mode === 'run' ? <T variant="muted">{HIKE_PROFILE_NOTE}</T> : null}
            </RouteChoiceGroup>
            <RouteChoiceGroup
              key={`${optionsKey}-shape`}
              title={shapeTouched ? 'Shape' : 'Shape (optional)'}
              choice={shapeTouched ? shapeChoice : 'Loop or A to B'}
            >
              <Choice label="Loop" selected={shapeTouched && shape === 'loop'} onPress={() => chooseShape('loop')} />
              <Choice label="A to B" selected={shapeTouched && shape === 'a_to_b'} onPress={() => chooseShape('a_to_b')} />
            </RouteChoiceGroup>
            <RouteChoiceGroup key={`${optionsKey}-distance`} title="Distance (optional)" choice={distanceChoice}>
              {ROUTE_DISTANCE_CHOICES.map((item) => (
                <Choice key={item.id} label={item.label} selected={distanceId === item.id} onPress={() => setDistanceId(item.id)} />
              ))}
              {distanceId === 'custom' ? (
                <Field
                  label={unit === 'mile' ? 'Distance (miles)' : 'Distance (km)'}
                  value={customDistance}
                  onChangeText={(value) => {
                    customSession.distance = value;
                    setCustomDistance(value);
                  }}
                  keyboardType="decimal-pad"
                  placeholder={unit === 'mile' ? '3.1' : '6.5'}
                  hint={routeDistanceFieldHint(unit)}
                  maxLength={8}
                />
              ) : null}
              <T variant="muted">{DISTANCE_WINS_NOTE}</T>
              <T variant="label">Time</T>
              {ROUTE_TIME_CHOICES.map((item) => (
                <Choice key={item.id} label={item.label} selected={timeId === item.id} onPress={() => setTimeId(item.id)} />
              ))}
              {timeId === 'custom' ? (
                <Field
                  label="Time (minutes)"
                  value={customMinutes}
                  onChangeText={(value) => {
                    customSession.minutes = value;
                    setCustomMinutes(value);
                  }}
                  keyboardType="number-pad"
                  placeholder="75"
                  hint={routeMinutesFieldHint()}
                  maxLength={4}
                />
              ) : null}
            </RouteChoiceGroup>
          </>
        )}
        {!craving ? (
          <T style={{ color: statsToneColors(theme.scheme).good.ink, fontFamily: theme.font.bodyStrong }}>
            {DRAW_PEN_HINT}
          </T>
        ) : null}
        {/* Start, destination and the paths switch sit between the drawing hint and the map. */}
        <T variant="label">Start</T>
        {locatingRole === 'start' ? (
          <Button label="Where I am" tone="quiet" pending pendingLabel={LOCATION_FIX_PENDING} onPress={() => {}} />
        ) : (
          <Choice label="Where I am" selected={hereSelected} onPress={() => { void whereIAm('start'); }} />
        )}
        <T variant="muted">or</T>
        <Field label="Search for a place" value={query} onChangeText={onSearchText} maxLength={80} />
        {startName && !hereSelected ? (
          <Choice key={startPick?.id ?? 'chosen-start'} label={startName} selected onPress={() => undefined} />
        ) : null}
        {results.map((place) => (
          <Choice
            key={`found-${place.id}`}
            label={place.name}
            selected={pin?.id === place.id}
            selectOnPressIn
            onPress={() => choosePlace(place)}
          />
        ))}
        {placeSearchEmptyShown(searched, results.length, query, startPick?.name) ? <T>{SEARCH_EMPTY}</T> : null}
        {rough && hereSelected ? <T>{ROUGH_FIX_LINE}</T> : null}
        {!craving && shapeTouched && shape === 'a_to_b' ? (
          <>
            <T variant="label">Destination</T>
            {locatingRole === 'end' ? (
              <Button label="Where I am" tone="quiet" pending pendingLabel={LOCATION_FIX_PENDING} onPress={() => {}} />
            ) : (
              <Choice label="Where I am" selected={endHereSelected} onPress={() => { void whereIAm('end'); }} />
            )}
            <T variant="muted">or</T>
            <Field label="Search for a destination" value={endQuery} onChangeText={onEndSearchText} maxLength={80} />
            {endName && !endHereSelected ? (
              <Choice key={endPick?.id ?? 'chosen-end'} label={endName} selected onPress={() => undefined} />
            ) : null}
            {endResults.map((place) => (
              <Choice
                key={`end-found-${place.id}`}
                label={place.name}
                selected={endPick?.id === place.id}
                selectOnPressIn
                onPress={() => chooseEndPlace(place)}
              />
            ))}
            {placeSearchEmptyShown(endSearched, endResults.length, endQuery, endPick?.name) ? <T>{SEARCH_EMPTY}</T> : null}
            {hereSelected && endHereSelected ? <T variant="muted">{BOTH_HERE_HINT}</T> : null}
          </>
        ) : null}
        {!craving ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <T style={{ flex: 1 }}>{PREFER_PATHS_LABEL}</T>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="What this means"
                accessibilityState={{ expanded: pathsNote }}
                onPress={() => setPathsNote((open) => !open)}
                style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
              >
                <T>i</T>
              </Pressable>
              <Switch
                accessibilityLabel={PREFER_PATHS_LABEL}
                value={preferPaths}
                onValueChange={setPreferPaths}
                trackColor={{ true: theme.colors.ink, false: theme.colors.line }}
                thumbColor={theme.colors.surface}
              />
            </View>
            {pathsNote ? <T variant="muted">{PREFER_PATHS_NOTE}</T> : null}
          </>
        ) : null}
        {sketchLabel ? <T>{sketchLabel}</T> : null}
        <FootpathMap
          routes={[]}
          sketch={snappedLine}
          pencilLines={strokeLines}
          gaps={gaps}
          pin={pin}
          here={you}
          startPoint={plan?.snappedStart ?? plan?.points[0] ?? start}
          locationFocus={focus}
          lookAt={lookAt}
          lookFocus={lookFocus}
          homeTick={homeTick}
          locating={locating}
          follow={drawing ? false : undefined}
          height={Math.max(180, narrow ? 220 : 280)}
          draw={drawing ? {
            enabled: true,
            onChange: (points) => {
              // The pencil is the finger path. The location dot is not copied on. Snapping waits for the green tick.
              setPencil(points);
            },
            onEnd: (points) => { holdStroke(points); },
          } : null}
          onToggleDraw={craving ? undefined : toggleDraw}
          onUndoDraw={undoDraw}
          onClearDraw={clearDraw}
          onConfirmDraw={craving ? undefined : () => { void confirmDraw(); }}
          canUndoDraw={pencil.length > 0 || strokes.length > 0 || drawStack.length > 0}
          canClearDraw={pencil.length > 0 || strokes.length > 0 || fromDraw}
          canConfirmDraw={drawReadyToSnap(strokes, pencil)}
          confirmPending={pending}
          bar={drawBar}
          statusNote={snapMiss ? DRAW_SNAP_FAILED : drawing ? null : drawNote}
          onShowMyLocation={() => { void showMyLocation(); }}
        />
        {snapPanel}
        {drawNote && drawNote !== DRAW_SNAP_FAILED ? (
          <T style={drawNote === DRAW_SNAPPED ? { color: statsToneColors(theme.scheme).good.ink, fontFamily: theme.font.bodyStrong } : undefined}>
            {drawNote}
          </T>
        ) : null}
        <Button
          label={craving ? 'Make this walk' : 'Make the route'}
          disabled={pending || locating}
          pending={pending}
          onPress={() => { void make(); }}
        />
        {!craving ? (
          <Button
            label={RESET_MAP}
            tone="quiet"
            disabled={!needsReset}
            onPress={resetMap}
          />
        ) : null}
      </Card>
      {plan ? (
        <Card>
          <T variant="title">{craving ? 'Craving walk' : title}</T>
          <RouteSnapSummary plan={plan} />
          {nearLine ? <T>{nearLine}</T> : null}
          {rough && hereSelected ? <T>{ROUGH_FIX_LINE}</T> : null}
          {plan.mocked ? <T>{ROUTE_MOCK_LINE}</T> : null}
          {plan.mode === 'run' ? <T variant="muted">{HIKE_PROFILE_NOTE}</T> : null}
          {SHOW_IN_APP_OUTING && !craving && plan.points.length >= 2 ? (
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
                setDrawing(false);
                setAdjusting((on) => !on);
              }}
            />
          ) : null}
          {adjustActions}
          <View accessibilityLabel="Route line">
            <FootpathMap
              routes={[]}
              sketch={snappedLine}
              pencilLines={strokeLines}
              gaps={gaps}
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
          {saved ? <T>Saved on your account. You can delete it from Map a Route.</T> : null}
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
