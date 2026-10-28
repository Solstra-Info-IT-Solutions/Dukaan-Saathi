'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createAdminServerClient } from '@/core/supabase/server';

export interface MfaState {
  /** Set while enrolling: the QR code (SVG data URL) and secret for the authenticator app. */
  enrolment: { factorId: string; qrCode: string; secret: string } | null;
  error: 'invalid_code' | 'enroll_failed' | 'signed_out' | null;
}

/** Creates a new TOTP factor and returns its QR code (operators scan it once). */
export async function startEnrolmentAction(): Promise<MfaState> {
  const client = await createAdminServerClient();
  if (!client) return { enrolment: null, error: 'signed_out' };
  // Unfinished earlier attempts would block a new one with the same name.
  const factors = await client.auth.mfa.listFactors();
  for (const f of factors.data?.all ?? []) {
    if (f.status === 'unverified') await client.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await client.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: 'Dukaan Saathi Admin',
  });
  if (error || !data || data.type !== 'totp') return { enrolment: null, error: 'enroll_failed' };
  return {
    enrolment: { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret },
    error: null,
  };
}

const CodeSchema = z.object({ factorId: z.string().min(1), code: z.string().regex(/^\d{6}$/) });

/** Checks the 6-digit code; on success the session becomes aal2 and the panel opens. */
export async function verifyCodeAction(prev: MfaState, formData: FormData): Promise<MfaState> {
  const parsed = CodeSchema.safeParse({ factorId: formData.get('factorId'), code: formData.get('code') });
  if (!parsed.success) return { ...prev, error: 'invalid_code' };
  const client = await createAdminServerClient();
  if (!client) return { ...prev, error: 'signed_out' };
  const { error } = await client.auth.mfa.challengeAndVerify(parsed.data);
  if (error) return { ...prev, error: 'invalid_code' };
  redirect('/');
}
