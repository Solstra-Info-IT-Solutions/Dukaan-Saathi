import type { Announcement, NewTicketCommand, SupportMessage, SupportTicket } from '../entities/Support';
import type { SupportRepository } from '../repositories/SupportRepository';

export class SupportInputError extends Error {
  constructor(readonly reason: 'SUBJECT_REQUIRED' | 'MESSAGE_REQUIRED' | 'MESSAGE_TOO_LONG') {
    super(reason);
    this.name = 'SupportInputError';
  }
}

export const MAX_MESSAGE_CHARS = 2000;

function checkBody(body: string) {
  const b = body.trim();
  if (!b) throw new SupportInputError('MESSAGE_REQUIRED');
  if (b.length > MAX_MESSAGE_CHARS) throw new SupportInputError('MESSAGE_TOO_LONG');
  return b;
}

export class ListTickets {
  constructor(private readonly support: SupportRepository) {}
  execute(shopId: string): Promise<SupportTicket[]> {
    return this.support.listTickets(shopId);
  }
}

export class GetTicketThread {
  constructor(private readonly support: SupportRepository) {}
  async execute(
    shopId: string,
    ticketId: string,
  ): Promise<{ ticket: SupportTicket; messages: SupportMessage[] }> {
    const [ticket, messages] = await Promise.all([
      this.support.getTicket(shopId, ticketId),
      this.support.listMessages(shopId, ticketId),
    ]);
    return { ticket, messages };
  }
}

/** Opens a ticket with its first message. The id is fixed per form, so a retried send opens one ticket. */
export class CreateTicket {
  constructor(private readonly support: SupportRepository) {}
  async execute(command: NewTicketCommand): Promise<void> {
    const subject = command.subject.trim();
    if (subject.length < 3 || subject.length > 120) throw new SupportInputError('SUBJECT_REQUIRED');
    await this.support.createTicket({ ...command, subject, body: checkBody(command.body) });
  }
}

export class ReplyToTicket {
  constructor(private readonly support: SupportRepository) {}
  async execute(shopId: string, ticketId: string, body: string): Promise<void> {
    await this.support.addMessage(shopId, ticketId, checkBody(body));
  }
}

export class GetAnnouncements {
  constructor(private readonly support: SupportRepository) {}
  execute(): Promise<Announcement[]> {
    return this.support.announcements();
  }
}

/** Title and message in the app language, falling back to English. */
export function localized(a: Announcement, lang: 'en' | 'hi') {
  return {
    title: (lang === 'hi' ? a.title.hi : undefined) || a.title.en,
    body: (lang === 'hi' ? a.body.hi : undefined) || a.body.en || '',
  };
}
