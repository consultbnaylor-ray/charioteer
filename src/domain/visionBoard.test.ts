import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { buildSystemPrompt, buildThumosContext } from './thumos';
import {
  formatVisionContext,
  formatVisionTarget,
  moveVisionItem,
  packVisionRows,
  planVisionText,
  visionContextFrom,
  visionDateLine,
  visionPhotoLimitMessage,
  visionStoragePath,
  visionTargetDay,
  VISION_CAPTION_LIMIT,
  VISION_DATE_WAITING,
  VISION_EMPTY_EXAMPLES,
  VISION_EMPTY_STATEMENT,
  VISION_PROMPT_LINE,
} from './visionBoard';

const base = {
  now: new Date('2026-10-11T12:00:00.000Z'),
  displayName: 'Alex',
  sobrietyStartedAt: '2026-01-13T06:00:00.000Z',
  reasons: ['I want to remember my evenings.'],
  weeklySpendGbp: 45,
  weeklyUnits: 28,
  checkIns: [],
  health: [],
  mode: 'steady' as const,
  safety: { selfHarm: false, withdrawal: false, reasons: [] },
};

describe('vision board dates and layout', () => {
  it('sets the target five years after the day the board began', () => {
    expect(visionTargetDay('2026-10-11')).toBe('2031-10-11');
    expect(formatVisionTarget('2031-10-11')).toBe('11 October 2031');
    expect(visionDateLine('2026-10-11')).toBe('Looking towards 11 October 2031.');
    expect(visionDateLine(null)).toBe(VISION_DATE_WAITING);
  });

  it('packs large tiles on their own row and pairs the smaller ones', () => {
    const rows = packVisionRows([
      { id: 'a', size: 'large' as const },
      { id: 'b', size: 'medium' as const },
      { id: 'c', size: 'small' as const },
      { id: 'd', size: 'small' as const },
    ]);
    expect(rows.map((row) => row.map((item) => item.id))).toEqual([['a'], ['b', 'c'], ['d']]);
  });

  it('moves a tile earlier or later and leaves the ends alone', () => {
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(moveVisionItem(items, 'b', 'up').map((item) => item.id)).toEqual(['b', 'a', 'c']);
    expect(moveVisionItem(items, 'b', 'down').map((item) => item.id)).toEqual(['a', 'c', 'b']);
    expect(moveVisionItem(items, 'a', 'up').map((item) => item.id)).toEqual(['a', 'b', 'c']);
  });

  it('refuses a caption that is too long and caps the board', () => {
    expect(planVisionText('  A quiet kitchen  ', VISION_CAPTION_LIMIT)).toEqual({ ok: true, text: 'A quiet kitchen' });
    expect(planVisionText('x'.repeat(VISION_CAPTION_LIMIT + 1), VISION_CAPTION_LIMIT).ok).toBe(false);
    expect(visionPhotoLimitMessage(39)).toBeNull();
    expect(visionPhotoLimitMessage(40)).toContain('Forty');
    expect(visionStoragePath('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1')).toBe(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1/a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1.jpg',
    );
  });
});

describe('vision words for Thumos', () => {
  const vision = visionContextFrom(
    'A home that feels like mine.',
    '2026-10-11',
    [
      { caption: 'Morning light', area: 'home' },
      { caption: '   ', area: 'career' },
    ],
  );

  it('sends the statement and captions, and no picture', () => {
    const text = formatVisionContext(vision);
    expect(text).toContain('A home that feels like mine.');
    expect(text).toContain('Home: Morning light');
    expect(text).toContain('11 October 2031');
    expect(text).toContain('photos were not sent');
    expect(text).not.toContain('career');
    expect(text).not.toMatch(/https?:|storage_path|\.jpg|previewUrl|signed_url/);
    const context = buildThumosContext({ ...base, vision });
    expect(context).toContain('Morning light');
    const prompt = buildSystemPrompt(context, 'steady');
    expect(prompt).toContain(VISION_PROMPT_LINE);
    expect(prompt).toContain('Do not pretend you can see them');
  });

  it('withholds the board on a self-harm turn', () => {
    const crisis = buildThumosContext({
      ...base,
      vision,
      safety: { selfHarm: true, withdrawal: false, reasons: ['self-harm or suicidal language'] },
    });
    expect(crisis).not.toContain('Morning light');
    expect(crisis).not.toContain('feels like mine');
    expect(crisis).toContain('vision board');
    const prompt = buildSystemPrompt(crisis, 'support', undefined, { selfHarm: true });
    expect(prompt).not.toContain('Do not pretend you can see them');
    expect(prompt).toContain('vision board');
  });
});

describe('vision board privacy', () => {
  it('keeps the pictures out of Thumos, the community, and the public profile', () => {
    const chat = readFileSync('supabase/functions/thumos-chat/index.ts', 'utf8');
    const voice = readFileSync('supabase/functions/thumos-voice-token/index.ts', 'utf8');
    const shared = readFileSync('supabase/functions/_shared/thumos.ts', 'utf8');
    const briefing = readFileSync('src/voice/briefing.ts', 'utf8');
    for (const source of [chat, voice]) {
      expect(source).toContain(".select('caption, area')");
      expect(source).not.toMatch(/vision-board|previewUrl|signed_url|storage_path/);
    }
    expect(shared).not.toMatch(/vision-board|previewUrl|signed_url|storage_path/);
    expect(briefing).toContain('visionContextFrom');
    expect(briefing).not.toMatch(/vision-board|previewUrl|storage_path/);
    expect(readFileSync('src/app/(main)/people.tsx', 'utf8')).not.toMatch(/vision_board|vision-board/);
    expect(readFileSync('src/ui/CommunityProfile.tsx', 'utf8')).not.toMatch(/vision_board|vision-board/);
    expect(readFileSync('src/ui/PublicProfileCard.tsx', 'utf8')).not.toMatch(/vision_board|vision-board|visionStatement/);
    const screen = readFileSync('src/ui/VisionBoard.tsx', 'utf8');
    expect(screen).toContain('My 5-year vision');
    expect(screen).toContain('VISION_EMPTY_STATEMENT');
    expect(screen).toContain('VISION_EMPTY_EXAMPLES');
    expect(screen).toContain('Examples, until you add your own.');
    expect(VISION_EMPTY_STATEMENT).toContain('quiet life');
    expect(VISION_EMPTY_EXAMPLES[0].caption).toContain('morning light');
    expect(screen).toContain('Look at my vision');
    expect(screen).toContain('Move up');
    expect(screen).toContain('Move down');
    expect(screen).toContain('Take a photo');
    expect(screen).toContain('Choose from library');
    expect(screen).toContain('pickProgressPhoto');
    expect(screen).toContain('Saving photo…');
    expect(screen).toContain('Photo saved');
    expect(screen).toContain('Try again');
    expect(screen).not.toMatch(/Share with community|visibility/);
    const sql = readFileSync('supabase/migrations/20261010250000_vision_board.sql', 'utf8');
    expect(sql).toContain('create table public.vision_board_items');
    expect(sql).toContain("storage_path = user_id::text || '/' || id::text || '.jpg'");
    expect(sql).toContain('user_id = auth.uid()');
    expect(sql).not.toMatch(/to anon/);
    const deleted = readFileSync('supabase/functions/account-delete/index.ts', 'utf8');
    expect(deleted).toContain('vision-board');
    expect(deleted.indexOf('removeVisionPhotos')).toBeGreaterThan(deleted.indexOf('removeGratitudePhotos'));
    expect(deleted.indexOf('deleteUser')).toBeGreaterThan(deleted.indexOf('removeVisionPhotos'));
    const exporter = readFileSync('supabase/functions/account-export/index.ts', 'utf8');
    expect(exporter).toContain('vision-board');
    expect(exporter).toContain('vision_board_items');
    expect(exporter).toContain('createSignedUrl');
    expect(exporter).not.toMatch(/base64/);
    const consent = readFileSync('src/ui/ConsentChoices.tsx', 'utf8');
    expect(consent).toContain('Vision board photos are not sent');
    expect(consent).toContain('Vision board photos always stay private');
    expect(consent).toContain('photo captions may be included');
    const sections = readFileSync('src/domain/sections.ts', 'utf8');
    expect(sections).toContain("label: 'Vision Board'");
    expect(sections).toContain("href: '/vision'");
    expect(sections).toContain("icon: 'board'");
    expect(sections).toContain("group: 'tools'");
    expect(sections.indexOf("label: 'Vision Board'")).toBeGreaterThan(sections.indexOf("label: 'Progress photos'"));
    expect(sections.indexOf("label: 'Vision Board'")).toBeLessThan(sections.indexOf("label: 'Drinks & units calculator'"));
    expect(readFileSync('src/ui/menuIcons.tsx', 'utf8')).toContain("name === 'board'");
    const home = readFileSync('src/app/(main)/home.tsx', 'utf8');
    expect(home).toContain('My 5-year vision');
    expect(home).toContain('Open vision board');
    expect(home).toContain("router.push('/vision'");
    expect(readFileSync('app.json', 'utf8')).toContain('"buildNumber": "12"');
  });
});
