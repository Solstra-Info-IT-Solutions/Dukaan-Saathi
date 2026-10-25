import {
  type CloseDayInput,
  DashboardSnapshotSchema,
  DayCloseSchema,
  ExportStartedSchema,
  type ReportGroup,
  SalesReportSchema,
} from '@ds/contracts';
import type { TypedSupabaseClient } from '@/core/network/supabaseClient';

/** One RPC per method; responses validated with the shared contracts. Errors thrown as-is. */
export class SupabaseReportsDataSource {
  constructor(private readonly client: TypedSupabaseClient) {}

  private async call<T>(promise: PromiseLike<{ data: unknown; error: unknown }>, parse: (d: unknown) => T) {
    const { data, error } = await promise;
    if (error) throw error;
    return parse(data);
  }

  getDashboard(shopId: string, businessDate: string | null) {
    return this.call(
      this.client.rpc('get_dashboard_snapshot', {
        p_shop_id: shopId,
        ...(businessDate ? { p_business_date: businessDate } : {}),
      }),
      (d) => DashboardSnapshotSchema.parse(d),
    );
  }

  getSalesReport(shopId: string, from: string, to: string, groupBy: ReportGroup) {
    return this.call(
      this.client.rpc('get_sales_report', { p_shop_id: shopId, p_from: from, p_to: to, p_group_by: groupBy }),
      (d) => SalesReportSchema.parse(d),
    );
  }

  beginExport(shopId: string) {
    return this.call(this.client.rpc('begin_report_export', { p_shop_id: shopId }), (d) =>
      ExportStartedSchema.parse(d),
    );
  }

  getDayClose(shopId: string, deviceId: string) {
    return this.call(this.client.rpc('get_day_close', { p_shop_id: shopId, p_device_id: deviceId }), (d) =>
      DayCloseSchema.parse(d),
    );
  }

  closeDay(input: CloseDayInput) {
    return this.call(this.client.rpc('close_day', { p_input: input }), (d) => DayCloseSchema.parse(d));
  }
}
