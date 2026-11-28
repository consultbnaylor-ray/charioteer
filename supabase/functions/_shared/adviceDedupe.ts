/**
 * One line per advice topic in a single note or plan.
 * A later, more specific line replaces an earlier one on the same topic.
 * The body-fat protein tip wins over the general protein-short line.
 * Weekly focus items stay on the first row and keep the fuller complete sentence.
 */

import { LOW_CARDIO_CONTEXT_LINE, VO2_FOCUS_LINE, VO2_ZONE2_TIP, ZONE2_BESIDE_WORK } from './trainingGuidance.ts';

const CANONICAL_ADVICE = [VO2_FOCUS_LINE, ZONE2_BESIDE_WORK, VO2_ZONE2_TIP, LOW_CARDIO_CONTEXT_LINE];

const WEEKDAY = /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/;

export function adviceTopic(line: string): string {
  const text = line.trim().toLowerCase();
  if (/^protein logged today is short of the target/.test(text)) return 'protein-short';
  if (/^protein is still short of the target/.test(text)) return 'protein-short';
  if (/^protein logged today meets the target/.test(text)) return 'protein-met';
  if (/^protein today meets the target/.test(text)) return 'protein-met';
  if (/interval/.test(text) && /vo2|4\s*[x×]\s*4|85/.test(text)) return 'vo2-intervals';
  if (!WEEKDAY.test(text) && /zone\s*2/.test(text) && /(base and recovery|aerobic base|not the main way to raise vo2)/.test(text)) {
    return 'zone2-base';
  }
  if (/^fitness goal:/.test(text)) return 'fitness-goal';
  return `line:${text}`;
}

/** Higher means this wording should stay when two lines share a topic. */
function adviceRank(line: string): number {
  if (/do not skip drinks/i.test(line)) return 3;
  if (/another protein meal/i.test(line)) return 2;
  if (/still short of the target/i.test(line)) return 1;
  return 0;
}

function normalizeAdvice(line: string): string {
  return line
    .toLowerCase()
    .replace(/×/g, 'x')
    .replace(/[–—]/g, '-')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function lastSentenceEnd(text: string): number {
  for (let i = text.length - 1; i >= 24; i -= 1) {
    const mark = text[i];
    if ((mark === '.' || mark === '!' || mark === '?') && (i === text.length - 1 || text[i + 1] === ' ')) return i;
  }
  return -1;
}

/**
 * A stored slice such as "hard enoug" is put back to the full sentence when it is
 * that sentence cut short. Otherwise an unfinished tail is dropped at the previous sentence.
 */
export function finishAdviceText(value: string, mode: 'restore' | 'sentence' = 'restore'): string {
  const text = value.replace(/\s+/g, ' ').trim();
  if (!text) return '';
  for (const canon of CANONICAL_ADVICE) {
    if (canon.length > text.length && canon.startsWith(text)) {
      const next = canon.charAt(text.length);
      if (/[\p{L}\p{N}]/u.test(next)) return canon;
    }
  }
  if (mode !== 'sentence' || /[.!?]$/.test(text)) return text;
  const end = lastSentenceEnd(text);
  if (end >= 24) return text.slice(0, end + 1).trim();
  return text;
}

/** Same advice when the topic id matches, or one wording is the start of the other. */
export function sameAdvice(left: string, right: string): boolean {
  const a = finishAdviceText(left, 'restore');
  const b = finishAdviceText(right, 'restore');
  if (!a || !b) return false;
  const topicA = adviceTopic(a);
  const topicB = adviceTopic(b);
  if (!topicA.startsWith('line:') && topicA === topicB) return true;
  const normalA = normalizeAdvice(a);
  const normalB = normalizeAdvice(b);
  if (!normalA || !normalB) return false;
  if (normalA === normalB) return true;
  const [shorter, longer] = normalA.length <= normalB.length ? [normalA, normalB] : [normalB, normalA];
  if (shorter.length < 48) return false;
  return longer.startsWith(shorter);
}

function preferText(current: string, incoming: string): string {
  const left = finishAdviceText(current, 'sentence');
  const right = finishAdviceText(incoming, 'sentence');
  const score = (text: string) => (/[.!?]$/.test(text) ? 10000 : 0) + text.length;
  return score(right) > score(left) ? right : left;
}

/** Zone colours name the watch. They do not send logging to another product. */
export function keepsWatchZoneWording(line: string): boolean {
  const topic = adviceTopic(finishAdviceText(line, 'restore'));
  if (topic !== 'vo2-intervals' && topic !== 'zone2-base') return false;
  if (/\b(log|track|sync|download|install|another app|tracking app|myfitnesspal|fitbit)\b/i.test(line)) return false;
  return true;
}

export function dedupeAdviceLines(lines: readonly string[]): string[] {
  const kept: { line: string; topic: string; rank: number; index: number }[] = [];
  lines.forEach((raw, index) => {
    const line = finishAdviceText(raw.trim(), 'restore');
    if (!line) return;
    const topic = adviceTopic(line);
    const rank = adviceRank(line);
    const existing = kept.findIndex((item) => sameAdvice(item.line, line));
    if (existing < 0) {
      kept.push({ line, topic, rank, index });
      return;
    }
    const prior = kept[existing];
    if (prior) {
      const incomingCut = /…|\.{3}/.test(line);
      const priorCut = /…|\.{3}/.test(prior.line);
      const longer = line.length > prior.line.length && !incomingCut;
      if (rank > prior.rank || (rank === prior.rank && (longer || (priorCut && !incomingCut)))) {
        kept[existing] = { line, topic, rank, index };
      }
    }
  });
  return kept.sort((left, right) => left.index - right.index).map((item) => item.line);
}

type FocusItem = { text: string; done: boolean };

/**
 * One row per piece of advice. The fuller complete sentence stays.
 * The row is ticked when either copy was ticked. Order stays with the first copy.
 */
export function dedupeFocusItems<T extends FocusItem>(items: readonly T[]): T[] {
  const kept: { item: T; index: number }[] = [];
  items.forEach((raw, index) => {
    const text = finishAdviceText(raw.text, 'sentence');
    if (!text) return;
    const at = kept.findIndex((row) => sameAdvice(row.item.text, text));
    if (at < 0) {
      kept.push({ item: { ...raw, text }, index });
      return;
    }
    const prior = kept[at];
    if (!prior) return;
    const better = preferText(prior.item.text, text);
    kept[at] = {
      item: { ...prior.item, text: better, done: prior.item.done || raw.done },
      index: prior.index,
    };
  });
  return kept.sort((left, right) => left.index - right.index).map((row) => row.item);
}

/** The saved focus row for this advice, including a shorter or cut copy of the same line. */
export function matchingFocus<T extends FocusItem>(items: readonly T[], text: string): T | null {
  const wanted = text.replace(/\s+/g, ' ').trim().toLowerCase();
  if (!wanted) return null;
  return items.find((item) => item.text.replace(/\s+/g, ' ').trim().toLowerCase() === wanted)
    ?? items.find((item) => sameAdvice(item.text, text))
    ?? null;
}
