import {
  ShopAnnouncementSchema,
  SupportMessageSchema,
  SupportTicketSchema,
  TICKET_CATEGORIES,
  TICKET_STATUSES,
} from '@ds/contracts';
import { z } from 'zod';
import type { TypedSupabaseClient } from '@/core/network/supabaseClient';
import type { NewTicketCommand } from '../../../domain/entities/Support';

const TicketRowSchema = z.object({
  id: z.uuid(),
  subject: z.string(),
  category: z.enum(TICKET_CATEGORIES),
  status: z.enum(TICKET_STATUSES),
  last_message_at: z.string(),
  created_at: z.string(),
});
const toTicket = (r: z.infer<typeof TicketRowSchema>) =>
  SupportTicketSchema.parse({
    id: r.id,
    subject: r.subject,
    category: r.category,
    status: r.status,
    lastMessageAt: r.last_message_at,
    createdAt: r.created_at,
  });

const MessageRowSchema = z.object({
  id: z.uuid(),
  author_kind: z.enum(['shop', 'operator']),
  body: z.string(),
  created_at: z.string(),
});

const TICKET_COLUMNS = 'id, subject, category, status, last_message_at, created_at';

/** Help & support: RLS reads (internal notes are filtered by the policy), RPC writes. */
export class SupabaseSupportDataSource {
  constructor(private readonly client: TypedSupabaseClient) {}

  async listTickets(shopId: string) {
    const { data, error } = await this.client
      .from('support_tickets')
      .select(TICKET_COLUMNS)
      .eq('shop_id', shopId)
      .order('last_message_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    return z.array(TicketRowSchema).parse(data).map(toTicket);
  }

  async getTicket(shopId: string, ticketId: string) {
    const { data, error } = await this.client
      .from('support_tickets')
      .select(TICKET_COLUMNS)
      .eq('shop_id', shopId)
      .eq('id', ticketId)
      .single();
    if (error) throw error;
    return toTicket(TicketRowSchema.parse(data));
  }

  async listMessages(shopId: string, ticketId: string) {
    const { data, error } = await this.client
      .from('support_messages')
      .select('id, author_kind, body, created_at')
      .eq('shop_id', shopId)
      .eq('ticket_id', ticketId)
      .order('created_at')
      .limit(200);
    if (error) throw error;
    return z
      .array(MessageRowSchema)
      .parse(data)
      .map((m) =>
        SupportMessageSchema.parse({
          id: m.id,
          authorKind: m.author_kind,
          body: m.body,
          createdAt: m.created_at,
        }),
      );
  }

  async createTicket(command: NewTicketCommand) {
    const { error } = await this.client.rpc('create_support_ticket', { p_input: { ...command } });
    if (error) throw error;
  }

  async addMessage(shopId: string, ticketId: string, body: string) {
    const { error } = await this.client.rpc('add_ticket_message', { p_input: { shopId, ticketId, body } });
    if (error) throw error;
  }

  async announcements() {
    const { data, error } = await this.client.rpc('get_announcements');
    if (error) throw error;
    return z.array(ShopAnnouncementSchema).parse(data);
  }
}
