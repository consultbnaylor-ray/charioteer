import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { useRepository, useSnapshot } from '@/data';
import { shownError } from '@/domain/errors';
import { SEARCH_EMPTY, SEARCH_FAILED, type RoutePlace } from '@/domain/findRoute';
import { OUTSIDE_SECTION_LABEL } from '@/domain/outsideSection';
import { type OutdoorPoint } from '@/domain/outdoorRoute';
import { DRAW_ROUTE, createPlaceSearch, holdChosenPlace } from '@/domain/routeAdjust';
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
  const [picked, setPicked] = useState<RoutePlace | null>(null);
  const [lookAt, setLookAt] = useState<OutdoorPoint | null>(null);
  const [lookFocus, setLookFocus] = useState(0);
  const [searching, setSearching] = useState(false);
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
    setSearching(true);
    try {
      const found = await repo.searchRoutePlaces(asked);
      if (queryRef.current.trim() !== asked) return;
      setResults(found);
      setSearched(true);
    } catch (err) {
      setSearched(false);
      setError(shownError(err, SEARCH_FAILED));
    } finally {
      setSearching(false);
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
    setPicked(place);
    setLookAt(place);
    setLookFocus((value) => value + 1);
    setResults([]);
  }

  function usePlace(role: 'start' | 'end') {
    if (!picked) return;
    holdChosenPlace(role, picked);
    router.push('/find-route' as never);
  }

  return (
    <Screen eyebrow={OUTSIDE_SECTION_LABEL} title="Saved routes" intro="Footpaths from OpenStreetMap. A saved line stays on your account.">
      <Card>
        <View style={{ position: 'relative' }}>
          <FootpathMap
            routes={routes}
            sketch={[]}
            here={here}
            lookAt={lookAt}
            lookFocus={lookFocus}
            locationFocus={focus}
            locating={locating}
            onShowMyLocation={() => { void whereIAm(); }}
          />
          <View style={{ position: 'absolute', left: 8, right: 8, bottom: 60, zIndex: 6 }}>
            <Field label="Search for a place" value={query} onChangeText={onSearchText} maxLength={80} />
          </View>
        </View>
        <Button
          label="Search"
          tone="quiet"
          disabled={query.trim().length < 2 || searching || locating}
          pending={searching}
          onPress={() => {
            placeSearchRef.current.now();
            void search();
          }}
        />
        {results.map((place) => (
          <Choice
            key={place.id}
            label={place.name}
            selected={picked?.id === place.id}
            selectOnPressIn
            onPress={() => choose(place)}
          />
        ))}
        {searched && results.length === 0 ? <T>{SEARCH_EMPTY}</T> : null}
        <Button label="Set as start" tone="quiet" disabled={!picked || searching} onPress={() => usePlace('start')} />
        <Button label="Set as destination" tone="quiet" disabled={!picked || searching} onPress={() => usePlace('end')} />
        <Button label={DRAW_ROUTE} tone="quiet" onPress={() => router.push('/find-route?draw=1' as never)} />
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
