import { useQuery } from '@tanstack/react-query';
import type { GetLatestOnboarding } from '../../domain/usecases/onboardingUseCases';

export interface OnboardingStatusViewModelDeps {
  getLatestOnboarding: GetLatestOnboarding;
  /** The plan includes managed onboarding (entitlement onboarding.managed). */
  isEnabled(shopId: string): Promise<boolean>;
}

export const onboardingKeys = {
  all: (shopId: string) => ['onboarding', shopId] as const,
  latest: (shopId: string) => ['onboarding', shopId, 'latest'] as const,
  enabled: (shopId: string) => ['onboarding', shopId, 'enabled'] as const,
};

export type OnboardingCard =
  | { kind: 'hidden' }
  | { kind: 'offer' }
  | { kind: 'working'; status: 'new' | 'assigned' | 'in_progress' }
  | { kind: 'review'; importJobId: string; note: string | null };

/** What the Items tab shows about managed onboarding. */
export function useOnboardingStatusViewModel(deps: OnboardingStatusViewModelDeps, shopId: string) {
  const enabled = useQuery({
    queryKey: onboardingKeys.enabled(shopId),
    queryFn: () => deps.isEnabled(shopId),
  });
  const latest = useQuery({
    queryKey: onboardingKeys.latest(shopId),
    queryFn: () => deps.getLatestOnboarding.execute(shopId),
    enabled: enabled.data === true,
  });

  const r = latest.data;
  let card: OnboardingCard = { kind: 'hidden' };
  if (enabled.data === true && latest.isSuccess) {
    if (!r || r.status === 'cancelled') card = { kind: 'offer' };
    else if (r.status === 'awaiting_owner' && r.importJobId)
      card = { kind: 'review', importJobId: r.importJobId, note: r.statusNote };
    else if (r.status === 'new' || r.status === 'assigned' || r.status === 'in_progress')
      card = { kind: 'working', status: r.status };
  }
  return { state: { card } };
}
