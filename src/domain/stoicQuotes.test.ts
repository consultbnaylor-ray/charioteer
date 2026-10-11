import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { londonDay } from './healthInsights';
import { defaultProfileSharing, projectPublicProfile, sensitiveTurnedOn, type ShareSource } from './profileSharing';
import { APP_SECTIONS } from './sections';
import {
  quoteById,
  quoteForUkDay,
  quoteOfTheDay,
  STOIC_AUTHORS,
  STOIC_QUOTES,
  STOIC_THEMES,
  searchQuotes,
} from './stoicQuotes';
import { buildSystemPrompt, buildThumosContext } from './thumos';
import { STOIC_CATALOGUE } from '../../supabase/functions/_shared/stoicCatalogue';
import { adaptPromptForSpeech } from '../../supabase/functions/_shared/voice';

const SOURCE: ShareSource = {
  now: new Date('2026-10-11T12:00:00.000Z'),
  today: '2026-10-11',
  displayName: 'Alex Hart',
  town: null,
  stage: 'exploring',
  sobrietyStartedAt: null,
  weeklySpendGbp: null,
  weeklyUnits: null,
  interestLabels: [],
  reasons: [],
  checkIns: [],
  health: [],
  gratitude: [],
  vision: [],
  progressPhotos: [],
  pinnedQuoteId: null,
};

describe('Stoic quote catalogue', () => {
  it('keeps at least 365 sourced public-domain lines', () => {
    expect(STOIC_QUOTES.length).toBeGreaterThanOrEqual(365);
    const ids = STOIC_QUOTES.map((quote) => quote.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const quote of STOIC_QUOTES) {
      expect(quote.text.trim().length).toBeGreaterThan(40);
      expect(quote.author.trim()).not.toBe('');
      expect(quote.source.trim()).not.toBe('');
      expect(quote.translator.trim()).not.toBe('');
      expect(STOIC_THEMES).toContain(quote.theme);
      expect(quote.text).not.toContain('[Greek:');
      expect(quote.text).not.toContain('Gutenberg');
    }
    expect(STOIC_AUTHORS).toEqual(['Epictetus', 'Marcus Aurelius', 'Seneca', 'Zeno of Citium']);
    expect(STOIC_QUOTES.map((quote) => quote.translator)).toEqual(expect.arrayContaining([
      'Meric Casaubon',
      'George Long',
      'Aubrey Stewart',
      'C. D. Yonge',
    ]));
    expect(STOIC_QUOTES.some((quote) => quote.text.startsWith('Of my grandfather Verus'))).toBe(true);
    expect(STOIC_QUOTES.some((quote) => quote.text.startsWith('Of things some are in our power'))).toBe(true);
    expect(STOIC_QUOTES.some((quote) => quote.text.includes('Life is long enough, if you know how to use it.'))).toBe(true);
    expect(STOIC_QUOTES.some((quote) => quote.source.includes('Enchiridion'))).toBe(true);
    expect(STOIC_QUOTES.some((quote) => quote.source.startsWith('Discourses'))).toBe(true);
    expect(quoteById('not-a-real-quote')).toBeNull();
    expect(STOIC_CATALOGUE.map((quote) => `${quote.id}\n${quote.text}\n${quote.author}\n${quote.source}`)).toEqual(
      STOIC_QUOTES.map((quote) => `${quote.id}\n${quote.text}\n${quote.author}\n${quote.source}`),
    );
  });

  it('picks the same quote for a UK date, and the next UK day after 23:30 UTC in summer', () => {
    const morning = quoteOfTheDay(new Date('2026-06-15T12:00:00.000Z'));
    const late = quoteOfTheDay(new Date('2026-06-15T23:30:00.000Z'));
    expect(londonDay('2026-06-15T23:30:00.000Z')).toBe('2026-06-16');
    expect(late.id).toBe(quoteForUkDay('2026-06-16').id);
    expect(morning.id).toBe(quoteForUkDay('2026-06-15').id);
    expect(late.id).not.toBe(morning.id);
    expect(quoteForUkDay('2026-10-11').id).toBe(quoteForUkDay('2026-10-11').id);
  });

  it('searches by author and theme', () => {
    const marcus = searchQuotes({ author: 'Marcus Aurelius' });
    expect(marcus.length).toBeGreaterThan(0);
    expect(marcus.every((quote) => quote.author === 'Marcus Aurelius')).toBe(true);
    const courage = searchQuotes({ theme: 'Courage' });
    expect(courage.length).toBeGreaterThan(0);
    expect(courage.every((quote) => quote.theme === 'Courage')).toBe(true);
    expect(searchQuotes({ query: 'grandfather Verus' }).some((quote) => quote.author === 'Marcus Aurelius')).toBe(true);
  });
});

describe('pinned quote sharing', () => {
  const quote = STOIC_QUOTES[0];

  it('stays off the public profile until the switch is on, and an unknown id shows nothing', () => {
    const hidden = projectPublicProfile({ ...SOURCE, pinnedQuoteId: quote.id }, defaultProfileSharing());
    expect(hidden.pinnedQuote).toBeNull();
    expect(JSON.stringify(hidden)).not.toContain(quote.text);
    expect(hidden.hiddenLabels).toContain('Pinned quote');

    const shared = projectPublicProfile(
      { ...SOURCE, pinnedQuoteId: quote.id },
      { ...defaultProfileSharing(), pinnedQuote: true },
    );
    expect(shared.pinnedQuote).toEqual({
      id: quote.id,
      text: quote.text,
      author: quote.author,
      source: quote.source,
    });
    expect(shared.sharedLabels).toContain('Pinned quote');

    const unknown = projectPublicProfile(
      { ...SOURCE, pinnedQuoteId: 'not-in-the-catalogue' },
      { ...defaultProfileSharing(), pinnedQuote: true },
    );
    expect(unknown.pinnedQuote).toBeNull();
    expect(sensitiveTurnedOn(defaultProfileSharing(), { ...defaultProfileSharing(), pinnedQuote: true })).toBe(false);
  });
});

describe('Thumos and the pinned quote', () => {
  const quote = { text: 'Life is long enough, if you know how to use it.', author: 'Seneca', source: 'On the Shortness of Life, chapter 2' };
  const base = {
    now: new Date('2026-10-11T12:00:00.000Z'),
    displayName: 'Alex',
    sobrietyStartedAt: null,
    reasons: ['Be here for my daughter'],
    weeklySpendGbp: null,
    weeklyUnits: null,
    checkIns: [],
    health: [],
    mode: 'steady' as const,
    safety: { selfHarm: false, withdrawal: false, reasons: [] as string[] },
    pinnedQuote: quote,
  };

  it('includes the line for motivation, and withholds it on a self-harm turn', () => {
    const context = buildThumosContext(base);
    expect(context).toContain(quote.text);
    expect(context).toContain('Seneca');
    const prompt = buildSystemPrompt(context, 'steady');
    expect(prompt).toContain('you may use it once for motivation');
    const spoken = adaptPromptForSpeech(prompt);
    expect(spoken).toContain('Do not invent a quotation');

    const crisis = buildThumosContext({ ...base, safety: { selfHarm: true, withdrawal: false, reasons: [] } });
    expect(crisis).not.toContain(quote.text);
    expect(crisis).not.toContain('Be here for my daughter');
    const crisisPrompt = buildSystemPrompt(crisis, 'support', undefined, { selfHarm: true });
    expect(crisisPrompt).not.toContain(quote.text);
    expect(crisisPrompt).toContain('pinned Stoic quote');
  });
});

describe('Stoic quotes in the menu and the database', () => {
  it('sits in Tools without moving Vision Board', () => {
    const labels = APP_SECTIONS.map((section) => section.label);
    const quotes = APP_SECTIONS.find((section) => section.label === 'Stoic Quotes');
    expect(quotes).toMatchObject({ href: '/quotes', group: 'tools', icon: 'quote' });
    expect(labels.indexOf('Stoic Quotes')).toBeGreaterThan(labels.indexOf('Drinks & units calculator'));
    expect(labels.indexOf('Stoic Quotes')).toBeLessThan(labels.indexOf('Library'));
    expect(labels.indexOf('Vision Board')).toBeGreaterThan(labels.indexOf('Progress photos'));
    expect(labels.indexOf('Vision Board')).toBeLessThan(labels.indexOf('Drinks & units calculator'));
  });

  it('stores favourites and the pin for the owner only, and exports them', () => {
    const sql = readFileSync('supabase/migrations/20261010280000_stoic_quotes.sql', 'utf8');
    expect(sql).toContain('add column pinned_quote_id text');
    expect(sql).toContain('create table public.user_quotes');
    expect(sql).toContain('on delete cascade');
    expect(sql).toContain('revoke all on public.user_quotes from public, anon, authenticated');
    expect(sql).toContain('grant select, insert, delete on public.user_quotes to authenticated');
    expect(sql).not.toMatch(/grant update on public\.user_quotes/i);
    expect(sql).toContain('using (user_id = auth.uid())');
    expect(sql).toContain("'user_quotes'");
    expect(sql).toContain("'pinnedQuoteId', shown_quote");
    expect(sql).toContain("settings->>'pinnedQuote'");
    const projection = sql.slice(sql.indexOf('function public.public_profile'), sql.indexOf('function public.export_my_data'));
    expect(projection).not.toContain('from public.user_quotes');
    const deleted = readFileSync('supabase/functions/account-delete/index.ts', 'utf8');
    expect(deleted.indexOf("from('user_quotes')")).toBeGreaterThan(0);
    expect(deleted.indexOf("from('user_quotes')")).toBeLessThan(deleted.indexOf('deleteUser'));
    const chat = readFileSync('supabase/functions/thumos-chat/index.ts', 'utf8');
    expect(chat).toContain('pinnedStoicQuote(profile.pinned_quote_id)');
    expect(chat.indexOf('consent_ai')).toBeLessThan(chat.indexOf('pinnedStoicQuote(profile.pinned_quote_id)'));
  });
});
