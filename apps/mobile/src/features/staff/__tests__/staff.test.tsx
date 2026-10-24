import type { ShopRole } from '@ds/contracts';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { SHOP_A } from '../../../../tests/fakes/shops';
import { renderWithProviders } from '../../../../tests/renderWithProviders';
import { toDevice, toInvitation } from '../data/repositories/StaffRepositoryImpl';
import type { InvitableRole, PendingInvitation, ShopDevice, StaffMember } from '../domain/entities/Staff';
import type { InviteContact, StaffRepository } from '../domain/repositories/StaffRepository';
import {
  InviteMember,
  LoadStaff,
  parseInviteContact,
  StaffInputError,
} from '../domain/usecases/staffUseCases';
import { StaffScreen } from '../presentation/screens/StaffScreen';

class FakeStaffRepository implements StaffRepository {
  members: StaffMember[] = [
    {
      userId: 'owner',
      displayName: 'Ramesh',
      role: 'owner',
      status: 'active',
      joinedAt: '',
      isMe: true,
      phone: '+919000000001',
      email: null,
    },
    {
      userId: 'c1',
      displayName: 'Suresh',
      role: 'cashier',
      status: 'active',
      joinedAt: '',
      isMe: false,
      phone: '+919000000003',
      email: null,
    },
  ];
  invitations: PendingInvitation[] = [];
  devices: ShopDevice[] = [
    { deviceId: 'd1', deviceCode: 'A', label: null, platform: 'android', status: 'active', lastSeenAt: '' },
  ];
  log: string[] = [];
  async listMembers() {
    return this.members;
  }
  async listPendingInvitations() {
    return this.invitations;
  }
  async listDevices() {
    return this.devices;
  }
  async invite(_shopId: string, role: InvitableRole, contact: InviteContact) {
    this.log.push(`invite:${role}:${'email' in contact ? contact.email : contact.phoneE164}`);
    this.invitations = [
      ...this.invitations,
      {
        invitationId: 'i1',
        phone: 'phoneE164' in contact ? contact.phoneE164 : null,
        email: null,
        role,
        expiresAt: '',
      },
    ];
    return 'i1';
  }
  async revokeInvitation(id: string) {
    this.log.push(`revokeInvitation:${id}`);
  }
  async changeRole(_s: string, userId: string, role: ShopRole) {
    this.log.push(`role:${userId}:${role}`);
  }
  async deactivate(_s: string, userId: string) {
    this.log.push(`deactivate:${userId}`);
  }
  async revokeDevice(_s: string, deviceId: string) {
    this.log.push(`revokeDevice:${deviceId}`);
  }
}

function deps(repo: FakeStaffRepository) {
  return { loadStaff: new LoadStaff(repo), inviteMember: new InviteMember(repo), staffRepository: repo };
}

describe('parseInviteContact', () => {
  it.each([
    ['98765 43210', { phoneE164: '+919876543210' }],
    ['Staff@Shop.in', { email: 'staff@shop.in' }],
  ])('%s', (input, expected) => {
    expect(parseInviteContact(input)).toEqual(expected);
  });
  it('rejects anything else', () => {
    expect(() => parseInviteContact('12345')).toThrow(StaffInputError);
    expect(() => parseInviteContact('a@b')).toThrow(StaffInputError);
  });
});

describe('row mappers', () => {
  it('maps invitation and device rows', () => {
    expect(
      toInvitation({ id: 'i', phone_e164: '+919000000003', email: null, role: 'cashier', expires_at: 'x' }),
    ).toEqual({
      invitationId: 'i',
      phone: '+919000000003',
      email: null,
      role: 'cashier',
      expiresAt: 'x',
    });
    expect(
      toDevice({
        id: 'd',
        device_code: 'B',
        label: 'Counter',
        platform: 'android',
        status: 'revoked',
        last_seen_at: 'y',
      }),
    ).toEqual({
      deviceId: 'd',
      deviceCode: 'B',
      label: 'Counter',
      platform: 'android',
      status: 'revoked',
      lastSeenAt: 'y',
    });
  });
});

describe('StaffScreen', () => {
  it('invites a cashier by phone', async () => {
    const repo = new FakeStaffRepository();
    await renderWithProviders(<StaffScreen deps={deps(repo)} shopId={SHOP_A} />);
    await fireEvent.changeText(await screen.findByLabelText('Mobile number or email'), '9876543210');
    await fireEvent.press(screen.getByText('Send invite'));
    await waitFor(() => expect(repo.log).toContain('invite:cashier:+919876543210'));
    expect(await screen.findByText('+919876543210')).toBeOnTheScreen();
  });

  it('shows an inline error for an invalid contact', async () => {
    const repo = new FakeStaffRepository();
    await renderWithProviders(<StaffScreen deps={deps(repo)} shopId={SHOP_A} />);
    await fireEvent.changeText(await screen.findByLabelText('Mobile number or email'), '123');
    await fireEvent.press(screen.getByText('Send invite'));
    expect(await screen.findByText('Enter a 10-digit mobile number or an email address.')).toBeOnTheScreen();
    expect(repo.log).toEqual([]);
  });

  it('asks for confirmation before removing a member', async () => {
    const repo = new FakeStaffRepository();
    await renderWithProviders(<StaffScreen deps={deps(repo)} shopId={SHOP_A} />);
    await fireEvent.press((await screen.findAllByText('Remove'))[0]!);
    expect(await screen.findByText('Suresh will lose access to this shop immediately.')).toBeOnTheScreen();
    expect(repo.log).toEqual([]);
    await fireEvent.press(screen.getByText('Confirm'));
    await waitFor(() => expect(repo.log).toEqual(['deactivate:c1']));
  });

  it('does not offer actions on your own row', async () => {
    const repo = new FakeStaffRepository();
    repo.members = [repo.members[0]!];
    await renderWithProviders(<StaffScreen deps={deps(repo)} shopId={SHOP_A} />);
    expect(await screen.findByText('Ramesh (you)')).toBeOnTheScreen();
    expect(screen.queryByText('Make manager')).toBeNull();
  });
});
