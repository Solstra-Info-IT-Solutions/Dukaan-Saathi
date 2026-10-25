import {
  type AdjustStockInput,
  AdjustStockOutputSchema,
  type StockCountInput,
  StockCountOutputSchema,
  StockItemSchema,
  StockMovementSchema,
} from '@ds/contracts';
import { z } from 'zod';
import type { TypedSupabaseClient } from '@/core/network/supabaseClient';

const DriftSchema = z.array(
  z.object({
    productId: z.uuid(),
    name: z.string(),
    stockOnHandMilli: z.number().int(),
    fromMovementsMilli: z.number().int(),
  }),
);

const MovementRowSchema = z.object({
  id: z.uuid(),
  kind: z.string(),
  quantity_milli: z.number().int(),
  reason: z.string().nullable(),
  note: z.string().nullable(),
  created_at: z.string(),
});

/** Stock RPCs and the movement history (RLS read with stock.view). */
export class SupabaseInventoryDataSource {
  constructor(private readonly client: TypedSupabaseClient) {}

  private async call<T>(promise: PromiseLike<{ data: unknown; error: unknown }>, parse: (d: unknown) => T) {
    const { data, error } = await promise;
    if (error) throw error;
    return parse(data);
  }

  listStock(shopId: string, lowOnly: boolean, query: string) {
    return this.call(
      this.client.rpc('list_stock', {
        p_shop_id: shopId,
        p_low_only: lowOnly,
        ...(query ? { p_query: query } : {}),
      }),
      (d) => z.array(StockItemSchema).parse(d),
    );
  }

  movements(shopId: string, productId: string, limit: number) {
    return this.call(
      this.client
        .from('stock_movements')
        .select('id, kind, quantity_milli, reason, note, created_at')
        .eq('shop_id', shopId)
        .eq('product_id', productId)
        .order('created_at', { ascending: false })
        .limit(limit),
      (d) =>
        z
          .array(MovementRowSchema)
          .parse(d)
          .map((r) =>
            StockMovementSchema.parse({
              id: r.id,
              kind: r.kind,
              quantityMilli: r.quantity_milli,
              reason: r.reason,
              note: r.note,
              createdAt: r.created_at,
            }),
          ),
    );
  }

  adjust(input: AdjustStockInput) {
    return this.call(this.client.rpc('adjust_stock', { p_input: input }), (d) =>
      AdjustStockOutputSchema.parse(d),
    );
  }

  submitCount(input: StockCountInput) {
    return this.call(this.client.rpc('submit_stock_count', { p_input: input }), (d) =>
      StockCountOutputSchema.parse(d),
    );
  }

  checkDrift(shopId: string) {
    return this.call(this.client.rpc('check_stock_drift', { p_shop_id: shopId }), (d) =>
      DriftSchema.parse(d),
    );
  }
}
