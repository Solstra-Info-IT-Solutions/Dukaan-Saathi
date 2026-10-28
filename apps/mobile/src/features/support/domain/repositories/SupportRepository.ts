import type { Announcement, NewTicketCommand, SupportMessage, SupportTicket } from '../entities/Support';

export interface SupportRepository {
  /** The caller's tickets (owners and managers see the whole shop's), latest activity first. */
  listTickets(shopId: string): Promise<SupportTicket[]>;
  getTicket(shopId: string, ticketId: string): Promise<SupportTicket>;
  /** Messages the shop may see (internal notes of our team never reach the phone), oldest first. */
  listMessages(shopId: string, ticketId: string): Promise<SupportMessage[]>;
  /** Safe to repeat: the ticket id is the idempotency key. */
  createTicket(command: NewTicketCommand): Promise<void>;
  addMessage(shopId: string, ticketId: string, body: string): Promise<void>;
  /** Published announcements in their time window. */
  announcements(): Promise<Announcement[]>;
}
