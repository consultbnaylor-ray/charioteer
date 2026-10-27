import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useWindowDimensions } from 'react-native';

import { currentLive } from '@/activity/oneSession';
import { useRepository, useSnapshot } from '@/data';
import { OTHER_SESSION_LINE, startLabel, type ActivityKind } from '@/domain/activitySession';
import { shownError } from '@/domain/errors';
import { formatClimb } from '@/domain/findRoute';
import { routeKindLabel, routeSummary, type OutdoorPoint } from '@/domain/outdoorRoute';
import { OUTSIDE_SECTION_LABEL } from '@/domain/outsideSection';
import {
  ADJUST_THIS_ROUTE,
  SAVED_ROUTE_MAP_LABEL,
  canAdjustSavedRoute,
} from '@/domain/savedRoute';
import { LOCATION_FIX_MESSAGE, LOCATION_FIX_PENDING, readWhileUsingFix } from '@/location/whileUsing';
import { FootpathMap } from '@/ui/FootpathMap';
import { OutingInProgressBanner } from '@/ui/OutingInProgressBanner';
import { SavedRouteAdjust } from '@/ui/SavedRouteAdjust';
import { DeleteRouteConfirm, RenameRouteFields, narrowScreen } from '@/ui/SavedRouteCard';
import { Button, Card, Choice, ErrorNote, Screen, T } from '@/ui/ui';

function one(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw ?? '';
}

export default function SavedRouteScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = one(params.id);
  const snap = useSnapshot();
  const repo = useRepository();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const narrow = narrowScreen(width);
  const mapHeight = narrow ? 180 : 260;
  const route = (snap.outdoorRoutes ?? []).find((item) => item.id === id) ?? null;
  const storedTitle = route?.title ?? '';
  const [draft, setDraft] = useState(storedTitle);
  const seenTitle = useRef(storedTitle);
  useEffect(() => {
    if (seenTitle.current === storedTitle) return;
    seenTitle.current = storedTitle;
    setDraft(storedTitle);
  }, [storedTitle]);
  const [confirming, setConfirming] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [here, setHere] = useState<OutdoorPoint | null>(null);
  const [focus, setFocus] = useState(0);
  const [locating, setLocating] = useState(false);

  if (!route) {
    return (
      <Screen eyebrow={OUTSIDE_SECTION_LABEL} title="Saved route">
        <OutingInProgressBanner />
        <Card>
          <T>That route is not on this account.</T>
        </Card>
      </Screen>
    );
  }

  const name = route.title;

  function startKind(kind: ActivityKind) {
    if (currentLive()) {
      setError(OTHER_SESSION_LINE);
      return;
    }
    router.push(`/activity?kind=${kind}&route=${route!.id}` as never);
  }

  async function saveName() {
    setError(null);
    setPending(true);
    try {
      await repo.renameOutdoorRoute(route!.id, draft);
    } catch (err) {
      setError(shownError(err, 'Could not rename that route.'));
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    setError(null);
    setPending(true);
    try {
      await repo.deleteOutdoorRoute(route!.id);
      router.back();
    } catch (err) {
      setError(shownError(err, 'Could not delete that route.'));
      setPending(false);
    }
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

  return (
    <Screen eyebrow={OUTSIDE_SECTION_LABEL} title={name}>
      <OutingInProgressBanner />
      {adjusting ? <SavedRouteAdjust route={route} onClose={() => setAdjusting(false)} /> : (
        <>
          <Card>
            <T>{routeKindLabel(route.kind)}</T>
            <T>{routeSummary(route)}</T>
            <T>{formatClimb(route.ascentM ?? null)}</T>
            <FootpathMap
              routes={[route]}
              sketch={[]}
              here={here}
              locationFocus={focus}
              locating={locating}
              height={mapHeight}
              mapLabel={SAVED_ROUTE_MAP_LABEL}
              onShowMyLocation={() => { void whereIAm(); }}
            />
            {locating ? (
              <Button label="Where I am" tone="quiet" pending pendingLabel={LOCATION_FIX_PENDING} onPress={() => {}} />
            ) : (
              <Choice label="Where I am" selected={here != null} onPress={() => { void whereIAm(); }} />
            )}
          </Card>
          <Button label={startLabel('walk')} tone="quiet" onPress={() => startKind('walk')} />
          <Button label={startLabel('run')} tone="quiet" onPress={() => startKind('run')} />
          <Button label={startLabel('cycle')} tone="quiet" onPress={() => startKind('cycle')} />
          <Card>
            <RenameRouteFields
              narrow={narrow}
              value={draft}
              pending={pending}
              onChange={setDraft}
              onSave={() => { void saveName(); }}
              onCancel={() => { setDraft(name); setError(null); }}
            />
          </Card>
          {canAdjustSavedRoute(route.kind) ? (
            <Button label={ADJUST_THIS_ROUTE} tone="quiet" onPress={() => { setConfirming(false); setAdjusting(true); }} />
          ) : null}
          {confirming ? (
            <DeleteRouteConfirm
              narrow={narrow}
              title={name}
              pending={pending}
              onCancel={() => setConfirming(false)}
              onDelete={() => { void remove(); }}
            />
          ) : (
            <Button
              label="Delete"
              tone="quiet"
              accessibilityLabel={`Delete ${name}`}
              onPress={() => setConfirming(true)}
            />
          )}
        </>
      )}
      <ErrorNote>{error}</ErrorNote>
    </Screen>
  );
}
