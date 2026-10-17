import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import type { Connection } from '@/data/types';

import { discoverAction, incomingRequestCount, peopleTabAccessibilityLabel, requestBadgeText } from './connections';

const me = 'me';
const other = 'other';

function link(status: Connection['status'], requesterId = other, addresseeId = me, id = 'c1'): Connection {
  return { id, requesterId, addresseeId, status, createdAt: '2026-10-01T00:00:00.000Z' };
}

describe('discover connection actions', () => {
  it('asks when there is no live link', () => {
    expect(discoverAction([], me, other)).toEqual({ kind: 'ask' });
    expect(discoverAction([link('declined')], me, other)).toEqual({ kind: 'ask' });
  });

  it('offers accept and decline when the other person sent the request', () => {
    expect(discoverAction([link('pending', other, me, 'req')], me, other)).toEqual({ kind: 'incoming', connectionId: 'req' });
  });

  it('says the request was sent when I am waiting', () => {
    expect(discoverAction([link('pending', me, other)], me, other)).toEqual({ kind: 'sent' });
  });

  it('opens the chat once both have agreed', () => {
    expect(discoverAction([link('accepted', me, other, 'chat')], me, other)).toEqual({ kind: 'message', connectionId: 'chat' });
    expect(discoverAction([link('accepted', other, me, 'chat')], me, other)).toEqual({ kind: 'message', connectionId: 'chat' });
  });

  it('counts only requests addressed to me', () => {
    const rows = [
      link('pending', other, me, 'in'),
      link('pending', 'third', me, 'in2'),
      link('pending', me, other, 'out'),
      link('accepted', other, me, 'done'),
      link('declined', 'fourth', me, 'no'),
    ];
    expect(incomingRequestCount(rows, me)).toBe(2);
    expect(incomingRequestCount(rows, 'nobody')).toBe(0);
  });

  it('names the People tab for one request, many, or none', () => {
    expect(peopleTabAccessibilityLabel(0)).toBe('People');
    expect(peopleTabAccessibilityLabel(1)).toBe('People, 1 request');
    expect(peopleTabAccessibilityLabel(4)).toBe('People, 4 requests');
    expect(requestBadgeText(0)).toBeNull();
    expect(requestBadgeText(1)).toBe('1');
    expect(requestBadgeText(100)).toBe('99+');
  });

  it('puts those actions on the Discover card and a badge on the People tab', () => {
    const people = readFileSync('src/app/(main)/people.tsx', 'utf8');
    const layout = readFileSync('src/app/(main)/_layout.tsx', 'utf8');
    expect(people).toContain('Accept request');
    expect(people).toContain('Decline');
    expect(people).toContain('Request sent');
    expect(people).toContain('Message');
    expect(people).toContain('Ask to connect');
    expect(people).toContain('discoverAction');
    expect(people).not.toContain('Already in touch');
    expect(people).not.toMatch(/gratitude/);
    expect(people).not.toMatch(/thumos|xai|progress-photos/i);
    expect(layout).toContain('incomingRequestCount');
    expect(layout).toContain('peopleTabAccessibilityLabel');
    expect(layout).toContain('requestBadgeText');
    expect(layout).toContain('href === \'/people\'');
    expect(people).toContain("tone={incoming.length > 0 ? 'alert' : 'default'}");
    const choice = readFileSync('src/ui/ui.tsx', 'utf8');
    expect(choice).toContain("tone === 'alert'");
    expect(choice).toContain('alert ? theme.colors.danger');
    expect(layout).toContain('theme.colors.dangerFill');
    expect(layout).toContain('theme.colors.dangerInk');
  });
});
