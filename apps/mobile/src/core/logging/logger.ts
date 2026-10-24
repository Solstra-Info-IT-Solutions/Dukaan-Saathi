/**
 * Minimal structured logger. Context values are scrubbed so phone numbers, tokens and OTPs never
 * reach logs or a crash reporter (SECURITY_MODEL.md §6). A remote reporter (Sentry) can be attached
 * with `setLogReporter` once a DSN exists — not wired in Phase 01.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogContext = Record<string, unknown>;
export type LogReporter = (level: LogLevel, message: string, context: LogContext) => void;

const SENSITIVE_KEY = /token|password|secret|otp|authorization|apikey|api_key|key$/i;
const PHONE = /\+?91[-\s]?[6-9]\d{9}|\b[6-9]\d{9}\b/g;

export function scrub(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[depth]';
  if (typeof value === 'string') return value.replace(PHONE, '[phone]');
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        SENSITIVE_KEY.test(k) ? '[redacted]' : scrub(v, depth + 1),
      ]),
    );
  }
  return value;
}

let reporter: LogReporter | null = null;

export function setLogReporter(next: LogReporter | null): void {
  reporter = next;
}

function log(level: LogLevel, message: string, context: LogContext = {}): void {
  const safe = scrub(context) as LogContext;
  if (__DEV__) {
    const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    fn(`[${level}] ${message}`, safe);
  }
  if (reporter && (level === 'warn' || level === 'error')) reporter(level, message, safe);
}

export const logger = {
  debug: (message: string, context?: LogContext) => log('debug', message, context),
  info: (message: string, context?: LogContext) => log('info', message, context),
  warn: (message: string, context?: LogContext) => log('warn', message, context),
  error: (message: string, context?: LogContext) => log('error', message, context),
};
