import { CreateSaleOutputSchema, type CreateSaleInput, SaleSchema } from '@ds/contracts';
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
}
