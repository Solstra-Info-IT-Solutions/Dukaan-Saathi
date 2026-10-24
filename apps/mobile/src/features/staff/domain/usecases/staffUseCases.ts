import { normalizeIndianPhone } from '@ds/contracts';
import type { InvitableRole, StaffOverview } from '../entities/Staff';
import type { InviteContact, StaffRepository } from '../repositories/StaffRepository';

export class StaffInputError extends Error {
  constructor(readonly reason: 'invalid_contact') {
    super(reason);
    this.name = 'StaffInputError';
  }
}

export class LoadStaff {
  constructor(private readonly staff: StaffRepository) {}

  async execute(shopId: string): Promise<StaffOverview> {
    const [members, invitations, devices] = await Promise.all([
      this.staff.listMembers(shopId),
      this.staff.listPendingInvitations(shopId),
      this.staff.listDevices(shopId),
    ]);
    return { members, invitations, devices };
  }
}

/** Accepts a phone number (Indian mobile) or an email address typed into one field. */
export function parseInviteContact(value: string): InviteContact {
  const trimmed = value.trim();
  if (trimmed.includes('@')) {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed)) throw new StaffInputError('invalid_contact');
    return { email: trimmed.toLowerCase() };
  }
  const phoneE164 = normalizeIndianPhone(trimmed);
  if (!phoneE164) throw new StaffInputError('invalid_contact');
  return { phoneE164 };
}

export class InviteMember {
  constructor(private readonly staff: StaffRepository) {}

  execute(shopId: string, role: InvitableRole, contactText: string): Promise<string> {
    return this.staff.invite(shopId, role, parseInviteContact(contactText));
  }
}
