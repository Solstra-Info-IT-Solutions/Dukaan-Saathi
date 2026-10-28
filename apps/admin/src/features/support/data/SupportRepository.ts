import 'server-only';
import { rpc } from '@/core/admin/rpc';
import type { AdminSupabaseClient } from '@/core/supabase/server';
import type { TicketPriority, TicketStatus } from '../domain/support';

export interface TicketSummary {
  id: string;
  shopId: string;
  shopName: string;
  subject: string;
  category: string;
  status: TicketStatus;
  priority: TicketPriority;
  assignedToEmail: string | null;
  lastMessageAt: string;
}

export interface TicketMessage {
  id: string;
  authorKind: 'shop' | 'operator';
  isInternal: boolean;
  body: string;
  createdAt: string;
  author: string | null;
}

export interface Ticket extends Omit<TicketSummary, 'lastMessageAt'> {
  createdAt: string;
  messages: TicketMessage[];
}

/** Support queue (super_admin, support_agent). */
export class SupportRepository {
  constructor(private readonly client: AdminSupabaseClient) {}

  list(status: TicketStatus | null, query: string) {
    return rpc<TicketSummary[]>(this.client, 'admin_list_tickets', {
      p_status: status,
      p_query: query || null,
    });
  }

  get(id: string) {
    return rpc<Ticket>(this.client, 'admin_get_ticket', { p_ticket_id: id });
  }

  reply(id: string, body: string, internal: boolean) {
    return rpc<Ticket>(this.client, 'admin_reply_ticket', {
      p_ticket_id: id,
      p_body: body,
      p_internal: internal,
    });
  }

  update(id: string, patch: { status?: TicketStatus; priority?: TicketPriority; assignTo?: 'me' | 'none' }) {
    return rpc<Ticket>(this.client, 'admin_update_ticket', { p_ticket_id: id, p_patch: patch });
  }
}
