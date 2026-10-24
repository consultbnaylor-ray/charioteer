import { COACHING_PAUSED, COACHING_PAUSED_SAVED } from '../../supabase/functions/_shared/xaiPersonal';

/** The row under a paused coach note. It only opens the choice. It does not turn it on. */
export const PAUSED_COACHING_LINK = 'Choose whether to continue before xAI confirms';

/** Privacy & consent, scrolled to the temporary switch. */
export const PAUSED_COACHING_HREF = '/privacy?section=interim';

/** True when this text is the server's paused reply, including a reply that also carries a safety notice. */
export function isPausedCoachingText(text: string | null | undefined): boolean {
  if (!text) return false;
  return text.includes(COACHING_PAUSED) || text.includes(COACHING_PAUSED_SAVED);
}

/** Voice mint uses this code when coaching is paused. The message text is checked as well. */
export function isPausedCoachingNote(text: string | null | undefined, code?: string | null): boolean {
  return code === 'paused' || isPausedCoachingText(text);
}
