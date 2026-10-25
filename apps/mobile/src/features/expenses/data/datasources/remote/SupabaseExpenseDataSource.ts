import { EXPENSE_CATEGORIES, ExpenseSchema, type RecordExpenseInput } from '@ds/contracts';
import { z } from 'zod';
import type { TypedSupabaseClient } from '@/core/network/supabaseClient';

export const EXPENSE_BUCKET = 'expense-attachments';

const RowSchema = z.object({
  id: z.uuid(),
  business_date: z.string(),
  category: z.enum(EXPENSE_CATEGORIES),
  amount_paise: z.number().int(),
  method: z.enum(['cash', 'upi', 'card', 'other']),
  note: z.string().nullable(),
  attachment_path: z.string().nullable(),
  created_at: z.string(),
  voided_at: z.string().nullable(),
  void_reason: z.string().nullable(),
});

/** Expenses: RLS read of the table, RPC writes, private storage bucket for receipt photos. */
export class SupabaseExpenseDataSource {
  constructor(
    private readonly client: TypedSupabaseClient,
    private readonly readBytes: (uri: string) => Promise<ArrayBuffer>,
  ) {}

  async list(shopId: string, from: string, to: string) {
    const { data, error } = await this.client
      .from('expenses')
      .select(
        'id, business_date, category, amount_paise, method, note, attachment_path, created_at, voided_at, void_reason',
      )
      .eq('shop_id', shopId)
      .gte('business_date', from)
      .lte('business_date', to)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    return z
      .array(RowSchema)
      .parse(data)
      .map((r) =>
        ExpenseSchema.parse({
          id: r.id,
          businessDate: r.business_date,
          category: r.category,
          amountPaise: r.amount_paise,
          method: r.method,
          note: r.note,
          attachmentPath: r.attachment_path,
          createdAt: r.created_at,
          voidedAt: r.voided_at,
          voidReason: r.void_reason,
        }),
      );
  }

  async record(input: RecordExpenseInput) {
    const { data, error } = await this.client.rpc('record_expense', { p_input: input });
    if (error) throw error;
    return ExpenseSchema.parse(data);
  }

  async void(shopId: string, expenseId: string, reason: string) {
    const { data, error } = await this.client.rpc('void_expense', {
      p_shop_id: shopId,
      p_expense_id: expenseId,
      p_reason: reason,
    });
    if (error) throw error;
    return ExpenseSchema.parse(data);
  }

  async uploadPhoto(shopId: string, expenseId: string, photo: { uri: string; mimeType: string }) {
    const ext = photo.mimeType === 'image/png' ? 'png' : photo.mimeType === 'image/webp' ? 'webp' : 'jpg';
    const path = `${shopId}/${expenseId}/receipt.${ext}`;
    const { error } = await this.client.storage
      .from(EXPENSE_BUCKET)
      .upload(path, await this.readBytes(photo.uri), { contentType: photo.mimeType, upsert: true });
    if (error) throw error;
    return path;
  }

  async photoUrl(path: string) {
    const { data, error } = await this.client.storage.from(EXPENSE_BUCKET).createSignedUrl(path, 300);
    if (error) throw error;
    return data.signedUrl;
  }
}
