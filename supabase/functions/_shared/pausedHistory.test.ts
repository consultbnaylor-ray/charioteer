import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { ensureSafetyNotices } from './safety.ts';
import { buildChatCompletionBody, historyTurnsForModel, THUMOS_CHAT } from './thumos.ts';
import {
  COACHING_PAUSED,
  COACHING_PAUSED_EARLIER,
  COACHING_PAUSED_SAVED,
  isFixedPausedCoachingText,
} from './xaiPersonal.ts';

describe('paused replies stay out of the model history', () => {
  it('drops every fixed paused line and backfills the last real turns', () => {
    expect(COACHING_PAUSED_EARLIER).toContain('Coaching is paused. Your personal details were not sent.');
    expect(isFixedPausedCoachingText(COACHING_PAUSED)).toBe(true);
    expect(isFixedPausedCoachingText(COACHING_PAUSED_SAVED)).toBe(true);
    expect(isFixedPausedCoachingText(COACHING_PAUSED_EARLIER[0])).toBe(true);
    expect(isFixedPausedCoachingText(`  ${COACHING_PAUSED}  `)).toBe(true);
    expect(isFixedPausedCoachingText(COACHING_PAUSED.replace("'", '’'))).toBe(true);
    const withNotice = ensureSafetyNotices(COACHING_PAUSED, { selfHarm: true, withdrawal: false, reasons: [] });
    expect(withNotice).not.toBe(COACHING_PAUSED);
    expect(isFixedPausedCoachingText(withNotice)).toBe(true);
    expect(isFixedPausedCoachingText('Thumos remains paused pending xAI confirmation.')).toBe(false);
    expect(isFixedPausedCoachingText('The walk still counts. You are not paused on that.')).toBe(false);

    const real = Array.from({ length: 10 }, (_, index) => ({
      role: index % 2 === 0 ? 'user' : 'assistant',
      content: `real ${index}`,
      createdAt: `2026-10-24T10:${String(index).padStart(2, '0')}:00.000Z`,
    }));
    const paused = [COACHING_PAUSED, COACHING_PAUSED_SAVED, COACHING_PAUSED_EARLIER[0], withNotice].map((content, index) => ({
      role: 'assistant',
      content,
      createdAt: `2026-10-24T11:0${index}:00.000Z`,
    }));
    const history = historyTurnsForModel([...real, ...paused]);
    expect(history).toHaveLength(THUMOS_CHAT.historyLimit);
    expect(history.map((turn) => turn.content)).toEqual(['real 2', 'real 3', 'real 4', 'real 5', 'real 6', 'real 7', 'real 8', 'real 9']);
    expect(history.some((turn) => isFixedPausedCoachingText(turn.content))).toBe(false);

    const body = buildChatCompletionBody({
      system: 'Stay with them.',
      history: [
        { role: 'assistant', content: COACHING_PAUSED },
        { role: 'user', content: 'I want to talk about the walk.' },
        { role: 'assistant', content: 'The walk still counts.' },
      ],
      user: 'What next?',
      stream: false,
    });
    expect(body.messages.map((message) => message.content)).toEqual([
      'Stay with them.',
      'I want to talk about the walk.',
      'The walk still counts.',
      'What next?',
    ]);
    expect(body.messages.some((message) => message.role === 'assistant' && isFixedPausedCoachingText(message.content))).toBe(false);

    expect(THUMOS_CHAT.historyFetchLimit).toBeGreaterThan(THUMOS_CHAT.historyLimit);
    const chat = readFileSync('supabase/functions/thumos-chat/index.ts', 'utf8');
    const voiceToken = readFileSync('supabase/functions/thumos-voice-token/index.ts', 'utf8');
    const voice = readFileSync('supabase/functions/_shared/voice.ts', 'utf8');
    expect(chat).toContain('.limit(THUMOS_CHAT.historyFetchLimit)');
    expect(voiceToken).toContain('.limit(THUMOS_CHAT.historyFetchLimit)');
    expect(chat).toContain('historyTurnsForModel(historyRows)');
    expect(voice).toContain('historyTurnsForModel(input.historyRows)');
    expect(chat).toContain("history.filter((turn) => turn.role === 'assistant')");
    expect(voice).toContain('healthAlreadySaid: history.some');
    expect(readFileSync('app.json', 'utf8')).toContain('"buildNumber": "61"');
  });
});
