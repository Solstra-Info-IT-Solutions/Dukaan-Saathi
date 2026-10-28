import { translateError } from '@/core/errors/translateError';
import type { NewTicketCommand } from '../../domain/entities/Support';
import type { SupportRepository } from '../../domain/repositories/SupportRepository';
import type { SupabaseSupportDataSource } from '../datasources/remote/SupabaseSupportDataSource';

async function translated<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (e) {
    throw translateError(e);
  }
}

export class SupportRepositoryImpl implements SupportRepository {
  constructor(private readonly remote: SupabaseSupportDataSource) {}

  listTickets = (shopId: string) => translated(() => this.remote.listTickets(shopId));
  getTicket = (shopId: string, ticketId: string) => translated(() => this.remote.getTicket(shopId, ticketId));
  listMessages = (shopId: string, ticketId: string) =>
    translated(() => this.remote.listMessages(shopId, ticketId));
  createTicket = (command: NewTicketCommand) => translated(() => this.remote.createTicket(command));
  addMessage = (shopId: string, ticketId: string, body: string) =>
    translated(() => this.remote.addMessage(shopId, ticketId, body));
  announcements = () => translated(() => this.remote.announcements());
}
