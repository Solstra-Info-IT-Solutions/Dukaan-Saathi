'use server';

import { adminAction, field } from '@/core/admin/action';
import { AdminRpcError } from '@/core/admin/rpc';
import { ShopsRepository } from '../data/ShopsRepository';

const path = (form: FormData) => `/shops/${field(form, 'shopId')}`;

/** Suspend or reactivate — high impact: reason required, confirmation box ticked (ADMIN_PANEL_SPECIFICATION.md §3). */
export async function setShopStatusAction(form: FormData) {
  const status = field(form, 'status') === 'suspended' ? 'suspended' : 'active';
  return adminAction(['super_admin', 'billing_admin'], path(form), async (client) => {
    if (form.get('confirm') !== 'yes') throw new AdminRpcError('DS_VALIDATION_FAILED');
    await new ShopsRepository(client).setStatus(field(form, 'shopId'), status, field(form, 'reason'));
  });
}

export async function deactivateMemberAction(form: FormData) {
  return adminAction(['super_admin', 'support_agent'], path(form), async (client) => {
    await new ShopsRepository(client).deactivateMember(
      field(form, 'shopId'),
      field(form, 'userId'),
      field(form, 'reason'),
    );
  });
}

export async function revokeDeviceAction(form: FormData) {
  return adminAction(['super_admin', 'support_agent'], path(form), async (client) => {
    await new ShopsRepository(client).revokeDevice(
      field(form, 'shopId'),
      field(form, 'deviceId'),
      field(form, 'reason'),
    );
  });
}
