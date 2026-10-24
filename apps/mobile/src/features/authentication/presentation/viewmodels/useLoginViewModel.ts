import { useCallback, useRef, useState } from 'react';
import { translateError } from '@/core/errors/translateError';
import type { OtpChannel, OtpDestination } from '../../domain/entities/AuthSession';
import { AuthInputError } from '../../domain/errors';
import type { RequestOtp } from '../../domain/usecases/authUseCases';

export interface LoginViewModelDeps {
  requestOtp: RequestOtp;
}

export interface LoginState {
  channel: OtpChannel;
  value: string;
  status: 'idle' | 'sending' | 'error';
  errorKey: string | null;
}

export function authErrorKey(error: unknown): string {
  if (error instanceof AuthInputError) return `auth.errors.${error.reason}`;
  return translateError(error).messageKey;
}

/** Collects a phone number (default) or email and asks for a one-time code. */
export function useLoginViewModel({ requestOtp }: LoginViewModelDeps) {
  const [state, setState] = useState<LoginState>({
    channel: 'phone',
    value: '',
    status: 'idle',
    errorKey: null,
  });
  const sending = useRef(false);

  const setChannel = useCallback((channel: OtpChannel) => {
    setState({ channel, value: '', status: 'idle', errorKey: null });
  }, []);

  const setValue = useCallback((value: string) => {
    setState((s) => ({ ...s, value, status: s.status === 'error' ? 'idle' : s.status, errorKey: null }));
  }, []);

  /** Resolves to the destination when the code was sent; the screen navigates. */
  const submit = useCallback(async (): Promise<OtpDestination | null> => {
    if (sending.current) return null;
    sending.current = true;
    setState((s) => ({ ...s, status: 'sending', errorKey: null }));
    try {
      const destination = await requestOtp.execute(state.channel, state.value);
      setState((s) => ({ ...s, status: 'idle' }));
      return destination;
    } catch (error) {
      setState((s) => ({ ...s, status: 'error', errorKey: authErrorKey(error) }));
      return null;
    } finally {
      sending.current = false;
    }
  }, [requestOtp, state.channel, state.value]);

  return { state, actions: { setChannel, setValue, submit } };
}
