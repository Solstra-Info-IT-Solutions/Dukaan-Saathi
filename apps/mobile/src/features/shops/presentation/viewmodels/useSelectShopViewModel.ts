import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';
import { translateError } from '@/core/errors/translateError';
import type { Invitation, Membership, ShopActivation } from '../../domain/entities/Shop';
import type { AcceptInvitation, ActivateShop, LoadMyContext } from '../../domain/usecases/shopUseCases';
import { shopKeys } from '../shopKeys';

export interface SelectShopViewModelDeps {
  loadContext: LoadMyContext;
  activateShop: ActivateShop;
  acceptInvitation: AcceptInvitation;
}

/** Lists the user's shops and pending invitations; opening one hands the activation to the caller. */
export function useSelectShopViewModel(
  { loadContext, activateShop, acceptInvitation }: SelectShopViewModelDeps,
  onActivated: (activation: ShopActivation) => void,
) {
  const queryClient = useQueryClient();
  const context = useQuery({ queryKey: shopKeys.context(), queryFn: () => loadContext.execute() });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const busy = useRef(false);

  const run = useCallback(async (id: string, work: () => Promise<void>) => {
    if (busy.current) return;
    busy.current = true;
    setBusyId(id);
    setErrorKey(null);
    try {
      await work();
    } catch (error) {
      setErrorKey(translateError(error).messageKey);
    } finally {
      busy.current = false;
      setBusyId(null);
    }
  }, []);

  const openShop = useCallback(
    (membership: Membership) =>
      run(membership.shopId, async () => onActivated(await activateShop.execute(membership))),
    [run, activateShop, onActivated],
  );

  const accept = useCallback(
    (invitation: Invitation) =>
      run(invitation.invitationId, async () => {
        const shopId = await acceptInvitation.execute(invitation.invitationId);
        const fresh = await queryClient.fetchQuery({
          queryKey: shopKeys.context(),
          queryFn: () => loadContext.execute(),
        });
        const membership = fresh.memberships.find((m) => m.shopId === shopId);
        if (membership) onActivated(await activateShop.execute(membership));
      }),
    [run, acceptInvitation, queryClient, loadContext, activateShop, onActivated],
  );

  const status = context.isPending ? 'loading' : context.isError ? 'error' : 'loaded';

  return {
    state: {
      status,
      memberships: context.data?.memberships ?? [],
      invitations: context.data?.invitations ?? [],
      loadErrorKey: context.isError ? translateError(context.error).messageKey : null,
      busyId,
      errorKey,
    } as const,
    actions: { openShop, accept, retry: () => void context.refetch() },
  };
}
