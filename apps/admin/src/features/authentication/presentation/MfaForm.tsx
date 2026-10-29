'use client';

import { useActionState, useState, useTransition } from 'react';
import { type MfaState, startEnrolmentAction, verifyCodeAction } from './mfaActions';
import { button, input } from '@/core/ui/classes';

const ERRORS: Record<NonNullable<MfaState['error']>, string> = {
  invalid_code: 'That code is not right. Enter the 6 digits shown in your authenticator app now.',
  enroll_failed: 'Could not start the set-up. Try again.',
  signed_out: 'Your session ended. Sign in again.',
};

/**
 * Operators must use a second factor (TOTP). First time: scan the QR code, then enter a code. Later: enter a code.
 */
export function MfaForm({
  factorId,
  start = startEnrolmentAction,
  verify = verifyCodeAction,
}: {
  /** A verified factor of this operator, or null when they still have to set one up. */
  factorId: string | null;
  start?: typeof startEnrolmentAction;
  verify?: typeof verifyCodeAction;
}) {
  const [enrolment, setEnrolment] = useState<MfaState>({ enrolment: null, error: null });
  const [starting, startTransition] = useTransition();
  const [state, formAction, pending] = useActionState(verify, enrolment);
  const activeFactor = factorId ?? state.enrolment?.factorId ?? enrolment.enrolment?.factorId ?? null;
  const shown = state.enrolment ?? enrolment.enrolment;
  const error = state.error ?? enrolment.error;

  if (!activeFactor) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-ink">
          Set up an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…) for this
          account.
        </p>
        {error ? (
          <p role="alert" className="text-sm text-error">
            {ERRORS[error]}
          </p>
        ) : null}
        <button
          type="button"
          disabled={starting}
          onClick={() => startTransition(async () => setEnrolment(await start()))}
          className={`${button} w-full`}
        >
          {starting ? 'Preparing…' : 'Set up authenticator'}
        </button>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {shown ? (
        <div className="flex flex-col items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- data URL from Supabase */}
          <img src={shown.qrCode} alt="QR code for your authenticator app" width={180} height={180} />
          <p className="text-xs text-ink-2">
            Or enter this key: <code className="break-all">{shown.secret}</code>
          </p>
        </div>
      ) : null}
      <input type="hidden" name="factorId" value={activeFactor} />
      <label className="flex flex-col gap-1 text-sm font-medium text-ink">
        6-digit code
        <input
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          required
          className={`${input} text-base tracking-widest`}
        />
      </label>
      {error ? (
        <p role="alert" className="text-sm text-error">
          {ERRORS[error]}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className={`${button} w-full`}>
        {pending ? 'Checking…' : 'Verify'}
      </button>
    </form>
  );
}
