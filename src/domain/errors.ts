export type ErrorContext = 'sign-in' | 'sign-up' | 'thumos' | 'reset' | 'general';

export type UserFacingCode =
  | 'offline'
  | 'email_taken'
  | 'wrong_password'
  | 'weak_password'
  | 'confirm_email'
  | 'generic';

export const OFFLINE_MESSAGE = "Couldn't reach Charioteer, check your connection and try again.";
export const EMAIL_TAKEN_MESSAGE = 'An account with this email already exists. Sign in instead?';
export const WRONG_PASSWORD_MESSAGE = 'That email or password is not right.';
export const WEAK_PASSWORD_MESSAGE = 'Use at least 8 characters.';
export const CONFIRM_EMAIL_MESSAGE = 'Check your email to confirm the account, then sign in.';
export const RESET_SENT_MESSAGE = "If an account exists for that email, we've sent a link to set a new password.";
export const RESET_NEEDS_EMAIL = 'Enter the email on your account, then try Forgot password again.';

const NETWORK =
  /network connection was lost|network request failed|failed to fetch|fetch failed|load failed|internet connection|enotfound|econnreset|etimedout|network error|timed out|timeout/i;

const TECHNICAL =
  /expomodulescore|\.swift\b|\.ts:\d|unexpectedexception|\(at\s+\S+|node_modules|pgrst\d+|stack trace|cannot read propert|is not a function|is not defined|of undefined|of null|typeerror|referenceerror|permission denied|row-level security|violates|duplicate key|invalid input syntax|null value in column|jwt|relation "|column "|syntax error|postgrest/i;

export class UserFacingError extends Error {
  readonly code: UserFacingCode;

  constructor(message: string, code: UserFacingCode) {
    super(message);
    this.name = 'UserFacingError';
    this.code = code;
  }
}

export function isTransientNetworkError(error: unknown): boolean {
  return NETWORK.test(errorText(error));
}

function errorText(error: unknown): string {
  if (error == null) return '';
  if (typeof error === 'string') return error;
  if (typeof error !== 'object') return String(error);
  const record = error as { message?: unknown; code?: unknown; name?: unknown; cause?: unknown };
  const parts = [record.name, record.code, record.message].map((part) => (part == null ? '' : String(part)));
  if (record.cause) parts.push(errorText(record.cause));
  return parts.filter(Boolean).join(' ');
}

function plainMessage(error: unknown): string {
  if (error instanceof Error) return error.message.trim();
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') return error.message.trim();
  return '';
}

function isSafeToShow(message: string): boolean {
  if (!message || message.length > 180 || message.includes('\n')) return false;
  return !TECHNICAL.test(message) && !NETWORK.test(message);
}

function fallback(context: ErrorContext): string {
  if (context === 'sign-in') return 'Could not sign in. Try again.';
  if (context === 'sign-up') return 'Could not create the account. Try again.';
  if (context === 'thumos') return "Couldn't send that. Try again in a moment.";
  if (context === 'reset') return 'Could not update the password. Try again.';
  return 'Something went wrong. Try again.';
}

function matchKnown(text: string): UserFacingError | null {
  const lower = text.toLowerCase();
  if (/already registered|already been registered|user_already_exists|email address.+already|already exists/.test(lower)) {
    return new UserFacingError(EMAIL_TAKEN_MESSAGE, 'email_taken');
  }
  if (/invalid login|invalid credentials|invalid email or password|wrong password/.test(lower)) {
    return new UserFacingError(WRONG_PASSWORD_MESSAGE, 'wrong_password');
  }
  if (/weak_password|password should be at least|password is too short|at least \d+ characters/.test(lower)) {
    return new UserFacingError(WEAK_PASSWORD_MESSAGE, 'weak_password');
  }
  if (/email not confirmed|not confirmed/.test(lower)) {
    return new UserFacingError(CONFIRM_EMAIL_MESSAGE, 'confirm_email');
  }
  if (/too many requests|rate limit|over_request_rate_limit/.test(lower)) {
    return new UserFacingError('Too many attempts. Wait a moment and try again.', 'generic');
  }
  return null;
}

/** Returns copy that is safe to put on screen. Raw details are logged when they are not shown. */
export function asUserFacing(error: unknown, context: ErrorContext): UserFacingError {
  if (error instanceof UserFacingError) return error;
  const text = errorText(error);
  if (isTransientNetworkError(error)) {
    console.error(context, error);
    return new UserFacingError(OFFLINE_MESSAGE, 'offline');
  }
  const known = matchKnown(text);
  if (known) {
    console.error(context, error);
    return known;
  }
  const plain = plainMessage(error);
  if (isSafeToShow(plain)) return new UserFacingError(plain, 'generic');
  console.error(context, error);
  return new UserFacingError(fallback(context), 'generic');
}

export function shownError(error: unknown, fallbackMessage: string, context: ErrorContext = 'general'): string {
  const faced = asUserFacing(error, context);
  if (faced.code === 'generic' && faced.message === fallback(context)) return fallbackMessage;
  return faced.message;
}

const PRIVATE_MESSAGE_FALLBACK = 'Could not open a private message.';

function errorCode(error: unknown): string {
  if (!error || typeof error !== 'object' || !('code' in error)) return '';
  const code = (error as { code?: unknown }).code;
  if (typeof code === 'string') return code.trim();
  if (typeof code === 'number' && Number.isFinite(code)) return String(code);
  return '';
}

function firstLine(value: string): string {
  return value.split('\n')[0].replace(/\s+/g, ' ').trim();
}

/** Code plus the server message, without a stack trace or a token. */
function serverReason(error: unknown): string {
  const code = errorCode(error);
  const raw = typeof error === 'string' ? error : plainMessage(error);
  const message = firstLine(raw);
  const text = (code && message && !message.startsWith(code) ? `${code}: ${message}` : message || code)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
  if (!text || /node_modules|\.swift\b|\.ts:\d|jwt|bearer\s|eyJ[A-Za-z0-9_-]{12,}/i.test(text)) return '';
  return text;
}

/**
 * Copy for a failed private message. A sentence we wrote stays as it is.
 * A server failure keeps its code and message, so the screen can show why it failed.
 */
export function privateMessageFailure(error: unknown): string {
  console.error(error);
  if (error instanceof UserFacingError) return error.message;
  if (isTransientNetworkError(error)) return OFFLINE_MESSAGE;
  const known = matchKnown(errorText(error));
  if (known) return known.message;
  return serverReason(error) || PRIVATE_MESSAGE_FALLBACK;
}
