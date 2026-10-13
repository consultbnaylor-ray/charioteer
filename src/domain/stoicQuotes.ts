import raw from '../data/stoic-quotes.json';
import { londonDay, shiftDay } from './healthInsights';

/**
 * Public-domain lines bundled with the app, Stoic and Platonic. Translations used:
 * Meric Casaubon (died 1671) for Marcus Aurelius, George Long (died 1879)
 * for Epictetus, Aubrey Stewart (died 1918) for Seneca’s dialogues, and
 * C. D. Yonge (died 1891) for Zeno as reported by Diogenes Laertius, and
 * Benjamin Jowett (died 1893) for Plato’s dialogues. Plato is Platonic, not a Stoic.
 * Musonius Rufus and Seneca’s Letters are left out: no English translation
 * out of UK copyright could be verified. The `text` field is that translation.
 * `plain` is Charioteer’s own short paraphrase, not the author’s words.
 */
export const STOIC_THEMES = ['Discipline', 'Courage', 'Control', 'Adversity', 'Self-mastery', 'Temperance'] as const;

export type StoicTheme = (typeof STOIC_THEMES)[number];

export const QUOTE_SCHOOLS = ['Stoic', 'Platonic'] as const;

export type QuoteSchool = (typeof QUOTE_SCHOOLS)[number];

export type StoicQuote = {
  id: string;
  author: string;
  /** Stoic for the Stoics. Platonic for Plato, who was not a Stoic. */
  school: QuoteSchool;
  source: string;
  translator: string;
  text: string;
  /** Charioteer’s plain-English paraphrase. Not the author’s words. */
  plain: string;
  theme: StoicTheme;
};

function isTheme(value: string): value is StoicTheme {
  return (STOIC_THEMES as readonly string[]).includes(value);
}

/** Missing school means Stoic. Plato must be tagged Platonic, and is never stored as a Stoic. */
function asSchool(author: string, value: unknown): QuoteSchool | null {
  if (author === 'Plato') return value === 'Platonic' ? 'Platonic' : null;
  if (value == null || value === 'Stoic') return 'Stoic';
  return null;
}

function asQuote(value: unknown): StoicQuote | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== 'string' || typeof row.author !== 'string' || typeof row.source !== 'string') return null;
  if (typeof row.translator !== 'string' || typeof row.text !== 'string' || typeof row.plain !== 'string' || typeof row.theme !== 'string') return null;
  if (!isTheme(row.theme)) return null;
  const school = asSchool(row.author, row.school);
  if (!school) return null;
  const text = row.text.trim();
  const plain = row.plain.trim();
  if (!text || !plain) return null;
  return {
    id: row.id,
    author: row.author,
    school,
    source: row.source,
    translator: row.translator,
    text,
    plain,
    theme: row.theme,
  };
}

/** Author, school, and source, so a Platonic line is never shown as Stoic. */
export function quoteCredit(quote: Pick<StoicQuote, 'author' | 'school' | 'source'>): string {
  return `${quote.author} · ${quote.school} · ${quote.source}`;
}

export const STOIC_QUOTES: readonly StoicQuote[] = (Array.isArray(raw) ? raw : [])
  .flatMap((item) => {
    const quote = asQuote(item);
    return quote ? [quote] : [];
  })
  .sort((a, b) => a.id.localeCompare(b.id));

const BY_ID = new Map(STOIC_QUOTES.map((quote) => [quote.id, quote]));

export const STOIC_AUTHORS: readonly string[] = [...new Set(STOIC_QUOTES.map((quote) => quote.author))].sort();

export function quoteById(id: string | null | undefined): StoicQuote | null {
  if (!id) return null;
  return BY_ID.get(id) ?? null;
}

/** Days since 1 January 2020, from a calendar date. The same date always lands on the same index. */
export function stoicDayIndex(day: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return 0;
  const utc = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Math.floor((utc - Date.UTC(2020, 0, 1)) / 86_400_000);
}

/** The line for a UK calendar date. No clock and no server job: the date picks the index. */
export function quoteForUkDay(day: string): StoicQuote {
  const count = STOIC_QUOTES.length || 1;
  const index = ((stoicDayIndex(day) % count) + count) % count;
  return STOIC_QUOTES[index];
}

export function quoteOfTheDay(now: Date): StoicQuote {
  return quoteForUkDay(londonDay(now));
}

export function earlierQuoteDay(today: string, daysBack: number): string {
  return shiftDay(today, -Math.max(0, daysBack));
}

export function searchQuotes(input: { query?: string; author?: string | null; theme?: StoicTheme | null }): StoicQuote[] {
  const query = (input.query ?? '').trim().toLowerCase();
  return STOIC_QUOTES.filter((quote) => {
    if (input.author && quote.author !== input.author) return false;
    if (input.theme && quote.theme !== input.theme) return false;
    if (!query) return Boolean(input.author || input.theme);
    return [quote.text, quote.plain, quote.author, quote.school, quote.source, quote.theme, quote.translator].some((part) => part.toLowerCase().includes(query));
  });
}
