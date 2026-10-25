import {
  CreateSaleOutputSchema,
  type CreateSaleInput,
  SalePageSchema,
  type SaleReturnInput,
  SaleReturnOutputSchema,
  SaleSchema,
  type VoidSaleInput,
} from '@ds/contracts';
import type { TypedSupabaseClient } from '@/core/network/supabaseClient';

/** One RPC per method; responses validated with the shared contracts. Errors thrown as-is. */
export class SupabaseBillingDataSource {
  constructor(private readonly client: TypedSupabaseClient) {}

  private async call<T>(promise: PromiseLike<{ data: unknown; error: unknown }>, parse: (d: unknown) => T) {
    const { data, error } = await promise;
    if (error) throw error;
    return parse(data);
  }

  createSale(input: CreateSaleInput) {
    return this.call(this.client.rpc('create_sale', { p_input: input }), (d) =>
      CreateSaleOutputSchema.parse(d),
    );
  }

  getSale(shopId: string, saleId: string) {
    return this.call(this.client.rpc('get_sale', { p_shop_id: shopId, p_sale_id: saleId }), (d) =>
      SaleSchema.parse(d),
    );
  }

  listSales(
    shopId: string,
    filter: { from: string | null; to: string | null; status: string | null; query: string },
    cursor: string | null,
    limit: number,
  ) {
    return this.call(
      this.client.rpc('list_sales', {
        p_shop_id: shopId,
        p_limit: limit,
        ...(filter.from ? { p_from: filter.from } : {}),
        ...(filter.to ? { p_to: filter.to } : {}),
        ...(filter.status ? { p_status: filter.status } : {}),
        ...(filter.query ? { p_query: filter.query } : {}),
        ...(cursor ? { p_cursor: cursor } : {}),
      }),
      (d) => SalePageSchema.parse(d),
    );
  }

  createReturn(input: SaleReturnInput) {
    return this.call(this.client.rpc('create_sale_return', { p_input: input }), (d) =>
      SaleReturnOutputSchema.parse(d),
    );
  }

  voidSale(input: VoidSaleInput) {
    return this.call(this.client.rpc('void_sale', { p_input: input }), (d) => SaleSchema.parse(d));
  }
}
