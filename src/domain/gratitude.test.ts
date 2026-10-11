import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { buildSystemPrompt, buildThumosContext } from './thumos';
import { APP_SECTIONS, TAB_SECTIONS } from './sections';
import {
  filterGratitude,
  formatGratitudeContext,
  gratitudeCountLabel,
  gratitudeForThumos,
  gratitudeFromRows,
  groupGratitudeByDay,
  localGratitudeReflect,
  parseGratitudeReflect,
  planGratitudeEntry,
  resurfaceGratitude,
  sameGratitudeBody,
  type GratitudeEntry,
  type GratitudePhoto,
} from './gratitude';
import { gratitudePhotoLimitMessage, gratitudePhotosFromRows, gratitudeStoragePath, withGratitudePhotos } from './gratitudePhotos';

function entry(partial: Partial<GratitudeEntry> & Pick<GratitudeEntry, 'id' | 'body' | 'entryDate'>): GratitudeEntry {
  return {
    category: null,
    isFavourite: false,
    createdAt: `${partial.entryDate}T09:00:00.000Z`,
    updatedAt: `${partial.entryDate}T09:00:00.000Z`,
    ...partial,
    photos: partial.photos ?? [],
  };
}

const rows = [
  entry({ id: 'a', body: 'The river path', entryDate: '2026-09-01', category: 'Nature', isFavourite: false, createdAt: '2026-09-01T09:00:00.000Z' }),
  entry({ id: 'b', body: 'My sister rang', entryDate: '2026-10-08', category: 'People', isFavourite: true, createdAt: '2026-10-08T09:00:00.000Z' }),
  entry({ id: 'c', body: 'A quiet cup of tea', entryDate: '2025-10-11', category: 'Small joys', isFavourite: false, createdAt: '2025-10-11T09:00:00.000Z' }),
  entry({ id: 'd', body: 'Slept through the night', entryDate: '2026-10-11', category: 'Health', isFavourite: true, createdAt: '2026-10-11T08:00:00.000Z' }),
  entry({ id: 'e', body: 'The neighbour waved', entryDate: '2026-10-10', category: 'People', isFavourite: true, createdAt: '2026-10-10T09:00:00.000Z' }),
  entry({ id: 'f', body: 'Warm socks', entryDate: '2026-10-09', category: 'Small joys', isFavourite: true, createdAt: '2026-10-09T09:00:00.000Z' }),
  entry({ id: 'g', body: 'A short walk', entryDate: '2026-10-07', isFavourite: false, createdAt: '2026-10-07T09:00:00.000Z' }),
];

describe('gratitude diary helpers', () => {
  it('counts without turning a quiet day into a failure', () => {
    expect(gratitudeCountLabel(0)).toBe("Nothing saved yet. A quiet day is not a failure.");
    expect(gratitudeCountLabel(1)).toBe("1 thing you're grateful for");
    expect(gratitudeCountLabel(42)).toBe("42 things you're grateful for");
  });

  it('plans a trimmed line on or before today and keeps an internal new line', () => {
    expect(planGratitudeEntry('  hello\nthere  ', '2026-10-11', '2026-10-11')).toEqual({ ok: true, body: 'hello\nthere', entryDate: '2026-10-11' });
    expect(planGratitudeEntry('   ', '2026-10-11', '2026-10-11').ok).toBe(false);
    expect(planGratitudeEntry('x'.repeat(1001), '2026-10-11', '2026-10-11').ok).toBe(false);
    expect(planGratitudeEntry('x'.repeat(1000), '2026-10-11', '2026-10-11').ok).toBe(true);
    expect(planGratitudeEntry('Tomorrow', '2026-10-12', '2026-10-11').ok).toBe(false);
    expect(planGratitudeEntry('Yesterday', '2026-10-10', '2026-10-11').ok).toBe(true);
  });

  it('groups by day, searches, and filters favourites', () => {
    const grouped = groupGratitudeByDay(rows);
    expect(grouped[0]?.entryDate).toBe('2026-10-11');
    expect(grouped.map((group) => group.entryDate)).toEqual(['2026-10-11', '2026-10-10', '2026-10-09', '2026-10-08', '2026-10-07', '2026-09-01', '2025-10-11']);
    expect(filterGratitude(rows, { query: 'RIVER' }).map((item) => item.id)).toEqual(['a']);
    expect(filterGratitude(rows, { query: 'people' }).map((item) => item.id)).toEqual(['e', 'b']);
    expect(filterGratitude(rows, { favouritesOnly: true, category: 'People' }).map((item) => item.id)).toEqual(['e', 'b']);
  });

  it('resurfaces this calendar day in an earlier year, otherwise something at least a fortnight old', () => {
    expect(resurfaceGratitude(rows, '2026-10-11')).toEqual({ entry: expect.objectContaining({ id: 'c' }), kind: 'on-this-day' });
    const older = resurfaceGratitude(rows.filter((item) => item.id !== 'c'), '2026-10-11');
    expect(older).toEqual({ entry: expect.objectContaining({ id: 'a' }), kind: 'a-while-ago' });
    expect(resurfaceGratitude([entry({ id: 'new', body: 'Today', entryDate: '2026-10-11' })], '2026-10-11')).toBeNull();
    expect(resurfaceGratitude([entry({ id: 'recent', body: 'Recent', entryDate: '2026-10-01' })], '2026-10-11')).toBeNull();
    const twoYears = [
      entry({ id: 'older-year', body: 'Older', entryDate: '2024-10-11' }),
      entry({ id: 'newer-year', body: 'Newer', entryDate: '2025-10-11' }),
    ];
    expect(resurfaceGratitude(twoYears, '2026-10-11')?.entry.id).toBe('older-year');
  });

  it('sends at most five lines to Thumos, starred first', () => {
    const picked = gratitudeForThumos(rows);
    expect(picked).toHaveLength(5);
    expect(picked.slice(0, 3).every((item) => item.isFavourite)).toBe(true);
    expect(picked.map((item) => item.id)).toEqual(['d', 'e', 'f', 'b', 'g']);
    expect(formatGratitudeContext([])).toBe('');
    expect(formatGratitudeContext([rows[1]!])).toContain('2026-10-08, People, favourite: My sister rang');
    expect(sameGratitudeBody('  My sister   rang ', 'my sister rang')).toBe(true);
    expect(gratitudeFromRows([{ id: '1', body: 'Tea', category: 'Nope', is_favourite: true, entry_date: '2026-10-11', created_at: '', updated_at: '' }])).toEqual([
      { id: '1', body: 'Tea', category: null, isFavourite: true, entryDate: '2026-10-11', createdAt: '', updatedAt: '', photos: [] },
    ]);
    const photo: GratitudePhoto = {
      id: '11111111-1111-4111-8111-1111111111a1',
      entryId: 'b',
      storagePath: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1/11111111-1111-4111-8111-1111111111a1.jpg',
      createdAt: '2026-10-08T10:00:00.000Z',
      previewUrl: 'https://signed.example/private',
    };
    const withPhoto = entry({ id: 'b', body: 'My sister rang', entryDate: '2026-10-08', category: 'People', isFavourite: true, photos: [photo] });
    expect(formatGratitudeContext([withPhoto])).toContain('My sister rang');
    expect(formatGratitudeContext([withPhoto])).not.toContain('signed.example');
    expect(formatGratitudeContext([withPhoto])).not.toContain('.jpg');
    expect(gratitudePhotoLimitMessage(3)).toBeNull();
    expect(gratitudePhotoLimitMessage(4)).toBe('Four photos is the limit for one line.');
    expect(gratitudeStoragePath('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', photo.id)).toBe(photo.storagePath);
    expect(() => gratitudeStoragePath('not-a-uuid', photo.id)).toThrow(/store/);
    expect(gratitudePhotosFromRows([{ id: photo.id, entry_id: 'b', storage_path: '../secret.jpg', created_at: '' }])).toEqual([]);
    expect(withGratitudePhotos([entry({ id: 'b', body: 'My sister rang', entryDate: '2026-10-08' })], [{ ...photo, previewUrl: null }])[0]?.photos[0]?.id).toBe(photo.id);
  });

  it('parses a reflection and falls back locally without calling a model', () => {
    const longSuggestion = 'x'.repeat(81);
    expect(parseGratitudeReflect(`{"comment":"You noticed it.","suggestions":["A second cup","The person who made it","${longSuggestion}"]}`)?.suggestions).toEqual([
      'A second cup',
      'The person who made it',
    ]);
    const wrapped = parseGratitudeReflect('Note {"comment":"Kept.","suggestions":["One","Two","Three","Four"]} thanks');
    expect(wrapped?.suggestions).toEqual(['One', 'Two', 'Three']);
    expect(parseGratitudeReflect('{"comment":"Kept.","suggestions":["Only one"]}')).toBeNull();
    expect(parseGratitudeReflect('{"comment":"' + 'x'.repeat(601) + '","suggestions":["One","Two"]}')).toBeNull();
    const local = localGratitudeReflect('My sister rang', 'People');
    expect(local.suggestions).toHaveLength(3);
    expect(local.suggestions[1]).toBe('Someone who made today easier');
    expect(local.comment).toContain('My sister rang');
  });

  it('puts real diary lines in the coach context and withholds them on a self-harm turn', () => {
    const base = {
      now: new Date('2026-10-11T12:00:00.000Z'),
      displayName: 'Alex',
      sobrietyStartedAt: '2026-01-13T06:00:00.000Z',
      reasons: ['I want to remember my evenings.'],
      weeklySpendGbp: 45,
      weeklyUnits: 28,
      checkIns: [],
      health: [],
      mode: 'support' as const,
      safety: { selfHarm: false, withdrawal: false, reasons: [] },
      gratitude: [rows[1]!],
    };
    const context = buildThumosContext(base);
    expect(context).toContain('My sister rang');
    expect(context).toContain('Gratitude diary');
    const prompt = buildSystemPrompt(context, 'support');
    expect(prompt).toContain('Last week you wrote');
    expect(prompt).toContain('Never invent a diary line');
    const crisis = buildThumosContext({ ...base, safety: { selfHarm: true, withdrawal: false, reasons: ['self-harm or suicidal language'] } });
    expect(crisis).not.toContain('My sister rang');
    const crisisPrompt = buildSystemPrompt(crisis, 'support', undefined, { selfHarm: true });
    expect(crisisPrompt).not.toContain('Last week you wrote');
    expect(crisisPrompt).toContain('gratitude diary');
  });
});

describe('gratitude diary wiring', () => {
  it('adds the owner-only table and includes it in export', () => {
    const sql = readFileSync('supabase/migrations/20261010210000_gratitude_entries.sql', 'utf8');
    expect(sql).toContain('create table public.gratitude_entries');
    expect(sql).toContain('user_id = auth.uid()');
    expect(sql).toContain('revoke all on table public.gratitude_entries from public, anon, authenticated');
    expect(sql).not.toMatch(/grant .+ to anon/i);
    expect(sql).not.toMatch(/drop table/i);
    expect(sql).toContain('grant select (');
    expect(sql).toContain('grant insert (');
    expect(sql).toContain('grant update (');
    expect(sql).toContain('body,');
    expect(sql).toContain('is_favourite');
    expect(sql).toContain('entry_date');
    expect(sql).toContain("'gratitude_entries'");
    expect(sql).toContain('execute function public.touch_updated_at()');
    expect(sql).not.toMatch(/create function public\.touch_updated_at/i);
    const update = sql.match(/grant update \(([^)]+)\) on public\.gratitude_entries/i)?.[1] ?? '';
    expect(update).not.toMatch(/\buser_id\b/);
    expect(update).not.toMatch(/\bcreated_at\b/);
  });

  it('deletes diary rows before the auth user and does not load other tables for a reflection', () => {
    const deleted = readFileSync('supabase/functions/account-delete/index.ts', 'utf8');
    const handler = deleted.slice(0, deleted.indexOf('async function removeProgressPhotos'));
    expect(handler.indexOf('removeGratitudePhotos')).toBeGreaterThan(handler.indexOf('removeProgressPhotos'));
    expect(handler.indexOf("from('gratitude_entries')")).toBeGreaterThan(handler.indexOf('removeGratitudePhotos'));
    expect(handler.indexOf("from('gratitude_entries')")).toBeLessThan(handler.indexOf('deleteUser'));
    expect(deleted).toContain('gratitude-photos');
    const reflect = readFileSync('supabase/functions/gratitude-reflect/index.ts', 'utf8');
    expect(reflect).toContain('consent_ai');
    expect(reflect).toContain('localGratitudeReflect');
    expect(reflect).not.toMatch(/check_ins|health_samples|reasons|progress_photos|gratitude_entries/);
    const chat = readFileSync('supabase/functions/thumos-chat/index.ts', 'utf8');
    const voice = readFileSync('supabase/functions/thumos-voice-token/index.ts', 'utf8');
    const chatHandler = chat.slice(chat.indexOf('Deno.serve'));
    const voiceHandler = voice.slice(voice.indexOf('Deno.serve'));
    expect(chatHandler.indexOf('consent_ai')).toBeLessThan(chatHandler.indexOf('loadGratitude'));
    expect(chatHandler.indexOf('loadGratitude')).toBeLessThan(chatHandler.indexOf('buildThumosContext'));
    expect(voiceHandler.indexOf('consent_ai')).toBeLessThan(voiceHandler.indexOf('gratitude_entries'));
    expect(voiceHandler.indexOf('gratitude_entries')).toBeLessThan(voiceHandler.indexOf('buildVoiceBriefing'));
    expect(chat).toContain("from('gratitude_entries')");
    expect(chat).toContain(".select('id, body, category, is_favourite, entry_date, created_at, updated_at')");
    expect(chat).not.toMatch(/gratitude_photos|gratitude-photos/);
    expect(voice).not.toMatch(/gratitude_photos|gratitude-photos/);
    expect(chat).toContain('gratitude,');
    expect(voice).toContain('gratitude,');
    const voiceTurn = readFileSync('supabase/functions/thumos-voice-turn/index.ts', 'utf8');
    const sharedThumos = readFileSync('supabase/functions/_shared/thumos.ts', 'utf8');
    const sharedVoice = readFileSync('supabase/functions/_shared/voice.ts', 'utf8');
    const briefing = readFileSync('src/voice/briefing.ts', 'utf8');
    for (const source of [voiceTurn, sharedThumos, sharedVoice, briefing, reflect]) {
      expect(source).not.toMatch(/gratitude_photos|gratitude-photos/);
    }
    const exporter = readFileSync('supabase/functions/account-export/index.ts', 'utf8');
    expect(exporter).toContain('gratitude-photos');
    expect(exporter).toContain('createSignedUrl');
    expect(exporter).not.toMatch(/base64/);
    const photosMigration = readFileSync('supabase/migrations/20261010230000_gratitude_photos.sql', 'utf8');
    expect(photosMigration).toContain('create table public.gratitude_photos');
    expect(photosMigration).toContain("storage_path = user_id::text || '/' || id::text || '.jpg'");
    expect(photosMigration).toContain('revoke all on table public.gratitude_photos from public, anon, authenticated');
    expect(photosMigration).toContain('grant select (id, entry_id, user_id, storage_path, created_at)');
    expect(photosMigration).toContain('grant insert (id, entry_id, user_id, storage_path)');
    expect(photosMigration).toContain('grant delete on public.gratitude_photos to authenticated');
    expect(photosMigration).not.toMatch(/grant update/i);
    expect(photosMigration).not.toMatch(/to anon/);
    expect(photosMigration).toContain("values ('gratitude-photos', 'gratitude-photos', false, 2097152");
    expect(photosMigration).toContain('set public = false');
    expect(photosMigration).not.toMatch(/visibility/);
    expect(photosMigration).not.toMatch(/for select to authenticated\s+using \(visibility/i);
    expect(photosMigration).toContain("'gratitude_photos'");
    expect(photosMigration).toContain("'gratitude_entries'");
    expect(photosMigration).toContain("'progress_photos'");
  });

  it('lists every section in the drawer and replaces the Library tab', () => {
    expect(APP_SECTIONS.map((section) => section.label)).toEqual([
      'Today',
      'Check-in',
      'Breathe',
      'Thumos',
      'People',
      'Gratitude Diary',
      'Health Stats',
      'Progress photos',
      'Drinks & units calculator',
      'Library',
      'You',
      'Privacy & consent',
      'Help & crisis lines',
      'Sign out',
    ]);
    expect(TAB_SECTIONS.map((section) => section.tabLabel ?? section.label)).toEqual([
      'Today',
      'Check-in',
      'Breathe',
      'Thumos',
      'People',
      'Gratitude',
    ]);
    const layout = readFileSync('src/app/(main)/_layout.tsx', 'utf8');
    expect(layout).toContain('accessibilityLabel="Menu"');
    expect(layout).toContain('width: 44, height: 44');
    expect(layout).toContain('TAB_SECTIONS');
    expect(layout).not.toContain("label: 'Library'");
    const drawer = readFileSync('src/ui/SectionDrawer.tsx', 'utf8');
    expect(drawer).toContain('APP_SECTIONS');
    expect(drawer).toContain('MENU_GROUPS');
    expect(drawer).toContain('accessibilityLabel="Close menu"');
    expect(drawer).toContain('width: 44, height: 44');
    expect(drawer).toContain('<CloseMark');
    expect(drawer).not.toContain('>Close<');
    expect(drawer).toContain('accessibilityLabel="Dismiss menu"');
    expect(drawer).toContain('<MenuGlyph');
    expect(readFileSync('src/domain/sections.ts', 'utf8')).toContain("label: 'Library'");
    expect(readFileSync('src/domain/sections.ts', 'utf8')).toContain("label: 'You'");
    expect(readFileSync('app.json', 'utf8')).toContain('"buildNumber": "10"');
    const consent = readFileSync('src/ui/ConsentChoices.tsx', 'utf8');
    expect(consent).toContain('gratitude');
    expect(consent).toContain('never shown to the community');
    const diary = readFileSync('src/app/(main)/gratitude.tsx', 'utf8');
    expect(diary.indexOf('consentAi')).toBeLessThan(diary.indexOf('reflectOnGratitude'));
    expect(diary).toContain('My daughter laughing at breakfast');
    expect(diary).toContain('accessibilityLabel="More actions"');
    expect(diary).toContain('Take a photo');
    expect(diary).toContain('Choose from library');
    expect(diary).toContain('Saving photo…');
    expect(diary).toContain('Try again');
    expect(diary).toContain('Photo saved');
    expect(diary).toContain('Remove photo');
    expect(diary).toContain('View photo');
    expect(diary).toContain('maximumZoomScale={4}');
    expect(diary).toContain('Pinch to zoom.');
    expect(diary).toContain('pickProgressPhoto');
    expect(diary).not.toMatch(/Share with community|gratitude-photos|visibility/);
    expect(readFileSync('src/ui/CommunityProfile.tsx', 'utf8')).not.toMatch(/gratitude_photos|gratitude-photos/);
    expect(readFileSync('src/app/(main)/people.tsx', 'utf8')).not.toMatch(/gratitude/);
    const repo = readFileSync('src/data/supabase-repository.ts', 'utf8');
    const reflectMethod = repo.slice(repo.indexOf('async reflectOnGratitude'), repo.indexOf('async exportData'));
    expect(reflectMethod).toContain('body: { body, category }');
    expect(reflectMethod).not.toMatch(/gratitude_photos|storage_path|previewUrl/);
    expect(consent).toContain('Gratitude photos are not sent');
    expect(consent).toContain('Gratitude photos always stay private');
    expect(readFileSync('src/app/(main)/check-in.tsx', 'utf8')).toContain('Add to your Gratitude Diary');
    expect(readFileSync('src/app/(main)/people.tsx', 'utf8')).not.toContain('gratitude');
  });
});
