import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { useRepository, useSnapshot } from '@/data';
import { formatUkLong, isoDay, parseIsoDay, startOfLocalDay } from '@/domain/dates';
import { shownError } from '@/domain/errors';
import {
  filterGratitude,
  gratitudeCountLabel,
  GRATITUDE_CATEGORIES,
  groupGratitudeByDay,
  planGratitudeEntry,
  resurfaceGratitude,
  sameGratitudeBody,
  type GratitudeCategory,
  type GratitudeEntry,
} from '@/domain/gratitude';
import { DateField } from '@/ui/DateField';
import { Button, Card, Choice, EditSheet, ErrorNote, Field, Screen, T } from '@/ui/ui';
import { useAppTheme } from '@/ui/theme';

const EXAMPLE = 'My daughter laughing at breakfast';

type ReflectState = {
  entryId: string;
  comment: string;
  suggestions: { text: string; added: boolean }[];
};

export default function GratitudeDiary() {
  const repo = useRepository();
  const snap = useSnapshot();
  const router = useRouter();
  const theme = useAppTheme();
  const entries = snap.gratitude ?? [];
  const today = isoDay(new Date());
  const [view, setView] = useState<'all' | 'favourites'>('all');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<GratitudeCategory | null>(null);
  const [body, setBody] = useState('');
  const [draftCategory, setDraftCategory] = useState<GratitudeCategory | null>(null);
  const [favourite, setFavourite] = useState(false);
  const [date, setDate] = useState(() => startOfLocalDay(new Date()));
  const [editing, setEditing] = useState<GratitudeEntry | null>(null);
  const [editBody, setEditBody] = useState('');
  const [editCategory, setEditCategory] = useState<GratitudeCategory | null>(null);
  const [editFavourite, setEditFavourite] = useState(false);
  const [editDate, setEditDate] = useState(() => startOfLocalDay(new Date()));
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [reflect, setReflect] = useState<ReflectState | null>(null);
  const [reflectNote, setReflectNote] = useState<string | null>(null);
  const [reflectingId, setReflectingId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = filterGratitude(entries, { query, category, favouritesOnly: view === 'favourites' });
  const groups = groupGratitudeByDay(filtered);
  const resurfaced = view === 'all' && !query.trim() && !category ? resurfaceGratitude(entries, today) : null;

  async function addEntry() {
    const plan = planGratitudeEntry(body, isoDay(date), today);
    if (!plan.ok) {
      setError(plan.message);
      return;
    }
    setPending(true);
    setError(null);
    try {
      await repo.addGratitudeEntry({
        body: plan.body,
        entryDate: plan.entryDate,
        category: draftCategory,
        isFavourite: favourite,
      });
      setBody('');
      setFavourite(false);
      setDraftCategory(null);
      setDate(startOfLocalDay(new Date()));
    } catch (err) {
      setError(shownError(err, 'Could not save that line.'));
    } finally {
      setPending(false);
    }
  }

  function openEdit(entry: GratitudeEntry) {
    setEditing(entry);
    setEditBody(entry.body);
    setEditCategory(entry.category);
    setEditFavourite(entry.isFavourite);
    setEditDate(parseIsoDay(entry.entryDate));
    setError(null);
  }

  async function saveEdit() {
    if (!editing) return;
    const plan = planGratitudeEntry(editBody, isoDay(editDate), today);
    if (!plan.ok) {
      setError(plan.message);
      return;
    }
    setPending(true);
    setError(null);
    try {
      await repo.updateGratitudeEntry(editing.id, {
        body: plan.body,
        entryDate: plan.entryDate,
        category: editCategory,
        isFavourite: editFavourite,
      });
      setEditing(null);
    } catch (err) {
      setError(shownError(err, 'Could not save that line.'));
    } finally {
      setPending(false);
    }
  }

  async function toggleStar(entry: GratitudeEntry) {
    setError(null);
    try {
      await repo.updateGratitudeEntry(entry.id, {
        body: entry.body,
        entryDate: entry.entryDate,
        category: entry.category,
        isFavourite: !entry.isFavourite,
      });
    } catch (err) {
      setError(shownError(err, 'Could not update that line.'));
    }
  }

  async function remove(id: string) {
    setError(null);
    setPending(true);
    try {
      await repo.deleteGratitudeEntry(id);
      setConfirmId(null);
      if (editing?.id === id) setEditing(null);
    } catch (err) {
      setError(shownError(err, 'Could not delete that line.'));
    } finally {
      setPending(false);
    }
  }

  async function reflectOn(entry: GratitudeEntry) {
    setError(null);
    setReflectNote(null);
    if (!snap.profile?.consentAi) {
      setReflectNote('Turn on the coach under Privacy & consent. A reflection sends only this line.');
      return;
    }
    setReflectingId(entry.id);
    try {
      const result = await repo.reflectOnGratitude(entry.body, entry.category);
      setReflect({
        entryId: entry.id,
        comment: result.comment,
        suggestions: result.suggestions.map((text) => ({
          text,
          added: entries.some((item) => sameGratitudeBody(item.body, text)),
        })),
      });
    } catch (err) {
      setError(shownError(err, 'Could not reflect just now.'));
    } finally {
      setReflectingId(null);
    }
  }

  async function takeSuggestion(entry: GratitudeEntry, text: string) {
    if (!reflect) return;
    if (entries.some((item) => sameGratitudeBody(item.body, text))) {
      setReflect({
        ...reflect,
        suggestions: reflect.suggestions.map((item) => item.text === text ? { ...item, added: true } : item),
      });
      return;
    }
    setError(null);
    try {
      await repo.addGratitudeEntry({
        body: text,
        entryDate: today,
        category: entry.category,
        isFavourite: false,
      });
      setReflect({
        ...reflect,
        suggestions: reflect.suggestions.map((item) => item.text === text ? { ...item, added: true } : item),
      });
    } catch (err) {
      setError(shownError(err, 'Could not add that line.'));
    }
  }

  return (
    <Screen
      eyebrow="Private"
      title="Gratitude Diary"
      intro="A list you can come back to. This diary is private. It is not shown to the community. Thumos sees a few lines only if you have allowed the coach."
    >
      <T>{gratitudeCountLabel(entries.length)}</T>
      <Card>
        <Field label="A line to keep" value={body} onChangeText={setBody} multiline placeholder={EXAMPLE} maxLength={1000} />
        <DateField label="Date" value={date} onChange={setDate} maximumDate={new Date()} />
        <T variant="label">Tag, if you want</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Choice label="No tag" selected={draftCategory == null} onPress={() => setDraftCategory(null)} />
          {GRATITUDE_CATEGORIES.map((item) => (
            <Choice key={item} label={item} selected={draftCategory === item} onPress={() => setDraftCategory(item)} />
          ))}
        </View>
        <Choice label="Favourite" selected={favourite} onPress={() => setFavourite((value) => !value)} />
        <Button label="Add to the diary" pending={pending && !editing} onPress={() => void addEntry()} />
      </Card>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Choice label="All" selected={view === 'all'} onPress={() => setView('all')} />
        <Choice label="Favourites" selected={view === 'favourites'} onPress={() => setView('favourites')} />
      </View>
      <Field label="Search" value={query} onChangeText={setQuery} placeholder="Search your lines" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Choice label="Any tag" selected={category == null} onPress={() => setCategory(null)} />
        {GRATITUDE_CATEGORIES.map((item) => (
          <Choice key={item} label={item} selected={category === item} onPress={() => setCategory(item)} />
        ))}
      </View>
      <ErrorNote>{error}</ErrorNote>
      {reflectNote ? (
        <Card>
          <T>{reflectNote}</T>
          <Button label="Privacy & consent" tone="quiet" onPress={() => router.push('/privacy' as never)} />
        </Card>
      ) : null}
      {entries.length === 0 ? (
        <Card>
          <T variant="muted">{EXAMPLE}</T>
          <T variant="muted">An example, greyed out. Yours can be smaller than that.</T>
        </Card>
      ) : null}
      {resurfaced ? (
        <Card>
          <T variant="label">{resurfaced.kind === 'on-this-day' ? 'On this day' : 'A while ago'}</T>
          <T variant="muted">{formatUkLong(resurfaced.entry.entryDate)}</T>
          <T>{resurfaced.entry.body}</T>
        </Card>
      ) : null}
      {entries.length > 0 && groups.length === 0 ? <T variant="muted">Nothing matches.</T> : null}
      {groups.map((group) => (
        <View key={group.entryDate} style={{ gap: 8 }}>
          <T variant="label">{formatUkLong(group.entryDate)}</T>
          {group.entries.map((entry) => (
            <Card key={entry.id}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                <T style={{ flex: 1 }}>{entry.body}</T>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={entry.isFavourite ? 'Remove favourite' : 'Mark as favourite'}
                  onPress={() => void toggleStar(entry)}
                  style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
                >
                  <T style={{ color: entry.isFavourite ? theme.colors.ink : theme.colors.muted }}>{entry.isFavourite ? '★' : '☆'}</T>
                </Pressable>
              </View>
              {entry.category ? <T variant="muted">{entry.category}</T> : null}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <Button label="Edit" tone="quiet" onPress={() => openEdit(entry)} />
                <Button label="Delete" tone="quiet" onPress={() => setConfirmId(entry.id)} />
                <Button label="Reflect with Thumos" tone="quiet" pending={reflectingId === entry.id} onPress={() => void reflectOn(entry)} />
              </View>
              {confirmId === entry.id ? (
                <View style={{ gap: 8 }}>
                  <T>Delete this line?</T>
                  <Button label="Delete this line" tone="quiet" pending={pending} onPress={() => void remove(entry.id)} />
                  <Button label="Keep it" tone="quiet" onPress={() => setConfirmId(null)} />
                </View>
              ) : null}
              {reflect?.entryId === entry.id ? (
                <View style={{ gap: 8 }}>
                  <T>{reflect.comment}</T>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {reflect.suggestions.map((suggestion) => (
                      <Choice
                        key={suggestion.text}
                        label={suggestion.added ? `Added: ${suggestion.text}` : suggestion.text}
                        selected={suggestion.added}
                        onPress={() => {
                          if (!suggestion.added) void takeSuggestion(entry, suggestion.text);
                        }}
                      />
                    ))}
                  </View>
                </View>
              ) : null}
            </Card>
          ))}
        </View>
      ))}
      <EditSheet
        visible={editing != null}
        title="Edit this line"
        saveLabel="Save"
        pending={pending}
        onClose={() => { if (!pending) setEditing(null); }}
        onSave={() => void saveEdit()}
      >
        <Field label="Line" value={editBody} onChangeText={setEditBody} multiline maxLength={1000} />
        <DateField label="Date" value={editDate} onChange={setEditDate} maximumDate={new Date()} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Choice label="No tag" selected={editCategory == null} onPress={() => setEditCategory(null)} />
          {GRATITUDE_CATEGORIES.map((item) => (
            <Choice key={item} label={item} selected={editCategory === item} onPress={() => setEditCategory(item)} />
          ))}
        </View>
        <Choice label="Favourite" selected={editFavourite} onPress={() => setEditFavourite((value) => !value)} />
        <ErrorNote>{error}</ErrorNote>
      </EditSheet>
    </Screen>
  );
}
