import { describe, expect, it } from 'vitest';
import { CreateSaleInputSchema, CreateSaleOutputSchema } from '../index';

const valid = {
  clientOperationId: '0190f0f0-0000-7000-8000-000000000001',
  shopId: '0190f0f0-0000-7000-8000-000000000002',
  deviceId: '0190f0f0-0000-7000-8000-000000000003',
  invoice: { fy: '2627', seq: 1 },
  occurredAt: '2026-10-25T10:00:00.000Z',
  origin: 'online' as const,
  lines: [{ kind: 'quick' as const, amountPaise: 5000 }],
  payments: [{ method: 'cash' as const, amountPaise: 5000 }],
  clientTotals: { subtotalPaise: 5000, discountPaise: 0, taxPaise: 0, roundOffPaise: 0, totalPaise: 5000 },
};

describe('create_sale contract', () => {
  it('accepts a quick bill', () => {
    expect(CreateSaleInputSchema.safeParse(valid).success).toBe(true);
  });
  it('rejects empty bills, zero amounts and unknown payment methods', () => {
    expect(CreateSaleInputSchema.safeParse({ ...valid, lines: [] }).success).toBe(false);
    expect(
      CreateSaleInputSchema.safeParse({ ...valid, lines: [{ kind: 'quick', amountPaise: 0 }] }).success,
    ).toBe(false);
    expect(
      CreateSaleInputSchema.safeParse({ ...valid, payments: [{ method: 'udhaar', amountPaise: 5000 }] })
        .success,
    ).toBe(false);
  });
  it('round-off may be negative in totals', () => {
    const out = {
      saleId: valid.shopId,
      invoiceNumber: 'DS/2627/A-000001',
      seq: 1,
      status: 'completed',
      reviewReasons: [],
      totals: { subtotalPaise: 7049, discountPaise: 0, taxPaise: 0, roundOffPaise: -49, totalPaise: 7000 },
      replayed: false,
    };
    expect(CreateSaleOutputSchema.parse(out).totals.roundOffPaise).toBe(-49);
  });
});
