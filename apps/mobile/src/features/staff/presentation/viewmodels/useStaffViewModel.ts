import type { ShopRole } from '@ds/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { translateError } from '@/core/errors/translateError';
import type { InvitableRole } from '../../domain/entities/Staff';
import type { StaffRepository } from '../../domain/repositories/StaffRepository';
import { type InviteMember, type LoadStaff, StaffInputError } from '../../domain/usecases/staffUseCases';

export interface StaffViewModelDeps {
  loadStaff: LoadStaff;
  inviteMember: InviteMember;
  /** Simple commands go straight through the repository interface (no extra rules to apply). */
  staffRepository: StaffRepository;
}

export const staffKeys = { overview: (shopId: string) => ['staff', shopId] as const };

export type PendingConfirm =
  | { kind: 'deactivate'; userId: string; name: string }
  | { kind: 'revokeDevice'; deviceId: string; code: string }
  | null;

export function useStaffViewModel(
  { loadStaff, inviteMember, staffRepository }: StaffViewModelDeps,
  shopId: string,
) {
  const queryClient = useQueryClient();
  const overview = useQuery({
    queryKey: staffKeys.overview(shopId),
    queryFn: () => loadStaff.execute(shopId),
  });
  const [contact, setContact] = useState('');
  const [inviteRole, setInviteRole] = useState<InvitableRole>('cashier');
  const [inviteErrorKey, setInviteErrorKey] = useState<string | null>(null);
  const [actionErrorKey, setActionErrorKey] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<PendingConfirm>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: staffKeys.overview(shopId) });

  const invite = useMutation({
    mutationFn: () => inviteMember.execute(shopId, inviteRole, contact),
    onSuccess: () => {
      setContact('');
      void refresh();
    },
    onError: (e) =>
      setInviteErrorKey(
        e instanceof StaffInputError ? 'staff.errors.invalid_contact' : translateError(e).messageKey,
      ),
  });

  const command = useMutation({
    mutationFn: (work: () => Promise<void>) => work(),
    onSuccess: () => void refresh(),
    onError: (e) => setActionErrorKey(translateError(e).messageKey),
  });

  const run = useCallback(
    (work: () => Promise<void>) => {
      if (command.isPending) return;
      setActionErrorKey(null);
      command.mutate(work);
    },
    [command],
  );

  return {
    state: {
      status: overview.isPending ? 'loading' : overview.isError ? 'error' : 'loaded',
      loadErrorKey: overview.isError ? translateError(overview.error).messageKey : null,
      members: overview.data?.members ?? [],
      invitations: overview.data?.invitations ?? [],
      devices: overview.data?.devices ?? [],
      contact,
      inviteRole,
      inviting: invite.isPending,
      inviteErrorKey,
      busy: command.isPending,
      actionErrorKey,
      confirm,
    } as const,
    actions: {
      setContact: (v: string) => {
        setContact(v);
        setInviteErrorKey(null);
      },
      setInviteRole,
      invite: () => {
        if (!invite.isPending && contact.trim()) invite.mutate();
      },
      changeRole: (userId: string, role: ShopRole) =>
        run(() => staffRepository.changeRole(shopId, userId, role)),
      revokeInvitation: (invitationId: string) => run(() => staffRepository.revokeInvitation(invitationId)),
      askDeactivate: (userId: string, name: string) => setConfirm({ kind: 'deactivate', userId, name }),
      askRevokeDevice: (deviceId: string, code: string) =>
        setConfirm({ kind: 'revokeDevice', deviceId, code }),
      cancelConfirm: () => setConfirm(null),
      confirm: () => {
        const c = confirm;
        setConfirm(null);
        if (c?.kind === 'deactivate') run(() => staffRepository.deactivate(shopId, c.userId));
        if (c?.kind === 'revokeDevice') run(() => staffRepository.revokeDevice(shopId, c.deviceId));
      },
      retry: () => void overview.refetch(),
    },
  };
}
