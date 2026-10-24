import { useCallback, useEffect, useRef, useState } from 'react';
import type { OtpDestination } from '../../domain/entities/AuthSession';
import type { RequestOtp, VerifyOtp } from '../../domain/usecases/authUseCases';
import { authErrorKey } from './useLoginViewModel';

export const RESEND_SECONDS = 30;

export interface OtpViewModelDeps {
  verifyOtp: VerifyOtp;
  requestOtp: RequestOtp;
}

export interface OtpState {
  code: string;
  status: 'idle' | 'verifying' | 'resending' | 'verified' | 'error';
  errorKey: string | null;
  resendInSeconds: number;
}

/**
 * Verifies the one-time code. On success the auth listener updates the session store and the
 * root layout's guards move the user on — this ViewModel does not navigate.
 */
export function useOtpViewModel({ verifyOtp, requestOtp }: OtpViewModelDeps, destination: OtpDestination) {
  const [state, setState] = useState<OtpState>({
    code: '',
    status: 'idle',
    errorKey: null,
    resendInSeconds: RESEND_SECONDS,
  });
  const busy = useRef(false);

  useEffect(() => {
    if (state.resendInSeconds <= 0) return;
    const timer = setTimeout(() => setState((s) => ({ ...s, resendInSeconds: s.resendInSeconds - 1 })), 1000);
    return () => clearTimeout(timer);
  }, [state.resendInSeconds]);

  const setCode = useCallback((code: string) => {
    setState((s) => ({ ...s, code: code.replace(/\D/g, '').slice(0, 8), errorKey: null, status: 'idle' }));
  }, []);

  const verify = useCallback(async (): Promise<boolean> => {
    if (busy.current) return false;
    busy.current = true;
    setState((s) => ({ ...s, status: 'verifying', errorKey: null }));
    try {
      await verifyOtp.execute(destination, state.code);
      setState((s) => ({ ...s, status: 'verified' }));
      return true;
    } catch (error) {
      setState((s) => ({ ...s, status: 'error', errorKey: authErrorKey(error) }));
      return false;
    } finally {
      busy.current = false;
    }
  }, [verifyOtp, destination, state.code]);

  const resend = useCallback(async () => {
    if (busy.current || state.resendInSeconds > 0) return;
    busy.current = true;
    setState((s) => ({ ...s, status: 'resending', errorKey: null }));
    try {
      const value = destination.kind === 'phone' ? destination.phoneE164 : destination.email;
      await requestOtp.execute(destination.kind, value);
      setState((s) => ({ ...s, status: 'idle', code: '', resendInSeconds: RESEND_SECONDS }));
    } catch (error) {
      setState((s) => ({ ...s, status: 'error', errorKey: authErrorKey(error) }));
    } finally {
      busy.current = false;
    }
  }, [requestOtp, destination, state.resendInSeconds]);

  return { state, actions: { setCode, verify, resend } };
}
