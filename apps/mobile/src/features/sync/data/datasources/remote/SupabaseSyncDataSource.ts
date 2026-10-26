import { SyncPullOutputSchema, SyncPushOutputSchema } from '@ds/contracts';
import { translateError } from '@/core/errors/translateError';
import type { TypedSupabaseClient } from '@/core/network/supabaseClient';
import type { PushBatch, SyncCursors, SyncRemote } from '../../../domain/entities/Sync';

/** sync_push / sync_pull. Errors come back as AppError (NETWORK_OFFLINE, NETWORK_TIMEOUT, DS_*). */
export class SupabaseSyncDataSource implements SyncRemote {
  constructor(private readonly client: TypedSupabaseClient) {}

  async push(batch: PushBatch) {
    const { data, error } = await this.client.rpc('sync_push', { p_input: batch as never });
    if (error) throw translateError(error);
    return SyncPushOutputSchema.parse(data).results;
  }

  async pull(shopId: string, deviceId: string, cursors: SyncCursors) {
    const { data, error } = await this.client.rpc('sync_pull', {
      p_shop_id: shopId,
      p_device_id: deviceId,
      p_cursors: cursors as never,
    });
    if (error) throw translateError(error);
    return SyncPullOutputSchema.parse(data);
  }
}
