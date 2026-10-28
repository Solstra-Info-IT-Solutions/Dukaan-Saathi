'use server';

import { adminAction, field } from '@/core/admin/action';
import { AdminRpcError } from '@/core/admin/rpc';
import { parseJson } from '@/features/billing/domain/entitlements';
import { FlagsRepository } from '../data/FlagsRepository';
import { flagFromForm } from '../domain/flags';

const SUPER = ['super_admin'] as const;

export async function saveFlagAction(form: FormData) {
  return adminAction(SUPER, '/flags', async (client) => {
    const edit = flagFromForm(
      (n) => field(form, n),
      (n) => form.get(n) === 'on',
    );
    if (!edit.ok) throw new AdminRpcError('DS_VALIDATION_FAILED');
    await new FlagsRepository(client).saveFlag(
      { key: field(form, 'key'), ...edit.value, ...(field(form, 'isNew') ? { killSwitchable: true } : {}) },
      field(form, 'reason'),
    );
  });
}

/** One tap: turn a kill-switchable flag off for everyone. */
export async function killFlagAction(form: FormData) {
  return adminAction(SUPER, '/flags', async (client) => {
    await new FlagsRepository(client).saveFlag(
      { key: field(form, 'key'), enabled: false },
      field(form, 'reason'),
    );
  });
}

export async function setConfigAction(form: FormData) {
  return adminAction(SUPER, '/config', async (client) => {
    const parsed = parseJson(field(form, 'value'));
    if (!parsed.ok) throw new AdminRpcError('DS_VALIDATION_FAILED');
    await new FlagsRepository(client).setConfig(
      field(form, 'key'),
      parsed.value,
      Number(field(form, 'revision')),
      field(form, 'reason'),
    );
  });
}

export async function restoreRevisionAction(form: FormData) {
  const back = field(form, 'back') === '/flags' ? '/flags' : '/config';
  return adminAction(SUPER, back, async (client) => {
    await new FlagsRepository(client).restore(Number(field(form, 'revisionId')), field(form, 'reason'));
  });
}
