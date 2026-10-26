import {
  type BalanceAdjustmentInput,
  CustomerBalanceOutputSchema,
  CustomerLedgerSchema,
  CustomerListSchema,
  CustomerSchema,
  type RepaymentInput,
  type SaveCustomerInput,
} from '@ds/contracts';
import type { TypedSupabaseClient } from '@/core/network/supabaseClient';
import type { CustomerQuery } from '../../../domain/entities/Customers';

/** Customers and their udhaar ledger; all through RPCs (list_customers, get_customer_ledger, …). */
export class SupabaseCustomerDataSource {
  constructor(private readonly client: TypedSupabaseClient) {}

  private async call<T>(promise: PromiseLike<{ data: unknown; error: unknown }>, parse: (d: unknown) => T) {
    const { data, error } = await promise;
    if (error) throw error;
    return parse(data);
  }

  list(shopId: string, query: CustomerQuery) {
    return this.call(
      this.client.rpc('list_customers', {
        p_shop_id: shopId,
        p_query: query.query,
        p_sort: query.sort,
        p_udhaar_only: query.udhaarOnly,
      }),
      (d) => CustomerListSchema.parse(d),
    );
  }

  save(input: SaveCustomerInput) {
    return this.call(this.client.rpc('save_customer', { p_input: input }), (d) => CustomerSchema.parse(d));
  }

  ledger(shopId: string, customerId: string) {
    return this.call(
      this.client.rpc('get_customer_ledger', { p_shop_id: shopId, p_customer_id: customerId }),
      (d) => CustomerLedgerSchema.parse(d),
    );
  }

  recordRepayment(input: RepaymentInput) {
    return this.call(this.client.rpc('record_customer_repayment', { p_input: input }), (d) =>
      CustomerBalanceOutputSchema.parse(d),
    );
  }

  adjustBalance(input: BalanceAdjustmentInput) {
    return this.call(this.client.rpc('adjust_customer_balance', { p_input: input }), (d) =>
      CustomerBalanceOutputSchema.parse(d),
    );
  }
}
