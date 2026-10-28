import { useRouter } from 'expo-router';
import { useDependencies } from '@/bootstrap/DependenciesProvider';
import { useSessionStore } from '@/core/session/sessionStore';
import { OnboardingRequestScreen } from '@/features/onboarding';
import { RequirePermission } from '@/shared/components/RequirePermission';

export default function SetupHelpRoute() {
  const { features } = useDependencies();
  const router = useRouter();
  const shopId = useSessionStore((s) => s.activeShop?.shopId);
  if (!features || !shopId) return null;
  return (
    <RequirePermission permission="onboarding.request">
      <OnboardingRequestScreen deps={features.onboarding} shopId={shopId} onSent={() => router.back()} />
    </RequirePermission>
  );
}
