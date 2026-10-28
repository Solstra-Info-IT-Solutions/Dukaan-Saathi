'use server';

import { adminAction, field } from '@/core/admin/action';
import { AdminRpcError } from '@/core/admin/rpc';
import { AnnouncementsRepository } from '../data/AnnouncementsRepository';
import { announcementFromForm, type AnnouncementStatus } from '../domain/announcement';

const ROLES = ['super_admin', 'support_agent'] as const;

/** Create (no id) or edit an announcement. */
export async function saveAnnouncementAction(form: FormData) {
  return adminAction(ROLES, '/announcements', async (client) => {
    const input = announcementFromForm((name) => field(form, name));
    if (!input) throw new AdminRpcError('DS_VALIDATION_FAILED');
    const id = field(form, 'id');
    await new AnnouncementsRepository(client).save({ ...input, ...(id ? { id } : {}) });
  });
}

/** Publish, unpublish (back to draft) or archive. */
export async function setAnnouncementStatusAction(form: FormData) {
  return adminAction(ROLES, '/announcements', async (client) => {
    const status = field(form, 'status') as AnnouncementStatus;
    if (!['draft', 'published', 'archived'].includes(status)) throw new AdminRpcError('DS_VALIDATION_FAILED');
    await new AnnouncementsRepository(client).save({
      id: field(form, 'id'),
      status,
      // Sent so the database can require super_admin for publishing a critical one.
      ...(field(form, 'severity') === 'critical' ? { severity: 'critical' as const } : {}),
    });
  });
}
