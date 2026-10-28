'use server';

import { randomUUID } from 'node:crypto';
import { adminAction, field } from '@/core/admin/action';
import { AdminRpcError } from '@/core/admin/rpc';
import { OnboardingRepository } from '../data/OnboardingRepository';
import { csvToImport, NEXT_STEPS, type OnboardingStatus } from '../domain/onboarding';

const ROLES = ['super_admin', 'onboarding_operator'] as const;
const back = (form: FormData) => `/onboarding/${field(form, 'id')}`;

export async function changeOnboardingStatusAction(form: FormData) {
  const to = field(form, 'status') as OnboardingStatus;
  return adminAction(ROLES, back(form), async (client) => {
    const from = field(form, 'from') as OnboardingStatus;
    if (!NEXT_STEPS[from]?.includes(to)) throw new AdminRpcError('DS_CONFLICT');
    await new OnboardingRepository(client).update(field(form, 'id'), {
      status: to,
      ...(field(form, 'statusNote') ? { statusNote: field(form, 'statusNote') } : {}),
    });
  });
}

/**
 * The operator uploads a CSV typed from the shop's photos or list (same columns as the app's import). It goes into the
 * shop's import job; nothing reaches the catalogue until the owner approves it in the app.
 */
export async function uploadImportCsvAction(form: FormData) {
  return adminAction(ROLES, back(form), async (client) => {
    const file = form.get('csv');
    if (!(file instanceof File) || file.size === 0 || file.size > 5 * 1024 * 1024) {
      throw new AdminRpcError('DS_VALIDATION_FAILED');
    }
    const parsed = csvToImport(await file.text());
    if (parsed.rowCount === 0 || parsed.missingRequired.length > 0) {
      throw new AdminRpcError('DS_VALIDATION_FAILED', { missing: parsed.missingRequired });
    }
    const repo = new OnboardingRepository(client);
    const id = field(form, 'id');
    await repo.createImportJob(id, file.name, field(form, 'opId') || randomUUID());
    for (const batch of parsed.batches) await repo.stageRows(id, batch);
  });
}
