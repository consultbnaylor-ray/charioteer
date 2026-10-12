import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { THUMOS_EXPANDED, THUMOS_LINE_CAP, THUMOS_VISIBLE, latestThumos, messageNeedsMore } from './thumosThread';
import { introSeenIn, withIntroSeen } from '../ui/thumosIntroMemory';

describe('thumos conversation window', () => {
  it('shows the latest six messages and counts the rest as earlier', () => {
    const messages = Array.from({ length: 10 }, (_, index) => index);
    expect(THUMOS_VISIBLE).toBe(6);
    expect(THUMOS_LINE_CAP).toBe(6);
    expect(latestThumos(messages, 6)).toEqual({ visible: messages.slice(4), earlier: 4 });
    expect(latestThumos(messages, 6.9).visible).toEqual(messages.slice(4));
    expect(latestThumos(messages, THUMOS_EXPANDED)).toEqual({ visible: messages, earlier: 0 });
    expect(latestThumos([], 6)).toEqual({ visible: [], earlier: 0 });
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
    expect(screen).toContain('Thumos is your Sober Coach, tap to read more');
    expect(screen).toContain('THUMOS_INTRO');
    expect(screen).toContain('numberOfLines={1}');
    expect(screen).toContain('Show earlier messages');
    expect(screen).toContain('accessibilityLabel="More"');
    expect(screen).toContain('messageNeedsMore');
    expect(screen).toContain('numberOfLines={open || !long ? undefined : THUMOS_LINE_CAP}');
    expect(screen).toContain('setShown(THUMOS_EXPANDED)');
    expect(screen).toContain('latestThumos');
    expect(screen).toContain('THUMOS_VISIBLE');
    expect(screen).toContain("alignSelf: mine ? 'flex-end' : 'flex-start'");
    expect(screen).toContain("maxWidth: '80%'");
    expect(screen).toContain('fontSize: 15 * theme.scale');
    expect(screen).toContain('lineHeight: 20 * theme.scale');
    expect(screen).toContain('paddingVertical: 6');
    expect(screen).toContain('paddingHorizontal: 10');
    expect(screen).toContain('gap: 4');
    expect(screen).toContain('nativeID="thumos-latest"');
    expect(screen).toContain("scrollIntoView({ block: 'end' })");
    expect(screen).toContain("mine={message.role === 'user'}");
    expect(screen).not.toContain("message.role === 'user' ? 'You'");
    expect(screen).not.toContain("variant=\"label\">{message.role");
  });
});
