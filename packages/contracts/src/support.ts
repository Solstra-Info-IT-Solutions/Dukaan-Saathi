import { z } from 'zod';
import { UuidSchema } from './common';

/** Phase 11 contracts: managed onboarding, support tickets, announcements (features/onboarding-and-support.md). */

export const ONBOARDING_METHODS = ['photos', 'spreadsheet', 'call'] as const;
export type OnboardingMethod = (typeof ONBOARDING_METHODS)[number];

export const ONBOARDING_STATUSES = [
  'new',
  'assigned',
  'in_progress',
  'awaiting_owner',
  'completed',
  'cancelled',
] as const;
export type OnboardingStatus = (typeof ONBOARDING_STATUSES)[number];

export const OnboardingFileSchema = z.object({
  id: UuidSchema,
  path: z.string(),
  fileName: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int(),
});

export const OnboardingRequestSchema = z.object({
  id: UuidSchema,
  shopId: UuidSchema,
  method: z.enum(ONBOARDING_METHODS),
  contactPhone: z.string().nullable(),
  preferredTime: z.string().nullable(),
  note: z.string().nullable(),
  operatorMayCommit: z.boolean(),
  status: z.enum(ONBOARDING_STATUSES),
  statusNote: z.string().nullable(),
  importJobId: UuidSchema.nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  files: z.array(OnboardingFileSchema),
});
export type OnboardingRequestDto = z.infer<typeof OnboardingRequestSchema>;

export interface CreateOnboardingRequestInput {
  id: string;
  shopId: string;
  method: OnboardingMethod;
  contactPhone?: string;
  preferredTime?: string;
  note?: string;
}

export const MAX_ONBOARDING_FILES = 30;
export const MAX_ONBOARDING_FILE_BYTES = 10 * 1024 * 1024;

export const TICKET_CATEGORIES = ['billing', 'sync', 'catalogue', 'account', 'other'] as const;
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];
export const TICKET_STATUSES = ['waiting_support', 'waiting_shop', 'resolved', 'closed'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const SupportTicketSchema = z.object({
  id: UuidSchema,
  subject: z.string(),
  category: z.enum(TICKET_CATEGORIES),
  status: z.enum(TICKET_STATUSES),
  lastMessageAt: z.string(),
  createdAt: z.string(),
});
export type SupportTicketDto = z.infer<typeof SupportTicketSchema>;

export const SupportMessageSchema = z.object({
  id: UuidSchema,
  authorKind: z.enum(['shop', 'operator']),
  body: z.string(),
  createdAt: z.string(),
});
export type SupportMessageDto = z.infer<typeof SupportMessageSchema>;

export const ShopAnnouncementSchema = z.object({
  id: UuidSchema,
  title: z.object({ en: z.string(), hi: z.string().optional() }),
  body: z.object({ en: z.string().optional(), hi: z.string().optional() }),
  severity: z.enum(['info', 'warning', 'critical']),
  startsAt: z.string().nullable(),
  endsAt: z.string().nullable(),
});
export type AnnouncementDto = z.infer<typeof ShopAnnouncementSchema>;
