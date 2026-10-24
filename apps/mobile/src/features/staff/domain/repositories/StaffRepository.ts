import type { ShopRole } from '@ds/contracts';
import type { InvitableRole, PendingInvitation, ShopDevice, StaffMember } from '../entities/Staff';

export type InviteContact = { phoneE164: string } | { email: string };

export interface StaffRepository {
  listMembers(shopId: string): Promise<StaffMember[]>;
  listPendingInvitations(shopId: string): Promise<PendingInvitation[]>;
  listDevices(shopId: string): Promise<ShopDevice[]>;
  invite(shopId: string, role: InvitableRole, contact: InviteContact): Promise<string>;
  revokeInvitation(invitationId: string): Promise<void>;
  changeRole(shopId: string, userId: string, role: ShopRole): Promise<void>;
  deactivate(shopId: string, userId: string): Promise<void>;
  revokeDevice(shopId: string, deviceId: string): Promise<void>;
}
