import { ShopMemberSchema } from '@ds/contracts';
import { z } from 'zod';
import type { TypedSupabaseClient } from '@/core/network/supabaseClient';
import type { InviteContact } from '../../../domain/repositories/StaffRepository';

const InvitationRowSchema = z.object({
  id: z.uuid(),
  phone_e164: z.string().nullable(),
  email: z.string().nullable(),
  role: z.enum(['manager', 'cashier']),
  expires_at: z.string(),
});
export type InvitationRow = z.infer<typeof InvitationRowSchema>;

const DeviceRowSchema = z.object({
  id: z.uuid(),
  device_code: z.string(),
  label: z.string().nullable(),
  platform: z.enum(['android', 'ios']),
  status: z.enum(['active', 'revoked']),
  last_seen_at: z.string(),
});
export type DeviceRow = z.infer<typeof DeviceRowSchema>;

export class SupabaseStaffDataSource {
  constructor(private readonly client: TypedSupabaseClient) {}

  async listMembers(shopId: string) {
    const { data, error } = await this.client.rpc('list_shop_members', { p_shop_id: shopId });
    if (error) throw error;
    return z.array(ShopMemberSchema).parse(data);
  }

  // RLS limits these reads to members with staff.manage (invitations) / any member (devices).
  async listPendingInvitations(shopId: string) {
    const { data, error } = await this.client
      .from('shop_invitations')
      .select('id, phone_e164, email, role, expires_at')
      .eq('shop_id', shopId)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .order('id');
    if (error) throw error;
    return z.array(InvitationRowSchema).parse(data);
  }

  async listDevices(shopId: string) {
    const { data, error } = await this.client
      .from('shop_devices')
      .select('id, device_code, label, platform, status, last_seen_at')
      .eq('shop_id', shopId)
      .order('device_code');
    if (error) throw error;
    return z.array(DeviceRowSchema).parse(data);
  }

  async invite(shopId: string, role: string, contact: InviteContact) {
    const { data, error } = await this.client.rpc('invite_shop_member', {
      p_shop_id: shopId,
      p_role: role,
      ...('email' in contact ? { p_email: contact.email } : { p_phone: contact.phoneE164 }),
    });
    if (error) throw error;
    return z.object({ invitationId: z.uuid() }).parse(data).invitationId;
  }

  private async command(promise: PromiseLike<{ error: unknown }>) {
    const { error } = await promise;
    if (error) throw error;
  }

  revokeInvitation = (invitationId: string) =>
    this.command(this.client.rpc('revoke_shop_invitation', { p_invitation_id: invitationId }));
  changeRole = (shopId: string, userId: string, role: string) =>
    this.command(
      this.client.rpc('update_member_role', { p_shop_id: shopId, p_user_id: userId, p_role: role }),
    );
  deactivate = (shopId: string, userId: string) =>
    this.command(this.client.rpc('deactivate_member', { p_shop_id: shopId, p_user_id: userId }));
  revokeDevice = (shopId: string, deviceId: string) =>
    this.command(this.client.rpc('revoke_device', { p_shop_id: shopId, p_device_id: deviceId }));
}
