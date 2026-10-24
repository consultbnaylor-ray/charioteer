/**
 * Shown when coaching will not send personal or health context to xAI
 * because this person has not chosen the interim path.
 */
export const COACHING_PAUSED =
  "Thumos is paused while we wait for xAI to confirm that they won't save your data. Everything else in the app still works.";

/** Shown when they have chosen to continue, but the operator has not opened that path. Nothing was sent. */
export const COACHING_PAUSED_SAVED =
  "Your choice is saved. Thumos stays paused while we wait for xAI to confirm that they won't save your data. Nothing was sent.";

/**
 * Server kill switch. Unset, empty, or any value other than false leaves coaching on.
 * Ben sets XAI_PERSONAL_DATA_ENABLED=false after checking Zero Data Retention.
 */
export function xaiPersonalDataEnabled(value: string | null | undefined): boolean {
  if (value == null || value.trim() === '') return true;
  return value.trim().toLowerCase() !== 'false';
}

/**
 * Operator gate for the temporary per-person choice.
 * Only the exact word true opens it. Missing, empty, or anything else stays closed.
 */
export function xaiInterimOptInAllowed(value: string | null | undefined): boolean {
  return value?.trim().toLowerCase() === 'true';
}

/** The stored choice counts only when it is exactly true. Missing or unreadable sends nothing. */
export function interimCoachOptIn(value: unknown): boolean {
  return value === true;
}

/**
 * XAI_PERSONAL_DATA_ENABLED=false stays the kill switch.
 * A person gets through that closed switch only when the operator has opened
 * XAI_INTERIM_OPT_IN_ALLOWED and this person's own choice is exactly true.
 */
export function coachingPersonalDataAllowed(input: {
  personalDataFlag: string | null | undefined;
  interimFlag: string | null | undefined;
  userOptIn: unknown;
}): boolean {
  if (xaiPersonalDataEnabled(input.personalDataFlag)) return true;
  if (!xaiInterimOptInAllowed(input.interimFlag)) return false;
  return interimCoachOptIn(input.userOptIn);
}

export function pausedCoachingMessage(userOptIn: unknown): string {
  return interimCoachOptIn(userOptIn) ? COACHING_PAUSED_SAVED : COACHING_PAUSED;
}

type InterimReader = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: unknown }>;
      };
    };
  };
};

/**
 * Reads profiles.consent_xai_interim for the signed-in person.
 * A missing column, a failed read, or a value other than true comes back as undefined
 * so the caller sends nothing while the kill switch is off.
 */
export async function readInterimCoachOptIn(client: InterimReader, userId: string): Promise<unknown> {
  try {
    const res = await client.from('profiles').select('consent_xai_interim').eq('id', userId).maybeSingle();
    if (res.error || !res.data) return undefined;
    if (!Object.prototype.hasOwnProperty.call(res.data, 'consent_xai_interim')) return undefined;
    return res.data.consent_xai_interim;
  } catch {
    return undefined;
  }
}
