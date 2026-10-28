import type {
  AnnouncementDto,
  SupportMessageDto,
  SupportTicketDto,
  TicketCategory,
  TicketStatus,
} from '@ds/contracts';

export type SupportTicket = SupportTicketDto;
export type SupportMessage = SupportMessageDto;
export type Announcement = AnnouncementDto;
export type { TicketCategory, TicketStatus };

export interface NewTicketCommand {
  id: string;
  shopId: string;
  category: TicketCategory;
  subject: string;
  body: string;
}
