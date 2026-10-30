import { useCallback, useRef, useState } from 'react';
import type { SignUpResult } from '../../domain/entities/AuthSession';
import type {
  RegisterAccount,
  RequestPasswordReset,
  ResetPassword,
  SignInWithPassword,
} from '../../domain/usecases/authUseCases';
import { authErrorKey } from './useLoginViewModel';

export { MIN_PASSWORD_LENGTH } from '../../domain/usecases/authUseCases';
export type { SignUpResult } from '../../domain/entities/AuthSession';

/** Runs one request at a time and keeps its error message key. */
function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const running = useRef(false);
  const run = useCallback(async <T>(work: () => Promise<T>): Promise<T | null> => {
    if (running.current) return null;
    running.current = true;
    setBusy(true);
    setErrorKey(null);
    try {
      return await work();
    } catch (error) {
      setErrorKey(authErrorKey(error));
      return null;
    } finally {
      running.current = false;
      setBusy(false);
    }
  }, []);
  return { busy, errorKey, setErrorKey, run };
}

export interface PasswordLoginViewModelDeps {
  signInWithPassword: SignInWithPassword;
}

/** Email + password sign-in. Success signs the user in; the session controller opens the shop. */
export function usePasswordLoginViewModel(deps: PasswordLoginViewModelDeps, initialEmail = '') {
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const { busy, errorKey, setErrorKey, run } = useSubmit();
  const submit = useCallback(
    () => run(() => deps.signInWithPassword.execute(email, password)),
    [deps, email, password, run],
  );
  return {
    state: { email, password, busy, errorKey },
    actions: {
      setEmail: (v: string) => {
        setEmail(v);
        setErrorKey(null);
      },
      setPassword: (v: string) => {
        setPassword(v);
        setErrorKey(null);
      },
      submit,
    },
  };
}

export interface RegisterViewModelDeps {
  registerAccount: RegisterAccount;
}

/** New shop-owner account: name, email, password twice. */
export function useRegisterViewModel(deps: RegisterViewModelDeps) {
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const { busy, errorKey, setErrorKey, run } = useSubmit();
  const set = useCallback(
    (field: keyof typeof form) => (value: string) => {
      setForm((f) => ({ ...f, [field]: value }));
      setErrorKey(null);
    },
    [setErrorKey],
  );
  const submit = useCallback(
    (): Promise<SignUpResult | null> => run(() => deps.registerAccount.execute(form)),
    [deps, form, run],
  );
  return {
    state: { ...form, busy, errorKey },
    actions: {
      setName: set('name'),
      setEmail: set('email'),
      setPassword: set('password'),
      setConfirm: set('confirm'),
      submit,
    },
  };
}

export interface ForgotPasswordViewModelDeps {
  requestPasswordReset: RequestPasswordReset;
  resetPassword: ResetPassword;
}

/** Step 1: email → a code is emailed. Step 2: code + new password → signed in with the new password. */
export function useForgotPasswordViewModel(deps: ForgotPasswordViewModelDeps, initialEmail = '') {
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const { busy, errorKey, setErrorKey, run } = useSubmit();

  const sendCode = useCallback(async () => {
    const sentTo = await run(() => deps.requestPasswordReset.execute(email));
    if (sentTo) {
      setEmail(sentTo);
      setStep('code');
    }
  }, [deps, email, run]);

  const reset = useCallback(
    () => run(() => deps.resetPassword.execute(email, code, password, confirm)),
    [code, confirm, deps, email, password, run],
  );

  const clear = (setter: (v: string) => void) => (v: string) => {
    setter(v);
    setErrorKey(null);
  };
  return {
    state: { step, email, code, password, confirm, busy, errorKey },
    actions: {
      setEmail: clear(setEmail),
      setCode: clear(setCode),
      setPassword: clear(setPassword),
      setConfirm: clear(setConfirm),
      sendCode,
      reset,
      back: () => setStep('email'),
    },
  };
}
