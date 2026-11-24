/**
 * Split copy so one sentence can stay on the card.
 * A following warning stays with it. "2.2 g" is not a sentence break.
 */
const WARNING_SENTENCE = /has not yet confirmed|dangerous|call 999|not a doctor|NHS 111|immediate danger|not medical advice/i;

export function explanationSplit(text: string): { lead: string; rest: string } {
  const trimmed = text.trim();
  const sentences = trimmed.split(/(?<=[.!?])\s+(?=[A-Z])/).map((part) => part.trim()).filter(Boolean);
  if (sentences.length <= 1) return { lead: trimmed, rest: '' };
  const keep = sentences[1] && WARNING_SENTENCE.test(sentences[1]) ? 2 : 1;
  return {
    lead: sentences.slice(0, keep).join(' '),
    rest: sentences.slice(keep).join(' '),
  };
}
