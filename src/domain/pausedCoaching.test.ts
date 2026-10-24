import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { ensureSafetyNotices } from './safety';
import { COACHING_PAUSED, COACHING_PAUSED_SAVED } from '../../supabase/functions/_shared/xaiPersonal';
import { PAUSED_COACHING_HREF, PAUSED_COACHING_LINK, isPausedCoachingNote, isPausedCoachingText } from './pausedCoaching';

describe('paused coaching link', () => {
  it('recognises both paused sentences, including a crisis reply, and ignores other text', () => {
    expect(isPausedCoachingText(COACHING_PAUSED)).toBe(true);
    expect(isPausedCoachingText(COACHING_PAUSED_SAVED)).toBe(true);
    const crisis = ensureSafetyNotices(COACHING_PAUSED, { selfHarm: true, withdrawal: false, reasons: [] });
    expect(isPausedCoachingText(crisis)).toBe(true);
    expect(isPausedCoachingText('Tea and a short walk are enough for now.')).toBe(false);
    expect(isPausedCoachingText("won't save your data")).toBe(false);
    expect(isPausedCoachingText(null)).toBe(false);
    expect(isPausedCoachingNote('Could not start voice.', 'paused')).toBe(true);
    expect(isPausedCoachingNote('Could not start voice.', 'unavailable')).toBe(false);
  });

  it('opens Privacy and consent at the switch and does not turn the switch on', () => {
    const link = readFileSync('src/ui/PausedCoachingLink.tsx', 'utf8');
    const screen = readFileSync('src/app/(main)/thumos.tsx', 'utf8');
    const choices = readFileSync('src/ui/ConsentChoices.tsx', 'utf8');
    expect(PAUSED_COACHING_LINK).toBe('Choose whether to continue before xAI confirms');
    expect(PAUSED_COACHING_HREF).toBe('/privacy?section=interim');
    expect(link).toContain('PAUSED_COACHING_HREF');
    expect(link).toContain('textDecorationLine: \'underline\'');
    expect(link).toContain('accessibilityHint="Opens Privacy and consent. It does not turn the choice on."');
    expect(link).not.toContain('setInterimCoachOptIn');
    expect(link).not.toContain('onInterim');
    expect(screen).toContain('<PausedCoachingLink />');
    expect(screen).toContain('isPausedCoachingText(text)');
    expect(screen).toContain("mint.code === 'paused'");
    expect(screen).not.toContain('setInterimCoachOptIn');
    const target = choices.indexOf('<ScrollTarget id="interim">');
    expect(target).toBeGreaterThan(choices.indexOf('onChange={onAi}'));
    expect(target).toBeLessThan(choices.indexOf('title={INTERIM_COACH_TITLE}'));
    expect(choices.indexOf('</ScrollTarget>')).toBeGreaterThan(choices.indexOf('onChange={onInterim}'));
    expect(choices.indexOf('</ScrollTarget>')).toBeLessThan(choices.indexOf('title="Message notifications"'));
  });
});