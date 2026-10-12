import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  buildSystemPrompt,
  freshThumosFallback,
  mentionsCheckInOrHealth,
  replyRecaps,
  replyRepeatsRecent,
  thumosReplyFaults,
} from './thumos';

const CLOSING = 'What part of sleep or another area from exercise, nutrition, connection or purpose do you want to try?';

describe('thumos reply post-check', () => {
  it('rejects recap and a repeated ending across four turns, and accepts a direct thread', () => {
    const bad = [
      `You've followed the dog walk and gym, and that is a solid base. ${CLOSING}`,
      `Your recent check-in recorded 7 hours of sleep, which is a steady night. ${CLOSING}`,
      `Ten o'clock is a clear bedtime. Put the phone in another room at half past nine. ${CLOSING}`,
      `You have followed that plan through the week. Maintaining momentum will help. ${CLOSING}`,
    ];
    const earlier: string[] = [];
    const faults = bad.map((reply) => {
      const found = thumosReplyFaults(reply, earlier);
      earlier.push(reply);
      return found;
    });
    expect(faults[0]).toContain('recap');
    expect(faults[1]).toEqual(expect.arrayContaining(['recap', 'repeat']));
    expect(faults[2]).toContain('repeat');
    expect(faults[2]).not.toContain('recap');
    expect(faults[3]).toEqual(expect.arrayContaining(['recap', 'repeat', 'banned']));
    expect(replyRepeatsRecent(bad[2], bad.slice(0, 2))).toBe(true);
    expect(replyRecaps(bad[0])).toBe(true);
    expect(replyRecaps("You've followed the dog walk and gym.")).toBe(true);

    const good = [
      'Ten o\'clock is a clear bedtime. Put the phone in another room at half past nine.',
      'A short walk after dinner can make that hour easier to keep.',
      'If the evening runs long, set an alarm for half past nine and call it lights out.',
      'That is enough of a plan for tonight. I am here if the evening gets noisy.',
    ];
    const seen: string[] = [];
    for (const reply of good) {
      expect(thumosReplyFaults(reply, seen)).toEqual([]);
      expect(replyRecaps(reply)).toBe(false);
      expect(replyRepeatsRecent(reply, seen)).toBe(false);
      seen.push(reply);
    }
    expect(seen).toHaveLength(4);

    const firstFigure = 'Seven hours of sleep last night is enough to protect a ten o\'clock bedtime.';
    const secondFigure = 'Those hours of sleep can stay where they are. Keep the phone out of the bedroom.';
    expect(mentionsCheckInOrHealth(firstFigure)).toBe(true);
    expect(thumosReplyFaults(firstFigure, [])).toEqual([]);
    expect(thumosReplyFaults(secondFigure, [firstFigure])).toContain('health');
    expect(thumosReplyFaults(secondFigure, [firstFigure, good[0], good[1]]).filter((fault) => fault === 'health')).toEqual(['health']);
    expect(freshThumosFallback([firstFigure, ...bad])).not.toMatch(/followed|check-in|momentum|tied to that figure/i);
    expect(thumosReplyFaults(freshThumosFallback(bad), bad)).toEqual([]);
  });

  it('asks the chat function to reject a draft before it is sent', () => {
    const chat = readFileSync('supabase/functions/thumos-chat/index.ts', 'utf8');
    const checkAt = chat.indexOf('thumosReplyFaults(modelText, earlierAssistant)');
    const sendAt = chat.indexOf("send({ type: 'delta', text: reply })", checkAt);
    expect(checkAt).toBeGreaterThan(0);
    expect(sendAt).toBeGreaterThan(checkAt);
    expect(chat).toContain('THUMOS_RETRY_NOTE');
    expect(chat).toContain('freshThumosFallback(earlierAssistant)');
    expect(chat).toContain('healthAlreadySaid:');
    const prompt = buildSystemPrompt('CONTEXT', 'steady');
    expect(prompt).toContain('Do not recap');
    expect(prompt).toContain('at most once');
    expect(prompt).toContain('never in two replies in a row');
    expect(prompt).toContain('2 to 4 sentences');
    expect(prompt).not.toContain('What part of sleep or another area');
  });
});
