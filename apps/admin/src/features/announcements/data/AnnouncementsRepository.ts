import 'server-only';
import { rpc } from '@/core/admin/rpc';
import type { AdminSupabaseClient } from '@/core/supabase/server';
import type { AnnouncementInput } from '../domain/announcement';

export interface Announcement {
  id: string;
  title: { en: string; hi?: string };
  body: { en?: string; hi?: string };
  severity: 'info' | 'warning' | 'critical';
  status: 'draft' | 'published' | 'archived';
  startsAt: string | null;
  endsAt: string | null;
  updatedAt: string;
}

/** In-app announcements (super_admin, support_agent; critical + published is super_admin only). */
export class AnnouncementsRepository {
  constructor(private readonly client: AdminSupabaseClient) {}

  list() {
    return rpc<Announcement[]>(this.client, 'admin_list_announcements', {});
  }

  save(input: AnnouncementInput & { id?: string }) {
    return rpc<{ id: string; status: string }>(this.client, 'admin_save_announcement', { p_input: input });
  }
}
