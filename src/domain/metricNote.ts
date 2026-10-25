/**
 * One More info shape for a metric card.
 * Verdicts use only the number, band, age, and target already passed in.
 * Nothing here fetches data or invents an age table.
 */

export type ReadingPlace = 'none' | 'below' | 'within' | 'above';

export function placeReading(value: number | null, low: number, high: number): ReadingPlace {
  if (value == null || !Number.isFinite(value)) return 'none';
  if (value < low) return 'below';
  if (value > high) return 'above';
  return 'within';
}

function count(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 100) return Math.round(abs).toLocaleString('en-GB');
  const rounded = Math.round(abs * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/** How the reading sits against a stored target. No target means that is said, not invented. */
export function targetComparison(
  value: number | null,
  target: { value: number; unit: string } | null,
): string {
  if (target == null) return 'No target is set for this, so it is not compared with a personal target.';
  const goal = count(target.value);
  if (value == null) return `Your target is ${goal} ${target.unit}. There is no reading yet to compare with it.`;
  const gap = value - target.value;
  if (Math.abs(gap) < 0.05) return `This matches your target of ${goal} ${target.unit}.`;
  const way = gap > 0 ? 'above' : 'below';
  return `You are ${count(gap)} ${target.unit} ${way} your target of ${goal} ${target.unit}.`;
}

/**
 * Age is used only when a published age band is passed in.
 * A missing age uses the general adult range and says so.
 * A metric with no age band does not get one invented.
 */
export function ageRangeLine(input: {
  age: number | null;
  ageBand: { low: number; high: number; unit: string; source: string } | null;
  general: { low: number; high: number; unit: string; source: string } | null;
  /** Set when the metric is a device scale with no healthy-person age norm. */
  ownScale: string | null;
}): string {
  if (input.ownScale) return input.ownScale;
  if (input.age != null && input.ageBand) {
    const band = input.ageBand;
    return `For a typical healthy adult around age ${input.age}, ${band.source} gives about ${count(band.low)} to ${count(band.high)} ${band.unit}.`;
  }
  if (input.general) {
    const band = input.general;
    const range = `${band.source} uses a general adult range of ${count(band.low)} to ${count(band.high)} ${band.unit}.`;
    if (input.age == null) return `${range} This is based on a general adult range, because age isn't set.`;
    return `Your age is set as ${input.age}. ${range} That source is not split by age, so this is not a comparison with someone your exact age.`;
  }
  if (input.age == null) return "Age isn't set, and there is no published adult range here to use.";
  return `Your age is set as ${input.age}. There is no published age-banded range here, so nothing is compared with a typical person of that age.`;
}

export function rangeVerdict(place: ReadingPlace, kind: 'range' | 'higher' | 'own'): string {
  if (place === 'none') return 'There is no reading yet to judge.';
  if (kind === 'own') return 'There is no healthy-person range for this. Compare it with your own usual days. That is general guidance, not a diagnosis.';
  if (kind === 'higher') {
    if (place === 'below') return 'This is under the reference range. That is general guidance, not a diagnosis, and it is not an alarm on its own.';
    return 'This looks healthy for general guidance. It is not a diagnosis.';
  }
  if (place === 'within') return 'This looks healthy for general guidance. It is not a diagnosis.';
  if (place === 'below') return 'This is under the usual range. That can be normal for some people. It is general guidance, not a diagnosis.';
  return 'This sits above the usual range. That is general guidance, not a diagnosis, and one spell of readings is not an alarm.';
}

export function metricParagraph(parts: {
  what: string;
  comparison: string;
  target: string;
  verdict: string;
  consider: string;
  source: string;
}): string {
  return [parts.what, parts.comparison, parts.target, parts.verdict, parts.consider, parts.source]
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}
