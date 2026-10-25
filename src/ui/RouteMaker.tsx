import { useState } from 'react';
import { Linking } from 'react-native';

import { useRepository } from '@/data';
import { shownError } from '@/domain/errors';
import {
  APPLE_MAPS_NOTE,
  HIKE_PROFILE_NOTE,
  ROUTE_MOCK_LINE,
  STARTER_NOTE,
  STARTER_PLACES,
  appleMapsUrl,
  formatClimb,
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
import { LOCATION_FIX_MESSAGE, LOCATION_FIX_PENDING, readWhileUsingFix } from '@/location/whileUsing';
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
  const hereSelected = startName === 'Where I am' && start != null;

  function pickStart(place: RoutePlace) {
    setStart(place);
    setStartName(place.name);
    setPlan(null);
  }

  function pickEnd(place: RoutePlace) {
    setEnd(place);
    setEndName(place.name);
    setPlan(null);
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
      setPlan(null);
      setError(null);
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
      if (!craving) {
        const label = next.mode === 'run' ? 'Run' : next.mode === 'cycle' ? 'Cycle' : 'Walk';
        setTitle(next.shape === 'a_to_b' ? `${label} to a place` : `${label} loop`);
      }
    } catch (err) {
      setPlan(null);
      setError(shownError(err, 'The route service is not available right now. Nothing was saved.'));
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
          {plan.mocked ? <T>{ROUTE_MOCK_LINE}</T> : null}
          {plan.mode === 'run' ? <T variant="muted">{HIKE_PROFILE_NOTE}</T> : null}
          <FootpathMap routes={[]} sketch={plan.points} here={plan.points[0] ?? null} />
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
