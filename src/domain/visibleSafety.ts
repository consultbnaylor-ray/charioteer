/**
 * Urgent-care wording that stays on the card.
 * The longer explanation and the self-care tips sit behind More info.
 */
export const VISIBLE_SAFETY_LINE =
  'Not medical advice. If you feel unwell, contact your GP or NHS 111. Call 999 for chest pain, fainting or breathlessness.';

/** Drops the GP, NHS 111, and 999 sentences. Those stay in VISIBLE_SAFETY_LINE. */
export function selfCareStep(step: string): string {
  return step
    .replace(/\s*If you feel unwell, contact your GP or NHS 111\./gi, '')
    .replace(/\s*If it stays up, contact your GP or NHS 111\./gi, '')
    .replace(/\s*If short sleep carries on, contact your GP or NHS 111\./gi, '')
    .replace(/\s*If you did not mean to lose this weight, or it keeps falling, contact your GP or NHS 111\./gi, '')
    .replace(/\s*If this was not your aim, contact your GP or NHS 111\./gi, '')
    .replace(/\s*a GP or NHS 111 can talk it through\./gi, '')
    .replace(/\s*Contact your GP or NHS 111\./gi, '')
    .replace(/\s*Call 999 if you have chest pain, fainting, or breathlessness\./gi, '')
    .replace(/\s*Call 999 if there is a seizure, confusion, or you feel unsafe\./gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}
