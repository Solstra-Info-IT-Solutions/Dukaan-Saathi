import { useQuery } from '@tanstack/react-query';
import { translateError } from '@/core/errors/translateError';
import type { ShopActivation } from '../../domain/entities/Shop';
import { type GetShopEntitlements, trialDaysLeft } from '../../domain/usecases/shopUseCases';
import { shopKeys } from '../shopKeys';

export interface ShopHomeViewModelDeps {
  getEntitlements: GetShopEntitlements;
  now?: () => number;
}

/** Shop summary: who you are here, this device's invoice series, and the plan status. */
export function useShopHomeViewModel(
  { getEntitlements, now = Date.now }: ShopHomeViewModelDeps,
  shop: ShopActivation,
) {
  const entitlements = useQuery({
    queryKey: shopKeys.entitlements(shop.shopId),
    queryFn: () => getEntitlements.execute(shop.shopId),
  });
  const data = entitlements.data;
  return {
    state: {
      shop,
      plan: data
        ? {
            planCode: data.planCode,
            status: data.subscriptionStatus,
            trialDaysLeft:
              data.subscriptionStatus === 'trialing' ? trialDaysLeft(data.trialEndsAt, now()) : null,
          }
        : null,
      planErrorKey: entitlements.isError ? translateError(entitlements.error).messageKey : null,
      invoiceSeries: `${shop.invoicePrefix}/${shop.fy}/${shop.deviceCode}`,
    },
    actions: { refresh: () => void entitlements.refetch() },
  };
}
