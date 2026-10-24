import { useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import { useRepository, useSnapshot } from '@/data';
import { formatUkLong } from '@/domain/dates';
import { shownError } from '@/domain/errors';
import { londonDay } from '@/domain/healthInsights';
import {
  earlierQuoteDay,
  quoteById,
  quoteCredit,
  quoteForUkDay,
  searchQuotes,
  STOIC_AUTHORS,
  STOIC_THEMES,
  type StoicQuote,
  type StoicTheme,
} from '@/domain/stoicQuotes';
import { InPlainWords, QuoteWords } from '@/ui/InPlainWords';
import { Button, Card, Choice, ErrorNote, Field, Screen, T } from '@/ui/ui';

function dayLabel(day: string): string {
  return formatUkLong(`${day}T12:00:00`);
}

function QuoteBody({ quote }: { quote: StoicQuote }) {
  return (
    <View style={{ gap: 6 }}>
      <QuoteWords>{quote.text}</QuoteWords>
      <T variant="muted">{quote.author} · {quote.school}</T>
      <T variant="muted">{quote.source}</T>
      <T variant="muted">{quote.translator}</T>
      <InPlainWords plain={quote.plain} />
      <T variant="label">{quote.theme}</T>
    </View>
  );
}

export default function StoicQuotes() {
  const snap = useSnapshot();
  const repo = useRepository();
  const today = londonDay(new Date());
  const [daysBack, setDaysBack] = useState(0);
  const [query, setQuery] = useState('');
  const [author, setAuthor] = useState<string | null>(null);
  const [theme, setTheme] = useState<StoicTheme | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [shown, setShown] = useState(24);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const pendingRef = useRef<string | null>(null);
  const day = earlierQuoteDay(today, daysBack);
  const daily = quoteForUkDay(day);
  const saved = snap.savedQuotes.flatMap((item) => {
    const quote = quoteById(item.quoteId);
    return quote ? [quote] : [];
  });
  const filtering = Boolean(query.trim() || author || theme);
  const matches = filtering ? searchQuotes({ query, author, theme }) : [];
  const visible = matches.slice(0, shown);

  async function run(id: string, action: () => Promise<void>) {
    if (pendingRef.current) return;
    pendingRef.current = id;
    setPending(id);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(shownError(err, 'Could not update that quote.'));
    } finally {
      pendingRef.current = null;
      setPending(null);
    }
  }

  function actions(quote: StoicQuote) {
    if (openId !== quote.id) return null;
    const savedAlready = snap.savedQuotes.some((item) => item.quoteId === quote.id);
    const pinned = snap.profile?.pinnedQuoteId === quote.id;
    return (
      <View style={{ gap: 8 }}>
        <Button
          label={savedAlready ? 'Remove from my quotes' : 'Save to my quotes'}
          tone="quiet"
          pending={pending === quote.id}
          onPress={() => void run(quote.id, () => (savedAlready ? repo.unsaveQuote(quote.id) : repo.saveQuote(quote.id)))}
        />
        <Button
          label={pinned ? 'Unpin from my profile' : 'Pin to my profile'}
          tone="quiet"
          pending={pending === `${quote.id}-pin`}
          onPress={() => void run(`${quote.id}-pin`, () => repo.pinQuote(pinned ? null : quote.id))}
        />
      </View>
    );
  }

  function row(quote: StoicQuote) {
    return (
      <Card key={`${quote.id}`}>
        <Pressable accessibilityRole="button" accessibilityLabel={`${quote.author}, ${quote.school}. ${quote.text}`} onPress={() => setOpenId(openId === quote.id ? null : quote.id)}>
          <QuoteBody quote={quote} />
        </Pressable>
        {actions(quote)}
      </Card>
    );
  }

  return (
    <Screen
      eyebrow="Stoic & Classical Wisdom"
      title="A line for the day."
      intro="Public-domain translations from the Stoics and from Plato. Plato is Platonic, not a Stoic. The same line for everyone on a UK date."
    >
      {error ? <ErrorNote>{error}</ErrorNote> : null}
      <Card featured>
        <T variant="label">{daysBack === 0 ? 'Quote of the day' : 'Earlier day'}</T>
        <T variant="muted">{dayLabel(day)}</T>
        <QuoteWords>{daily.text}</QuoteWords>
        <T variant="muted">{quoteCredit(daily)}</T>
        <InPlainWords plain={daily.plain} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Button label="Previous day" tone="quiet" onPress={() => setDaysBack((value) => Math.min(value + 1, 364))} />
          <Button label="Next day" tone="quiet" disabled={daysBack === 0} disabledReason={daysBack === 0 ? 'This is today.' : undefined} onPress={() => setDaysBack((value) => Math.max(0, value - 1))} />
        </View>
        <Button label={openId === daily.id ? 'Hide actions' : 'Save or pin this line'} tone="quiet" onPress={() => setOpenId(openId === daily.id ? null : daily.id)} />
        {actions(daily)}
      </Card>
      <Field label="Search" value={query} onChangeText={(value) => { setQuery(value); setShown(24); }} placeholder="Author, theme, or words" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Choice label="Any author" selected={author == null} onPress={() => { setAuthor(null); setShown(24); }} />
        {STOIC_AUTHORS.map((name) => (
          <Choice key={name} label={name} selected={author === name} onPress={() => { setAuthor(author === name ? null : name); setShown(24); }} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Choice label="Any theme" selected={theme == null} onPress={() => { setTheme(null); setShown(24); }} />
        {STOIC_THEMES.map((name) => (
          <Choice key={name} label={name} selected={theme === name} onPress={() => { setTheme(theme === name ? null : name); setShown(24); }} />
        ))}
      </View>
      {filtering ? visible.map((quote) => row(quote)) : <T variant="muted">Choose an author or a theme, or search, to browse the library.</T>}
      {filtering && matches.length > visible.length ? (
        <Button label="Show more" tone="quiet" onPress={() => setShown((value) => value + 24)} />
      ) : null}
      {filtering && matches.length === 0 ? <T variant="muted">No lines match that search.</T> : null}
      <T variant="label">My quotes</T>
      {saved.length === 0 ? <T variant="muted">Nothing saved yet. Tap a line, then Save to my quotes.</T> : saved.map((quote) => row(quote))}
    </Screen>
  );
}
