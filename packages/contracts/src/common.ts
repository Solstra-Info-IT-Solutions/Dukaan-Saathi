import { z } from 'zod';

/** Reusable primitives for RPC/Edge payload schemas. */

export const UuidSchema = z.uuid();

/** Integer paise, non-negative. */
export const PaiseSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
/** Integer paise that may be negative (ledger amounts, round-off). */
export const SignedPaiseSchema = z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER);
/** Integer milli-units, strictly positive. */
export const QuantityMilliSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
/** Basis points 0..10000. */
export const BasisPointsSchema = z.number().int().min(0).max(10_000);

/** Indian mobile number in E.164: +91 followed by 10 digits starting 6–9. */
export const IndianPhoneE164Schema = z.string().regex(/^\+91[6-9]\d{9}$/, 'INVALID_PHONE');

export const SemverSchema = z.string().regex(/^\d+\.\d+\.\d+$/);

export const LocalizedTextSchema = z.object({ en: z.string(), hi: z.string().optional() });
export type LocalizedText = z.infer<typeof LocalizedTextSchema>;

export const PageRequestSchema = z.object({
  cursor: z.string().nullable().optional(),
  limit: z.number().int().min(1).max(100).default(30),
});

export function pageOf<T extends z.ZodType>(item: T) {
  return z.object({ items: z.array(item), nextCursor: z.string().nullable() });
}

/** Normalises user-typed Indian numbers ("98765 43210", "09876543210", "+91-9876543210") to E.164. */
export function normalizeIndianPhone(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  const national = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits.replace(/^0/, '');
  const candidate = `+91${national}`;
  return IndianPhoneE164Schema.safeParse(candidate).success ? candidate : null;
}
