import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { THUMOS_LINE_CAP, groupThumosByDay, messageNeedsMore, thumosDayLabel, visibleThumos } from './thumosThread';
import { introSeenIn, withIntroSeen } from '../ui/thumosIntroMemory';

describe('thumos conversation window', () => {
  it('shows only the latest message, and keeps a fresh send with its reply', () => {
    const saturday = new Date(2026, 9, 10, 15, 0).toISOString();
    const sunday = new Date(2026, 9, 11, 15, 0).toISOString();
    const messages = [
      { role: 'guide', createdAt: saturday, content: 'How are you feeling?' },
      { role: 'user', createdAt: saturday, content: 'The afternoon felt long.' },
      { role: 'assistant', createdAt: saturday, content: 'Tea and a short walk are enough for now.' },
      { role: 'user', createdAt: sunday, content: 'Restless this afternoon, but I slept.' },
      { role: 'assistant', createdAt: sunday, content: 'A walk before dinner has suited you.' },
    ];
    expect(THUMOS_LINE_CAP).toBe(6);
    expect(visibleThumos(messages, null)).toEqual({ visible: [messages[4]], earlier: messages.slice(0, 4) });
    expect(visibleThumos(messages, null).earlier.some((message) => message.role === 'user')).toBe(true);
    expect(visibleThumos([], null)).toEqual({ visible: [], earlier: [] });
    const opening = [
      { role: 'guide', createdAt: saturday, content: 'Earlier hello' },
      { role: 'guide', createdAt: sunday, content: 'How are you feeling?' },
    ];
    expect(visibleThumos(opening, null)).toEqual({ visible: [opening[1]], earlier: [opening[0]] });
    expect(visibleThumos(messages, 'Restless this afternoon, but I slept.')).toEqual({
      visible: messages.slice(3),
      earlier: messages.slice(0, 3),
    });
    expect(visibleThumos(messages, 'Not stored yet')).toEqual({ visible: [], earlier: messages });
    expect(thumosDayLabel(sunday)).toBe('Sunday 11 October 2026');
    expect(groupThumosByDay(messages).map((day) => day.heading)).toEqual([
      'Saturday 10 October 2026',
      'Sunday 11 October 2026',
    ]);
    expect(groupThumosByDay(messages)[0].messages).toHaveLength(3);
    expect(groupThumosByDay(messages)[1].messages).toHaveLength(2);
    expect(messageNeedsMore('One short line.')).toBe(false);
    expect(messageNeedsMore('word '.repeat(20))).toBe(false);
    expect(messageNeedsMore('word '.repeat(40))).toBe(true);
    expect(messageNeedsMore(Array.from({ length: 7 }, () => 'Line').join('\n'))).toBe(true);
  });

  it('remembers that the intro was opened once', () => {
    expect(introSeenIn(null, 'alex')).toBe(false);
    expect(introSeenIn('not json', 'alex')).toBe(false);
    const stored = withIntroSeen(null, 'alex');
    expect(introSeenIn(stored, 'alex')).toBe(true);
    expect(introSeenIn(stored, 'sam')).toBe(false);
    expect(introSeenIn(withIntroSeen(stored, 'sam'), 'alex')).toBe(true);
  });

  it('renders compact bubbles, a one-line intro, and a show-earlier control', () => {
    const screen = readFileSync('src/app/(main)/thumos.tsx', 'utf8');
    expect(screen).toContain('Thumos is your sober and fitness coach, tap to read more');
    expect(screen).toContain('THUMOS_INTRO');
    expect(screen).toContain('numberOfLines={1}');
    expect(screen).toContain('Show earlier messages (${earlier.length})');
    expect(screen).toContain('accessibilityLabel={earlierLabel}');
    expect(screen).toContain('accessibilityLabel={heading}');
    expect(screen).toContain('accessibilityState={{ expanded: open }}');
    expect(screen).toContain('useFocusEffect');
    expect(screen).toContain('key={threadVisit}');
    expect(screen).toContain('visibleThumos');
    expect(screen).toContain('setKeptSend(null)');
    expect(screen).toContain('setKeptSend(trimmed)');
    expect(screen).toContain('groupThumosByDay');
    expect(screen).toContain('accessibilityLabel="More"');
    expect(screen).toContain('messageNeedsMore');
    expect(screen).toContain('numberOfLines={open || !long ? undefined : THUMOS_LINE_CAP}');
    expect(screen).not.toContain('THUMOS_VISIBLE');
    expect(screen).toContain("alignSelf: mine ? 'flex-end' : 'flex-start'");
    expect(screen).toContain("maxWidth: '80%'");
    expect(screen).toContain('fontSize: 15 * theme.scale');
    expect(screen).toContain('lineHeight: 20 * theme.scale');
    expect(screen).toContain('paddingVertical: 10');
    expect(screen).toContain('paddingHorizontal: 14');
    expect(screen).toContain('gap: 4');
    expect(screen).toContain('nativeID="thumos-latest"');
    expect(screen).toContain("scrollIntoView({ block: 'end' })");
    expect(screen).toContain("mine={message.role === 'user'}");
    expect(screen).not.toContain("message.role === 'user' ? 'You'");
    expect(screen).not.toContain("variant=\"label\">{message.role");
  });
});
