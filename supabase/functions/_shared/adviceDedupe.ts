/**
 * One line per advice topic in a single note or plan.
 * A later, more specific line replaces an earlier one on the same topic.
 * The body-fat protein tip wins over the general protein-short line.
 */

function adviceTopic(line: string): string {
  const text = line.trim().toLowerCase();
  if (/^protein logged today is short of the target/.test(text)) return 'protein-short';
  if (/^protein is still short of the target/.test(text)) return 'protein-short';
  if (/^protein logged today meets the target/.test(text)) return 'protein-met';
  if (/^protein today meets the target/.test(text)) return 'protein-met';
  return `line:${text}`;
}

/** Higher means this wording should stay when two lines share a topic. */
function adviceRank(line: string): number {
  if (/do not skip drinks/i.test(line)) return 3;
  if (/another protein meal/i.test(line)) return 2;
  if (/still short of the target/i.test(line)) return 1;
  return 0;
}

export function dedupeAdviceLines(lines: readonly string[]): string[] {
  const kept: { line: string; topic: string; rank: number; index: number }[] = [];
  lines.forEach((raw, index) => {
    const line = raw.trim();
    if (!line) return;
    const topic = adviceTopic(line);
    const rank = adviceRank(line);
    const existing = kept.findIndex((item) => item.topic === topic);
    if (existing < 0) {
      kept.push({ line, topic, rank, index });
      return;
    }
    const prior = kept[existing];
    if (prior && rank > prior.rank) kept[existing] = { line, topic, rank, index };
  });
  return kept.sort((left, right) => left.index - right.index).map((item) => item.line);
}
