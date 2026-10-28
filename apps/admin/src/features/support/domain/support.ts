export type TicketStatus = 'waiting_support' | 'waiting_shop' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';

export const TICKET_STATUSES: TicketStatus[] = ['waiting_support', 'waiting_shop', 'resolved', 'closed'];
export const TICKET_PRIORITIES: TicketPriority[] = ['urgent', 'high', 'normal', 'low'];

export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  waiting_support: 'Waiting for us',
  waiting_shop: 'Waiting for shop',
  resolved: 'Resolved',
  closed: 'Closed',
};

export const isTicketStatus = (v: unknown): v is TicketStatus => TICKET_STATUSES.includes(v as TicketStatus);
export const isTicketPriority = (v: unknown): v is TicketPriority =>
  TICKET_PRIORITIES.includes(v as TicketPriority);
