'use client';

import { useActionState } from 'react';
import { type LoginFormState, signInAction } from './actions';

const ERROR_TEXT: Record<NonNullable<LoginFormState['error']>, string> = {
  invalid_input: 'Enter a valid email and a password of at least 8 characters.',
  invalid_credentials: 'Email or password is incorrect.',
  backend_not_configured: 'The admin panel is not connected to a Supabase project yet.',
};

export function LoginForm({ action = signInAction }: { action?: typeof signInAction }) {
  const [state, formAction, pending] = useActionState(action, { error: null });

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Email
        <input
          name="email"
          type="email"
          autoComplete="username"
          required
          className="rounded-md border border-slate-300 px-3 py-2 text-base"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Password
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          minLength={8}
          className="rounded-md border border-slate-300 px-3 py-2 text-base"
        />
      </label>
      {state.error ? (
        <p role="alert" className="text-sm text-red-700">
          {ERROR_TEXT[state.error]}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-emerald-800 px-4 py-2 font-semibold text-white disabled:opacity-60"
      >
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
