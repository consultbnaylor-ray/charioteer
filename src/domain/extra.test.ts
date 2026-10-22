import { describe, expect, it } from 'vitest';
import { crisisHelplines, RESOURCE_CATALOGUE } from '../data/catalogue';
import { planCustomInterest, slugifyInterest, validateTown } from './privacy';
import { readFileSync } from 'node:fs';

import { clearUrge, ensureUrge, restartUrge, urgeStartedAt } from '@/features/urgeSession';
import { formatClock, urgeRemainingSeconds } from './urge';
import { detectRisk } from './thumos';

describe('town privacy', () => {
  it('accepts a town and rejects a postcode or street number', () => {
    expect(validateTown('Bristol')).toBeNull();
    expect(validateTown('')).toBeNull();
    expect(validateTown('BS1 4ST')).toMatch(/postcode/i);
    expect(validateTown('12 Example Road')).toMatch(/street/i);
  });

  it('slugifies custom interests', () => {
    expect(slugifyInterest('Five-a-side')).toBe('five-a-side');
  });

  it('treats a repeated interest name as the same slug', () => {
    const first = planCustomInterest('Comedy');
    const again = planCustomInterest('  comedy ');
    const shout = planCustomInterest('COMEDY');
    expect(first).toEqual({ ok: true, slug: 'comedy', label: 'Comedy' });
    expect(again).toEqual({ ok: true, slug: 'comedy', label: 'comedy' });
    expect(shout).toEqual({ ok: true, slug: 'comedy', label: 'COMEDY' });
    expect(planCustomInterest('Gym')).toMatchObject({ slug: 'gym' });
    expect(planCustomInterest('!!')).toEqual({ ok: false, message: 'Use letters or numbers.' });
    const long = planCustomInterest('a'.repeat(41));
    expect(long.ok).toBe(false);
    if (!long.ok) expect(long.message).toMatch(/40 characters/);
  });
});

describe('urge timer', () => {
  it('counts down ten minutes and clamps at zero', () => {
    expect(urgeRemainingSeconds(1_000, 1_000)).toBe(600);
    expect(formatClock(600)).toBe('10:00');
    expect(formatClock(65)).toBe('1:05');
    expect(urgeRemainingSeconds(0, 11 * 60 * 1000)).toBe(0);
  });

  it('starts only when asked, and forgets the countdown when the chat closes', () => {
    clearUrge();
    expect(urgeStartedAt()).toBeNull();
    restartUrge(5_000);
    expect(urgeStartedAt()).toBe(5_000);
    clearUrge();
    expect(urgeStartedAt()).toBeNull();
    expect(ensureUrge(6_000)).toBe(6_000);
    clearUrge();
    expect(urgeStartedAt()).toBeNull();
  });

  it('treats a finished word such as pub as planning, and leaves a longer word alone', () => {
    expect(detectRisk('pub')).toBe('planning');
    expect(detectRisk('the pub')).toBe('planning');
    expect(detectRisk('public')).toBe('none');
    expect(detectRisk('pubs')).toBe('none');
    expect(detectRisk('crav')).toBe('acute');
  });

  it('reads craving words only from a sent Thumos message, and waits for Start ten minutes', () => {
    const screen = readFileSync('src/app/(main)/thumos.tsx', 'utf8');
    const modeBlock = screen.slice(screen.indexOf('const mode: ThumosMode'), screen.indexOf('const showSupport'));
    expect(modeBlock).not.toContain('draft');
    expect(modeBlock).not.toContain('userText');
    const sendBlock = screen.slice(screen.indexOf('async function send'), screen.indexOf('const inCall'));
    expect(sendBlock).toContain('userText: trimmed');
    expect(sendBlock).not.toContain('userText: draft');
    expect(screen).not.toContain('ensureUrge');
    expect(screen).toContain('clearUrge()');
    expect(screen).toContain("label={urgeStart == null ? 'Start ten minutes' : 'Start the ten minutes again'}");
    expect(screen).toContain('if (urgeStart == null) return');
    const safety = screen.slice(screen.indexOf('const safety'), screen.indexOf('const notices'));
    expect(safety).toContain('draft,');
    expect(safety).toContain('firstSafetyHit');
  });
});

describe('resource catalogue', () => {
  it('includes the verified UK helplines', () => {
    const phones = RESOURCE_CATALOGUE.filter((item) => item.category === 'helplines' && item.verification === 'verified').map((item) => item.phone);
    expect(phones).toEqual(expect.arrayContaining(['0300 123 1110', '116 123', '111', '999']));
  });

  it('shows bundled helplines when the signed-out query has none', () => {
    const lines = crisisHelplines([]);
    expect(lines.map((item) => item.title)).toEqual(expect.arrayContaining(['Drinkline', 'Samaritans']));
    expect(lines.every((item) => item.category === 'helplines')).toBe(true);
    const remote = [{ ...lines[0], title: 'From the database' }];
    expect(crisisHelplines(remote).map((item) => item.title)).toEqual(['From the database']);
    expect(crisisHelplines(RESOURCE_CATALOGUE.filter((item) => item.category === 'quit_lit')).some((item) => item.title === 'Samaritans')).toBe(true);
  });

  it('does not invent a link for an unchecked book', () => {
    const book = RESOURCE_CATALOGUE.find((item) => item.title === 'This Naked Mind');
    expect(book?.url).toBeNull();
    expect(book?.verification).toBe('unverified');
  });
});
