import type { GoalMeasure } from '@/domain/goalLed';

/**
 * One line beside a goal ring.
 * The long sentence, including any safety caveat, stays in About.
 */
export function goalRingLabel(measure: GoalMeasure): string {
  const name = measure.id === 'weight' ? 'Weight' : measure.label;
  if (measure.status === 'Nothing logged yet') return `${name} · nothing logged`;
  if (measure.status === 'No target yet') return `${name} · no target`;
  if (measure.id === 'protein') {
    const target = measure.status.match(/\(target ([\d,]+) g\)/)?.[1];
    return target ? `Protein ${measure.centre} / ${target} g` : `Protein ${measure.centre} g`;
  }
  if (measure.id === 'kcal') {
    const target = measure.words.match(/([\d,]+) kcal/)?.[1];
    const shown = grouped(measure.centre);
    return target ? `Calories ${shown} / ${target} kcal` : `Calories ${shown} kcal`;
  }
  if (measure.id === 'sessions') {
    if (measure.unit.startsWith('of ')) return `Training ${measure.centre} / ${measure.unit.slice(3)} days`;
    if (measure.unit === 'min') return `Training ${measure.centre} min`;
    return `Training ${measure.centre} ${measure.unit}`.trim();
  }
  if (measure.id === 'sleep') {
    const note = measure.status === 'Short' ? ' · short' : measure.status === 'Above the usual range' ? ' · long' : '';
    return `Sleep ${measure.centre} h${note}`;
  }
  if (measure.id === 'weight') return weightRingLabel(measure);
  return `${name} ${measure.centre} ${measure.unit}`.replace(/\s+/g, ' ').trim();
}

function weightRingLabel(measure: GoalMeasure): string {
  const over = measure.status.match(/([\d.]+) kg over the upper limit/);
  if (over) return `Weight ${over[1]} kg over class`;
  const under = measure.status.match(/([\d.]+) kg under the lower limit/);
  if (under) return `Weight ${under[1]} kg under class`;
  if (measure.status.includes('Inside the class') || measure.signal === 'Inside the class') {
    return `Weight ${measure.centre} kg in class`;
  }
  if (measure.status === 'One reading') return `Weight ${measure.centre} kg`;
  if (measure.status === 'Steady') return `Weight ${measure.centre} kg · steady`;
  const change = measure.words.match(/\b(up|down) ([\d.]+) kg/);
  if (change) return `Weight ${change[1]} ${change[2]} kg`;
  return `Weight ${measure.centre} kg`;
}

/** Sentences that stay on the card. The rest of a pace note can sit in About. */
const URGENT_SENTENCE = /fainting|urgent help|call 999|nhs 111|immediate danger|chest pain/i;

export function splitUrgentCopy(text: string): { shown: string; rest: string } {
  const sentences = text.split(/(?<=[.!?])\s+/).map((part) => part.trim()).filter(Boolean);
  const shown = sentences.filter((part) => URGENT_SENTENCE.test(part));
  const rest = sentences.filter((part) => !URGENT_SENTENCE.test(part));
  return { shown: shown.join(' '), rest: rest.join(' ') };
}

/** A one-line chip for a health headline. The full sentence stays in About. */
export function insightChip(headline: string): string {
  const text = headline.trim();
  const sleep = text.match(/Sleep has been under (\d+) hours on (\d+) of the last (\d+) nights/i);
  if (sleep) return `Sleep · under ${sleep[1]}h on ${sleep[2]} of ${sleep[3]} nights`;
  const high = text.match(/Resting heart rate has been above (\d+) bpm on (\d+) of the last (\d+) days/i);
  if (high) return `Resting HR · over ${high[1]} bpm on ${high[2]} of ${high[3]} days`;
  const rise = text.match(/Resting heart rate is (\d+) bpm higher/i);
  if (rise) return `Resting HR · ${rise[1]} bpm higher`;
  if (/heart rate variability has been below/i.test(text)) return 'HRV · below your usual';
  const lost = text.match(/Weight is about (\d+)% lower/i);
  if (lost) return `Weight · ${lost[1]}% lower`;
  if (/not enough readings/i.test(text)) return 'No 7-day comparison yet';
  const week = text.match(/^(.+?) (?:(?:is|are) )?(up|down) (\d+)% on the previous 7 days$/i);
  if (week) return `${shortSubject(week[1] ?? '')} · ${week[2]} ${week[3]}%`;
  const same = text.match(/^(.+?) (?:is|are) about the same/i);
  if (same) return `${shortSubject(same[1] ?? '')} · about the same`;
  if (/^Range |^Held at /.test(text)) return text;
  if (text.length <= 42) return text;
  const first = text.split(/(?<=[.!?])\s+/)[0]?.trim() ?? text;
  return first.length <= 42 ? first : `${first.slice(0, 41).trimEnd()}…`;
}

function shortSubject(subject: string): string {
  if (/resting heart rate/i.test(subject)) return 'Resting HR';
  if (/heart rate variability/i.test(subject)) return 'HRV';
  return subject.trim();
}

/** The number on the Daily Targets card. The how-to sentences stay in About. */
export function dailyTargetChip(plan: { intake: string; targetKcal: number }): string {
  const target = plan.targetKcal.toLocaleString('en-GB');
  const drop = plan.intake.match(/Drop calorie intake by ([\d,]+) kcal\/day/);
  if (drop) return `${target} kcal · drop ${drop[1]}`;
  const raise = plan.intake.match(/Raise calorie intake by ([\d,]+) kcal\/day/);
  if (raise) return `${target} kcal · add ${raise[1]}`;
  if (/Hold about/i.test(plan.intake)) return `${target} kcal · hold`;
  return `${target} kcal`;
}

/** One line for the weight-range bar. The class sentence stays in About. */
export function weightRangeChip(words: string): string {
  const text = words.trim();
  const over = text.match(/([\d.]+) kg over the upper limit/);
  if (over) return `${over[1]} kg over class`;
  const under = text.match(/([\d.]+) kg under the lower limit/);
  if (under) return `${under[1]} kg under class`;
  if (text.includes('Inside the class')) return 'Inside the class';
  if (text === 'Within range' || text.startsWith('Within range')) return 'Within range';
  const lose = text.match(/^About (.+?) to lose/i);
  if (lose) return `${lose[1]} above the range`;
  const gain = text.match(/^About (.+?) to gain/i);
  if (gain) return `${gain[1]} under the range`;
  if (/no scale target|no separate published/i.test(text)) return 'No scale target';
  if (/log a weight/i.test(text)) return 'No weight logged';
  if (text.length <= 42) return text;
  const first = text.split('.')[0]?.trim() ?? text;
  return first.length <= 42 ? first : `${first.slice(0, 41).trimEnd()}…`;
}

function grouped(centre: string): string {
  const value = Number(centre.replace(/,/g, ''));
  return Number.isFinite(value) ? value.toLocaleString('en-GB') : centre;
}
