'use server';

import { adminAction, field } from '@/core/admin/action';
import { AdminRpcError } from '@/core/admin/rpc';
import { SupportRepository } from '../data/SupportRepository';
import { isTicketPriority, isTicketStatus } from '../domain/support';

const ROLES = ['super_admin', 'support_agent'] as const;
const back = (form: FormData) => `/support/${field(form, 'id')}`;

/** Reply to the shop, or (ticked) an internal note the shop never sees. */
export async function replyTicketAction(form: FormData) {
  return adminAction(ROLES, back(form), async (client) => {
    const body = field(form, 'body');
    if (!body) throw new AdminRpcError('DS_VALIDATION_FAILED');
    await new SupportRepository(client).reply(field(form, 'id'), body, form.get('internal') === 'on');
  });
}

export async function updateTicketAction(form: FormData) {
  return adminAction(ROLES, back(form), async (client) => {
    const status = field(form, 'status');
    const priority = field(form, 'priority');
    const assignTo = field(form, 'assignTo');
    await new SupportRepository(client).update(field(form, 'id'), {
      ...(isTicketStatus(status) ? { status } : {}),
      ...(isTicketPriority(priority) ? { priority } : {}),
      ...(assignTo === 'me' || assignTo === 'none' ? { assignTo } : {}),
    });
  });
}
