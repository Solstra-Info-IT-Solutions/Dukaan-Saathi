import type { ShopRole } from '@ds/contracts';
import { translateError } from '@/core/errors/translateError';
import type { InvitableRole, PendingInvitation, ShopDevice } from '../../domain/entities/Staff';
import type { InviteContact, StaffRepository } from '../../domain/repositories/StaffRepository';
import type {
  DeviceRow,
  InvitationRow,
  SupabaseStaffDataSource,
} from '../datasources/remote/SupabaseStaffDataSource';

export const toInvitation = (r: InvitationRow): PendingInvitation => ({
  invitationId: r.id,
  phone: r.phone_e164,
  email: r.email,
  role: r.role,
  expiresAt: r.expires_at,
});

export const toDevice = (r: DeviceRow): ShopDevice => ({
  deviceId: r.id,
  deviceCode: r.device_code,
  label: r.label,
  platform: r.platform,
  status: r.status,
  lastSeenAt: r.last_seen_at,
});

async function translated<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (e) {
    throw translateError(e);
  }
}

export class StaffRepositoryImpl implements StaffRepository {
  constructor(private readonly remote: SupabaseStaffDataSource) {}

  listMembers = (shopId: string) => translated(() => this.remote.listMembers(shopId));
  listPendingInvitations = (shopId: string) =>
    translated(async () => (await this.remote.listPendingInvitations(shopId)).map(toInvitation));
  listDevices = (shopId: string) =>
    translated(async () => (await this.remote.listDevices(shopId)).map(toDevice));
  invite = (shopId: string, role: InvitableRole, contact: InviteContact) =>
    translated(() => this.remote.invite(shopId, role, contact));
  revokeInvitation = (invitationId: string) => translated(() => this.remote.revokeInvitation(invitationId));
  changeRole = (shopId: string, userId: string, role: ShopRole) =>
    translated(() => this.remote.changeRole(shopId, userId, role));
  deactivate = (shopId: string, userId: string) => translated(() => this.remote.deactivate(shopId, userId));
  revokeDevice = (shopId: string, deviceId: string) =>
    translated(() => this.remote.revokeDevice(shopId, deviceId));
}
