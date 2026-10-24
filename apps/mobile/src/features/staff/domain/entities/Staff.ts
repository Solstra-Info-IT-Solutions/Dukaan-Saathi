import type { ShopMemberDto, ShopRole } from '@ds/contracts';

export type StaffMember = ShopMemberDto;
export type InvitableRole = Exclude<ShopRole, 'owner'>;

export interface PendingInvitation {
  invitationId: string;
  phone: string | null;
  email: string | null;
  role: InvitableRole;
  expiresAt: string;
}

export interface ShopDevice {
  deviceId: string;
  deviceCode: string;
  label: string | null;
  platform: 'android' | 'ios';
  status: 'active' | 'revoked';
  lastSeenAt: string;
}

export interface StaffOverview {
  members: StaffMember[];
  invitations: PendingInvitation[];
  devices: ShopDevice[];
}
