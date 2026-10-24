import { STOIC_CATALOGUE } from './stoicCatalogue.ts';

export type PinnedStoicQuote = {
  id: string;
  text: string;
  author: string;
  source: string;
  /** Plato is Platonic. Every other author in this catalogue is Stoic. */
  school: 'Stoic' | 'Platonic';
};

const byId = new Map<string, PinnedStoicQuote>();
for (const row of STOIC_CATALOGUE) {
  byId.set(row.id, {
    id: row.id,
    text: row.text,
    author: row.author,
    source: row.source,
    school: row.author === 'Plato' ? 'Platonic' : 'Stoic',
  });
}

/** Catalogue text for a pinned id. Unknown ids are ignored, so a client cannot publish arbitrary words. */
export function pinnedStoicQuote(id: unknown): PinnedStoicQuote | null {
  if (typeof id !== 'string' || !id) return null;
  return byId.get(id) ?? null;
}
