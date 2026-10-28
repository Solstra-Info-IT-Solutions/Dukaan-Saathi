'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createAdminServerClient } from '@/core/supabase/server';
import { OperatorRepository } from '../data/OperatorRepository';

export interface LoginFormState {
  error: 'invalid_input' | 'invalid_credentials' | 'backend_not_configured' | null;
}

const LoginSchema = z.object({
  email: z.email(),
  password: z.string().min(8).max(200),
});

export async function signInAction(_prev: LoginFormState, formData: FormData): Promise<LoginFormState> {
  const parsed = LoginSchema.safeParse({ email: formData.get('email'), password: formData.get('password') });
  if (!parsed.success) return { error: 'invalid_input' };

  const client = await createAdminServerClient();
  if (!client) return { error: 'backend_not_configured' };

  const result = await new OperatorRepository(client).signInWithPassword(
    parsed.data.email,
    parsed.data.password,
  );
  // Same message for unknown email and wrong password: no account enumeration.
  if (!result.ok) return { error: 'invalid_credentials' };
  // Operators finish with their authenticator code (aal2); the guard sends anyone else back to /login.
  redirect('/mfa');
}

export async function signOutAction(): Promise<void> {
  const client = await createAdminServerClient();
  if (client) await new OperatorRepository(client).signOut();
  redirect('/login');
}
