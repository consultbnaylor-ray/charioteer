import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  buildSystemPrompt,
  formatReminderClock,
  MOTIVATION_MEMORY,
  motivationForTurn,
  MOVEMENT_REMINDER_BODY,
  parseReminderClock,
  thumosReplyFaults,
} from './thumos';

const EVENING = new Date('2026-10-14T17:30:00.000Z');
const RUN = "I can't be bothered to run";

describe('thumos motivation', () => {
  it('varies five replies to the same cannot-be-bothered-to-run prompt', () => {
    const ids: string[] = [];
    const replies: string[] = [];
    let recentIds: string[] = [];
    const earlier: string[] = [];
    let first: NonNullable<ReturnType<typeof motivationForTurn>> | null = null;
    for (let step = 0; step < 12; step += 1) {
      const plan = motivationForTurn({ text: RUN, recentIds, now: EVENING });
      expect(plan).not.toBeNull();
      if (!plan) return;
      const prior = ids.slice(Math.max(0, ids.length - MOTIVATION_MEMORY));
      expect(prior).not.toContain(plan.id);
      expect(thumosReplyFaults(plan.reply, earlier.slice(-3))).toEqual([]);
      expect(plan.reply).not.toMatch(/followed|recent check-in|tied to that figure|I can set a reminder/i);
      if (step === 0) first = plan;
      ids.push(plan.id);
      replies.push(plan.reply);
      earlier.push(plan.reply);
      recentIds = plan.recentIds;
    }
    expect(new Set(ids.slice(0, 5)).size).toBe(5);
    expect(new Set(replies.slice(0, 5)).size).toBe(5);
    expect(replies[0]).toContain('just put your trainers on and step outside for 5 minutes');
    expect(replies[0]).toContain('This evening');
    expect(ids[0]).toBe('tiny_step');
    expect(MOTIVATION_MEMORY).toBe(10);
    expect(ids[11]).toBe(ids[0]);
    expect(replies.join(' ')).toMatch(/endorphin/i);
    expect(replies.join(' ')).toMatch(/dopamine/i);
    expect(replies.join(' ')).toMatch(/endocannabinoid/i);

    if (!first) throw new Error('missing first motivation reply');
    const prompt = buildSystemPrompt('CONTEXT', 'steady', undefined, { motivation: first });
    expect(prompt).toContain('MOTIVATION TURN');
    expect(prompt).toContain(replies[0]);
    expect(prompt).toContain('not medical advice');
    const support = buildSystemPrompt('CONTEXT', 'support', undefined, {
      motivation: first,
      selfHarm: true,
    });
    expect(support).not.toContain('MOTIVATION TURN');
    expect(support).not.toContain('cannot be bothered');
  });

  it('uses their own words, and rests instead of pushing through illness or a low mood', () => {
    const own = motivationForTurn({
      text: 'I cannot be bothered to go to the gym',
      now: EVENING,
      reasons: ['I want my evenings back'],
      visionStatement: 'A strong quiet year',
    });
    expect(own?.id).toBe('tiny_step');
    const second = motivationForTurn({
      text: 'I cannot be bothered to go to the gym',
      now: EVENING,
      recentIds: own ? [own.id] : [],
      reasons: ['I want my evenings back'],
      visionStatement: 'A strong quiet year',
    });
    expect(second?.id).toBe('own_words');
    expect(second?.reply).toContain('I want my evenings back');

    const ill = motivationForTurn({ text: "I can't be bothered to run, my knee is injured", now: EVENING });
    expect(ill?.id).toBe('rest');
    expect(ill?.reply.toLowerCase()).not.toContain('trainers');
    expect(ill?.reply).toMatch(/rest/i);

    const low = motivationForTurn({ text: "I can't be bothered to walk", now: EVENING, mood: 3 });
    expect(low?.id).toBe('rest');
    expect(low?.reply).toMatch(/rest/i);

    const drink = motivationForTurn({ text: "I can't be bothered to run and I really want a drink" });
    expect(drink).toBeNull();
    const crisis = motivationForTurn({
      text: "I can't be bothered to run. I want to kill myself.",
      safety: { selfHarm: true, withdrawal: false },
    });
    expect(crisis).toBeNull();
    expect(motivationForTurn({ text: RUN, mode: 'support' })).toBeNull();
  });

  it('keeps the movement reminder off, timed, and free of health details', () => {
    expect(parseReminderClock('18:00')).toBe(18 * 60);
    expect(parseReminderClock('7:05')).toBe(7 * 60 + 5);
    expect(parseReminderClock('24:00')).toBeNull();
    expect(formatReminderClock(18 * 60)).toBe('18:00');
    expect(MOVEMENT_REMINDER_BODY).not.toMatch(/mood|streak|weight|calorie|sober|craving|body fat/i);
    const sql = readFileSync('supabase/migrations/20261014190000_thumos_motivation.sql', 'utf8');
    expect(sql).toContain('movement_reminder boolean not null default false');
    expect(sql).toContain('thumos_motivation_memory');
    expect(sql).toContain('user_id = auth.uid()');
    expect(sql).toContain('cardinality(recent_ids) <= 10');
    const screen = readFileSync('src/app/(main)/notifications.tsx', 'utf8');
    expect(screen).not.toContain('Movement reminder');
    expect(screen).not.toContain('movementReminder');
    const register = readFileSync('src/notifications/register.ts', 'utf8');
    expect(register).toContain('cancelAllScheduledNotificationsAsync');
    expect(register).not.toContain('scheduleNotificationAsync');
    const chat = readFileSync('supabase/functions/thumos-chat/index.ts', 'utf8');
    const modeAt = chat.indexOf('resolveThumosMode(');
    const planAt = chat.indexOf('motivationForTurn(');
    expect(modeAt).toBeGreaterThan(0);
    expect(planAt).toBeGreaterThan(modeAt);
    expect(chat).toContain("from('thumos_motivation_memory')");
    const intro = readFileSync('src/app/onboarding.tsx', 'utf8');
    expect(intro).toContain('cannot be bothered to start');
  });
});
