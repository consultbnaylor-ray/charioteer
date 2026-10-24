import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { londonDay, shiftDay } from './healthInsights';
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
  bio: '',
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
    expect(STOIC_AUTHORS).toEqual(['Epictetus', 'Marcus Aurelius', 'Plato', 'Seneca', 'Zeno of Citium']);
    expect(STOIC_QUOTES.map((quote) => quote.translator)).toEqual(expect.arrayContaining([
      'Meric Casaubon',
      'George Long',
      'Aubrey Stewart',
      'C. D. Yonge',
      'Benjamin Jowett',
    ]));
    expect(STOIC_QUOTES.filter((quote) => quote.author !== 'Plato').every((quote) => quote.school === 'Stoic')).toBe(true);
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

  it('stores a short plain-English paraphrase that is not the translation', () => {
    const seen = new Set<string>();
    for (const quote of STOIC_QUOTES) {
      const words = quote.plain.trim().split(/\s+/);
      expect(words.length, quote.id).toBeGreaterThanOrEqual(25);
      expect(words.length, quote.id).toBeLessThanOrEqual(35);
      const sentences = quote.plain.split(/[.!?]+/).map((part) => part.trim()).filter(Boolean);
      expect(sentences.length, quote.id).toBeGreaterThanOrEqual(1);
      expect(sentences.length, quote.id).toBeLessThanOrEqual(2);
      expect(quote.plain.endsWith('.'), quote.id).toBe(true);
      expect(quote.plain, quote.id).not.toBe(quote.text);
      expect(seen.has(quote.plain), quote.id).toBe(false);
      seen.add(quote.plain);
      const original = new Set<string>();
      const sourceWords = quote.text.toLowerCase().replace(/[^a-z0-9'\s]/g, ' ').split(/\s+/).filter(Boolean);
      for (let index = 0; index <= sourceWords.length - 5; index += 1) original.add(sourceWords.slice(index, index + 5).join(' '));
      const plainWords = quote.plain.toLowerCase().replace(/[^a-z0-9'\s]/g, ' ').split(/\s+/).filter(Boolean);
      for (let index = 0; index <= plainWords.length - 5; index += 1) {
        expect(original.has(plainWords.slice(index, index + 5).join(' ')), quote.id).toBe(false);
      }
    }
    expect(seen.size).toBe(STOIC_QUOTES.length);
    const mark = readFileSync('src/ui/InPlainWords.tsx', 'utf8');
    expect(mark).toContain("export const IN_PLAIN_WORDS = 'In plain words'");
    expect(mark).toContain("export const PLAIN_WORDS_MARK = 'Charioteer’s own words, not the author’s.'");
    expect(mark).toContain('font.bodyItalic');
  });

  it('shows the paraphrase under the daily quote, favourites, and the pin on You', () => {
    const home = readFileSync('src/app/(main)/home.tsx', 'utf8');
    const quotes = readFileSync('src/app/(main)/quotes.tsx', 'utf8');
    const you = readFileSync('src/app/(main)/profile.tsx', 'utf8');
    for (const source of [home, quotes, you]) {
      expect(source).toContain('InPlainWords');
      expect(source).toContain('plain=');
    }
    expect(quotes).toContain('<InPlainWords plain={quote.plain} />');
    expect(quotes).toContain('<InPlainWords plain={daily.plain} />');
    expect(you).toContain('<InPlainWords plain={pinned.plain} />');
    const community = readFileSync('src/ui/CommunityProfile.tsx', 'utf8');
    expect(community).not.toContain('InPlainWords');
    expect(community).not.toContain('.plain');
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
      school: quote.school,
      source: quote.source,
    });
    expect(JSON.stringify(shared)).not.toContain(quote.plain);
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
    expect(context).toContain('Pinned Stoic quote');
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

describe('Plato in the daily rotation', () => {
  const MISATTRIBUTIONS = [
    'Be kind, for everyone you meet is fighting a hard battle',
    'Only the dead have seen the end of war',
    'Wise men speak because they have something to say',
    'Music is a moral law',
    'We can easily forgive a child who is afraid of the dark',
    'A good decision is based on knowledge not on numbers',
    'the practice of dying',
    'be of good cheer about death',
  ];

  it('keeps Plato Platonic, sourced to a dialogue, and inside one full rotation', () => {
    const plato = STOIC_QUOTES.filter((quote) => quote.author === 'Plato');
    expect(plato.length).toBeGreaterThanOrEqual(20);
    expect(plato.length).toBeLessThanOrEqual(30);
    const source = /^(Apology|Charmides|Crito|Gorgias|Laches|Laws|Phaedrus|Protagoras|Republic|Symposium|Theaetetus) \d{2,3}[a-e](?:–(?:\d{2,3})?[a-e])?$/;
    for (const quote of plato) {
      expect(quote.school, quote.id).toBe('Platonic');
      expect(quote.translator, quote.id).toBe('Benjamin Jowett');
      expect(quote.source, quote.id).toMatch(source);
      expect(quote.text, quote.id).not.toMatch(/Plato was a Stoic|Stoic philosopher/i);
      for (const fake of MISATTRIBUTIONS) expect(quote.text, quote.id).not.toContain(fake);
    }
    expect(plato.some((quote) => quote.source.startsWith('Phaedrus 246'))).toBe(true);
    expect(plato.some((quote) => quote.id === 'pl-ap-38a' && quote.text.includes('the unexamined life is not worth living'))).toBe(true);
    const seen = new Set<string>();
    let day = '2020-01-01';
    for (let index = 0; index < STOIC_QUOTES.length; index += 1) {
      const quote = quoteForUkDay(day);
      if (quote.author === 'Plato') seen.add(quote.id);
      day = shiftDay(day, 1);
    }
    expect([...seen].sort()).toEqual(plato.map((quote) => quote.id).sort());
    const byTranslator = searchQuotes({ query: 'Benjamin Jowett' });
    expect(byTranslator.map((quote) => quote.id).sort()).toEqual(plato.map((quote) => quote.id).sort());
    expect(searchQuotes({ author: 'Plato' }).every((quote) => quote.school === 'Platonic')).toBe(true);
  });

  it('labels the library, the pin, and Thumos without calling Plato a Stoic', () => {
    const home = readFileSync('src/app/(main)/home.tsx', 'utf8');
    const quotes = readFileSync('src/app/(main)/quotes.tsx', 'utf8');
    const you = readFileSync('src/app/(main)/profile.tsx', 'utf8');
    expect(quotes).toContain('eyebrow="Stoic & Classical Wisdom"');
    expect(quotes).toContain('Plato is Platonic, not a Stoic.');
    expect(quotes).toContain('{quote.school}');
    expect(home).toContain('quoteCredit(dailyQuote)');
    expect(home).toContain('label="Stoic & classical wisdom"');
    expect(you).toContain('quoteCredit(pinned)');
    expect(you).toContain('label="Pin a quote"');
    expect(you).not.toContain('Pin a Stoic quote');
    const plato = STOIC_QUOTES.find((quote) => quote.id === 'pl-ph-246a');
    expect(plato?.text).toContain('a pair of winged horses and a charioteer');
    const context = buildThumosContext({
      now: new Date('2026-10-11T12:00:00.000Z'),
      displayName: 'Alex',
      sobrietyStartedAt: null,
      reasons: [],
      weeklySpendGbp: null,
      weeklyUnits: null,
      checkIns: [],
      health: [],
      mode: 'steady',
      safety: { selfHarm: false, withdrawal: false, reasons: [] },
      pinnedQuote: plato
        ? { text: plato.text, author: plato.author, source: plato.source, school: plato.school }
        : null,
    });
    expect(context).toContain('Pinned Platonic quote');
    expect(context).toContain('Plato is Platonic, not a Stoic.');
    expect(context).not.toContain('Pinned Stoic quote');
    const prompt = buildSystemPrompt(context, 'steady');
    expect(prompt).toContain('Do not call Plato a Stoic.');
    expect(adaptPromptForSpeech(prompt)).toContain('do not call the author a Stoic');
    const inferred = buildThumosContext({
      now: new Date('2026-10-11T12:00:00.000Z'),
      displayName: 'Alex',
      sobrietyStartedAt: null,
      reasons: [],
      weeklySpendGbp: null,
      weeklyUnits: null,
      checkIns: [],
      health: [],
      mode: 'steady',
      safety: { selfHarm: false, withdrawal: false, reasons: [] },
      pinnedQuote: { text: 'A line.', author: 'Plato', source: 'Phaedrus 246a–b' },
    });
    expect(inferred).toContain('Pinned Platonic quote');
    expect(inferred).not.toContain('Pinned Stoic quote');
  });
});

describe('Stoic quotes in the menu and the database', () => {
  it('sits in Tools without moving Vision Board', () => {
    const labels = APP_SECTIONS.map((section) => section.label);
    const quotes = APP_SECTIONS.find((section) => section.label === 'Stoic & Classical Wisdom');
    expect(quotes).toMatchObject({ href: '/quotes', group: 'tools', icon: 'quote' });
    expect(labels.indexOf('Stoic & Classical Wisdom')).toBeGreaterThan(labels.indexOf('Drinks & units calculator'));
    expect(labels.indexOf('Stoic & Classical Wisdom')).toBeLessThan(labels.indexOf('Library'));
    expect(labels).not.toContain('Stoic Quotes');
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
