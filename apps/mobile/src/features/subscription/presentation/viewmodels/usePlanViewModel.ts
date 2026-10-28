import type { ClientConfig, ShopEntitlementsDto } from '@ds/contracts';
import { useQuery } from '@tanstack/react-query';
import { translateError } from '@/core/errors/translateError';
import { summarizePlan, whatsappLink } from '../../domain/plan';

export interface PlanViewModelDeps {
  getEntitlements: { execute(shopId: string): Promise<ShopEntitlementsDto> };
  getClientConfig: () => Promise<ClientConfig>;
  openUrl: (url: string) => Promise<void>;
  now?: () => number;
}

/** Plan screen: plan and status, usage against limits, what is included, and how to reach sales. */
export function usePlanViewModel(
  deps: PlanViewModelDeps,
  shopId: string,
  shopName: string,
  upgradeText: string,
) {
  const plan = useQuery({
    // Same key as the home screen's plan row, so both refresh together.
    queryKey: ['shops', shopId, 'entitlements'],
    queryFn: () => deps.getEntitlements.execute(shopId),
  });
  const config = useQuery({
    queryKey: ['clientConfig'],
    queryFn: deps.getClientConfig,
    staleTime: 15 * 60_000,
  });
  const contact = config.data?.supportContact;
  const whatsapp = whatsappLink(contact?.whatsapp, `${upgradeText} — ${shopName}`);

  return {
    state: {
      summary: plan.data ? summarizePlan(plan.data, (deps.now ?? Date.now)()) : null,
      loading: plan.isPending,
      loadErrorKey: plan.error ? translateError(plan.error).messageKey : null,
      hasWhatsapp: whatsapp !== null,
      phone: contact?.phone ?? null,
      hours: contact?.hours ?? null,
    },
    actions: {
      reload: () => void plan.refetch(),
      contactWhatsapp: () => (whatsapp ? void deps.openUrl(whatsapp) : undefined),
      call: () => (contact?.phone ? void deps.openUrl(`tel:${contact.phone}`) : undefined),
    },
  };
}
