import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useRepository, useSnapshot } from '@/data';
import { shownError } from '@/domain/errors';
import { SEARCH_EMPTY, SEARCH_FAILED, type RoutePlace } from '@/domain/findRoute';
import { OUTSIDE_SECTION_LABEL } from '@/domain/outsideSection';
import { type OutdoorPoint } from '@/domain/outdoorRoute';
import { createPlaceSearch, holdChosenPlace } from '@/domain/routeAdjust';
import { LOCATION_FIX_MESSAGE, LOCATION_FIX_PENDING, readWhileUsingFix } from '@/location/whileUsing';
import { FootpathMap } from '@/ui/FootpathMap';
import { OutsideFooter } from '@/ui/OutsideFooter';
import { SavedRouteCard } from '@/ui/SavedRouteCard';
import { Button, Card, Choice, ErrorNote, Field, Screen, T } from '@/ui/ui';

export default function OutsideMap() {
  const snap = useSnapshot();
  const repo = useRepository();
  const router = useRouter();
  const [here, setHere] = useState<OutdoorPoint | null>(null);
  const [focus, setFocus] = useState(0);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<RoutePlace[]>([]);
  const [pin, setPin] = useState<RoutePlace | null>(null);
  const [lookAt, setLookAt] = useState<OutdoorPoint | null>(null);
  const [lookFocus, setLookFocus] = useState(0);
  const [searched, setSearched] = useState(false);
  const routes = snap.outdoorRoutes ?? [];
  const queryRef = useRef('');
  const searchRef = useRef<() => void>(() => undefined);
  const placeSearchRef = useRef(createPlaceSearch(() => searchRef.current()));

  useEffect(() => {
    const places = placeSearchRef.current;
    return () => places.dispose();
  }, []);

  async function whereIAm() {
    setError(null);
    setLocating(true);
    try {
      const fix = await readWhileUsingFix();
      if (!fix.ok) {
        setError(LOCATION_FIX_MESSAGE);
        return;
      }
      setHere(fix.point);
      setFocus((value) => value + 1);
      setError(null);
    } finally {
      setLocating(false);
    }
  }

  async function search() {
    const asked = queryRef.current.trim();
    if (asked.length < 2) {
      setResults([]);
      setSearched(false);
      return;
    }
    setError(null);
    try {
      const found = await repo.searchRoutePlaces(asked);
      if (queryRef.current.trim() !== asked) return;
      setResults(found);
      setSearched(true);
    } catch (err) {
      setSearched(false);
      setError(shownError(err, SEARCH_FAILED));
    }
  }
  searchRef.current = () => { void search(); };

  function onSearchText(value: string) {
    setQuery(value);
    queryRef.current = value;
    if (value.trim().length < 2) {
      setResults([]);
      setSearched(false);
    }
    placeSearchRef.current.type(value);
  }

  function choose(place: RoutePlace) {
    setPin(place);
    setLookAt(place);
    setLookFocus((value) => value + 1);
    setResults([]);
    setQuery(place.name);
    queryRef.current = place.name;
  }

  function usePlace(role: 'start' | 'end') {
    if (!pin) return;
    holdChosenPlace(role, pin);
    router.push('/find-route' as never);
  }

  return (
    <Screen eyebrow={OUTSIDE_SECTION_LABEL} title="Saved routes" intro="Footpaths from OpenStreetMap. A saved line stays on your account.">
      <Card>
        <FootpathMap
          routes={routes}
          sketch={[]}
          pin={pin}
          here={here}
          lookAt={lookAt}
          lookFocus={lookFocus}
          locationFocus={focus}
          locating={locating}
          onShowMyLocation={() => { void whereIAm(); }}
        />
        <Field label="Search for a place" value={query} onChangeText={onSearchText} maxLength={80} />
        {results.map((place) => (
          <Choice
            key={place.id}
            label={place.name}
            selected={pin?.id === place.id}
            selectOnPressIn
            onPress={() => choose(place)}
          />
        ))}
        {searched && results.length === 0 ? <T>{SEARCH_EMPTY}</T> : null}
        {pin ? (
          <>
            <Choice label="Start here" selected={false} onPress={() => usePlace('start')} />
            <Choice label="Go here" selected={false} onPress={() => usePlace('end')} />
          </>
        ) : null}
        {locating ? (
          <Button label="Where I am" tone="quiet" pending pendingLabel={LOCATION_FIX_PENDING} onPress={() => {}} />
        ) : (
          <Choice label="Where I am" selected={here != null} onPress={() => { void whereIAm(); }} />
        )}
        <T variant="muted">Where I am stays on this page. It does not ask the route service for a line.</T>
      </Card>
      <ErrorNote>{error}</ErrorNote>
      {routes.map((route) => <SavedRouteCard key={route.id} route={route} />)}
      <OutsideFooter kind="full" />
    </Screen>
  );
}
