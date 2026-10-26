import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';

import { useRepository } from '@/data';
import { shownError } from '@/domain/errors';
import { routeKindLabel, routeSummary, routeTitleOf, type OutdoorRoute } from '@/domain/outdoorRoute';
import {
  CANCEL,
  DELETE_REMOVES,
  DELETE_THIS_ROUTE,
  RENAME,
  ROUTE_NAME_FIELD,
  ROUTE_NEEDS_NAME,
  SAVE_NAME,
  openLabel,
} from '@/domain/savedRoute';
import { Button, Card, ErrorNote, Field, T } from '@/ui/ui';

export function narrowScreen(width: number): boolean {
  return width < 360;
}

/** At 320 each child is its own row. At 390 they share one row. */
export function ActionRow({ narrow, children }: { narrow: boolean; children: ReactNode }) {
  const items = Array.isArray(children) ? children : [children];
  if (narrow) return <View style={{ gap: 8 }}>{items}</View>;
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {items.map((child, index) => (
        <View key={index} style={{ flex: 1, minWidth: 0 }}>{child}</View>
      ))}
    </View>
  );
}

export function DeleteRouteConfirm({
  narrow,
  title,
  pending,
  onCancel,
  onDelete,
}: {
  narrow: boolean;
  title: string;
  pending?: boolean;
  onCancel: () => void;
  onDelete: () => void;
}) {
  return (
    <Card>
      <T variant="title">{DELETE_THIS_ROUTE}</T>
      <T>{DELETE_REMOVES}</T>
      <ActionRow narrow={narrow}>
        <Button label={CANCEL} onPress={onCancel} />
        <Button
          label="Delete"
          tone="quiet"
          pending={pending}
          accessibilityLabel={`Delete ${title}`}
          onPress={onDelete}
        />
      </ActionRow>
    </Card>
  );
}

export function RenameRouteFields({
  narrow,
  value,
  pending,
  onChange,
  onSave,
  onCancel,
}: {
  narrow: boolean;
  value: string;
  pending?: boolean;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const empty = routeTitleOf(value) == null;
  return (
    <View style={{ gap: 8 }}>
      <Field label={ROUTE_NAME_FIELD} value={value} onChangeText={onChange} maxLength={80} />
      <ActionRow narrow={narrow}>
        <Button
          label={SAVE_NAME}
          disabled={empty || pending}
          pending={pending}
          disabledReason={empty ? ROUTE_NEEDS_NAME : undefined}
          onPress={onSave}
        />
        <Button label={CANCEL} tone="quiet" onPress={onCancel} />
      </ActionRow>
    </View>
  );
}

/** The name opens the route. Rename and Delete stay their own buttons. */
export function SavedRouteCard({ route }: { route: OutdoorRoute }) {
  const router = useRouter();
  const repo = useRepository();
  const { width } = useWindowDimensions();
  const narrow = narrowScreen(width);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(route.title);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startRename() {
    setError(null);
    setConfirming(false);
    setDraft(route.title);
    setRenaming(true);
  }

  function cancelRename() {
    setDraft(route.title);
    setRenaming(false);
    setError(null);
  }

  async function saveName() {
    setError(null);
    setPending(true);
    try {
      await repo.renameOutdoorRoute(route.id, draft);
      setRenaming(false);
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
      await repo.deleteOutdoorRoute(route.id);
      setConfirming(false);
    } catch (err) {
      setError(shownError(err, 'Could not delete that route.'));
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={openLabel(route.title)}
        onPress={() => router.push(`/saved-route?id=${route.id}` as never)}
        style={{ minHeight: 44, justifyContent: 'center' }}
      >
        <T variant="title">{route.title}</T>
        <T variant="muted">{routeKindLabel(route.kind)} · {routeSummary(route)}</T>
      </Pressable>
      {renaming ? (
        <RenameRouteFields
          narrow={narrow}
          value={draft}
          pending={pending}
          onChange={setDraft}
          onSave={() => { void saveName(); }}
          onCancel={cancelRename}
        />
      ) : confirming ? (
        <DeleteRouteConfirm
          narrow={narrow}
          title={route.title}
          pending={pending}
          onCancel={() => setConfirming(false)}
          onDelete={() => { void remove(); }}
        />
      ) : (
        <ActionRow narrow={narrow}>
          <Button label={RENAME} tone="quiet" accessibilityLabel={`Rename ${route.title}`} onPress={startRename} />
          <Button
            label="Delete"
            tone="quiet"
            accessibilityLabel={`Delete ${route.title}`}
            onPress={() => { setRenaming(false); setConfirming(true); setError(null); }}
          />
        </ActionRow>
      )}
      <ErrorNote>{error}</ErrorNote>
    </Card>
  );
}
