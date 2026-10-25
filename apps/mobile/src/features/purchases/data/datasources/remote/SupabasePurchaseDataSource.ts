import {
  type ReceivePurchaseInput,
  ReceivePurchaseOutputSchema,
  type SaveSupplierInput,
  SupplierLedgerEntrySchema,
  type SupplierPaymentInput,
  SupplierPaymentOutputSchema,
  SupplierSchema,
} from '@ds/contracts';
import { z } from 'zod';
import type { TypedSupabaseClient } from '@/core/network/supabaseClient';

const SupplierRowSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  phone_e164: z.string().nullable(),
  gstin: z.string().nullable(),
  note: z.string().nullable(),
  balance_paise: z.number().int(),
  archived_at: z.string().nullable(),
});
const LedgerRowSchema = z.object({
  id: z.uuid(),
  kind: z.string(),
  amount_paise: z.number().int(),
  method: z.string().nullable(),
  purchase_id: z.uuid().nullable(),
  note: z.string().nullable(),
  created_at: z.string(),
});

/** Suppliers and ledger via RLS reads (purchase.view); writes through RPCs. */
export class SupabasePurchaseDataSource {
  constructor(private readonly client: TypedSupabaseClient) {}

  private async call<T>(promise: PromiseLike<{ data: unknown; error: unknown }>, parse: (d: unknown) => T) {
    const { data, error } = await promise;
    if (error) throw error;
    return parse(data);
  }

  listSuppliers(shopId: string) {
    return this.call(
      this.client
        .from('suppliers')
        .select('id, name, phone_e164, gstin, note, balance_paise, archived_at')
        .eq('shop_id', shopId)
        .is('archived_at', null)
        .order('name'),
      (d) =>
        z
          .array(SupplierRowSchema)
          .parse(d)
          .map((r) =>
            SupplierSchema.parse({
              id: r.id,
              name: r.name,
              phone: r.phone_e164,
              gstin: r.gstin,
              note: r.note,
              balancePaise: r.balance_paise,
              archivedAt: r.archived_at,
            }),
          ),
    );
  }

  saveSupplier(input: SaveSupplierInput) {
    return this.call(this.client.rpc('save_supplier', { p_input: input }), (d) => SupplierSchema.parse(d));
  }

  ledger(shopId: string, supplierId: string) {
    return this.call(
      this.client
        .from('supplier_ledger_entries')
        .select('id, kind, amount_paise, method, purchase_id, note, created_at')
        .eq('shop_id', shopId)
        .eq('supplier_id', supplierId)
        .order('created_at', { ascending: false })
        .limit(100),
      (d) =>
        z
          .array(LedgerRowSchema)
          .parse(d)
          .map((r) =>
            SupplierLedgerEntrySchema.parse({
              id: r.id,
              kind: r.kind,
              amountPaise: r.amount_paise,
              method: r.method,
              purchaseId: r.purchase_id,
              note: r.note,
              createdAt: r.created_at,
            }),
          ),
    );
  }

  receivePurchase(input: ReceivePurchaseInput) {
    return this.call(this.client.rpc('receive_purchase', { p_input: input }), (d) =>
      ReceivePurchaseOutputSchema.parse(d),
    );
  }

  paySupplier(input: SupplierPaymentInput) {
    return this.call(this.client.rpc('record_supplier_payment', { p_input: input }), (d) =>
      SupplierPaymentOutputSchema.parse(d),
    );
  }
}
