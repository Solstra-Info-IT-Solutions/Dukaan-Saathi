import { z } from 'zod';
import { ProductSchema } from './catalogue';
import { CustomerSchema } from './customers';
import { UuidSchema } from './common';

/** Phase 09 contracts: sync_push / sync_pull (OFFLINE_SYNC_DESIGN.md §4). */

export const SYNC_OPERATIONS = ['create_sale', 'create_customer', 'record_customer_repayment'] as const;
export type SyncOperation = (typeof SYNC_OPERATIONS)[number];
/** At most this many operations per sync_push call. */
export const SYNC_BATCH_SIZE = 50;

export const SyncPushInputSchema = z.object({
  shopId: UuidSchema,
  deviceId: UuidSchema,
  operations: z
    .array(
      z.object({
        clientOperationId: UuidSchema,
        operation: z.enum(SYNC_OPERATIONS),
        payload: z.record(z.string(), z.unknown()),
      }),
    )
    .min(1)
    .max(SYNC_BATCH_SIZE),
});
export type SyncPushInput = z.infer<typeof SyncPushInputSchema>;

export const SYNC_RESULT_STATUSES = ['applied', 'replayed', 'needs_review', 'quarantined', 'retry'] as const;
export type SyncResultStatus = (typeof SYNC_RESULT_STATUSES)[number];

export const SyncOperationResultSchema = z.object({
  clientOperationId: UuidSchema,
  status: z.enum(SYNC_RESULT_STATUSES),
  /** The RPC's own output when applied, replayed or needs_review. */
  result: z.record(z.string(), z.unknown()).optional(),
  /** DS_* code (quarantined) or SQLSTATE (retry). */
  code: z.string().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
});
export type SyncOperationResultDto = z.infer<typeof SyncOperationResultSchema>;
export const SyncPushOutputSchema = z.object({ results: z.array(SyncOperationResultSchema) });
export type SyncPushOutputDto = z.infer<typeof SyncPushOutputSchema>;

const page = <T extends z.ZodType>(row: T) =>
  z.object({ rows: z.array(row), cursor: z.string().nullable(), more: z.boolean() });

export const SyncCategorySchema = z.object({
  id: UuidSchema,
  name: z.string(),
  nameHi: z.string().nullable(),
  sortOrder: z.number().int(),
  archivedAt: z.string().nullable(),
  updatedAt: z.string(),
});
export type SyncCategoryDto = z.infer<typeof SyncCategorySchema>;

export const SyncPullOutputSchema = z.object({
  serverTime: z.string(),
  products: page(ProductSchema.extend({ archivedAt: z.string().nullable() })),
  categories: page(SyncCategorySchema),
  customers: page(CustomerSchema.extend({ updatedAt: z.string() })),
  customerAliases: z.object({
    rows: z.array(z.object({ aliasId: UuidSchema, customerId: UuidSchema })),
    cursor: z.string().nullable(),
  }),
  /** get_shop_settings shape; kept as-is for the offline settings cache. */
  settings: z.record(z.string(), z.unknown()),
});
export type SyncPullOutputDto = z.infer<typeof SyncPullOutputSchema>;

export interface SyncCursors {
  products?: string | null;
  categories?: string | null;
  customers?: string | null;
  aliases?: string | null;
}
